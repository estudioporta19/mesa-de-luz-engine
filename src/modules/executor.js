// mesa-de-luz-engine/src/modules/executor.js

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const EXECUTORS_FILE = path.join(__dirname, '../../data/executors.json');
let executors = [];

// Dependência para o módulo de playback (será injetada)
let playbackModule;
let cuelistModule; // Adicionar para aceder a cuelists

/**
 * Inicializa o módulo de executores com as dependências necessárias.
 * @param {object} ioInstance - A instância do Socket.IO para emitir atualizações.
 * @param {function} sendDmxCommandFn - A função para enviar comandos DMX.
 * @param {object} playbackMod - O módulo de playback.
 * @param {object} cuelistMod - O módulo de cuelist.
 */
function initExecutorModule(playbackMod, cuelistMod) {
  playbackModule = playbackMod;
  cuelistModule = cuelistMod;
  loadExecutorsFromFile(); // Carrega os executores ao iniciar o módulo
}

/**
 * Carrega os executores do ficheiro.
 */
function loadExecutorsFromFile() {
  try {
    if (fs.existsSync(EXECUTORS_FILE)) {
      const data = fs.readFileSync(EXECUTORS_FILE, 'utf8');
      executors = JSON.parse(data);
      console.log(`Executor: ${executors.length} executores carregados do ficheiro.`);
    } else {
      executors = [];
      console.log('Executor: Ficheiro de executores não encontrado. Iniciando com lista vazia.');
    }
  } catch (error) {
    console.error('Executor: Erro ao carregar executores:', error.message);
    executors = []; // Garante que a lista está vazia em caso de erro
  }
}

/**
 * Guarda os executores para o ficheiro.
 */
function saveExecutorsToFile() {
  try {
    fs.writeFileSync(EXECUTORS_FILE, JSON.stringify(executors, null, 2), 'utf8');
    console.log('Executor: Executores guardados para o ficheiro.');
  } catch (error) {
    console.error('Executor: Erro ao guardar executores:', error.message);
  }
}

/**
 * Retorna todos os executores.
 * @returns {Array<object>} A lista de executores.
 */
function getAllExecutors() {
  // Adiciona o nome da cuelist para exibição no frontend
  return executors.map(exec => {
    const cuelist = cuelistModule.getCuelistById(exec.cuelistId);
    return {
      ...exec,
      cuelistName: cuelist ? cuelist.name : 'Cuelist Desconhecida'
    };
  });
}

/**
 * Cria um novo executor.
 * @param {object} executorData - Os dados do novo executor (name, cuelistId, faderValue).
 * @returns {object} O executor criado.
 * @throws {Error} Se os dados forem inválidos ou a cuelist não existir.
 */
function createExecutor(executorData) {
  if (!executorData.name || !executorData.cuelistId) {
    throw new Error('Nome e ID da Cuelist são obrigatórios para criar um executor.');
  }
  if (!cuelistModule.getCuelistById(executorData.cuelistId)) {
    throw new Error(`Cuelist com ID '${executorData.cuelistId}' não encontrada.`);
  }

  const newExecutor = {
    id: uuidv4(),
    name: executorData.name,
    cuelistId: executorData.cuelistId,
    faderValue: executorData.faderValue !== undefined ? executorData.faderValue : 255, // Valor padrão
    buttonState: 'released' // 'pressed' | 'released'
  };
  executors.push(newExecutor);
  saveExecutorsToFile();
  console.log(`Executor: Executor '${newExecutor.name}' criado.`);
  return newExecutor;
}

/**
 * Atualiza um executor existente.
 * @param {string} id - O ID do executor a atualizar.
 * @param {object} updates - As propriedades a atualizar.
 * @returns {object} O executor atualizado.
 * @throws {Error} Se o executor não for encontrado ou os dados forem inválidos.
 */
function updateExecutor(id, updates) {
  const index = executors.findIndex(exec => exec.id === id);
  if (index === -1) {
    throw new Error(`Executor com ID '${id}' não encontrado.`);
  }

  // Validação para cuelistId se for atualizado
  if (updates.cuelistId && !cuelistModule.getCuelistById(updates.cuelistId)) {
    throw new Error(`Cuelist com ID '${updates.cuelistId}' não encontrada.`);
  }

  executors[index] = { ...executors[index], ...updates };
  saveExecutorsToFile();
  console.log(`Executor: Executor '${executors[index].name}' atualizado.`);

  // Se o faderValue foi atualizado e este executor está ativo no playback,
  // atualiza a intensidade master global.
  if (updates.faderValue !== undefined) {
    const currentPlaybackStatus = playbackModule.getPlaybackStatus();
    if (currentPlaybackStatus.isPlaying && currentPlaybackStatus.cuelistId === executors[index].cuelistId) {
      playbackModule.setGlobalMasterIntensity(updates.faderValue);
      // O playbackModule já emitirá 'playback_status_updated'
    }
  }
  return executors[index];
}

/**
 * Remove um executor pelo seu ID.
 * @param {string} id - O ID do executor a remover.
 * @returns {boolean} True se o executor foi removido com sucesso, false caso contrário.
 */
function deleteExecutor(id) {
  const initialLength = executors.length;
  executors = executors.filter(exec => exec.id !== id);
  if (executors.length < initialLength) {
    saveExecutorsToFile();
    console.log(`Executor: Executor ${id} removido.`);
    return true;
  }
  console.log(`Executor: Executor ${id} não encontrado para remoção.`);
  return false;
}

/**
 * Atualiza o valor do fader de um executor e ajusta a intensidade master global se aplicável.
 * Esta função é projetada para ser chamada por entradas MIDI ou outras automações.
 * @param {string} executorId - O ID do executor a atualizar.
 * @param {number} value - O novo valor do fader (0-255).
 */
function updateExecutorFaderFromMidi(executorId, value) {
  const executor = executors.find(exec => exec.id === executorId);
  if (!executor) {
    console.warn(`Executor: Tentativa de atualizar fader de executor desconhecido: ${executorId}`);
    return;
  }

  const parsedValue = Math.max(0, Math.min(255, parseInt(value, 10))); // Garante que o valor está entre 0-255

  if (executor.faderValue === parsedValue) {
    return; // Não faz nada se o valor não mudou
  }

  executor.faderValue = parsedValue;
  saveExecutorsToFile(); // Persiste a alteração do fader

  const currentPlaybackStatus = playbackModule.getPlaybackStatus();
  if (currentPlaybackStatus.isPlaying && currentPlaybackStatus.cuelistId === executor.cuelistId) {
    playbackModule.setGlobalMasterIntensity(parsedValue);
    console.log(`Executor: Fader do executor '${executor.name}' atualizado via MIDI para ${parsedValue}. Intensidade Master Global ajustada.`);
  } else {
    console.log(`Executor: Fader do executor '${executor.name}' atualizado via MIDI para ${parsedValue}. Playback não ativo para esta cuelist.`);
  }

  // O server.js precisará emitir 'executors_updated' para o frontend
  // após esta função ser chamada e o estado ser atualizado.
}


module.exports = {
  initExecutorModule,
  getAllExecutors,
  createExecutor,
  updateExecutor,
  deleteExecutor,
  updateExecutorFaderFromMidi // NOVO: Exportar esta função
};
