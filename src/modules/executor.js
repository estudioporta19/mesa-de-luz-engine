// mesa-de-luz-engine/src/modules/executor.js

const cuelistModule = require('./cuelist'); // Precisamos do módulo de cuelist para aceder aos cues
const patchModule = require('./patch');     // Precisamos do módulo de patch para obter detalhes do fixture

// Variáveis internas do executor
let currentCuelistId = null;
let currentCueIndex = -1;
let playbackTimeout = null; // Para gerenciar delays entre cues
let fadeInterval = null;    // Para gerenciar o fade in/out dos canais
let io = null; // Referência ao objeto socket.io para emitir eventos para o frontend
let universe = null; // Referência ao universo DMX

// Estado DMX para o soft-fade, será o currentDmxState do server.js
let currentDmxStateReference = {};

// Inicializa o módulo executor com as dependências necessárias
const initExecutor = (socketIoInstance, dmxUniverse, dmxStateRef) => {
    io = socketIoInstance;
    universe = dmxUniverse;
    currentDmxStateReference = dmxStateRef; // Recebe a referência ao estado DMX global
    console.log('Executor module initialized.');
};

// Função auxiliar para aplicar um cue ao universo DMX com soft-fade
const applyCueToUniverse = (cueValues, fadeTime, callback) => {
    if (!universe || !currentDmxStateReference) {
        console.error("DMX universe or currentDmxStateReference not initialized in executor.");
        if (callback) callback();
        return;
    }

    const startValues = { ...currentDmxStateReference }; // Captura o estado atual do universo
    const endValues = {};

    cueValues.forEach(val => {
        const fixture = patchModule.getFixtureById(val.fixtureId);
        if (fixture) {
            // Supondo que 'attribute' mapeia para um canal DMX específico dentro do fixture
            // Esta lógica precisa ser mais robusta se houver personalidades com múltiplos canais/atributos
            // Por enquanto, vamos simplificar para apenas o canal inicial do fixture
            const dmxChannel = fixture.startChannel; // Lógica simplificada: atributo sempre no canal inicial
                                                     // Isso precisa ser expandido com o editor de personalidades.
            if (dmxChannel >= 1 && dmxChannel <= 512) {
                endValues[dmxChannel] = val.value;
            } else {
                console.warn(`Canal DMX ${dmxChannel} para fixture ${val.fixtureId} fora do range.`);
            }
        } else {
            console.warn(`Fixture com ID ${val.fixtureId} não encontrado ao aplicar cue.`);
        }
    });

    if (fadeTime <= 0.1) { // Tempo de fade muito pequeno, aplica instantaneamente
        universe.update(endValues);
        // Atualiza o estado DMX de referência
        Object.assign(currentDmxStateReference, endValues);
        if (callback) callback();
        io.emit('dmx_state_updated', currentDmxStateReference); // Notifica o frontend
        return;
    }

    const duration = fadeTime * 1000; // Converte segundos para milissegundos
    const steps = duration / 20; // Aproximadamente 20ms por passo para um fade suave (50 FPS)
    let currentStep = 0;

    clearInterval(fadeInterval); // Limpa qualquer fade anterior

    fadeInterval = setInterval(() => {
        const newValues = {};
        let allReached = true;

        for (const channel in endValues) {
            const start = startValues[channel] !== undefined ? startValues[channel] : 0;
            const end = endValues[channel];

            if (currentStep < steps) {
                const interpolatedValue = Math.round(start + (end - start) * (currentStep / steps));
                newValues[channel] = interpolatedValue;
                if (interpolatedValue !== end) { // Ainda não atingiu o valor final
                    allReached = false;
                }
            } else {
                newValues[channel] = end;
            }
        }

        // Aplica os valores interpolados
        if (Object.keys(newValues).length > 0) {
            universe.update(newValues);
            Object.assign(currentDmxStateReference, newValues); // Atualiza o estado de referência
            io.emit('dmx_state_updated', currentDmxStateReference); // Notifica o frontend
        }

        currentStep++;

        if (currentStep > steps && allReached) {
            clearInterval(fadeInterval);
            fadeInterval = null;
            if (callback) callback();
        }
    }, 20); // Intervalo de 20ms para o fade (50 FPS)
};


// Inicia a reprodução de uma cuelist
const playCuelist = (cuelistId) => {
    const cuelist = cuelistModule.getCuelistById(cuelistId);
    if (!cuelist) {
        console.error(`Cuelist com ID ${cuelistId} não encontrada.`);
        io.emit('playback_error', `Cuelist '${cuelistId}' não encontrada.`);
        return false;
    }

    // Para qualquer reprodução ou fade existente
    stopPlayback();

    currentCuelistId = cuelistId;
    currentCueIndex = -1; // Começa antes do primeiro cue para ir para o índice 0 no nextCue

    console.log(`Iniciando reprodução da cuelist: ${cuelist.name}`);
    io.emit('playback_started', { cuelistId: currentCuelistId, cuelistName: cuelist.name });

    // Inicia o próximo cue imediatamente
    nextCue();
    return true;
};

// Avança para o próximo cue na cuelist atual
const nextCue = () => {
    const cuelist = cuelistModule.getCuelistById(currentCuelistId);
    if (!cuelist || cuelist.cues.length === 0) {
        console.log("Fim da cuelist ou cuelist vazia.");
        stopPlayback();
        return;
    }

    currentCueIndex++;

    if (currentCueIndex >= cuelist.cues.length) {
        console.log("Todos os cues da cuelist foram reproduzidos.");
        stopPlayback();
        return;
    }

    const currentCue = cuelist.cues[currentCueIndex];
    console.log(`Reproduzindo Cue ${currentCueIndex + 1}: ${currentCue.name} (Fade: ${currentCue.fade_in}s, Delay: ${currentCue.delay_in}s)`);
    io.emit('cue_playing', {
        cuelistId: currentCuelistId,
        cueId: currentCue.id,
        cueName: currentCue.name,
        cueIndex: currentCueIndex
    });

    // Aplica o cue com o tempo de fade
    applyCueToUniverse(currentCue.values, currentCue.fade_in, () => {
        // Callback é executado após o fade terminar
        if (currentCueIndex < cuelist.cues.length - 1) {
            // Se houver mais cues, agenda o próximo após o delay
            playbackTimeout = setTimeout(nextCue, currentCue.delay_in * 1000);
        } else {
            // Se for o último cue, para a reprodução
            console.log("Último cue da cuelist reproduzido.");
            stopPlayback();
        }
    });
};

// Para a reprodução atual
const stopPlayback = () => {
    if (playbackTimeout) {
        clearTimeout(playbackTimeout);
        playbackTimeout = null;
    }
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }
    if (currentCuelistId) {
        console.log(`Reprodução da cuelist '${cuelistModule.getCuelistById(currentCuelistId)?.name || currentCuelistId}' parada.`);
        io.emit('playback_stopped', { cuelistId: currentCuelistId });
        currentCuelistId = null;
        currentCueIndex = -1;
    }
};

// Obtém o estado atual da reprodução
const getPlaybackStatus = () => {
    return {
        isPlaying: currentCuelistId !== null,
        cuelistId: currentCuelistId,
        cuelistName: currentCuelistId ? cuelistModule.getCuelistById(currentCuelistId)?.name : null,
        currentCueIndex: currentCueIndex,
        currentCueName: currentCueIndex !== -1 ? cuelistModule.getCuelistById(currentCuelistId)?.cues[currentCueIndex]?.name : null
    };
};

module.exports = {
    initExecutor,
    playCuelist,
    stopPlayback,
    nextCue, // Pode ser útil para um botão "próximo cue"
    getPlaybackStatus
};