// mesa-de-luz-engine/src/modules/patch.js

// Array para armazenar os fixtures em memória.
// Mais tarde, isto será substituído por uma base de dados (SQLite3).
const fixtures = [];

// Função para gerar um ID único para o fixture
const generateUniqueId = () => {
  return 'fixture_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

/**
 * Adiciona um novo fixture.
 * @param {object} fixtureData - Dados do fixture (name, type, startChannel, etc.).
 * @returns {object} O fixture adicionado com um ID único.
 */
const createFixture = (fixtureData) => {
  const newFixture = {
    id: generateUniqueId(),
    name: fixtureData.name || 'Novo Fixture',
    manufacturer: fixtureData.manufacturer || 'Desconhecido',
    model: fixtureData.model || 'Desconhecido',
    type: fixtureData.type || 'Generic', // Ex: 'LED_PAR', 'Moving_Head'
    universeId: fixtureData.universeId || 'my-universe', // ID do universo DMX ao qual pertence
    startChannel: fixtureData.startChannel, // Canal DMX inicial (obrigatório)
    personalityId: fixtureData.personalityId || 'default', // ID da personalidade (para tipos de canais)
    // Exemplo de estrutura de canais - será mais detalhado com o módulo Personality
    channels: fixtureData.channels || [
      { name: 'Dimmer', channelOffset: 0, default: 255, min: 0, max: 255 }
    ],
    // Outras propriedades conforme o protocolo ou necessidade
    patchedAt: new Date().toISOString()
  };

  // Validação básica: startChannel é obrigatório e deve ser um número
  if (typeof newFixture.startChannel !== 'number' || newFixture.startChannel < 1 || newFixture.startChannel > 512) {
    throw new Error('startChannel é obrigatório e deve ser um número entre 1 e 512.');
  }

  // Verificar se já existe um fixture com o mesmo startChannel no mesmo universo
  const conflict = fixtures.some(f =>
    f.universeId === newFixture.universeId &&
    f.startChannel === newFixture.startChannel
  );
  if (conflict) {
    throw new Error(`Já existe um fixture patchado no canal ${newFixture.startChannel} do universo ${newFixture.universeId}.`);
  }

  fixtures.push(newFixture);
  console.log('Fixture criado:', newFixture.id, newFixture.name, 'no canal', newFixture.startChannel);
  return newFixture;
};

/**
 * Atualiza um fixture existente.
 * @param {string} id - ID do fixture a atualizar.
 * @param {object} updates - Objeto com as propriedades a atualizar.
 * @returns {object} O fixture atualizado.
 */
const updateFixture = (id, updates) => {
  const index = fixtures.findIndex(f => f.id === id);
  if (index === -1) {
    throw new Error(`Fixture com ID ${id} não encontrado.`);
  }

  // Prevenir que o ID seja alterado
  if (updates.id && updates.id !== id) {
    throw new Error('Não é permitido alterar o ID de um fixture.');
  }

  // Se o startChannel ou universeId for atualizado, verificar conflitos
  if ((updates.startChannel && updates.startChannel !== fixtures[index].startChannel) ||
      (updates.universeId && updates.universeId !== fixtures[index].universeId)) {
    const newStartChannel = updates.startChannel || fixtures[index].startChannel;
    const newUniverseId = updates.universeId || fixtures[index].universeId;

    const conflict = fixtures.some((f, i) =>
      i !== index && // Não comparar com o próprio fixture
      f.universeId === newUniverseId &&
      f.startChannel === newStartChannel
    );
    if (conflict) {
      throw new Error(`A atualização criaria um conflito: já existe um fixture patchado no canal ${newStartChannel} do universo ${newUniverseId}.`);
    }
  }

  fixtures[index] = { ...fixtures[index], ...updates };
  console.log('Fixture atualizado:', id);
  return fixtures[index];
};

/**
 * Remove um fixture.
 * @param {string} id - ID do fixture a remover.
 * @returns {boolean} True se o fixture foi removido, false caso contrário.
 */
const deleteFixture = (id) => {
  const initialLength = fixtures.length;
  fixtures.splice(fixtures.findIndex(f => f.id === id), 1);
  if (fixtures.length < initialLength) {
    console.log('Fixture removido:', id);
    return true;
  }
  return false;
};

/**
 * Obtém todos os fixtures patchados.
 * @returns {Array<object>} Lista de todos os fixtures.
 */
const getAllFixtures = () => {
  return fixtures;
};

/**
 * Obtém um fixture pelo seu ID.
 * @param {string} id - ID do fixture.
 * @returns {object|undefined} O fixture encontrado ou undefined.
 */
const getFixtureById = (id) => {
    return fixtures.find(f => f.id === id);
};


module.exports = {
  createFixture,
  updateFixture,
  deleteFixture,
  getAllFixtures,
  getFixtureById
};