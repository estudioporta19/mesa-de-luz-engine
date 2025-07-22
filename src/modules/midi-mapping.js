// mesa-de-luz-engine/src/modules/midi-mapping.js - VERSÃO CORRETA E FINAL (Backend)

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MIDI_MAPPINGS_FILE = path.join(__dirname, '../../data/midi-mappings.json');
let midiMappings = [];

/**
 * Carrega os mapeamentos MIDI do ficheiro.
 */
function loadMidiMappings() {
  try {
    if (fs.existsSync(MIDI_MAPPINGS_FILE)) {
      const data = fs.readFileSync(MIDI_MAPPINGS_FILE, 'utf8');
      midiMappings = JSON.parse(data);
      console.log(`MIDI Mapping: ${midiMappings.length} mapeamentos carregados do ficheiro.`);
    } else {
      midiMappings = [];
      console.log('MIDI Mapping: Ficheiro de mapeamentos MIDI não encontrado. Iniciando com lista vazia.');
    }
  } catch (error) {
    console.error('MIDI Mapping: Erro ao carregar mapeamentos MIDI:', error.message);
    midiMappings = []; // Garante que a lista está vazia em caso de erro
  }
}

/**
 * Guarda os mapeamentos MIDI para o ficheiro.
 */
function saveMidiMappings() {
  try {
    fs.writeFileSync(MIDI_MAPPINGS_FILE, JSON.stringify(midiMappings, null, 2), 'utf8');
    console.log('MIDI Mapping: Mapeamentos MIDI guardados para o ficheiro.');
  } catch (error) {
    console.error('MIDI Mapping: Erro ao guardar mapeamentos MIDI:', error.message);
  }
}

/**
 * Retorna todos os mapeamentos MIDI.
 * @returns {Array<object>} A lista de mapeamentos MIDI.
 */
function getAllMidiMappings() {
  return [...midiMappings]; // Retorna uma cópia para evitar modificações diretas
}

/**
 * Adiciona ou atualiza um mapeamento MIDI.
 * @param {object} mappingData - Os dados do mapeamento MIDI.
 * Para 'cc' ou 'note': { targetType, executorId?, fixtureId?, attributeName?, midiType, midiChannel, midiControl, minValue, maxValue, targetMin, targetMax }
 * Para 'encoder_relative': { targetType, executorId?, fixtureId?, attributeName?, midiType, midiChannel, midiControl, incrementValue, decrementValue, stepSize }
 * @returns {object} O mapeamento MIDI adicionado/atualizado.
 * @throws {Error} Se os dados do mapeamento forem inválidos.
 */
function saveMidiMapping(mappingData) {
  // Validações básicas comuns
  if (!mappingData.targetType || !mappingData.midiType || mappingData.midiChannel === undefined ||
      mappingData.midiControl === undefined) {
    throw new Error('Dados de mapeamento MIDI incompletos (targetType, midiType, midiChannel, midiControl são obrigatórios).');
  }

  if (mappingData.midiChannel < 1 || mappingData.midiChannel > 16) {
    throw new Error('Canal MIDI deve ser entre 1 e 16.');
  }
  if (mappingData.midiControl < 0 || mappingData.midiControl > 127) {
    throw new Error('Controlo MIDI (CC/Nota) deve ser entre 0 e 127.');
  }

  // Validações baseadas no targetType
  if (mappingData.targetType === 'executor') {
      if (!mappingData.executorId) {
          throw new Error('ID do Executor é obrigatório para mapeamento de executor.');
      }
      // Garante que campos de programador não estão presentes para evitar poluição de dados
      delete mappingData.fixtureId;
      delete mappingData.attributeName;
  } else if (mappingData.targetType === 'programmer') {
      if (!mappingData.fixtureId || !mappingData.attributeName) {
          throw new Error('ID do Fixture e Nome do Atributo são obrigatórios para mapeamento do programador.');
      }
      // Garante que campos de executor não estão presentes
      delete mappingData.executorId;
  } else {
      throw new Error('Tipo de alvo inválido. Deve ser "executor" ou "programmer".');
  }


  // Validações específicas por tipo de mapeamento MIDI
  if (mappingData.midiType === 'cc' || mappingData.midiType === 'note') {
      if (mappingData.minValue === undefined || mappingData.maxValue === undefined ||
          mappingData.targetMin === undefined || mappingData.targetMax === undefined) {
          throw new Error('Dados de mapeamento absoluto incompletos (minValue, maxValue, targetMin, targetMax são obrigatórios).');
      }
      if (mappingData.minValue < 0 || mappingData.minValue > 127 || mappingData.maxValue < 0 || mappingData.maxValue > 127) {
          throw new Error('Valores MIDI (Min/Max) devem ser entre 0 e 127.');
      }
      if (mappingData.targetMin < 0 || mappingData.targetMin > 255 || mappingData.targetMax < 0 || mappingData.targetMax > 255) {
          throw new Error('Valores de destino (Min/Max) devem ser entre 0 e 255.');
      }
      if (mappingData.minValue >= mappingData.maxValue) {
          throw new Error('Valor MIDI Mínimo deve ser menor que o Valor MIDI Máximo.');
      }
      if (mappingData.targetMin >= mappingData.targetMax) {
          throw new Error('Valor de Destino Mínimo deve ser menor que o Valor de Destino Máximo.');
      }
      // Garante que campos de encoder não estão presentes
      delete mappingData.incrementValue;
      delete mappingData.decrementValue;
      delete mappingData.stepSize;

  } else if (mappingData.midiType === 'encoder_relative') {
      if (mappingData.incrementValue === undefined || mappingData.incrementValue === null || mappingData.decrementValue === undefined || mappingData.decrementValue === null ||
          mappingData.stepSize === undefined || mappingData.stepSize === null) {
          throw new Error('Dados de mapeamento de encoder relativo incompletos (incrementValue, decrementValue, stepSize são obrigatórios).');
      }
      if (mappingData.incrementValue < 0 || mappingData.incrementValue > 127 || mappingData.decrementValue < 0 || mappingData.decrementValue > 127) {
          throw new Error('Valores de Incremento/Decremento MIDI devem ser entre 0 e 127.');
      }
      if (mappingData.stepSize <= 0 || mappingData.stepSize > 255) {
          throw new Error('Tamanho do Passo deve ser entre 1 e 255.');
      }
      if (mappingData.incrementValue === mappingData.decrementValue) {
          throw new Error('Valores de Incremento e Decremento MIDI devem ser diferentes para encoders relativos.');
      }
      // Garante que campos de absoluto não estão presentes
      delete mappingData.minValue;
      delete mappingData.maxValue;
      delete mappingData.targetMin;
      delete mappingData.targetMax;
  } else {
      throw new Error('Tipo de mapeamento MIDI inválido.');
  }


  // Verificar se já existe um mapeamento para esta combinação MIDI (targetType, midiType, midiChannel, midiControl)
  // Um mapeamento é único pela combinação do tipo de alvo e da entrada MIDI
  const existingMappingIndex = midiMappings.findIndex(m =>
    m.targetType === mappingData.targetType &&
    m.midiType === mappingData.midiType &&
    m.midiChannel === mappingData.midiChannel &&
    m.midiControl === mappingData.midiControl
  );

  let newOrUpdatedMapping;
  if (existingMappingIndex !== -1) {
    // Atualiza mapeamento existente
    newOrUpdatedMapping = { ...midiMappings[existingMappingIndex], ...mappingData };
    midiMappings[existingMappingIndex] = newOrUpdatedMapping;
    console.log(`MIDI Mapping: Mapeamento existente atualizado para ${mappingData.targetType}.`);
  } else {
    // Adiciona novo mapeamento
    newOrUpdatedMapping = { id: uuidv4(), ...mappingData };
    midiMappings.push(newOrUpdatedMapping);
    console.log(`MIDI Mapping: Novo mapeamento criado para ${mappingData.targetType}.`);
  }

  saveMidiMappings();
  return newOrUpdatedMapping;
}

/**
 * Remove um mapeamento MIDI pelo seu ID.
 * @param {string} id - O ID do mapeamento a remover.
 * @returns {boolean} True se o mapeamento foi removido com sucesso, false caso contrário.
 */
function deleteMidiMapping(id) {
  const initialLength = midiMappings.length;
  midiMappings = midiMappings.filter(m => m.id !== id);
  if (midiMappings.length < initialLength) {
    saveMidiMappings();
    console.log(`MIDI Mapping: Mapeamento ${id} removido.`);
    return true;
  }
  console.log(`MIDI Mapping: Mapeamento ${id} não encontrado para remoção.`);
  return false;
}

/**
 * Procura um mapeamento MIDI correspondente a uma mensagem MIDI recebida.
 * @param {string} midiType - 'cc', 'note', ou 'encoder_relative'.
 * @param {number} midiChannel - O canal MIDI (1-16).
 * @param {number} midiControl - O número do controlo CC ou da nota (0-127).
 * @param {string} targetType - O tipo de alvo ('executor' ou 'programmer').
 * @returns {object | null} O objeto de mapeamento se encontrado, caso contrário null.
 */
function findMidiMapping(midiType, midiChannel, midiControl, targetType) {
  // Para encoders, precisamos de procurar por um tipo específico 'encoder_relative'
  // Para CC e Note, procuramos por 'cc' ou 'note'
  return midiMappings.find(m =>
    m.midiType === midiType &&
    m.midiChannel === midiChannel &&
    m.midiControl === midiControl &&
    m.targetType === targetType // Adicionar targetType para unicidade
  );
}

// Carrega os mapeamentos ao iniciar o módulo
loadMidiMappings();

module.exports = {
  getAllMidiMappings,
  saveMidiMapping,
  deleteMidiMapping,
  findMidiMapping,
  loadMidiMappings // Expor para ser chamado explicitamente no server.js se necessário
};
