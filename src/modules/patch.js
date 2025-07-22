// mesa-de-luz-engine/src/modules/patch.js

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const FIXTURES_FILE = path.join(__dirname, '../../data/fixtures.json');
let fixtures = [];

/**
 * Carrega os fixtures do ficheiro.
 */
function loadFixturesFromFile() {
  try {
    if (fs.existsSync(FIXTURES_FILE)) {
      const data = fs.readFileSync(FIXTURES_FILE, 'utf8');
      fixtures = JSON.parse(data);
      console.log(`Patch: ${fixtures.length} fixtures carregados do ficheiro.`);
    } else {
      fixtures = [];
      console.log('Patch: Ficheiro de fixtures não encontrado. Iniciando com lista vazia.');
    }
  } catch (error) {
    console.error('Patch: Erro ao carregar fixtures:', error.message);
    fixtures = []; // Garante que a lista está vazia em caso de erro
  }
}

/**
 * Guarda os fixtures para o ficheiro.
 */
function saveFixturesToFile() {
  try {
    fs.writeFileSync(FIXTURES_FILE, JSON.stringify(fixtures, null, 2), 'utf8');
    console.log('Patch: Fixtures guardados para o ficheiro.');
  } catch (error) {
    console.error('Patch: Erro ao guardar fixtures:', error.message);
  }
}

/**
 * Retorna todos os fixtures.
 * @returns {Array<object>} A lista de fixtures.
 */
function getAllFixtures() {
  return [...fixtures]; // Retorna uma cópia para evitar modificações diretas
}

/**
 * Retorna um fixture pelo seu ID.
 * @param {string} id - O ID do fixture.
 * @returns {object | undefined} O objeto fixture se encontrado, caso contrário undefined.
 */
function getFixtureById(id) {
  return fixtures.find(fixture => fixture.id === id);
}

/**
 * Cria um novo fixture.
 * @param {object} fixtureData - Os dados do novo fixture (name, type, startChannel, universeId, personalityId).
 * @returns {object} O fixture criado.
 * @throws {Error} Se os dados forem inválidos.
 */
function createFixture(fixtureData) {
  if (!fixtureData.name || !fixtureData.startChannel || !fixtureData.personalityId) {
    throw new Error('Nome, Canal Inicial e Personalidade são obrigatórios para criar um fixture.');
  }
  const newFixture = {
    id: uuidv4(),
    name: fixtureData.name,
    type: fixtureData.type || 'Generic',
    startChannel: parseInt(fixtureData.startChannel, 10),
    universeId: fixtureData.universeId || 'my-universe',
    personalityId: fixtureData.personalityId
  };
  fixtures.push(newFixture);
  saveFixturesToFile();
  console.log(`Patch: Fixture '${newFixture.name}' criado.`);
  return newFixture;
}

/**
 * Atualiza um fixture existente.
 * @param {string} id - O ID do fixture a atualizar.
 * @param {object} updates - As propriedades a atualizar.
 * @returns {object} O fixture atualizado.
 * @throws {Error} Se o fixture não for encontrado.
 */
function updateFixture(id, updates) {
  const index = fixtures.findIndex(fixture => fixture.id === id);
  if (index === -1) {
    throw new Error(`Fixture com ID '${id}' não encontrado.`);
  }
  fixtures[index] = { ...fixtures[index], ...updates };
  saveFixturesToFile();
  console.log(`Patch: Fixture '${fixtures[index].name}' atualizado.`);
  return fixtures[index];
}

/**
 * Remove um fixture pelo seu ID.
 * @param {string} id - O ID do fixture a remover.
 * @returns {boolean} True se o fixture foi removido com sucesso, false caso contrário.
 */
function deleteFixture(id) {
  const initialLength = fixtures.length;
  fixtures = fixtures.filter(fixture => fixture.id !== id);
  if (fixtures.length < initialLength) {
    saveFixturesToFile();
    console.log(`Patch: Fixture ${id} removido.`);
    return true;
  }
  console.log(`Patch: Fixture ${id} não encontrado para remoção.`);
  return false;
}

// Carrega os fixtures ao iniciar o módulo
loadFixturesFromFile();

module.exports = {
  getAllFixtures,
  getFixtureById, // NOVO: Exportar esta função
  createFixture,
  updateFixture,
  deleteFixture
};
