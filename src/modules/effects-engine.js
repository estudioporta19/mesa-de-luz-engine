// mesa-de-luz-engine/src/modules/effects-engine.js

const { v4: uuidv4 } = require('uuid');
const patchModule = require('./patch'); // Para obter fixtures
const personalityModule = require('./personality'); // Para obter personalidades

// Estado para gerir os efeitos ativos
// Cada efeito ativo terá um ID único e um intervalo de tempo para a sua execução
let activeEffects = new Map(); // Map<effectId, { type, fixtures, params, intervalId, currentStep, startTime, sendDmxCommandFunction }>

let sendDmxCommandFunction = null; // Função para enviar comandos DMX, injetada do server.js

// ==========================================
// FUNÇÕES DE INICIALIZAÇÃO
// ==========================================

/**
 * Inicializa o módulo de efeitos, injetando a função de envio DMX do servidor.
 * @param {function} dmxCmdFn - A função para enviar comandos DMX para o universo.
 */
const initEffectsEngine = (dmxCmdFn) => {
    sendDmxCommandFunction = dmxCmdFn;
    console.log('Effects Engine: Módulo de efeitos inicializado com função DMX injetada.');
};

// ==========================================
// FUNÇÕES AUXILIARES DE EFEITOS
// ==========================================

/**
 * Aplica um valor DMX a um atributo específico de um fixture.
 * @param {object} fixture - O objeto fixture.
 * @param {object} personality - O objeto personality do fixture.
 * @param {string} attributeName - O nome do atributo (e.g., 'dimmer', 'red').
 * @param {number} value - O valor DMX (0-255).
 * @param {number} fadeTime - O tempo de fade em segundos.
 */
const applyFixtureAttribute = (fixture, personality, attributeName, value, fadeTime = 0.0) => {
    if (!sendDmxCommandFunction) {
        console.error('Effects Engine: sendDmxCommandFunction não foi inicializada.');
        return;
    }

    const attribute = personality.attributes.find(attr => attr.name === attributeName);
    if (!attribute) {
        // console.warn(`Effects Engine: Atributo '${attributeName}' não encontrado para a personalidade '${personality.name}'.`);
        return; // Não é um erro crítico se o atributo não for encontrado, apenas ignora.
    }

    const dmxChannel = fixture.startChannel + attribute.offset;
    // CORREÇÃO AQUI: Usar 'attribute.min' e 'attribute.max'
    const finalValue = Math.max(attribute.min || 0, Math.min(attribute.max || 255, value)); // Garante que o valor está dentro do range do atributo

    sendDmxCommandFunction(dmxChannel, finalValue, fadeTime);
};

// ==========================================
// LÓGICA DOS EFEITOS
// ==========================================

/**
 * Lógica para um efeito de Chase (sequência).
 * @param {string} effectId - ID do efeito.
 * @param {Array<object>} fixtures - Array de objetos fixture.
 * @param {object} params - Parâmetros do efeito (e.g., { speed: 0.5, values: [0, 128, 255], attribute: 'dimmer' }).
 */
const runChaseEffect = (effectId, fixtures, params) => {
    const { speed, values, attribute, fadeTime = 0.1 } = params;
    const effectState = activeEffects.get(effectId);
    if (!effectState) return;

    // Garante que values é um array e tem pelo menos um valor
    if (!Array.isArray(values) || values.length === 0) {
        console.warn(`Effects Engine: Chase effect '${effectId}' requires 'values' array.`);
        stopEffect(effectId);
        return;
    }

    // currentStep é o índice do fixture que está a ser processado
    const currentFixtureIndex = effectState.currentStep % fixtures.length;
    const currentFixture = fixtures[currentFixtureIndex];

    const personality = personalityModule.getAllPersonalities().find(p => p.id === currentFixture.personalityId);
    if (!personality) {
        console.warn(`Effects Engine: Personalidade não encontrada para fixture '${currentFixture.name}'.`);
        return;
    }

    // Aplica o valor atual do chase ao fixture atual
    const valueToApply = values[effectState.currentStep % values.length];
    applyFixtureAttribute(currentFixture, personality, attribute, valueToApply, fadeTime);

    // Desliga os outros fixtures (se o chase for exclusivo)
    // Para um chase simples, muitas vezes queremos que apenas um esteja "ligado" por vez
    fixtures.forEach((f, idx) => {
        if (idx !== currentFixtureIndex) {
            const otherPersonality = personalityModule.getAllPersonalities().find(p => p.id === f.personalityId);
            if (otherPersonality) {
                applyFixtureAttribute(f, otherPersonality, attribute, 0, fadeTime); // Desliga os outros
            }
        }
    });

    effectState.currentStep++; // Avança para o próximo passo/fixture
    activeEffects.set(effectId, effectState); // Atualiza o estado
};

/**
 * Lógica para um efeito de Onda (Dimmer Wave).
 * @param {string} effectId - ID do efeito.
 * @param {Array<object>} fixtures - Array de objetos fixture.
 * @param {object} params - Parâmetros do efeito (e.g., { speed: 1.0, amplitude: 255, offset: 0, attribute: 'dimmer' }).
 */
const runDimmerWaveEffect = (effectId, fixtures, params) => {
    const { speed, amplitude = 255, offset = 0, attribute = 'dimmer', fadeTime = 0.1 } = params;
    const effectState = activeEffects.get(effectId);
    if (!effectState) return;

    const elapsed = (Date.now() - effectState.startTime) / 1000; // Tempo decorrido em segundos

    fixtures.forEach((fixture, index) => {
        const personality = personalityModule.getAllPersonalities().find(p => p.id === fixture.personalityId);
        if (!personality) {
            console.warn(`Effects Engine: Personalidade não encontrada para fixture '${fixture.name}'.`);
            return;
        }

        // Calcula o valor da onda senoidal
        // A fase de cada fixture é deslocada para criar o efeito de onda
        const phase = (index / fixtures.length) * Math.PI * 2; // Distribui a fase ao longo dos fixtures
        const value = Math.round(amplitude / 2 + (amplitude / 2) * Math.sin(elapsed * speed + phase + offset));
        
        applyFixtureAttribute(fixture, personality, attribute, value, fadeTime);
    });
};

// ==========================================
// FUNÇÕES DE CONTROLO DO MÓDULO
// ==========================================

/**
 * Inicia um novo efeito.
 * @param {string} type - Tipo de efeito (e.g., 'chase', 'dimmer_wave').
 * @param {Array<string>} fixtureIds - IDs dos fixtures envolvidos.
 * @param {object} params - Parâmetros específicos do efeito.
 * @returns {string|null} O ID do efeito iniciado, ou null se falhar.
 */
const startEffect = (type, fixtureIds, params) => {
    if (!sendDmxCommandFunction) {
        console.error('Effects Engine: sendDmxCommandFunction não foi inicializada. Não é possível iniciar efeito.');
        return null;
    }

    const fixtures = fixtureIds.map(id => patchModule.getAllFixtures().find(f => f.id === id)).filter(Boolean);
    if (fixtures.length === 0) {
        console.warn('Effects Engine: Nenhum fixture válido encontrado para iniciar o efeito.');
        return null;
    }

    const effectId = uuidv4();
    let intervalCallback;
    let intervalMs = 100; // Default interval

    switch (type) {
        case 'chase':
            intervalMs = (params.speed || 0.5) * 1000; // Speed em segundos
            intervalCallback = () => runChaseEffect(effectId, fixtures, params);
            break;
        case 'dimmer_wave':
            intervalMs = 50; // Atualiza a onda a cada 50ms para suavidade
            intervalCallback = () => runDimmerWaveEffect(effectId, fixtures, params);
            break;
        // Adicione mais tipos de efeitos aqui
        default:
            console.error(`Effects Engine: Tipo de efeito desconhecido: ${type}`);
            return null;
    }

    const intervalId = setInterval(intervalCallback, intervalMs);
    activeEffects.set(effectId, {
        type,
        fixtures,
        params,
        intervalId,
        currentStep: 0, // Para chases
        startTime: Date.now(), // Para ondas
    });

    console.log(`Effects Engine: Efeito '${type}' iniciado com ID: ${effectId} em ${fixtures.length} fixtures.`);
    return effectId;
};

/**
 * Para um efeito específico.
 * @param {string} effectId - ID do efeito a parar.
 */
const stopEffect = (effectId) => {
    const effectState = activeEffects.get(effectId);
    if (effectState) {
        clearInterval(effectState.intervalId);
        activeEffects.delete(effectId);
        console.log(`Effects Engine: Efeito '${effectId}' parado.`);

        // Opcional: Zerar os fixtures envolvidos no efeito ao parar
        // effectState.fixtures.forEach(fixture => {
        //     const personality = personalityModule.getAllPersonalities().find(p => p.id === fixture.personalityId);
        //     if (personality) {
        //         applyFixtureAttribute(fixture, personality, effectState.params.attribute || 'dimmer', 0, 0.5); // Fade out
        //     }
        // });
    } else {
        console.warn(`Effects Engine: Tentativa de parar efeito com ID '${effectId}' que não está ativo.`);
    }
};

/**
 * Para todos os efeitos ativos.
 */
const stopAllEffects = () => {
    console.log('Effects Engine: Parando todos os efeitos ativos.');
    activeEffects.forEach((_, effectId) => stopEffect(effectId));
};

/**
 * Atualiza os parâmetros de um efeito ativo.
 * Nota: Para efeitos baseados em intervalo, pode ser necessário parar e reiniciar o efeito.
 * Para efeitos baseados em tempo, pode-se ajustar os parâmetros diretamente.
 * Por simplicidade, para agora, vamos apenas atualizar os parâmetros.
 * Se a velocidade mudar para um chase, o intervalo será ajustado na próxima chamada de startEffect.
 * @param {string} effectId - ID do efeito a atualizar.
 * @param {object} newParams - Novos parâmetros a aplicar.
 */
const updateEffect = (effectId, newParams) => {
    const effectState = activeEffects.get(effectId);
    if (effectState) {
        // Atualiza os parâmetros do efeito
        effectState.params = { ...effectState.params, ...newParams };
        activeEffects.set(effectId, effectState);
        console.log(`Effects Engine: Efeito '${effectId}' atualizado com novos parâmetros.`);

        // Se a velocidade ou tipo de efeito mudar, pode ser necessário reiniciar o intervalo
        // Para simplificar, vamos parar e reiniciar o efeito se a velocidade mudar.
        if (newParams.speed !== undefined && effectState.type === 'chase') {
             console.log(`Effects Engine: Velocidade do Chase alterada, reiniciando efeito '${effectId}'.`);
             clearInterval(effectState.intervalId); // Limpa o intervalo antigo
             const newIntervalMs = (newParams.speed || 0.5) * 1000;
             effectState.intervalId = setInterval(() => runChaseEffect(effectId, effectState.fixtures, effectState.params), newIntervalMs);
        } else if (newParams.speed !== undefined && effectState.type === 'dimmer_wave') {
             // Onda não precisa de reiniciar o intervalo, apenas o cálculo interno se adapta
        }
    } else {
        console.warn(`Effects Engine: Tentativa de atualizar efeito com ID '${effectId}' que não está ativo.`);
    }
};

/**
 * Obtém o estado de todos os efeitos ativos.
 * @returns {Array<object>} Uma lista dos efeitos ativos.
 */
const getActiveEffectsStatus = () => {
    return Array.from(activeEffects.entries()).map(([id, state]) => ({
        id,
        type: state.type,
        fixtureIds: state.fixtures.map(f => f.id),
        params: state.params,
        currentStep: state.currentStep,
        running: true // Indica que está ativo
    }));
};

module.exports = {
    initEffectsEngine,
    startEffect,
    stopEffect,
    stopAllEffects,
    updateEffect,
    getActiveEffectsStatus
};
