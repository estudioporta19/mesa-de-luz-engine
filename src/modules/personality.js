// mesa-de-luz-engine/src/modules/personality.js

const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
// Importar funções de validação que criámos no validation.js
const { validateAttribute, validatePersonality: validatePersonalityData } = require('./validation');

const PERSONALITIES_FILE = path.join(__dirname, '..', '..', 'data', 'personalities.json');
let personalities = [];

// Função para carregar personalidades do ficheiro JSON
async function loadPersonalities() {
    try {
        const data = await fs.readFile(PERSONALITIES_FILE, 'utf8');
        personalities = JSON.parse(data);
        console.log(`Personalities loaded from ${PERSONALITIES_FILE}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Personalities file not found: ${PERSONALITIES_FILE}. Initializing with empty array.`);
            personalities = [];
        } else {
            console.error(`Error loading personalities from ${PERSONALITIES_FILE}:`, error);
            personalities = [];
        }
    }
}

// Função para salvar personalidades para o ficheiro JSON
async function savePersonalities() {
    try {
        await fs.writeFile(PERSONALITIES_FILE, JSON.stringify(personalities, null, 2), 'utf8');
        console.log(`Personalities saved to ${PERSONALITIES_FILE}`);
    } catch (error) {
        console.error(`Error saving personalities to ${PERSONALITIES_FILE}:`, error);
    }
}

// Chamar loadPersonalities uma vez ao iniciar o módulo
// Isto é importante para carregar os dados existentes quando o servidor inicia.
loadPersonalities();

/**
 * Cria uma nova personalidade e a adiciona à lista.
 * @param {object} personalityData - Dados da nova personalidade (name, model, numChannels, attributes).
 * @returns {object} - A personalidade criada.
 */
function createPersonality(personalityData) {
    const newPersonality = {
        id: `pers_${uuidv4()}`, // Gerar um ID único para a personalidade
        name: personalityData.name,
        model: personalityData.model || 'Generic',
        numChannels: personalityData.numChannels,
        attributes: personalityData.attributes || [], // Deve ser um array, pode estar vazio inicialmente
    };

    // Usar a função de validação importada
    validatePersonalityData(newPersonality);

    personalities.push(newPersonality);
    savePersonalities(); // Salvar após a criação
    return newPersonality;
}

/**
 * Retorna todas as personalidades.
 * @returns {Array<object>} - Lista de todas as personalidades.
 */
function getAllPersonalities() {
    return personalities;
}

/**
 * Obtém uma personalidade pelo ID.
 * @param {string} id - ID da personalidade.
 * @returns {object|undefined} - A personalidade ou undefined se não encontrada.
 */
function getPersonalityById(id) {
    return personalities.find(p => p.id === id);
}

/**
 * Atualiza uma personalidade existente.
 * @param {string} id - ID da personalidade a ser atualizada.
 * @param {object} updates - Objeto com os campos a serem atualizados.
 * @returns {object|null} - A personalidade atualizada ou null se não encontrada.
 */
function updatePersonality(id, updates) {
    const index = personalities.findIndex(p => p.id === id);
    if (index === -1) {
        throw new Error(`Personalidade com ID ${id} não encontrada.`);
    }

    const updatedPersonality = { ...personalities[index], ...updates };

    // Validar a personalidade atualizada antes de salvar
    validatePersonalityData(updatedPersonality);

    personalities[index] = updatedPersonality;
    savePersonalities(); // Salvar após a atualização
    return updatedPersonality;
}

/**
 * Deleta uma personalidade.
 * @param {string} id - ID da personalidade a ser deletada.
 * @returns {boolean} - True se a personalidade foi deletada, false caso contrário.
 */
function deletePersonality(id) {
    const initialLength = personalities.length;
    personalities = personalities.filter(p => p.id !== id);
    if (personalities.length < initialLength) {
        savePersonalities(); // Salvar após a deleção
        return true;
    }
    return false;
}

module.exports = {
    createPersonality,
    getAllPersonalities,
    getPersonalityById,
    updatePersonality,
    deletePersonality,
};
