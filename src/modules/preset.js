// mesa-de-luz-engine/src/modules/preset.js

// Array para armazenar as definições de preset em memória.
const presets = [];

// Função para gerar um ID único para o preset
const generateUniqueId = () => {
  return 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Exemplo de como um preset e seus valores podem ser estruturados
/*
{
  id: 'preset_color_red',
  name: 'Cor Vermelha',
  type: 'Color', // 'Dimmer', 'Position', 'Beam', 'Color', 'Gobo', 'Effect', 'Speed', 'Control'
  values: [ // Array de objetos { attribute: 'nomeDoAtributo', value: 0-255 }
    { attribute: 'red', value: 255 },
    { attribute: 'green', value: 0 },
    { attribute: 'blue', value: 0 }
  ],
  createdAt: new Date().toISOString()
}
*/

/**
 * Adiciona uma nova definição de preset.
 * @param {object} presetData - Dados do preset (name, type, values).
 * @returns {object} O preset adicionado com um ID único.
 */
const createPreset = (presetData) => {
  const newPreset = {
    id: generateUniqueId(),
    name: presetData.name || 'Novo Preset',
    type: presetData.type || 'Generic', // Dimmer, Position, Color, Beam, Gobo, etc.
    values: presetData.values || [], // Array de { attribute: string, value: number }
    createdAt: new Date().toISOString()
  };

  // Validação básica
  if (!newPreset.name.trim()) {
    throw new Error('O nome do preset é obrigatório.');
  }
  if (!Array.isArray(newPreset.values)) {
      throw new Error('Os valores do preset devem ser um array.');
  }
  // Opcional: Validação mais aprofundada para os valores, como range 0-255
  newPreset.values.forEach(v => {
      if (typeof v.attribute !== 'string' || !v.attribute.trim()) {
          throw new Error('Atributo inválido em um dos valores do preset.');
      }
      if (typeof v.value !== 'number' || v.value < 0 || v.value > 255) {
          throw new Error(`Valor DMX inválido para o atributo ${v.attribute}. Deve ser entre 0 e 255.`);
      }
  });


  presets.push(newPreset);
  console.log('Preset criado:', newPreset.id, newPreset.name, `(Tipo: ${newPreset.type})`);
  return newPreset;
};

/**
 * Atualiza uma definição de preset existente.
 * @param {string} id - ID do preset a atualizar.
 * @param {object} updates - Objeto com as propriedades a atualizar.
 * @returns {object} O preset atualizado.
 */
const updatePreset = (id, updates) => {
  const index = presets.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error(`Preset com ID ${id} não encontrado.`);
  }

  // Prevenir que o ID seja alterado
  if (updates.id && updates.id !== id) {
    throw new Error('Não é permitido alterar o ID de um preset.');
  }

  // Se 'values' for atualizado, validar também
  if (updates.values && !Array.isArray(updates.values)) {
      throw new Error('Os valores do preset devem ser um array.');
  }
  if (updates.values) {
      updates.values.forEach(v => {
          if (typeof v.attribute !== 'string' || !v.attribute.trim()) {
              throw new Error('Atributo inválido em um dos valores de atualização do preset.');
          }
          if (typeof v.value !== 'number' || v.value < 0 || v.value > 255) {
              throw new Error(`Valor DMX inválido para o atributo ${v.attribute} na atualização. Deve ser entre 0 e 255.`);
          }
      });
  }

  presets[index] = { ...presets[index], ...updates };
  console.log('Preset atualizado:', id);
  return presets[index];
};

/**
 * Remove uma definição de preset.
 * @param {string} id - ID do preset a remover.
 * @returns {boolean} True se o preset foi removido, false caso contrário.
 */
const deletePreset = (id) => {
  const initialLength = presets.length;
  presets.splice(presets.findIndex(p => p.id === id), 1);
  if (presets.length < initialLength) {
    console.log('Preset removido:', id);
    return true;
  }
  return false;
};

/**
 * Obtém todas as definições de preset.
 * @returns {Array<object>} Lista de todos os presets.
 */
const getAllPresets = () => {
  return presets;
};

/**
 * Obtém um preset pelo seu ID.
 * @param {string} id - ID do preset.
 * @returns {object|undefined} O preset encontrado ou undefined.
 */
const getPresetById = (id) => {
    return presets.find(p => p.id === id);
};


module.exports = {
  createPreset,
  updatePreset,
  deletePreset,
  getAllPresets,
  getPresetById
};