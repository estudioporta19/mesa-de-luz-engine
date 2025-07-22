// mesa-de-luz-engine/src/modules/playback.js

const { v4: uuidv4 } = require('uuid');
const { getAllFixtures } = require('./patch');
const { getAllPersonalities } = require('./personality');
const cuelistModule = require('./cuelist');

let activePlayback = {
    isPlaying: false,
    cuelistId: null,
    currentCueIndex: -1,
    currentCueTimeout: null, // Ainda usado para delay_in de um cue
    globalMasterIntensity: 255, // Valor inicial padrão
    playbackStatus: 'stopped' // 'stopped', 'playing', 'paused'
};

let ioInstance = null;
let sendDmxCommandFunction = null;
let clearDmxUniverseFunction = null;

// --- Funções Auxiliares ---

// Função para emitir o status de playback para todos os clientes
const emitPlaybackStatus = () => {
    if (ioInstance) {
        const cuelists = cuelistModule.getAllCuelists();
        const currentCuelist = cuelists.find(cl => cl.id === activePlayback.cuelistId);
        ioInstance.emit('playback_status_updated', {
            isPlaying: activePlayback.isPlaying,
            cuelistId: activePlayback.cuelistId,
            cuelistName: currentCuelist ? currentCuelist.name : 'N/A',
            currentCueIndex: activePlayback.currentCueIndex,
            currentCueName: activePlayback.currentCueIndex !== -1 && currentCuelist && currentCuelist.cues[activePlayback.currentCueIndex]
                            ? currentCuelist.cues[activePlayback.currentCueIndex].name
                            : 'Nenhum',
            globalMasterIntensity: activePlayback.globalMasterIntensity,
            playbackStatus: activePlayback.playbackStatus
        });
        console.log(`Playback Status Emitted: ${JSON.stringify(activePlayback)}`);
    }
};

// Função para aplicar um cue ao universo DMX
// Agora aceita um overrideFadeTime opcional
const applyCueToDmx = (cue, overrideFadeTime = null) => {
    if (!sendDmxCommandFunction) {
        console.error('sendDmxCommandFunction não foi inicializada no módulo playback.');
        return;
    }

    console.log(`Backend: applyCueToDmx para cue: '${cue.name}'. GlobalMasterIntensity NO INÍCIO DE applyCueToDmx: ${activePlayback.globalMasterIntensity}`);

    const fixtures = getAllFixtures();
    const personalities = getAllPersonalities();
    const dmxCommands = [];

    cue.values.forEach(cueValue => {
        const fixture = fixtures.find(f => f.id === cueValue.fixtureId);
        if (!fixture) {
            console.warn(`Fixture com ID ${cueValue.fixtureId} não encontrado para o cue.`);
            return;
        }

        const personality = personalities.find(p => p.id === fixture.personalityId);
        if (!personality) {
            console.warn(`Personalidade para o fixture ${fixture.name} não encontrada.`);
            return;
        }

        const attribute = personality.attributes.find(attr => attr.name === cueValue.attribute);
        if (!attribute) {
            console.warn(`Atributo ${cueValue.attribute} não encontrado para a personalidade ${personality.name}.`);
            return;
        }

        const dmxChannel = fixture.startChannel + attribute.offset;
        let finalValue = cueValue.value;
        const originalCueValue = finalValue; // Para logging

        // Aplica a intensidade master global
        finalValue = Math.round((finalValue / 255) * (activePlayback.globalMasterIntensity / 255) * 255);
        finalValue = Math.max(0, Math.min(255, finalValue)); // Garante que o valor está entre 0 e 255

        // Usa overrideFadeTime se fornecido, caso contrário, usa o fade_in do cue
        const effectiveFadeTime = overrideFadeTime !== null ? overrideFadeTime : (cue.fade_in || 0.0);

        dmxCommands.push({
            channel: dmxChannel,
            value: finalValue,
            fadeTime: effectiveFadeTime
        });
        console.log(`  Fixture: ${fixture.name}, Atributo: ${cueValue.attribute}, Valor Original Cue: ${originalCueValue}, Global Master Intensity USADO: ${activePlayback.globalMasterIntensity}, Valor Final (após master): ${finalValue}, Fade Time: ${effectiveFadeTime}s`);
    });

    if (dmxCommands.length > 0) {
        dmxCommands.forEach(cmd => sendDmxCommandFunction(cmd.channel, cmd.value, cmd.fadeTime));
        console.log(`Cue aplicado. Enviados ${dmxCommands.length} comandos DMX.`);
    } else {
        console.log('Nenhum comando DMX para aplicar neste cue.');
    }
};

// playCurrentCueAndSetNextTimeout agora apenas aplica o cue atual e configura o timeout para o *próximo* GO, se houver delay
const playCurrentCueAndSetNextTimeout = () => {
    clearTimeout(activePlayback.currentCueTimeout);

    const cuelists = cuelistModule.getAllCuelists();
    const currentCuelist = cuelists.find(cl => cl.id === activePlayback.cuelistId);

    if (!currentCuelist || !currentCuelist.cues || currentCuelist.cues.length === 0 || activePlayback.currentCueIndex === -1 || activePlayback.currentCueIndex >= currentCuelist.cues.length) {
        console.log('Cuelist não encontrada, vazia ou índice de cue inválido. Parando playback.');
        stopPlayback();
        return;
    }

    const currentCue = currentCuelist.cues[activePlayback.currentCueIndex];
    activePlayback.playbackStatus = 'playing';

    // Ao reproduzir um cue normalmente (via GO), usa o fade_in definido no cue
    applyCueToDmx(currentCue, null); // Passa null para usar o fade_in do cue
    emitPlaybackStatus();

    const delayTime = currentCue.delay_in || 0;
    if (delayTime > 0) {
        activePlayback.currentCueTimeout = setTimeout(() => {
            console.log(`Delay do cue '${currentCue.name}' concluído.`);
        }, delayTime * 1000);
    }
};


// --- Funções do Módulo ---

const initPlayback = (io, sendDmxCmdFn, clearDmxFn) => {
    ioInstance = io;
    sendDmxCommandFunction = sendDmxCmdFn;
    clearDmxUniverseFunction = clearDmxFn;
    console.log('Módulo Playback inicializado com funções DMX injetadas.');
};

// startPlayback agora recebe a intensidade master inicial do frontend
const startPlayback = (cuelistId, initialMasterIntensity = 255) => {
    console.log(`Backend: startPlayback INICIADO para cuelist ${cuelistId} com initialMasterIntensity recebido: ${initialMasterIntensity}`);
    const allCuelistsInPlaybackModule = cuelistModule.getAllCuelists(); // Captura o resultado
    console.log(`Playback Module: Todas as cuelists obtidas: ${JSON.stringify(allCuelistsInPlaybackModule.map(cl => ({id: cl.id, name: cl.name})), null, 2)}`);

    // --- NOVO LOG DE DEPURACAO AQUI ---
    console.log(`Playback Module: Tentando encontrar cuelist com ID: '${cuelistId}'`);
    allCuelistsInPlaybackModule.forEach((cl, index) => {
        console.log(`  Cuelist ${index} ID: '${cl.id}', Comparando com target: '${cuelistId}', Resultado da comparação (===): ${cl.id === cuelistId}`);
    });
    // --- FIM DO NOVO LOG DE DEPURACAO ---

    const cuelist = allCuelistsInPlaybackModule.find(cl => cl.id === cuelistId);

    console.log(`Playback Module: Cuelist obtida em startPlayback:`, JSON.stringify(cuelist, null, 2));
    if (cuelist) {
        console.log(`Playback Module: Cuelist.cues existe? ${!!cuelist.cues}, Comprimento de cues: ${cuelist.cues ? cuelist.cues.length : 'N/A'}`);
    }

    if (!cuelist || cuelist.cues.length === 0) {
        console.warn(`Cuelist ${cuelistId} não encontrada ou vazia. Não é possível iniciar o playback.`);
        return false;
    }

    // Antes de qualquer atribuição, log o estado atual para ver se algo está a influenciar
    console.log(`Backend: Estado de activePlayback ANTES de resetar em startPlayback: ${JSON.stringify(activePlayback)}`);

    // Reseta o estado de playback anterior, mas NÃO a intensidade master
    clearTimeout(activePlayback.currentCueTimeout);
    activePlayback.isPlaying = false;
    activePlayback.cuelistId = null;
    activePlayback.currentCueIndex = -1;
    activePlayback.currentCueName = null;
    activePlayback.playbackStatus = 'stopped';

    console.log(`Backend: Estado de activePlayback APÓS resetar (antes de definir nova intensidade): ${JSON.stringify(activePlayback)}`);


    activePlayback.cuelistId = cuelistId;
    activePlayback.isPlaying = true;
    activePlayback.currentCueIndex = 0; // Inicia sempre no primeiro cue (índice 0)
    activePlayback.playbackStatus = 'playing';
    activePlayback.globalMasterIntensity = initialMasterIntensity; // Define a intensidade master inicial
    console.log(`Backend: activePlayback.globalMasterIntensity DEFINIDA para ${activePlayback.globalMasterIntensity} em startPlayback.`);

    console.log(`Iniciando playback da cuelist: ${cuelist.name} com intensidade master: ${initialMasterIntensity}`);
    playCurrentCueAndSetNextTimeout(); // Aplica o primeiro cue
    emitPlaybackStatus();
    return true;
};

const stopPlayback = () => {
    if (activePlayback.currentCueTimeout) {
        clearTimeout(activePlayback.currentCueTimeout);
        activePlayback.currentCueTimeout = null;
    }
    activePlayback.isPlaying = false;
    activePlayback.cuelistId = null;
    activePlayback.currentCueIndex = -1;
    activePlayback.currentCueName = null;
    activePlayback.playbackStatus = 'stopped';
    // REMOVIDO: activePlayback.globalMasterIntensity = 255; // Não resetar aqui!
    console.log('Backend: stopPlayback chamado. Intensidade Master Global NÃO foi resetada.');
    if (clearDmxUniverseFunction) {
        clearDmxUniverseFunction();
    } else {
        console.error('clearDmxUniverseFunction não foi inicializada no módulo playback.');
    }
    emitPlaybackStatus();
    console.log('Playback parado.');
};

const nextCue = () => {
    if (!activePlayback.isPlaying || activePlayback.playbackStatus === 'stopped') {
        console.log('Playback não está ativo para avançar para o próximo cue.');
        return false;
    }

    clearTimeout(activePlayback.currentCueTimeout); // Limpa o timeout do cue atual

    const cuelists = cuelistModule.getAllCuelists();
    const currentCuelist = cuelists.find(cl => cl.id === activePlayback.cuelistId);
    if (!currentCuelist || !currentCuelist.cues || currentCuelist.cues.length === 0) {
        console.log('Cuelist não encontrada ou vazia. Não é possível avançar.');
        stopPlayback();
        return false;
    }

    let nextIndex = activePlayback.currentCueIndex + 1;

    if (nextIndex >= currentCuelist.cues.length) {
        console.log('Fim da cuelist. Não há mais cues para avançar.');
        stopPlayback(); // Para o playback ao chegar ao fim
        return false;
    }

    activePlayback.currentCueIndex = nextIndex;
    activePlayback.playbackStatus = 'playing'; // Garante que o status é 'playing'

    playCurrentCueAndSetNextTimeout(); // Aplica o próximo cue
    emitPlaybackStatus();
    return true;
};

const prevCue = () => {
    if (!activePlayback.isPlaying || activePlayback.playbackStatus === 'stopped') {
        console.log('Playback não está ativo para retroceder cue.');
        return false;
    }

    clearTimeout(activePlayback.currentCueTimeout); // Limpa o timeout do cue atual

    const cuelists = cuelistModule.getAllCuelists();
    const currentCuelist = cuelists.find(cl => cl.id === activePlayback.cuelistId);
    if (!currentCuelist || !currentCuelist.cues || currentCuelist.cues.length === 0) {
        console.log('Cuelist não encontrada ou vazia. Não é possível retroceder.');
        return false;
    }

    let prevIndex = activePlayback.currentCueIndex - 1;

    if (prevIndex < 0) {
        console.log('Já no primeiro cue. Não é possível retroceder mais.');
        return false;
    }

    activePlayback.currentCueIndex = prevIndex;
    activePlayback.playbackStatus = 'playing'; // Garante que o status é 'playing'

    playCurrentCueAndSetNextTimeout(); // Aplica o cue anterior
    emitPlaybackStatus();
    return true;
};

const pausePlayback = () => {
    if (activePlayback.isPlaying && activePlayback.playbackStatus === 'playing') {
        clearTimeout(activePlayback.currentCueTimeout);
        activePlayback.playbackStatus = 'paused';
        activePlayback.isPlaying = false;
        emitPlaybackStatus();
        console.log('Playback pausado.');
        return true;
    }
    console.log('Playback não está ativo ou já está pausado.');
    return false;
};

const resumePlayback = () => {
    if (activePlayback.playbackStatus === 'paused') {
        activePlayback.isPlaying = true;
        activePlayback.playbackStatus = 'playing';
        console.log('Retomando playback.');
        playCurrentCueAndSetNextTimeout();
        emitPlaybackStatus();
        return true;
    }
    console.log('Playback não está pausado para ser retomado.');
    return false;
};

const setGlobalMasterIntensity = (intensity) => {
    const parsedIntensity = Math.max(0, Math.min(255, parseInt(intensity, 10)));
    if (activePlayback.globalMasterIntensity !== parsedIntensity) {
        activePlayback.globalMasterIntensity = parsedIntensity;
        console.log(`Intensidade Master Global definida para: ${parsedIntensity}`);
        emitPlaybackStatus();
        // Se houver um cue ativo, reaplica-o para que a intensidade master tenha efeito imediato
        if (activePlayback.isPlaying && activePlayback.cuelistId && activePlayback.currentCueIndex !== -1) {
            const cuelists = cuelistModule.getAllCuelists();
            const currentCuelist = cuelists.find(cl => cl.id === activePlayback.cuelistId);
            if (currentCuelist) {
                // Passa 0.0 como fadeTime para que o fader responda instantaneamente
                applyCueToDmx(currentCuelist.cues[activePlayback.currentCueIndex], 0.0);
            }
        }
    }
};


module.exports = {
    initPlayback,
    startPlayback,
    stopPlayback,
    nextCue,
    prevCue,
    pausePlayback,
    resumePlayback,
    setGlobalMasterIntensity,
    getPlaybackStatus: () => activePlayback
};
