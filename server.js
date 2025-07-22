// mesa-de-luz-engine/server.js - Com Debugging

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const DMX = require('dmx');
const dmx = new DMX();
const midi = require('midi');
const cors = require('cors');

// Importar módulos
const patch = require('./src/modules/patch');
const personality = require('./src/modules/personality');
const preset = require('./src/modules/preset');
const cuelist = require('./src/modules/cuelist');
const playback = require('./src/modules/playback');
const effectsEngine = require('./src/modules/effects-engine');
const executorModule = require('./src/modules/executor');
const midiMappingModule = require('./src/modules/midi-mapping');
const programmerModule = require('./src/modules/programmer');

const app = express();
const server = http.createServer(app);

// Configurar CORS para permitir conexão do frontend React
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const PORT = process.env.PORT || 3001;

let universe = null;
const DMX_PORT = 'COM5';
const DMX_DRIVER = 'enttec-usb-dmx-pro';

const currentDmxState = {};
for (let i = 1; i <= 512; i++) {
    currentDmxState[i] = 0;
}

const activeFades = new Map();
const FADE_UPDATE_INTERVAL = 20; // ms

// --- Função Centralizada para Enviar Comandos DMX com Fade ---
function sendDmxCommandToUniverse(channel, value, fadeTime = 0.0) {
    if (!universe) {
        console.warn(`DMX Universe não está configurado. Não é possível enviar comando para o canal ${channel}.`);
        io.emit('server_message', `Erro DMX: Universo não configurado.`);
        return;
    }

    if (isNaN(channel) || channel < 1 || channel > 512) {
        console.error(`Erro: Canal DMX ${channel} fora do range válido (1-512).`);
        io.emit('server_message', `Erro DMX: Canal ${channel} inválido.`);
        return;
    }
    if (isNaN(value) || value < 0 || value > 255) {
        console.error(`Erro: Valor DMX ${value} fora do range válido (0-255) para o canal ${channel}.`);
        io.emit('server_message', `Erro DMX: Valor ${value} inválido para canal ${channel}.`);
        return;
    }
    if (isNaN(fadeTime) || fadeTime < 0 || fadeTime > 999.9) {
        console.error(`Erro: Fade time ${fadeTime} fora do range válido (0-999.9s) para o canal ${channel}.`);
        io.emit('server_message', `Erro DMX: Fade time ${fadeTime} inválido para canal ${channel}.`);
        return;
    }

    const startValue = currentDmxState[channel];
    const endValue = value;
    const fadeTimeMs = fadeTime * 1000;

    if (activeFades.has(channel)) {
        activeFades.delete(channel);
    }

    if (fadeTimeMs === 0) {
        currentDmxState[channel] = endValue;
        universe.update({ [channel]: endValue });
        io.emit('dmx_state_updated', currentDmxState);
    } else {
        activeFades.set(channel, {
            startValue: startValue,
            targetValue: endValue,
            startTime: Date.now(),
            fadeTimeMs: fadeTimeMs
        });
    }
}

function clearDmxUniverse() {
    if (universe) {
        universe.updateAll(0);
        for (let i = 1; i <= 512; i++) {
            currentDmxState[i] = 0;
        }
        io.emit('dmx_state_updated', currentDmxState);
        console.log('Todos os canais DMX zerados.');
    } else {
        console.warn('Não foi possível zerar o universo DMX: Universo não configurado.');
    }
}

try {
    console.log(`DMX: Tentando inicializar com driver '${DMX_DRIVER}' na porta '${DMX_PORT}'...`);

    const tempUniverse = dmx.addUniverse('my-universe', DMX_DRIVER, DMX_PORT);

    if (tempUniverse && tempUniverse.dev && tempUniverse.dev.path) {
        universe = tempUniverse;
        console.log(`DMX: Conexão bem-sucedida ao Enttec DMX USB PRO.`);
        console.log(`DMX: Universo 'my-universe' adicionado com sucesso, usando driver '${DMX_DRIVER}' na porta ${universe.dev.path}.`);
        universe.updateAll(0);
    } else {
        console.error(`ERRO DMX: dmx.addUniverse retornou um objeto universo inválido para driver '${DMX_DRIVER}' na porta '${DMX_PORT}'.`);
        console.error('Isso indica que o dispositivo Enttec não foi encontrado ou não pôde ser aberto, mesmo que o objeto tenha sido criado.');
        console.log('Tentando adicionar universo DMX virtual para desenvolvimento (sem hardware físico)...');
        universe = dmx.addUniverse('my-universe', 'null');
        console.log('Universo DMX virtual adicionado para teste.');
    }
} catch (error) {
    console.error('ERRO DMX CRÍTICO: Exceção capturada ao tentar adicionar universo DMX com hardware:', error);
    console.error('Verifique a conexão do Enttec, drivers e se a porta COM está correta e não está em uso por outro software.');
    console.log('Tentando adicionar universo DMX virtual para desenvolvimento (devido a erro grave)...');
    universe = dmx.addUniverse('my-universe', 'null');
    console.log('Universo DMX virtual adicionado para teste.');
}

setInterval(() => {
    if (!universe) return;

    const now = Date.now();
    let changesToApply = {};

    activeFades.forEach((fadeInfo, channel) => {
        const { startValue, targetValue, startTime, fadeTimeMs } = fadeInfo;

        const elapsedTime = now - startTime;

        if (elapsedTime >= fadeTimeMs) {
            currentDmxState[channel] = targetValue;
            changesToApply[channel] = targetValue;
            activeFades.delete(channel);
        } else {
            const progress = elapsedTime / fadeTimeMs;
            const newValue = Math.round(startValue + (targetValue - startValue) * progress);

            if (currentDmxState[channel] !== newValue) {
                currentDmxState[channel] = newValue;
                changesToApply[channel] = newValue;
            }
        }
    });

    if (Object.keys(changesToApply).length > 0) {
        universe.update(changesToApply);
        io.emit('dmx_state_updated', currentDmxState);
    }
}, FADE_UPDATE_INTERVAL);


// --- Configuração da Porta MIDI ---
const input = new midi.Input();
const output = new midi.Output();
let midiPortOpen = false;
try {
    const portCount = output.getPortCount();
    let midiBridgePortId = -1;
    console.log('Portas MIDI disponíveis:');
    for (let i = 0; i < portCount; i++) {
        const portName = output.getPortName(i);
        console.log(`- MIDI Port ${i}: ${portName}`);
        if (portName.includes('MIDI Bridge')) {
            midiBridgePortId = i;
            break;
        }
        if (midiBridgePortId === -1 && i === 0 && portCount > 0) {
            midiBridgePortId = i;
            break;
        }
    }

    if (midiBridgePortId !== -1) {
        output.openPort(midiBridgePortId);
        midiPortOpen = true;
        console.log(`Porta MIDI '${output.getPortName(midiBridgePortId)}' aberta com sucesso.`);
    } else {
        console.warn('Porta MIDI "MIDI Bridge" não encontrada e nenhuma outra porta foi aberta. Testes MIDI podem não funcionar.');
    }

    if (input.getPortCount() > 0) {
        input.openPort(0);
        input.on('message', (deltaTime, message) => {
            console.log(`MIDI: Recebido: ${message} (delta: ${deltaTime})`);
            io.emit('midi_message_received', { deltaTime, message });

            const status = message[0];
            const data1 = message[1];
            let data2 = message[2];

            const midiChannel = (status & 0x0F) + 1;
            const messageType = status & 0xF0;

            let processed = false; // Flag para indicar se a mensagem foi processada por um mapeamento

            if (messageType === 0xB0) { // Control Change (CC)
                // Tentar encontrar mapeamento de encoder relativo para EXECUTOR
                const encoderExecutorMapping = midiMappingModule.findMidiMapping('encoder_relative', midiChannel, data1, 'executor');
                if (encoderExecutorMapping && (data2 === encoderExecutorMapping.incrementValue || data2 === encoderExecutorMapping.decrementValue)) {
                    console.log(`MIDI: Mapeamento ENCODER (Executor) encontrado para CC ${data1} Canal ${midiChannel}.`);
                    let newFaderValue;
                    const currentExecutor = executorModule.getAllExecutors().find(exec => exec.id === encoderExecutorMapping.executorId);

                    if (currentExecutor) {
                        let currentVal = currentExecutor.faderValue;
                        if (data2 === encoderExecutorMapping.incrementValue) {
                            newFaderValue = currentVal + encoderExecutorMapping.stepSize;
                        } else if (data2 === encoderExecutorMapping.decrementValue) {
                            newFaderValue = currentVal - encoderExecutorMapping.stepSize;
                        } else {
                            return; // Ignorar outros valores do encoder (como o '0' de reset)
                        }
                        newFaderValue = Math.max(0, Math.min(255, newFaderValue));
                        executorModule.updateExecutorFaderFromMidi(encoderExecutorMapping.executorId, newFaderValue);
                        io.emit('executors_updated', executorModule.getAllExecutors());
                        processed = true;
                    }
                }

                // Se não foi processado como encoder de executor, tentar como encoder de PROGRAMADOR
                if (!processed) {
                    const encoderProgrammerMapping = midiMappingModule.findMidiMapping('encoder_relative', midiChannel, data1, 'programmer');
                    if (encoderProgrammerMapping && (data2 === encoderProgrammerMapping.incrementValue || data2 === encoderProgrammerMapping.decrementValue)) {
                        console.log(`MIDI: Mapeamento ENCODER (Programador) encontrado para CC ${data1} Canal ${midiChannel}.`);
                        const fixture = patch.getFixtureById(encoderProgrammerMapping.fixtureId);
                        const personality = personality.getPersonalityById(fixture ? fixture.personalityId : null);

                        if (fixture && personality) {
                            const attributeInfo = personality.attributes.find(attr => attr.name === encoderProgrammerMapping.attributeName);
                            if (attributeInfo) {
                                const currentProgrammerValue = programmerModule.getProgrammerValue(fixture.id, attributeInfo.name);
                                let newProgrammerValue;

                                if (data2 === encoderProgrammerMapping.incrementValue) {
                                    newProgrammerValue = currentProgrammerValue + encoderProgrammerMapping.stepSize;
                                } else if (data2 === encoderProgrammerMapping.decrementValue) {
                                    newProgrammerValue = currentProgrammerValue - encoderProgrammerMapping.stepSize;
                                } else {
                                    return; // Ignorar outros valores do encoder
                                }

                                newProgrammerValue = Math.max(0, Math.min(255, newProgrammerValue));
                                console.log(`MIDI: Chamando programmerModule.updateProgrammerValue para Fixture: ${fixture.name}, Atributo: ${attributeInfo.name}, Valor: ${newProgrammerValue}`);
                                programmerModule.updateProgrammerValue(fixture.id, attributeInfo.name, newProgrammerValue);
                                processed = true;
                            } else {
                                console.warn(`MIDI: Atributo '${encoderProgrammerMapping.attributeName}' não encontrado na personalidade para o mapeamento de encoder do programador.`);
                            }
                        } else {
                            console.warn(`MIDI: Fixture ou Personalidade não encontrados para o mapeamento de encoder do programador.`);
                        }
                    }
                }

                // Se não foi processado como encoder, tentar como CC ABSOLUTO (Executor ou Programador)
                if (!processed) {
                    const absoluteExecutorMapping = midiMappingModule.findMidiMapping('cc', midiChannel, data1, 'executor');
                    if (absoluteExecutorMapping) {
                        console.log(`MIDI: Mapeamento ABSOLUTO (Executor) encontrado para CC ${data1} Canal ${midiChannel}.`);
                        const mappedValue = Math.round(
                            absoluteExecutorMapping.targetMin +
                            ((data2 - absoluteExecutorMapping.minValue) / (absoluteExecutorMapping.maxValue - absoluteExecutorMapping.minValue)) *
                            (absoluteExecutorMapping.targetMax - absoluteExecutorMapping.targetMin)
                        );
                        const finalDmxValue = Math.max(0, Math.min(255, mappedValue));
                        executorModule.updateExecutorFaderFromMidi(absoluteExecutorMapping.executorId, finalDmxValue);
                        io.emit('executors_updated', executorModule.getAllExecutors());
                        processed = true;
                    }
                }

                if (!processed) {
                    const absoluteProgrammerMapping = midiMappingModule.findMidiMapping('cc', midiChannel, data1, 'programmer');
                    if (absoluteProgrammerMapping) {
                        console.log(`MIDI: Mapeamento ABSOLUTO (Programador) encontrado para CC ${data1} Canal ${midiChannel}.`);
                        const mappedValue = Math.round(
                            absoluteProgrammerMapping.targetMin +
                            ((data2 - absoluteProgrammerMapping.minValue) / (absoluteProgrammerMapping.maxValue - absoluteProgrammerMapping.minValue)) *
                            (absoluteProgrammerMapping.targetMax - absoluteProgrammerMapping.targetMin)
                        );
                        const finalDmxValue = Math.max(0, Math.min(255, mappedValue));
                        console.log(`MIDI: Chamando programmerModule.updateProgrammerValue para Fixture: ${absoluteProgrammerMapping.fixtureId}, Atributo: ${absoluteProgrammerMapping.attributeName}, Valor: ${finalDmxValue}`);
                        programmerModule.updateProgrammerValue(absoluteProgrammerMapping.fixtureId, absoluteProgrammerMapping.attributeName, finalDmxValue);
                        processed = true;
                    }
                }

            } else if (messageType === 0x90 || messageType === 0x80) { // Note On / Note Off
                // Para simplificar, Note Off (0x80) também será tratado, forçando data2 a 0
                if (messageType === 0x80) data2 = 0;

                // Tentar encontrar mapeamento de Note para EXECUTOR
                const noteExecutorMapping = midiMappingModule.findMidiMapping('note', midiChannel, data1, 'executor');
                if (noteExecutorMapping) {
                    console.log(`MIDI: Mapeamento NOTE (Executor) encontrado para Nota ${data1} Canal ${midiChannel}.`);
                    const mappedValue = Math.round(
                        noteExecutorMapping.targetMin +
                        ((data2 - noteExecutorMapping.minValue) / (noteExecutorMapping.maxValue - noteExecutorMapping.minValue)) *
                        (noteExecutorMapping.targetMax - noteExecutorMapping.targetMin)
                    );
                    const finalDmxValue = Math.max(0, Math.min(255, mappedValue));
                    executorModule.updateExecutorFaderFromMidi(noteExecutorMapping.executorId, finalDmxValue);
                    io.emit('executors_updated', executorModule.getAllExecutors());
                    processed = true;
                }

                // Se não foi processado como Note de executor, tentar como Note de PROGRAMADOR
                if (!processed) {
                    const noteProgrammerMapping = midiMappingModule.findMidiMapping('note', midiChannel, data1, 'programmer');
                    if (noteProgrammerMapping) {
                        console.log(`MIDI: Mapeamento NOTE (Programador) encontrado para Nota ${data1} Canal ${midiChannel}.`);
                        const mappedValue = Math.round(
                            noteProgrammerMapping.targetMin +
                            ((data2 - noteProgrammerMapping.minValue) / (noteProgrammerMapping.maxValue - noteProgrammerMapping.minValue)) *
                            (noteProgrammerMapping.targetMax - noteProgrammerMapping.targetMin)
                        );
                        const finalDmxValue = Math.max(0, Math.min(255, mappedValue));
                        console.log(`MIDI: Chamando programmerModule.updateProgrammerValue para Fixture: ${noteProgrammerMapping.fixtureId}, Atributo: ${noteProgrammerMapping.attributeName}, Valor: ${finalDmxValue}`);
                        programmerModule.updateProgrammerValue(noteProgrammerMapping.fixtureId, noteProgrammerMapping.attributeName, finalDmxValue);
                        processed = true;
                    }
                }
            }

            if (!processed) {
                console.log(`MIDI: Nenhuma ação para mensagem MIDI: Tipo ${messageType}, Canal ${midiChannel}, Controlo ${data1}, Valor ${data2}.`);
            }
        });
        console.log(`MIDI: Porta de entrada MIDI '${input.getPortName(0)}' aberta.`);
        io.emit('server_message', `MIDI: Porta de entrada aberta: ${input.getPortName(0)}.`);
    } else {
        console.warn('MIDI: Nenhuma porta de entrada MIDI encontrada.');
        io.emit('server_message', `MIDI: Nenhuma porta de entrada encontrada.`);
    }

} catch (error) {
    console.error('Erro ao abrir porta MIDI:', error.message);
}


app.get('/', (req, res) => {
    res.send('Servidor do Engine/Core está a correr!');
});

io.on('connection', (socket) => {
    console.log('Um cliente conectou-se ao Socket.io:', socket.id);
    socket.emit('server_message', `Bem-vindo, cliente ${socket.id}! Conectado ao Engine/Core.`);

    socket.emit('fixtures_updated', patch.getAllFixtures());
    socket.emit('personalities_updated', personality.getAllPersonalities());
    socket.emit('presets_updated', preset.getAllPresets());
    socket.emit('cuelists_updated', cuelist.getAllCuelists());
    socket.emit('executors_updated', executorModule.getAllExecutors());
    socket.emit('dmx_state_updated', currentDmxState);
    socket.emit('playback_status_updated', playback.getPlaybackStatus());
    socket.emit('active_effects_status', effectsEngine.getActiveEffectsStatus());
    socket.emit('midi_mappings_updated', midiMappingModule.getAllMidiMappings());

    socket.on('dmx_command', (data) => {
        sendDmxCommandToUniverse(data.channel, data.value, data.fadeTime);
    });

    socket.on('apply_dmx_commands', (commands) => {
        console.log(`Server: Recebido 'apply_dmx_commands' com ${commands.length} comandos.`);
        io.emit('server_message', `Server: Aplicando preset com ${commands.length} comandos DMX.`);
        commands.forEach(cmd => {
            sendDmxCommandToUniverse(cmd.channel, cmd.value, cmd.fadeTime || 0.0);
        });
    });

    socket.on('create_fixture', (fixtureData) => {
        try {
            const newFixture = patch.createFixture(fixtureData);
            io.emit('fixtures_updated', patch.getAllFixtures());
            io.emit('server_message', `Fixture '${newFixture.name}' criado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao criar fixture:', error.message);
            io.emit('server_message', `Erro ao criar fixture: ${error.message}`);
        }
    });

    socket.on('update_fixture', (data) => {
        try {
            const updatedFixture = patch.updateFixture(data.id, data.updates);
            io.emit('fixtures_updated', patch.getAllFixtures());
            io.emit('server_message', `Fixture '${updatedFixture.name}' atualizado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar fixture:', error.message);
            io.emit('server_message', `Erro ao atualizar fixture: ${error.message}`);
        }
    });

    socket.on('delete_fixture', (id) => {
        try {
            const success = patch.deleteFixture(id);
            if (success) {
                io.emit('fixtures_updated', patch.getAllFixtures());
                io.emit('server_message', `Fixture '${id}' removido com sucesso.`);
            } else {
                io.emit('server_message', `Fixture '${id}' não encontrado para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover fixture:', error.message);
            io.emit('server_message', `Erro ao remover fixture: ${error.message}`);
        }
    });

    socket.on('create_personality', (personalityData) => {
        try {
            const newPersonality = personality.createPersonality(personalityData);
            io.emit('personalities_updated', personality.getAllPersonalities());
            io.emit('server_message', `Personalidade '${newPersonality.name}' criada com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao criar personalidade:', error.message);
            io.emit('server_message', `Erro ao criar personalidade: ${error.message}`);
        }
    });

    socket.on('update_personality', (data) => {
        try {
            const updatedPersonality = personality.updatePersonality(data.id, data.updates);
            io.emit('personalities_updated', personality.getAllPersonalities());
            io.emit('server_message', `Personalidade '${updatedPersonality.name}' atualizada com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar personalidade:', error.message);
            io.emit('server_message', `Erro ao atualizar personalidade: ${error.message}`);
        }
    });

    socket.on('delete_personality', (id) => {
        try {
            const success = personality.deletePersonality(id);
            if (success) {
                io.emit('personalities_updated', personality.getAllPersonalities());
                io.emit('server_message', `Personalidade '${id}' removida com sucesso.`);
            } else {
                io.emit('server_message', `Personalidade '${id}' não encontrada para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover personalidade:', error.message);
            io.emit('server_message', `Erro ao remover personalidade: ${error.message}`);
        }
    });

    socket.on('create_preset', (presetData) => {
        try {
            const newPreset = preset.createPreset(presetData);
            io.emit('presets_updated', preset.getAllPresets());
            io.emit('server_message', `Preset '${newPreset.name}' criado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao criar preset:', error.message);
            io.emit('server_message', `Erro ao criar preset: ${error.message}`);
        }
    });

    socket.on('update_preset', (data) => {
        try {
            const updatedPreset = preset.updatePreset(data.id, data.updates);
            io.emit('presets_updated', preset.getAllPresets());
            io.emit('server_message', `Preset '${updatedPreset.name}' atualizado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar preset:', error.message);
            io.emit('server_message', `Erro ao atualizar preset: ${error.message}`);
        }
    });

    socket.on('delete_preset', (id) => {
        try {
            const success = preset.deletePreset(id);
            if (success) {
                io.emit('presets_updated', preset.getAllPresets());
                io.emit('server_message', `Preset '${id}' removido com sucesso.`);
            } else {
                io.emit('server_message', `Preset '${id}' não encontrado para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover preset:', error.message);
            io.emit('server_message', `Erro ao remover preset: ${error.message}`);
        }
    });

    socket.on('create_cuelist', (cuelistData) => {
        try {
            const newCuelist = cuelist.createCuelist(cuelistData);
            io.emit('cuelists_updated', cuelist.getAllCuelists());
            io.emit('server_message', `Cuelist '${newCuelist.name}' criada com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao criar cuelist:', error.message);
            io.emit('server_message', `Erro ao criar cuelist: ${error.message}`);
        }
    });

    socket.on('update_cuelist', (data) => {
        try {
            const updatedCuelist = cuelist.updateCuelist(data.id, data.updates);
            io.emit('cuelists_updated', cuelist.getAllCuelists());
            io.emit('server_message', `Cuelist '${updatedCuelist.name}' atualizada com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar cuelist:', error.message);
            io.emit('server_message', `Erro ao atualizar cuelist: ${error.message}`);
        }
    });

    socket.on('delete_cuelist', (id) => {
        try {
            const success = cuelist.deleteCuelist(id);
            if (success) {
                io.emit('cuelists_updated', cuelist.getAllCuelists());
                io.emit('server_message', `Cuelist '${id}' removida com sucesso.`);
            } else {
                io.emit('server_message', `Cuelist '${id}' não encontrada para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover cuelist:', error.message);
            io.emit('server_message', `Erro ao remover cuelist: ${error.message}`);
        }
    });

    socket.on('add_cue_to_cuelist', (data) => {
        try {
            const updatedCuelist = cuelist.addCueToCuelist(data.cuelistId, data.cueData);
            io.emit('cuelists_updated', cuelist.getAllCuelists());
            io.emit('server_message', `Cue '${data.cueData.name}' adicionado à cuelist '${updatedCuelist.name}'.`);
        } catch (error) {
            console.error('Server: Erro ao adicionar cue à cuelist:', error.message);
            io.emit('server_message', `Erro ao adicionar cue: ${error.message}`);
        }
    });

    socket.on('update_cue_in_cuelist', (data) => {
        try {
            const updatedCue = cuelist.updateCueInCuelist(data.cuelistId, data.cueId, data.updates);
            io.emit('cuelists_updated', cuelist.getAllCuelists());
            io.emit('server_message', `Cue '${updatedCue.name}' na cuelist '${data.cuelistId}' atualizado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar cue na cuelist:', error.message);
            io.emit('server_message', `Erro ao atualizar cue: ${error.message}`);
        }
    });

    socket.on('delete_cue_from_cuelist', (data) => {
        try {
            const success = cuelist.deleteCueFromCuelist(data.cuelistId, data.cueId);
            if (success) {
                io.emit('cuelists_updated', cuelist.getAllCuelists());
                io.emit('server_message', `Cue '${data.cueId}' removido da cuelist '${data.cuelistId}'.`);
            } else {
                io.emit('server_message', `Cue '${data.cueId}' não encontrado na cuelist '${data.cuelistId}' para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover cue da cuelist:', error.message);
            io.emit('server_message', `Erro ao remover cue: ${error.message}`);
        }
    });

    socket.on('start_playback', async (cuelistId, masterIntensity) => {
        console.log(`Backend: start_playback event received.`);
        console.log(`Backend: Received cuelistId:`, cuelistId, `(Type: ${typeof cuelistId})`);
        console.log(`Backend: Received masterIntensity:`, masterIntensity, `(Type: ${typeof masterIntensity})`);

        let actualCuelistId = cuelistId;
        if (typeof cuelistId === 'object' && cuelistId !== null && cuelistId.id) {
            actualCuelistId = cuelistId.id;
            console.warn(`Backend: cuelistId recebido como objeto. Usando cuelistId.id: ${actualCuelistId}`);
        } else if (typeof cuelistId !== 'string') {
            actualCuelistId = String(cuelistId);
            console.warn(`Backend: cuelistId recebido não é string nem objeto com .id. Convertendo para string: ${actualCuelistId}`);
        }

        try {
            const selectedCuelist = cuelist.getCuelistById(actualCuelistId);
            if (!selectedCuelist) {
                throw new Error(`Cuelist com ID '${actualCuelistId}' não encontrada ou vazia. Não é possível iniciar o playback.`);
            }
            await playback.startPlayback(selectedCuelist.id, masterIntensity);
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Comando 'start_playback' para cuelist ${selectedCuelist.name} recebido.`);
        } catch (error) {
            console.error('Server: Erro ao iniciar playback:', error.message);
            io.emit('server_message', `Erro ao iniciar playback: ${error.message}`);
        }
    });

    socket.on('pause_playback', () => {
        try {
            playback.pausePlayback();
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Comando 'pause_playback' recebido.`);
        } catch (error) {
            console.error('Server: Erro ao pausar playback:', error.message);
            io.emit('server_message', `Erro ao pausar playback: ${error.message}`);
        }
    });

    socket.on('resume_playback', async () => {
        try {
            await playback.resumePlayback();
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Comando 'resume_playback' recebido.`);
        } catch (error) {
            console.error('Server: Erro ao retomar playback:', error.message);
            io.emit('server_message', `Erro ao retomar playback: ${error.message}`);
        }
    });

    socket.on('stop_playback', async () => {
        try {
            await playback.stopPlayback();
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Comando 'stop_playback' recebido.`);
        } catch (error) {
            console.error('Server: Erro ao parar playback:', error.message);
            io.emit('server_message', `Erro ao parar playback: ${error.message}`);
        }
    });

    socket.on('next_cue', async () => {
        try {
            await playback.nextCue();
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Comando 'next_cue' recebido.`);
        } catch (error) {
            console.error('Server: Erro ao avançar cue:', error.message);
            io.emit('server_message', `Erro ao avançar cue: ${error.message}`);
        }
    });

    socket.on('prev_cue', async () => {
        try {
            await playback.prevCue();
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Comando 'prev_cue' recebido.`);
        } catch (error) {
            console.error('Server: Erro ao retroceder cue:', error.message);
            io.emit('server_message', `Erro ao retroceder cue: ${error.message}`);
        }
    });

    socket.on('request_playback_status', () => {
        socket.emit('playback_status_updated', playback.getPlaybackStatus());
    });

    socket.on('set_global_master_intensity', (intensity) => {
        try {
            playback.setGlobalMasterIntensity(intensity);
            io.emit('playback_status_updated', playback.getPlaybackStatus());
            socket.emit('server_message', `Intensidade Master Global definida para ${intensity}.`);
        } catch (error) {
            console.error('Server: Erro ao definir intensidade master global:', error.message);
            io.emit('server_message', `Erro ao definir intensidade master global: ${error.message}`);
        }
    });

    socket.on('start_effect', (data) => {
        console.log('Server: Recebido start_effect:', data);
        try {
            const effectId = effectsEngine.startEffect(data.type, data.fixtureIds, data.params);
            if (effectId) {
                io.emit('active_effects_status', effectsEngine.getActiveEffectsStatus());
                socket.emit('server_message', `Efeito '${data.type}' iniciado com sucesso.`);
            } else {
                socket.emit('server_message', `Erro ao iniciar efeito '${data.type}'.`);
            }
        } catch (error) {
            console.error('Server: Erro ao iniciar efeito:', error.message);
            io.emit('server_message', `Erro ao iniciar efeito: ${error.message}`);
        }
    });

    socket.on('stop_effect', (effectId) => {
        console.log('Server: Recebido stop_effect:', effectId);
        try {
            effectsEngine.stopEffect(effectId);
            io.emit('active_effects_status', effectsEngine.getActiveEffectsStatus());
            socket.emit('server_message', `Efeito '${effectId}' parado.`);
        } catch (error) {
            console.error('Server: Erro ao parar efeito:', error.message);
            io.emit('server_message', `Erro ao parar efeito: ${error.message}`);
        }
    });

    socket.on('stop_all_effects', () => {
        console.log('Server: Recebido stop_all_effects.');
        try {
            effectsEngine.stopAllEffects();
            io.emit('active_effects_status', effectsEngine.getActiveEffectsStatus());
            socket.emit('server_message', `Todos os efeitos parados.`);
        } catch (error) {
            console.error('Server: Erro ao parar todos os efeitos:', error.message);
            io.emit('server_message', `Erro ao parar todos os efeitos: ${error.message}`);
        }
    });

    socket.on('update_effect', (data) => {
        console.log('Server: Recebido update_effect:', data);
        try {
            effectsEngine.updateEffect(data.effectId, data.newParams);
            io.emit('active_effects_status', effectsEngine.getActiveEffectsStatus());
            socket.emit('server_message', `Efeito '${data.effectId}' atualizado.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar efeito:', error.message);
            io.emit('server_message', `Erro ao atualizar efeito: ${error.message}`);
        }
    });

    socket.on('request_active_effects_status', () => {
        socket.emit('active_effects_status', effectsEngine.getActiveEffectsStatus());
    });

    socket.on('create_executor', (executorData) => {
        try {
            const newExecutor = executorModule.createExecutor(executorData);
            io.emit('executors_updated', executorModule.getAllExecutors());
            io.emit('server_message', `Executor '${newExecutor.name}' criado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao criar executor:', error.message);
            io.emit('server_message', `Erro ao criar executor: ${error.message}`);
        }
    });

    socket.on('update_executor', (data) => {
        try {
            const updatedExecutor = executorModule.updateExecutor(data.id, data.updates);
            io.emit('executors_updated', executorModule.getAllExecutors());
            io.emit('server_message', `Executor '${updatedExecutor.name}' atualizado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao atualizar executor:', error.message);
            io.emit('server_message', `Erro ao atualizar executor: ${error.message}`);
        }
    });

    socket.on('delete_executor', (id) => {
        try {
            const success = executorModule.deleteExecutor(id);
            if (success) {
                io.emit('executors_updated', executorModule.getAllExecutors());
                io.emit('server_message', `Executor '${id}' removido com sucesso.`);
            } else {
                io.emit('server_message', `Executor '${id}' não encontrado para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover executor:', error.message);
            io.emit('server_message', `Erro ao remover executor: ${error.message}`);
        }
    });

    socket.on('request_executors_status', () => {
        socket.emit('executors_updated', executorModule.getAllExecutors());
    });

    socket.on('save_midi_mapping', (mappingData) => {
        try {
            const newMapping = midiMappingModule.saveMidiMapping(mappingData);
            io.emit('midi_mappings_updated', midiMappingModule.getAllMidiMappings());
            io.emit('server_message', `Mapeamento MIDI para ${newMapping.targetType} (Tipo: ${newMapping.midiType}) guardado com sucesso.`);
        } catch (error) {
            console.error('Server: Erro ao guardar mapeamento MIDI:', error.message);
            io.emit('server_message', `Erro ao guardar mapeamento MIDI: ${error.message}`);
        }
    });

    socket.on('delete_midi_mapping', (id) => {
        try {
            const success = midiMappingModule.deleteMidiMapping(id);
            if (success) {
                io.emit('midi_mappings_updated', midiMappingModule.getAllMidiMappings());
                io.emit('server_message', `Mapeamento MIDI '${id.substring(0, 8)}...' removido com sucesso.`);
            } else {
                io.emit('server_message', `Mapeamento MIDI '${id.substring(0, 8)}...' não encontrado para remoção.`);
            }
        } catch (error) {
            console.error('Server: Erro ao remover mapeamento MIDI:', error.message);
            io.emit('server_message', `Erro ao remover mapeamento MIDI: ${error.message}`);
        }
    });

    socket.on('request_midi_mappings', () => {
        socket.emit('midi_mappings_updated', midiMappingModule.getAllMidiMappings());
    });

    socket.on('request_fixtures', () => {
        socket.emit('fixtures_updated', patch.getAllFixtures());
    });

    socket.on('request_personalities', () => {
        socket.emit('personalities_updated', personality.getAllPersonalities());
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        io.emit('server_message', `Cliente desconectado: ${socket.id}`);
    });
});


server.listen(PORT, async () => {
    console.log(`Servidor do Engine/Core a correr na porta ${PORT}`);
    io.emit('server_message', `Server Engine/Core iniciado na porta ${PORT}.`);

    playback.initPlayback(io, sendDmxCommandToUniverse, clearDmxUniverse);
    effectsEngine.initEffectsEngine(sendDmxCommandToUniverse);
    executorModule.initExecutorModule(playback, cuelist);
    programmerModule.initProgrammerModule(io, sendDmxCommandToUniverse, patch, personality);


    setTimeout(() => {
        if (universe) {
            console.log('Enviando teste DMX: Canal 1 para 255 (fade de 2s)...');
            sendDmxCommandToUniverse(1, 255, 2.0);
            console.log('DMX fade (teste inicial) enviado!');

            setTimeout(() => {
                console.log('Enviando teste DMX: Canal 1 para 0 (fade de 2s)...');
                sendDmxCommandToUniverse(1, 0, 2.0);
                console.log('DMX fade (teste final) desligado!');
            }, 5000);
        } else {
            console.warn('Universo DMX não está disponível para o teste temporizado.');
        }
    }, 5000);

    setTimeout(() => {
        if (midiPortOpen) {
            console.log('Enviando teste MIDI: Note On (C3, 100)...');
            output.sendMessage([0x90, 60, 100]);
            console.log('MIDI enviado!');

            setTimeout(() => {
                console.log('Enviando teste MIDI: Note Off (C3, 0)...');
                output.sendMessage([0x80, 60, 0]);
                console.log('MIDI desligado!');
            }, 1000);
        } else {
            console.warn('Porta MIDI não está disponível para o teste temporizado.');
        }
    }, 10000);
});

process.on('exit', () => {
    if (midiPortOpen) {
        input.closePort();
        output.closePort();
        console.log('Portas MIDI fechadas.');
    }
    if (universe) {
        universe.updateAll(0);
        console.log('Todos os canais DMX zerados ao encerrar.');
    }
});

process.on('SIGINT', () => {
    console.log('\nServidor encerrado por Ctrl+C. Fechando portas e zerando DMX...');
    clearDmxUniverse();
    effectsEngine.stopAllEffects();
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('\nServidor encerrado por SIGTERM. Fechando portas e zerando DMX...');
    clearDmxUniverse();
    effectsEngine.stopAllEffects();
    process.exit();
});
