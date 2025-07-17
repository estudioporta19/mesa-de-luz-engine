// mesa-de-luz-engine/src/modules/personality.js

// Array para armazenar as definições de personalidade em memória.
// Cada personalidade define o mapeamento dos canais DMX para atributos.
const personalities = [];

// Função para gerar um ID único para a personalidade
const generateUniqueId = () => {
  return 'personality_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Exemplo de como uma personalidade e seus canais podem ser estruturados
// Um canal pode ter um offset (relativo ao startChannel do fixture),
// um atributo (Dimmer, Pan, Red, etc.), e informações como min/max/default, tipo.
/*
Exemplo de estrutura de personalidade:
{
  id: 'personality_abc',
  name: 'Generic Dimmer',
  manufacturer: 'Generic',
  model: 'Dimmer',
  numChannels: 1, // Número total de canais DMX que esta personalidade usa
  channels: [
    {
      offset: 0, // DMX Address = fixture.startChannel + offset
      attribute: 'Dimmer',
      type: '8bit', // '8bit', '16bit', 'strobe', 'color', 'gobo', 'control'
      default: 255,
      min: 0,
      max: 255,
      // Para canais com valores discretos (gobo, cor):
      // values: [ { name: 'Open', value: 0 }, { name: 'Gobo1', value: 10 } ]
    }
  ]
}
*/

/**
 * Adiciona uma nova definição de personalidade.
 * @param {object} personalityData - Dados da personalidade (name, model, numChannels, channels).
 * @returns {object} A personalidade adicionada com um ID único.
 */
const createPersonality = (personalityData) => {
  const newPersonality = {
    id: generateUniqueId(),
    name: personalityData.name || 'Nova Personalidade',
    manufacturer: personalityData.manufacturer || 'Desconhecido',
    model: personalityData.model || 'Desconhecido',
    numChannels: personalityData.numChannels, // Quantidade de canais DMX que esta personalidade utiliza
    channels: personalityData.channels || [], // Array de objetos que descrevem cada canal
    createdAt: new Date().toISOString()
  };

  // Validação básica
  if (typeof newPersonality.numChannels !== 'number' || newPersonality.numChannels <= 0) {
    throw new Error('numChannels é obrigatório e deve ser um número positivo.');
  }
  if (!Array.isArray(newPersonality.channels)) {
      throw new Error('Canais devem ser um array.');
  }
  if (newPersonality.channels.length === 0) {
      console.warn('Personalidade criada sem canais definidos. Lembre-se de adicionar canais.');
  }

  // Opcional: Adicionar validações mais detalhadas para a estrutura de cada canal dentro da personalidade

  personalities.push(newPersonality);
  console.log('Personalidade criada:', newPersonality.id, newPersonality.name, `(${newPersonality.numChannels} canais)`);
  return newPersonality;
};

/**
 * Atualiza uma definição de personalidade existente.
 * @param {string} id - ID da personalidade a atualizar.
 * @param {object} updates - Objeto com as propriedades a atualizar.
 * @returns {object} A personalidade atualizada.
 */
const updatePersonality = (id, updates) => {
  const index = personalities.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error(`Personalidade com ID ${id} não encontrada.`);
  }

  // Prevenir que o ID seja alterado
  if (updates.id && updates.id !== id) {
    throw new Error('Não é permitido alterar o ID de uma personalidade.');
  }

  // Opcional: Adicionar validação se a atualização dos canais é válida

  personalities[index] = { ...personalities[index], ...updates };
  console.log('Personalidade atualizada:', id);
  return personalities[index];
};

/**
 * Remove uma definição de personalidade.
 * @param {string} id - ID da personalidade a remover.
 * @returns {boolean} True se a personalidade foi removida, false caso contrário.
 */
const deletePersonality = (id) => {
  const initialLength = personalities.length;
  personalities.splice(personalities.findIndex(p => p.id === id), 1);
  if (personalities.length < initialLength) {
    console.log('Personalidade removida:', id);
    return true;
  }
  return false;
};

/**
 * Obtém todas as definições de personalidade.
 * @returns {Array<object>} Lista de todas as personalidades.
 */
const getAllPersonalities = () => {
  return personalities;
};

/**
 * Obtém uma personalidade pelo seu ID.
 * @param {string} id - ID da personalidade.
 * @returns {object|undefined} A personalidade encontrada ou undefined.
 */
const getPersonalityById = (id) => {
    return personalities.find(p => p.id === id);
};

module.exports = {
  createPersonality,
  updatePersonality,
  deletePersonality,
  getAllPersonalities,
  getPersonalityById
};