// mesa-de-luz-engine/src/modules/playback.js

const cuelistModule = require('./cuelist'); // Precisamos aceder às cuelists e cues
const patchModule = require('./patch');     // Precisamos aceder aos fixtures para obter canais DMX
const personalityModule = require('./personality'); // Precisamos aceder a personalidades para atributos

// Variáveis de estado do playback
let currentPlaybackState = {
    activeCuelistId: null,
    currentCueIndex: -1, // Índice do cue atualmente ativo na cuelist
    playbackStatus: 'stopped', // 'stopped', 'playing', 'paused'
    fadePromise: null, // Para controlar a promessa do fade atual (se houver)
    nextCueTimeout: null // Para controlar o timeout do delay/tempo de fade
};

let io = null; // Instância do Socket.io do server.js para emitir eventos
let sendDmxCommandToUniverse = null; // Função para enviar comandos DMX ao universo (será injetada do server.js)

// --- Funções de Inicialização e Injeção de Dependências ---
function initializePlayback(socketIoInstance, dmxCommander) {
    io = socketIoInstance;
    sendDmxCommandToUniverse = dmxCommander;
    console.log("Playback Module: Inicializado.");
}

// --- Funções Auxiliares de Playback ---

/**
 * Aplica os valores DMX de um cue.
 * @param {object} cue - O objeto cue a ser aplicado.
 */
async function applyCue(cue) {
    if (!cue || !cue.values || cue.values.length === 0) {
        console.warn("Playback Module: Tentou aplicar um cue vazio ou inválido.");
        return;
    }

    console.log(`Playback Module: Aplicando Cue '${cue.name}' (ID: ${cue.id})`);

    // Limpa qualquer fade ou timeout anterior para garantir um estado limpo
    clearCurrentFadeAndTimeout();

    const dmxUpdates = {};
    const fadeTime = cue.fade_in_time || 0; // Usar o fade_in_time do cue para a transição
    const delayTime = cue.delay_time || 0; // Usar o delay_time do cue

    // Para cada valor no cue (ex: { fixtureId: 'fix_001', attribute: 'dimmer', value: 255 })
    for (const val of cue.values) {
        const fixture = patchModule.getFixtureById(val.fixtureId);
        if (!fixture) {
            console.warn(`Playback Module: Fixture ID '${val.fixtureId}' não encontrado para o cue '${cue.name}'.`);
            continue;
        }

        const personality = personalityModule.getPersonalityById(fixture.personalityId);
        if (!personality) {
            console.warn(`Playback Module: Personalidade ID '${fixture.personalityId}' não encontrada para o fixture '${fixture.name}'.`);
            continue;
        }

        // Encontra o canal DMX para o atributo
        const attributeChannelInfo = personality.attributes.find(attr => attr.name === val.attribute);
        if (!attributeChannelInfo) {
            console.warn(`Playback Module: Atributo '${val.attribute}' não encontrado na personalidade '${personality.name}' para o fixture '${fixture.name}'.`);
            continue;
        }

        // Calcula o canal DMX absoluto (canal inicial do fixture + offset do atributo)
        const dmxChannel = fixture.startChannel + attributeChannelInfo.offset;

        // Adiciona o comando DMX à lista de updates
        // (A função sendDmxCommandToUniverse já gerencia o fadeTime)
        // Aqui vamos chamar diretamente a função de envio DMX do server.js
        try {
            // A função sendDmxCommandToUniverse será responsável por gerenciar a fila de fades
            // e os timeouts se necessário, ou usar o mecanismo de fade já presente no server.js
            await new Promise(resolve => {
                // A função sendDmxCommandToUniverse é assíncrona, mas o fade acontece no backend.
                // Para o playback, queremos que o sistema "espere" o fade terminar antes de continuar
                // para o próximo cue, se o fade for o fator limitante.
                // No entanto, universe.fade() (se estivesse a funcionar) ou o nosso soft-fade
                // no server.js são não bloqueantes.
                // Vamos fazer um "espera" simplificado aqui para simular a duração do fade.
                sendDmxCommandToUniverse(dmxChannel, val.value, fadeTime);

                // Se houver um fade, esperamos por ele.
                // Se não houver fade (fadeTime=0), resolvemos imediatamente.
                if (fadeTime > 0) {
                    currentPlaybackState.fadePromise = setTimeout(resolve, fadeTime * 1000);
                } else {
                    resolve();
                }
            });
        } catch (error) {
            console.error(`Playback Module: Erro ao enviar comando DMX para canal ${dmxChannel}:`, error);
        }
    }

    // Após aplicar todos os valores DMX, aguarda o delay_time do cue antes de potencialmente avançar
    if (delayTime > 0) {
        console.log(`Playback Module: Aguardando delay de ${delayTime}s para o cue '${cue.name}'...`);
        await new Promise(resolve => {
            currentPlaybackState.nextCueTimeout = setTimeout(resolve, delayTime * 1000);
        });
    }
    console.log(`Playback Module: Aplicação do Cue '${cue.name}' concluída.`);
}

function clearCurrentFadeAndTimeout() {
    if (currentPlaybackState.fadePromise) {
        clearTimeout(currentPlaybackState.fadePromise);
        currentPlaybackState.fadePromise = null;
    }
    if (currentPlaybackState.nextCueTimeout) {
        clearTimeout(currentPlaybackState.nextCueTimeout);
        currentPlaybackState.nextCueTimeout = null;
    }
}

/**
 * Inicia a reprodução de uma cuelist.
 * @param {string} cuelistId - O ID da cuelist a ser reproduzida.
 */
async function startPlayback(cuelistId) {
    if (currentPlaybackState.playbackStatus === 'playing') {
        io.emit('server_message', `Playback Module: Já existe uma cuelist em reprodução.`);
        return;
    }

    const cuelist = cuelistModule.getCuelistById(cuelistId);
    if (!cuelist) {
        io.emit('server_message', `Playback Module: Cuelist com ID '${cuelistId}' não encontrada.`);
        return;
    }

    if (cuelist.cues.length === 0) {
        io.emit('server_message', `Playback Module: Cuelist '${cuelist.name}' está vazia. Nada para reproduzir.`);
        return;
    }

    currentPlaybackState.activeCuelistId = cuelistId;
    currentPlaybackState.currentCueIndex = 0; // Começa do primeiro cue
    currentPlaybackState.playbackStatus = 'playing';
    io.emit('playback_status_updated', currentPlaybackState);
    io.emit('server_message', `Playback Module: Iniciando reprodução da cuelist '${cuelist.name}'.`);

    // Inicia a sequência de cues
    await playCurrentCue();
}

/**
 * Pausa a reprodução.
 */
function pausePlayback() {
    if (currentPlaybackState.playbackStatus === 'playing') {
        currentPlaybackState.playbackStatus = 'paused';
        clearCurrentFadeAndTimeout(); // Para qualquer fade ou delay em andamento
        io.emit('playback_status_updated', currentPlaybackState);
        io.emit('server_message', `Playback Module: Reprodução pausada.`);
    }
}

/**
 * Retoma a reprodução.
 */
async function resumePlayback() {
    if (currentPlaybackState.playbackStatus === 'paused') {
        currentPlaybackState.playbackStatus = 'playing';
        io.emit('playback_status_updated', currentPlaybackState);
        io.emit('server_message', `Playback Module: Reprodução retomada.`);
        await playCurrentCue(); // Retoma do cue atual
    }
}

/**
 * Para a reprodução e zera os canais DMX (com um fade_out global, se definido)
 */
async function stopPlayback() {
    if (currentPlaybackState.playbackStatus === 'stopped') {
        io.emit('server_message', `Playback Module: Já está parado.`);
        return;
    }

    console.log("Playback Module: Parando reprodução...");
    clearCurrentFadeAndTimeout(); // Limpa qualquer operação pendente

    // TODO: Implementar fade_out global para todos os canais afetados pela cuelist, se desejar.
    // Por agora, vamos zerar todos os canais DMX para 0 instantaneamente, ou com um pequeno fade default.
    const currentDmxSnapshot = {};
    for (let i = 1; i <= 512; i++) {
        // AQUI: Idealmente, deveria-se obter os canais que foram ativados por ESTA cuelist.
        // Para simplicidade, vamos zerar um conjunto fixo ou todo o universo.
        // Ou, melhor, aplicar um 'fade_out_time' da cuelist para os valores atuais dos canais que ESTAVAM ativos.
        // Isso exigiria que o Playback Engine mantivesse o estado dos canais que ele controla.
        // Por enquanto, apenas zera o canal 1 para 0 com um pequeno fade.
        currentDmxSnapshot[i] = 0; // Para simplificar, zeramos tudo.
    }

    // Pode-se enviar um comando DMX de 'all_off' com um fade
    // Ou iterar pelos canais ativos e enviá-los para 0 com fade.
    // Para o teste, vamos apenas zerar o canal 1 com um fade de 1s.
    sendDmxCommandToUniverse(1, 0, 1.0); // Zera o canal 1 com 1s de fade.

    currentPlaybackState = {
        activeCuelistId: null,
        currentCueIndex: -1,
        playbackStatus: 'stopped',
        fadePromise: null,
        nextCueTimeout: null
    };
    io.emit('playback_status_updated', currentPlaybackState);
    io.emit('server_message', `Playback Module: Reprodução parada.`);
}

/**
 * Avança para o próximo cue na cuelist.
 */
async function nextCue() {
    if (currentPlaybackState.playbackStatus === 'stopped') {
        io.emit('server_message', `Playback Module: Nenhuma cuelist em reprodução.`);
        return;
    }

    const cuelist = cuelistModule.getCuelistById(currentPlaybackState.activeCuelistId);
    if (!cuelist) {
        io.emit('server_message', `Playback Module: Cuelist ativa não encontrada.`);
        return;
    }

    clearCurrentFadeAndTimeout(); // Limpa qualquer delay ou fade anterior

    let nextIndex = currentPlaybackState.currentCueIndex + 1;
    if (nextIndex >= cuelist.cues.length) {
        io.emit('server_message', `Playback Module: Fim da cuelist '${cuelist.name}'. Parando reprodução.`);
        stopPlayback(); // Parar ao chegar ao fim
    } else {
        currentPlaybackState.currentCueIndex = nextIndex;
        io.emit('playback_status_updated', currentPlaybackState);
        io.emit('server_message', `Playback Module: Avançando para o próximo cue (${nextIndex + 1}).`);
        await playCurrentCue();
    }
}

/**
 * Volta para o cue anterior na cuelist.
 */
async function prevCue() {
    if (currentPlaybackState.playbackStatus === 'stopped') {
        io.emit('server_message', `Playback Module: Nenhuma cuelist em reprodução.`);
        return;
    }

    const cuelist = cuelistModule.getCuelistById(currentPlaybackState.activeCuelistId);
    if (!cuelist) {
        io.emit('server_message', `Playback Module: Cuelist ativa não encontrada.`);
        return;
    }

    clearCurrentFadeAndTimeout(); // Limpa qualquer delay ou fade anterior

    let prevIndex = currentPlaybackState.currentCueIndex - 1;
    if (prevIndex < 0) {
        io.emit('server_message', `Playback Module: Já está no primeiro cue.`);
        // Opcional: Reiniciar a cuelist ou manter no primeiro cue
        // currentPlaybackState.currentCueIndex = 0;
        // await playCurrentCue();
    } else {
        currentPlaybackState.currentCueIndex = prevIndex;
        io.emit('playback_status_updated', currentPlaybackState);
        io.emit('server_message', `Playback Module: Voltando para o cue anterior (${prevIndex + 1}).`);
        await playCurrentCue();
    }
}

/**
 * Reproduz o cue atualmente apontado por currentCueIndex.
 */
async function playCurrentCue() {
    const cuelist = cuelistModule.getCuelistById(currentPlaybackState.activeCuelistId);
    if (!cuelist || currentPlaybackState.currentCueIndex === -1 || currentPlaybackState.playbackStatus !== 'playing') {
        return; // Nada para reproduzir ou não está no estado 'playing'
    }

    const currentCue = cuelist.cues[currentPlaybackState.currentCueIndex];
    if (!currentCue) {
        console.error("Playback Module: Erro interno: Cue não encontrado no índice atual.");
        stopPlayback();
        return;
    }

    io.emit('server_message', `Playback Module: Reproduzindo Cue: '${currentCue.name}' (${currentPlaybackState.currentCueIndex + 1}/${cuelist.cues.length})`);
    io.emit('current_cue_update', { cuelistId: cuelist.id, cueIndex: currentPlaybackState.currentCueIndex, cue: currentCue });

    // Aplica o cue, aguardando o tempo de fade e delay
    await applyCue(currentCue);

    // Se a reprodução ainda estiver 'playing' (não foi pausada ou parada durante applyCue)
    if (currentPlaybackState.playbackStatus === 'playing') {
        // Avança automaticamente para o próximo cue após o delay do cue atual
        // (se houver um próximo cue)
        if (currentPlaybackState.currentCueIndex + 1 < cuelist.cues.length) {
            console.log("Playback Module: Preparando para o próximo cue automaticamente...");
            // Não precisa de um timeout aqui se applyCue já aguardou o delay.
            // O nextCue() será chamado *imediatamente* após o término do delay
            // do cue atual, se não houver interação manual.
            // Isso cria um fluxo contínuo.
            // Se queremos um AVANÇO AUTOMÁTICO, a chamada a nextCue deve ser
            // feita *após* o delay do cue atual.
            // A função applyCue já aguarda o delay_time.
            // Então, basta chamar nextCue após applyCue.
            setImmediate(nextCue); // Chama nextCue na próxima iteração do event loop
        } else {
            io.emit('server_message', `Playback Module: Fim da cuelist '${cuelist.name}'.`);
            stopPlayback(); // Parar se for o último cue
        }
    }
}


// --- Métodos Exportados ---
module.exports = {
    initializePlayback,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    nextCue,
    prevCue,
    getPlaybackState: () => currentPlaybackState // Para o frontend obter o estado
};