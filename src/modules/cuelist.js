// mesa-de-luz-engine/src/modules/cuelist.js

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data'); // Caminho para a pasta 'data'
const CUELISTS_FILE = path.join(DATA_DIR, 'cuelists.json');

// Array para armazenar as definições de cuelist em memória.
let cuelists = [];

// Função para gerar um ID único para cuelists e cues
const generateUniqueId = (prefix) => {
  return `${prefix}_` + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// --- Funções de Persistência ---

/**
 * Carrega as cuelists do ficheiro JSON para a memória.
 */
const loadCuelists = () => {
  console.log(`Cuelist Module: Tentando carregar cuelists de ${CUELISTS_FILE}...`);
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`Cuelist Module: Pasta de dados '${DATA_DIR}' não encontrada, criando...`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(CUELISTS_FILE)) {
    try {
      const data = fs.readFileSync(CUELISTS_FILE, 'utf8');
      cuelists = JSON.parse(data);
      console.log(`Cuelist Module: ${cuelists.length} cuelists carregadas de ${CUELISTS_FILE}.`);
      console.log('Cuelist Module: Conteúdo das cuelists carregadas:', JSON.stringify(cuelists, null, 2)); // LOG DETALHADO
    } catch (error) {
      console.error(`Cuelist Module: Erro ao carregar cuelists de ${CUELISTS_FILE}:`, error.message);
      cuelists = []; // Em caso de erro, inicializa vazio
      console.log('Cuelist Module: Cuelists inicializadas como vazias devido a erro de carregamento.');
    }
  } else {
    console.log(`Cuelist Module: Ficheiro ${CUELISTS_FILE} não encontrado. Iniciando com cuelists vazias.`);
    cuelists = [];
  }
};

/**
 * Salva as cuelists da memória para o ficheiro JSON.
 */
const saveCuelists = () => {
  try {
    fs.writeFileSync(CUELISTS_FILE, JSON.stringify(cuelists, null, 2), 'utf8');
    console.log(`Cuelist Module: Cuelists salvas em ${CUELISTS_FILE}.`);
  } catch (error) {
    console.error(`Cuelist Module: Erro ao salvar cuelists em ${CUELISTS_FILE}:`, error.message);
  }
};

// Carrega as cuelists ao iniciar o módulo
loadCuelists();


// --- Funções CRUD de Cuelists ---

/**
 * Cria uma nova cuelist e adiciona-a à lista.
 * @param {object} cuelistData - Objeto contendo o nome da cuelist.
 * @returns {object} A nova cuelist criada.
 */
const createCuelist = (cuelistData) => {
  if (!cuelistData.name) {
    throw new Error('Nome da cuelist é obrigatório.');
  }
  const existingCuelist = cuelists.find(cl => cl.name === cuelistData.name);
  if (existingCuelist) {
    throw new Error(`Cuelist com nome '${cuelistData.name}' já existe.`);
  }

  const newCuelist = {
    id: generateUniqueId('clist'),
    name: cuelistData.name,
    cues: []
  };
  cuelists.push(newCuelist);
  saveCuelists(); // Salva após a criação
  console.log(`Cuelist Module: Cuelist '${newCuelist.name}' criada com ID '${newCuelist.id}'.`);
  return newCuelist;
};

/**
 * Obtém uma cuelist pelo seu ID.
 * @param {string} id - ID da cuelist.
 * @returns {object|undefined} O objeto cuelist ou undefined se não for encontrado.
 */
const getCuelistById = (id) => {
  console.log(`Cuelist Module: getCuelistById chamado com ID: '${id}' (Tipo: ${typeof id})`);
  const foundCuelist = cuelists.find(cl => cl.id === id);
  if (foundCuelist) {
    console.log(`Cuelist Module: Cuelist encontrada: '${foundCuelist.name}' (ID: '${foundCuelist.id}').`);
  } else {
    console.warn(`Cuelist Module: Cuelist com ID '${id}' NÃO encontrada.`);
    console.log('Cuelist Module: Cuelists atuais em memória:', JSON.stringify(cuelists.map(cl => ({id: cl.id, name: cl.name})), null, 2)); // Mostra IDs e nomes para comparação
  }
  return foundCuelist;
};

/**
 * Obtém todas as cuelists.
 * @returns {Array<object>} Um array de todas as cuelists.
 */
const getAllCuelists = () => {
  return [...cuelists]; // Retorna uma cópia
};

/**
 * Atualiza as propriedades de uma cuelist existente.
 * @param {string} id - ID da cuelist a atualizar.
 * @param {object} updates - Objeto com as propriedades a atualizar.
 * @returns {object} A cuelist atualizada.
 */
const updateCuelist = (id, updates) => {
  const cuelistIndex = cuelists.findIndex(cl => cl.id === id);
  if (cuelistIndex === -1) {
    throw new Error(`Cuelist com ID ${id} não encontrada.`);
  }
  cuelists[cuelistIndex] = { ...cuelists[cuelistIndex], ...updates };
  saveCuelists(); // Salva após a atualização
  console.log(`Cuelist Module: Cuelist '${id}' atualizada.`);
  return cuelists[cuelistIndex];
};

/**
 * Remove uma cuelist da lista.
 * @param {string} id - ID da cuelist a remover.
 * @returns {boolean} True se a cuelist foi removida, false caso contrário.
 */
const deleteCuelist = (id) => {
  const initialLength = cuelists.length;
  cuelists = cuelists.filter(cl => cl.id !== id);
  if (cuelists.length < initialLength) {
    saveCuelists(); // Salva após a remoção
    console.log(`Cuelist Module: Cuelist '${id}' removida.`);
    return true;
  }
  console.warn(`Cuelist Module: Tentativa de remover cuelist '${id}', mas não foi encontrada.`);
  return false;
};

// --- Funções CRUD de Cues dentro de Cuelists ---

/**
 * Adiciona um novo cue a uma cuelist específica.
 * @param {string} cuelistId - ID da cuelist.
 * @param {object} cueData - Objeto contendo nome, fade_in, delay_in e values do cue.
 * @returns {object} A cuelist atualizada.
 */
const addCueToCuelist = (cuelistId, cueData) => {
  const cuelist = getCuelistById(cuelistId); // Usa a função de obtenção existente
  if (!cuelist) {
    throw new Error(`Cuelist com ID ${cuelistId} não encontrada para adicionar cue.`);
  }
  if (!cueData.name || !Array.isArray(cueData.values)) {
    throw new Error('Nome e valores (array) são obrigatórios para o cue.');
  }
  if (typeof cueData.fade_in !== 'number' || cueData.fade_in < 0 || cueData.fade_in > 999.9) {
    throw new Error('Fade time do cue deve ser um número entre 0 e 999.9.');
  }
  if (typeof cueData.delay_in !== 'number' || cueData.delay_in < 0 || cueData.delay_in > 999.9) {
    throw new Error('Delay time do cue deve ser um número entre 0 e 999.9.');
  }

  const newCue = {
    id: generateUniqueId('cue'),
    name: cueData.name,
    fade_in: cueData.fade_in,
    delay_in: cueData.delay_in,
    values: cueData.values
  };
  cuelist.cues.push(newCue);
  saveCuelists(); // Salva após a adição do cue
  console.log(`Cuelist Module: Cue '${newCue.name}' adicionado à cuelist '${cuelist.name}'.`);
  return cuelist;
};

/**
 * Atualiza as propriedades de um cue específico dentro de uma cuelist.
 * @param {string} cuelistId - ID da cuelist.
 * @param {string} cueId - ID do cue a atualizar.
 * @param {object} updates - Objeto com as propriedades a atualizar.
 * @returns {object} O cue atualizado.
 */
const updateCueInCuelist = (cuelistId, cueId, updates) => {
  const cuelist = getCuelistById(cuelistId);
  if (!cuelist) {
    throw new Error(`Cuelist com ID ${cuelistId} não encontrada para atualizar cue.`);
  }
  const cueIndex = cuelist.cues.findIndex(cue => cue.id === cueId);
  if (cueIndex === -1) {
    throw new Error(`Cue com ID ${cueId} não encontrado na cuelist ${cuelistId}.`);
  }

  // Validações para updates de fade_in e delay_in
  if (updates.fade_in !== undefined && (typeof updates.fade_in !== 'number' || updates.fade_in < 0 || updates.fade_in > 999.9)) {
    throw new Error('Fade time atualizado do cue deve ser um número entre 0 e 999.9.');
  }
  if (updates.delay_in !== undefined && (typeof updates.delay_in !== 'number' || updates.delay_in < 0 || updates.delay_in > 999.9)) {
    throw new Error('Delay time atualizado do cue deve ser um número entre 0 e 999.9.');
  }
  if (updates.values !== undefined && !Array.isArray(updates.values)) {
    throw new Error('Valores atualizados do cue devem ser um array.');
  }

  cuelist.cues[cueIndex] = { ...cuelist.cues[cueIndex], ...updates };
  saveCuelists(); // Salva após a atualização do cue
  console.log(`Cuelist Module: Cue '${cueId}' na cuelist '${cuelistId}' atualizado.`);
  return cuelist.cues[cueIndex];
};

/**
 * Remove um cue específico de uma cuelist.
 * @param {string} cuelistId - ID da cuelist.
 * @param {string} cueId - ID do cue a remover.
 * @returns {boolean} True se o cue foi removido, false caso contrário.
 */
const deleteCueFromCuelist = (cuelistId, cueId) => {
  const cuelist = getCuelistById(cuelistId);
  if (!cuelist) {
    throw new Error(`Cuelist com ID ${cuelistId} não encontrada para remover cue.`);
  }
  const initialLength = cuelist.cues.length;
  cuelist.cues = cuelist.cues.filter(cue => cue.id !== cueId);
  if (cuelist.cues.length < initialLength) {
    saveCuelists(); // Salva após a remoção do cue
    console.log(`Cuelist Module: Cue '${cueId}' removido da cuelist '${cuelistId}'.`);
    return true;
  }
  console.warn(`Cuelist Module: Tentativa de remover cue '${cueId}' da cuelist '${cuelistId}', mas não foi encontrado.`);
  return false;
};

// --- Exportações do Módulo ---
module.exports = {
  createCuelist,
  getCuelistById,
  getAllCuelists,
  updateCuelist,
  deleteCuelist,
  addCueToCuelist,
  updateCueInCuelist,
  deleteCueFromCuelist,
  loadCuelists,
  saveCuelists
};
