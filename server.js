// server.js na pasta mesa-de-luz-engine

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const DMX = require('dmx'); // Importa a biblioteca DMX
const dmx = new DMX(); // Cria uma nova instância do DMX
const midi = require('midi'); // Importa a biblioteca MIDI
const patch = require('./src/modules/patch'); // Importa o módulo de patch
const personality = require('./src/modules/personality'); // Importa o módulo de personalidade
const preset = require('./src/modules/preset'); // Importa o módulo de preset
const cuelist = require('./src/modules/cuelist'); // Importa o módulo de cuelist
const playback = require('./src/modules/playback'); // NOVO: Importa o módulo playback (substitui o executor para cuelists)


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permitir todas as origens para desenvolvimento. CUIDADO em produção!
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001; // Usar a porta 3001 para o backend

// --- Configuração da Porta DMX ---
let universe = null;
const DMX_PORT = 'COM5'; // Certifique-se de que esta é a porta COM correta para o seu Enttec
const DMX_DRIVER = 'enttec-usb-dmx-pro';

// NOVO: Armazena o estado atual de todos os 512 canais DMX.
// Será a "fonte da verdade" dos valores que queremos que o universo DMX tenha.
const currentDmxState = {};
for (let i = 1; i <= 512; i++) {
    currentDmxState[i] = 0; // Inicializa todos os canais a 0
}

// NOVO: Armazena as transições de fade ativas.
// { channel: { startValue, targetValue, startTime, fadeTimeMs } }
const activeFades = new Map();
const FADE_UPDATE_INTERVAL = 20; // Intervalo em ms para atualizar os valores de fade (20ms = 50 atualizações/segundo)

try {
    console.log(`DMX: Tentando inicializar com driver '${DMX_DRIVER}' na porta '${DMX_PORT}'...`);

    const tempUniverse = dmx.addUniverse('my-universe', DMX_DRIVER, DMX_PORT);

    if (tempUniverse && tempUniverse.dev && tempUniverse.dev.path) {
        universe = tempUniverse;
        console.log(`DMX: Conexão bem-sucedida ao Enttec DMX USB PRO.`);
        console.log(`DMX: Universo 'my-universe' adicionado com sucesso, usando driver '${DMX_DRIVER}' na porta ${universe.dev.path}.`);
        // Garante que todos os canais estão a 0 no início
        universe.updateAll(0);
    } else {
        console.error(`ERRO DMX: dmx.addUniverse retornou um objeto universo inválido para driver '${DMX_DRIVER}' na porta '${DMX_PORT}'.`);
        console.error('Isso indica que o dispositivo Enttec não foi encontrado ou não pôde ser aberto, mesmo que o objeto tenha sido criado.');
        console.log('Tentando adicionar universo DMX virtual para desenvolvimento (sem hardware físico)...');
        universe = dmx.addUniverse('my-universe', 'null'); // Fallback para universo virtual
        console.log('Universo DMX virtual adicionado para teste.');
    }
} catch (error) {
    console.error('ERRO DMX CRÍTICO: Exceção capturada ao tentar adicionar universo DMX com hardware:', error);
    console.error('Verifique a conexão do Enttec, drivers e se a porta COM está correta e não está em uso por outro software.');
    console.log('Tentando adicionar universo DMX virtual para desenvolvimento (devido a erro grave)...');
    universe = dmx.addUniverse('my-universe', 'null'); // Fallback para universo virtual em caso de exceção
    console.log('Universo DMX virtual adicionado para teste.');
}

// NOVO: Loop principal para processar todos os fades ativos
setInterval(() => {
    if (!universe) return; // Não faz nada se o universo DMX não estiver inicializado

    const now = Date.now();
    let changesToApply = {}; // Objeto para acumular as mudanças a enviar para o universo.update()

    activeFades.forEach((fadeInfo, channel) => {
        const { startValue, targetValue, startTime, fadeTimeMs } = fadeInfo;

        const elapsedTime = now - startTime;

        if (elapsedTime >= fadeTimeMs) {
            // Fade concluído
            currentDmxState[channel] = targetValue;
            changesToApply[channel] = targetValue; // Adiciona ao objeto de mudanças
            activeFades.delete(channel); // Remove o fade da lista
        } else {
            // Calcular o valor interpolado
            const progress = elapsedTime / fadeTimeMs;
            const newValue = Math.round(startValue + (targetValue - startValue) * progress);

            // Apenas atualiza se o valor mudou para evitar atualizações DMX desnecessárias
            if (currentDmxState[channel] !== newValue) {
                currentDmxState[channel] = newValue;
                changesToApply[channel] = newValue; // Adiciona ao objeto de mudanças
            }
        }
    });

    // Envia as atualizações para o universo DMX físico apenas se houver mudanças
    if (Object.keys(changesToApply).length > 0) {
        universe.update(changesToApply);
        // Opcional: emitir 'dmx_state_updated' aqui se quiser que o frontend veja cada passo do fade
        // io.emit('dmx_state_updated', currentDmxState);
    }
}, FADE_UPDATE_INTERVAL);


// --- Configuração da Porta MIDI ---
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
    }

    if (midiBridgePortId !== -1) {
        output.openPort(midiBridgePortId);
        midiPortOpen = true;
        console.log(`Porta MIDI '${output.getPortName(midiBridgePortId)}' aberta com sucesso.`);
    } else {
        console.warn('Porta MIDI "MIDI Bridge" não encontrada. Testes MIDI podem não funcionar sem ela.');
    }
} catch (error) {
    console.error('Erro ao abrir porta MIDI:', error.message);
}


// --- Rota de teste simples para o Express ---
app.get('/', (req, res) => {
  res.send('Servidor do Engine/Core está a correr!');
});

// --- Eventos do Socket.io ---
io.on('connection', (socket) => {
  console.log('Um cliente conectou-se ao Socket.io:', socket.id);
  socket.emit('server_message', `Bem-vindo, cliente ${socket.id}! Conectado ao Engine/Core.`);

  // Envia o estado DMX atual para o cliente recém-conectado
  socket.emit('dmx_state_updated', currentDmxState);

  socket.on('disconnect', () => {
    console.log('Cliente desconectou-se do Socket.io:', socket.id);
  });

  socket.on('dmx_command', (data) => {
    console.log('Comando DMX recebido via WebSocket:', data);
    if (universe && data && typeof data.channel === 'number' && typeof data.value === 'number') {
      const channel = parseInt(data.channel);
      const value = parseInt(data.value);
      const fadeTime = parseFloat(data.fadeTime) || 0; // Tempo de fade em segundos, default 0

      // Validações básicas (conforme protocolo)
      if (isNaN(channel) || channel < 1 || channel > 512) {
          console.warn(`DMX: Canal inválido recebido: ${data.channel}`);
          socket.emit('server_message', `Erro: Canal DMX inválido: ${data.channel}`);
          return;
      }
      if (isNaN(value) || value < 0 || value > 255) {
          console.warn(`DMX: Valor DMX inválido recebido: ${data.value}`);
          socket.emit('server_message', `Erro: Valor DMX inválido: ${data.value}`);
          return;
      }
      if (isNaN(fadeTime) || fadeTime < 0 || fadeTime > 999.9) { // Ajustado para 999.9s conforme protocolo
          console.warn(`DMX: Fade time inválido recebido: ${data.fadeTime}`);
          socket.emit('server_message', `Erro: Fade time inválido: ${data.fadeTime}`);
          return;
      }

      if (fadeTime > 0) {
        // Iniciar um fade suave
        const fadeTimeMs = fadeTime * 1000; // Converter segundos para milissegundos
        activeFades.set(channel, {
            startValue: currentDmxState[channel], // Pega o valor DMX atual do estado
            targetValue: value,
            startTime: Date.now(),
            fadeTimeMs: fadeTimeMs
        });
        console.log(`DMX: Canal ${channel} a fazer fade para ${value} em ${fadeTime}s`);
        socket.emit('server_message', `DMX: Canal ${channel} a fazer fade para ${value} em ${fadeTime}s`);
      } else {
        // Define o valor instantaneamente
        currentDmxState[channel] = value; // Atualiza o estado DMX interno
        const dmxData = {};
        dmxData[channel] = value;
        universe.update(dmxData); // Atualiza os valores DMX do universo
        activeFades.delete(channel); // Remove qualquer fade ativo para este canal
        console.log(`DMX: Canal ${channel} definido instantaneamente para ${value}`);
        socket.emit('server_message', `DMX: Canal ${channel} definido instantaneamente para ${value}`);
      }
      // Notifica todos os clientes sobre a mudança no estado DMX (apenas no final do fade para simplificar,
      // ou pode emitir no loop do setInterval se precisar de feedback mais granular)
      io.emit('dmx_state_updated', currentDmxState);
    } else {
        console.warn('Comando DMX inválido recebido:', data);
        socket.emit('server_message', `Erro: Comando DMX inválido.`);
    }
  });

  socket.on('midi_command', (data) => {
    console.log('Comando MIDI recebido via WebSocket:', data);
    if (midiPortOpen && data && data.message && Array.isArray(data.message)) {
        output.sendMessage(data.message);
        console.log(`MIDI: Mensagem enviada: ${data.message}`);
    } else {
        console.warn('Comando MIDI inválido recebido:', data);
    }
  });

  // --- Novos Listeners para Módulo de Patch ---
  socket.emit('fixtures_updated', patch.getAllFixtures()); // Envia a lista inicial de fixtures

  socket.on('create_fixture', (fixtureData) => {
    try {
      const newFixture = patch.createFixture(fixtureData);
      io.emit('fixtures_updated', patch.getAllFixtures());
      socket.emit('server_message', `Fixture '${newFixture.name}' criado com sucesso!`);
      console.log(`Server: Fixture '${newFixture.name}' (${newFixture.id}) criado.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao criar fixture: ${error.message}`);
      console.error('Server: Erro ao criar fixture:', error.message);
    }
  });

  socket.on('update_fixture', ({ id, updates }) => {
    try {
      const updatedFixture = patch.updateFixture(id, updates);
      io.emit('fixtures_updated', patch.getAllFixtures());
      socket.emit('server_message', `Fixture '${updatedFixture.name}' atualizado com sucesso!`);
      console.log(`Server: Fixture '${updatedFixture.name}' (${updatedFixture.id}) atualizado.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao atualizar fixture ${id}: ${error.message}`);
      console.error(`Server: Erro ao atualizar fixture ${id}:`, error.message);
    }
  });

  socket.on('delete_fixture', (id) => {
    try {
      const success = patch.deleteFixture(id);
      if (success) {
        io.emit('fixtures_updated', patch.getAllFixtures());
        socket.emit('server_message', `Fixture ${id} removido com sucesso.`);
        console.log(`Server: Fixture ${id} removido.`);
      } else {
        socket.emit('server_message', `Erro: Fixture ${id} não encontrado para remover.`);
        console.warn(`Server: Fixture ${id} não encontrado para remover.`);
      }
    } catch (error) {
      socket.emit('server_message', `Erro ao remover fixture ${id}: ${error.message}`);
      console.error(`Server: Erro ao remover fixture ${id}:`, error.message);
    }
  });

  // --- Novos Listeners para Módulo de Personalidade ---
  socket.emit('personalities_updated', personality.getAllPersonalities());

  socket.on('create_personality', (personalityData) => {
    try {
      const newPersonality = personality.createPersonality(personalityData);
      io.emit('personalities_updated', personality.getAllPersonalities());
      socket.emit('server_message', `Personalidade '${newPersonality.name}' criada com sucesso!`);
      console.log(`Server: Personalidade '${newPersonality.name}' (${newPersonality.id}) criada.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao criar personalidade: ${error.message}`);
      console.error('Server: Erro ao criar personalidade:', error.message);
    }
  });

  socket.on('update_personality', ({ id, updates }) => {
    try {
      const updatedPersonality = personality.updatePersonality(id, updates);
      io.emit('personalities_updated', personality.getAllPersonalities());
      socket.emit('server_message', `Personalidade '${updatedPersonality.name}' atualizada com sucesso!`);
      console.log(`Server: Personalidade '${updatedPersonality.name}' (${updatedPersonality.id}) atualizada.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao atualizar personalidade ${id}: ${error.message}`);
      console.error(`Server: Erro ao atualizar personalidade ${id}:`, error.message);
    }
  });

  socket.on('delete_personality', (id) => {
    try {
      const success = personality.deletePersonality(id);
      if (success) {
        io.emit('personalities_updated', personality.getAllPersonalities());
        socket.emit('server_message', `Personalidade ${id} removida com sucesso.`);
        console.log(`Server: Personalidade ${id} removida.`);
      } else {
        socket.emit('server_message', `Erro: Personalidade ${id} não encontrada para remover.`);
        console.warn(`Server: Personalidade ${id} não encontrada para remover.`);
      }
    } catch (error) {
      socket.emit('server_message', `Erro ao remover personalidade ${id}: ${error.message}`);
      console.error(`Server: Erro ao remover personalidade ${id}:`, error.message);
    }
  });

  // --- Novos Listeners para Módulo de Preset ---
  socket.emit('presets_updated', preset.getAllPresets());

  socket.on('create_preset', (presetData) => {
    try {
      const newPreset = preset.createPreset(presetData);
      io.emit('presets_updated', preset.getAllPresets());
      socket.emit('server_message', `Preset '${newPreset.name}' criado com sucesso!`);
      console.log(`Server: Preset '${newPreset.name}' (${newPreset.id}) criado.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao criar preset: ${error.message}`);
      console.error('Server: Erro ao criar preset:', error.message);
    }
  });

  socket.on('update_preset', ({ id, updates }) => {
    try {
      const updatedPreset = preset.updatePreset(id, updates);
      io.emit('presets_updated', preset.getAllPresets());
      socket.emit('server_message', `Preset '${updatedPreset.name}' atualizado com sucesso!`);
      console.log(`Server: Preset '${updatedPreset.name}' (${updatedPreset.id}) atualizado.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao atualizar preset ${id}: ${error.message}`);
      console.error(`Server: Erro ao atualizar preset ${id}:`, error.message);
    }
  });

  socket.on('delete_preset', (id) => {
    try {
      const success = preset.deletePreset(id);
      if (success) {
        io.emit('presets_updated', preset.getAllPresets());
        socket.emit('server_message', `Preset ${id} removido com sucesso.`);
        console.log(`Server: Preset ${id} removido.`);
      } else {
        socket.emit('server_message', `Erro: Preset ${id} não encontrado para remover.`);
        console.warn(`Server: Preset ${id} não encontrado para remover.`);
      }
    } catch (error) {
      socket.emit('server_message', `Erro ao remover preset ${id}: ${error.message}`);
      console.error(`Server: Erro ao remover preset ${id}:`, error.message);
    }
  });

  // --- Novos Listeners para Módulo de Cuelist e Cues ---
  socket.emit('cuelists_updated', cuelist.getAllCuelists());

  socket.on('create_cuelist', (cuelistData) => {
    try {
      const newCuelist = cuelist.createCuelist(cuelistData);
      io.emit('cuelists_updated', cuelist.getAllCuelists());
      socket.emit('server_message', `Cuelist '${newCuelist.name}' criada com sucesso!`);
      console.log(`Server: Cuelist '${newCuelist.name}' (${newCuelist.id}) criada.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao criar cuelist: ${error.message}`);
      console.error('Server: Erro ao criar cuelist:', error.message);
    }
  });

  socket.on('update_cuelist', ({ id, updates }) => {
    try {
      const updatedCuelist = cuelist.updateCuelist(id, updates);
      io.emit('cuelists_updated', cuelist.getAllCuelists());
      socket.emit('server_message', `Cuelist '${updatedCuelist.name}' atualizada com sucesso!`);
      console.log(`Server: Cuelist '${updatedCuelist.name}' (${updatedCuelist.id}) atualizada.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao atualizar cuelist ${id}: ${error.message}`);
      console.error(`Server: Erro ao atualizar cuelist ${id}:`, error.message);
    }
  });

  socket.on('delete_cuelist', (id) => {
    try {
      const success = cuelist.deleteCuelist(id);
      if (success) {
        io.emit('cuelists_updated', cuelist.getAllCuelists());
        socket.emit('server_message', `Cuelist ${id} removida com sucesso.`);
        console.log(`Server: Cuelist ${id} removida.`);
      } else {
        socket.emit('server_message', `Erro: Cuelist ${id} não encontrada para remover.`);
        console.warn(`Server: Cuelist ${id} não encontrada para remover.`);
      }
    } catch (error) {
      socket.emit('server_message', `Erro ao remover cuelist ${id}: ${error.message}`);
      console.error(`Server: Erro ao remover cuelist ${id}:`, error.message);
    }
  });

  socket.on('add_cue_to_cuelist', ({ cuelistId, cueData }) => {
    try {
      const newCue = cuelist.addCueToCuelist(cuelistId, cueData);
      io.emit('cuelists_updated', cuelist.getAllCuelists());
      socket.emit('server_message', `Cue '${newCue.name}' adicionado à cuelist '${cuelistId}' com sucesso!`);
      console.log(`Server: Cue '${newCue.name}' (${newCue.id}) adicionado à cuelist '${cuelistId}'.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao adicionar cue à cuelist ${cuelistId}: ${error.message}`);
      console.error(`Server: Erro ao adicionar cue à cuelist ${cuelistId}:`, error.message);
    }
  });

  socket.on('update_cue_in_cuelist', ({ cuelistId, cueId, updates }) => {
    try {
      const updatedCue = cuelist.updateCueInCuelist(cuelistId, cueId, updates);
      io.emit('cuelists_updated', cuelist.getAllCuelists());
      socket.emit('server_message', `Cue '${updatedCue.name}' na cuelist '${cuelistId}' atualizado com sucesso!`);
      console.log(`Server: Cue '${updatedCue.name}' (${updatedCue.id}) na cuelist '${cuelistId}' atualizado.`);
    } catch (error) {
      socket.emit('server_message', `Erro ao atualizar cue ${cueId} na cuelist ${cuelistId}: ${error.message}`);
      console.error(`Server: Erro ao atualizar cue ${cueId} na cuelist ${cuelistId}:`, error.message);
    }
  });

  socket.on('delete_cue_from_cuelist', ({ cuelistId, cueId }) => {
    try {
      const success = cuelist.deleteCueFromCuelist(cuelistId, cueId);
      if (success) {
        io.emit('cuelists_updated', cuelist.getAllCuelists());
        socket.emit('server_message', `Cue ${cueId} removido da cuelist ${cuelistId} com sucesso.`);
        console.log(`Server: Cue ${cueId} removido da cuelist ${cuelistId}.`);
      } else {
        socket.emit('server_message', `Erro: Cue ${cueId} não encontrado na cuelist ${cuelistId} para remover.`);
        console.warn(`Server: Cue ${cueId} não encontrado na cuelist ${cuelistId} para remover.`);
      }
    } catch (error) {
      socket.emit('server_message', `Erro ao remover cue ${cueId} da cuelist ${cuelistId}: ${error.message}`);
      console.error(`Server: Erro ao remover cue ${cueId} da cuelist ${cuelistId}:`, error.message);
    }
  });

  // --- Novos Listeners para Módulo de Playback ---
socket.on('start_playback', async (cuelistId) => {
    try {
        await playback.startPlayback(cuelistId);
        io.emit('playback_status_updated', playback.getPlaybackState()); // Atualiza o estado para todos os clientes
        socket.emit('server_message', `Comando 'start_playback' para cuelist ${cuelistId} recebido.`);
    } catch (error) {
        socket.emit('server_message', `Erro ao iniciar playback: ${error.message}`);
        console.error('Server: Erro ao iniciar playback:', error.message);
    }
});

socket.on('pause_playback', () => {
    playback.pausePlayback();
    io.emit('playback_status_updated', playback.getPlaybackState()); // Atualiza o estado para todos os clientes
    socket.emit('server_message', `Comando 'pause_playback' recebido.`);
});

socket.on('resume_playback', async () => {
    try {
        await playback.resumePlayback();
        io.emit('playback_status_updated', playback.getPlaybackState()); // Atualiza o estado para todos os clientes
        socket.emit('server_message', `Comando 'resume_playback' recebido.`);
    } catch (error) {
        socket.emit('server_message', `Erro ao retomar playback: ${error.message}`);
        console.error('Server: Erro ao retomar playback:', error.message);
    }
});

socket.on('stop_playback', async () => {
    try {
        await playback.stopPlayback();
        io.emit('playback_status_updated', playback.getPlaybackState()); // Atualiza o estado para todos os clientes
        socket.emit('server_message', `Comando 'stop_playback' recebido.`);
    } catch (error) {
        socket.emit('server_message', `Erro ao parar playback: ${error.message}`);
        console.error('Server: Erro ao parar playback:', error.message);
    }
});

socket.on('next_cue', async () => {
    try {
        await playback.nextCue();
        io.emit('playback_status_updated', playback.getPlaybackState()); // Atualiza o estado para todos os clientes
        socket.emit('server_message', `Comando 'next_cue' recebido.`);
    } catch (error) {
        socket.emit('server_message', `Erro ao avançar cue: ${error.message}`);
        console.error('Server: Erro ao avançar cue:', error.message);
    }
});

socket.on('prev_cue', async () => {
    try {
        await playback.prevCue();
        io.emit('playback_status_updated', playback.getPlaybackState()); // Atualiza o estado para todos os clientes
        socket.emit('server_message', `Comando 'prev_cue' recebido.`);
    } catch (error) {
        socket.emit('server_message', `Erro ao voltar cue: ${error.message}`);
        console.error('Server: Erro ao voltar cue:', error.message);
    }
});

// Envia o estado atual do playback para o cliente recém-conectado
socket.emit('playback_status_updated', playback.getPlaybackState());
});

// --- Teste de Envio DMX e MIDI após alguns segundos ---
server.listen(PORT, () => {
  console.log(`Servidor do Engine/Core a correr na porta ${PORT}`);

// NOVO: Inicializa o módulo de playback
  // Passa a instância do socket.io e uma função para enviar comandos DMX
 playback.initializePlayback(io, (channel, value, fadeTime) => {
      // Esta é a função que o playback.js vai chamar para enviar DMX.
      // Ela usa a mesma lógica que o socket.on('dmx_command') usa no server.js.
      // Replicamos a lógica de adicionar ao activeFades aqui.
      const currentVal = currentDmxState[channel]; // Pega o valor atual do canal
      const fadeTimeMs = fadeTime * 1000;

      if (fadeTime > 0) {
          activeFades.set(channel, {
              startValue: currentVal,
              targetValue: value,
              startTime: Date.now(),
              fadeTimeMs: fadeTimeMs
          });
          // console.log(`DMX Commander: Canal ${channel} a fazer fade para ${value} em ${fadeTime}s`);
      } else {
          currentDmxState[channel] = value;
          universe.update({ [channel]: value });
          activeFades.delete(channel);
          // console.log(`DMX Commander: Canal ${channel} definido instantaneamente para ${value}`);
      }
      // Sempre notificar o frontend sobre a mudança do estado DMX, mesmo que gradual
      io.emit('dmx_state_updated', currentDmxState);
  }); 

// Teste DMX: Acende o canal 1 para 255 (full) após 5 segundos com fade
setTimeout(() => {
    if (universe) {
      console.log('Enviando teste DMX: Canal 1 para 255 (fade de 2s)...');
      // Agora chamamos a mesma lógica que o 'dmx_command' usa
      const channel = 1;
      const value = 255;
      const fadeTime = 2.0; // 2 segundos

      const fadeTimeMs = fadeTime * 1000;
      activeFades.set(channel, {
          startValue: currentDmxState[channel],
          targetValue: value,
          startTime: Date.now(),
          fadeTimeMs: fadeTimeMs
      });
      io.emit('dmx_state_updated', currentDmxState); // Notifica o frontend
      console.log('DMX fade (teste inicial) enviado!');

      // Desliga o canal 1 após mais 5 segundos com fade
      setTimeout(() => {
        console.log('Enviando teste DMX: Canal 1 para 0 (fade de 2s)...');
        const channelOff = 1;
        const valueOff = 0;
        const fadeTimeOff = 2.0; // 2 segundos

        const fadeTimeMsOff = fadeTimeOff * 1000;
        activeFades.set(channelOff, {
            startValue: currentDmxState[channelOff],
            targetValue: valueOff,
            startTime: Date.now(),
            fadeTimeMs: fadeTimeMsOff
        });
        io.emit('dmx_state_updated', currentDmxState); // Notifica o frontend
        console.log('DMX fade (teste final) desligado!');
      }, 5000); // 5 segundos após o primeiro fade
    } else {
        console.warn('Universo DMX não está disponível para o teste temporizado.');
    }
  }, 5000); // 5 segundos após o início do servidor

  // Teste MIDI: Envia um Note On (Nota 60, Velocidade 100) após 10 segundos
  setTimeout(() => {
    if (midiPortOpen) {
        console.log('Enviando teste MIDI: Note On (C3, 100)...');
        output.sendMessage([0x90, 60, 100]);
        console.log('MIDI enviado!');

        // Envia um Note Off após 1 segundo
        setTimeout(() => {
            console.log('Enviando teste MIDI: Note Off (C3, 0)...');
            output.sendMessage([0x80, 60, 0]);
            console.log('MIDI desligado!');
        }, 1000);
    } else {
        console.warn('Porta MIDI não está disponível para o teste temporizado.');
    }
  }, 10000); // 10 segundos após o início do servidor
});

// Tratamento de erros para fechar a porta MIDI ao sair
process.on('exit', () => {
    if (midiPortOpen) {
        output.closePort();
        console.log('Porta MIDI fechada.');
    }
    // Ao encerrar, tenta garantir que o DMX fica a zero, se o universo existir
    if (universe) {
        universe.updateAll(0);
        console.log('Todos os canais DMX zerados ao encerrar.');
    }
});

process.on('SIGINT', () => {
    console.log('\nServidor encerrado por Ctrl+C. Fechando portas e zerando DMX...');
    // A função process.on('exit') é chamada depois, então ela tratará o fechamento
    process.exit();
});