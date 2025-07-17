// mesa-de-luz-engine/src/modules/cuelist.js

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE_PATH = path.join(DATA_DIR, 'cuelists.json'); // Usamos 'cuelists.json' no plural aqui

// Array para armazenar as definições de cuelist em memória.
// Cada cuelist contém um array de cues.
let cuelists = []; // <-- MUDAR PARA 'let' para permitir reatribuição após carregar do ficheiro

// Função para gerar um ID único para cuelists e cues
const generateUniqueId = (prefix) => {
  return `${prefix}_` + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Função para carregar cuelists do ficheiro
const loadCuelists = () => {
    try {
        if (fs.existsSync(DATA_FILE_PATH)) {
            const data = fs.readFileSync(DATA_FILE_PATH, 'utf8');
            cuelists = JSON.parse(data);
            console.log(`Cuelists carregadas de ${DATA_FILE_PATH}`);
        } else {
            console.log(`Ficheiro de cuelists não encontrado em ${DATA_FILE_PATH}. Será criado um novo.`);
            // Garante que o diretório 'data' existe e salva um array vazio para começar
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(DATA_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
            cuelists = [];
        }
    } catch (error) {
        console.error('Erro ao carregar cuelists do ficheiro:', error);
        cuelists = []; // Resetar para array vazio em caso de erro
    }
};

// Função para guardar cuelists no ficheiro
const saveCuelists = () => {
    try {
        // Garante que o diretório 'data' existe antes de tentar escrever
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(cuelists, null, 2), 'utf8');
        // console.log(`Cuelists salvas em ${DATA_FILE_PATH}`); // Removido para evitar spam no log
    } catch (error) {
        console.error('Erro ao salvar cuelists no ficheiro:', error);
    }
};

// Carregar as cuelists quando o módulo é inicializado
loadCuelists();


// Estrutura esperada para um 'Cue' - AGORA ALINHADA COM O PROTOCOLO
/*
{
  id: 'cue_abc',
  name: 'Primeiro Estado',
  fade_in: 2.0,  // Segundos (de acordo com o protocolo)
  delay_in: 0.0, // Segundos (de acordo com o protocolo)
  values: [ // Array de valores DMX/Preset
    { fixtureId: 'fixture_abc123', attribute: 'dimmer', value: 255 },
    { fixtureId: 'fixture_def456', attribute: 'red', value: 200 }
  ],
  midi_actions: [] // Opcional: Ações MIDI
}
*/

// --- Funções para gerir Cuelists ---

const getAllCuelists = () => {
  return cuelists;
};

const getCuelistById = (id) => {
  return cuelists.find(cl => cl.id === id);
};

const createCuelist = (cuelistData) => {
  if (!cuelistData || !cuelistData.name || typeof cuelistData.name !== 'string' || cuelistData.name.trim() === '') {
    throw new Error('Nome da cuelist inválido.');
  }
  if (cuelists.some(cl => cl.name === cuelistData.name.trim())) {
    throw new Error(`Cuelist com o nome '${cuelistData.name.trim()}' já existe.`);
  }

  const newCuelist = {
    id: generateUniqueId('clist'),
    name: cuelistData.name.trim(),
    cues: Array.isArray(cuelistData.cues) ? cuelistData.cues : [],
    fade_out_time: typeof cuelistData.fade_out_time === 'number' ? cuelistData.fade_out_time : 1.0 // Fade out padrão ao parar cuelist
  };

  // Validação básica de cues se fornecidos - AQUI JÁ ESPERAMOS 'fade_in' e 'delay_in'
  newCuelist.cues.forEach(cue => {
      if (!cue.id) cue.id = generateUniqueId('cue');
      if (typeof cue.fade_in !== 'number' || cue.fade_in < 0) cue.fade_in = 0;
      if (typeof cue.delay_in !== 'number' || cue.delay_in < 0) cue.delay_in = 0;
      if (!Array.isArray(cue.values)) cue.values = [];
  });

  cuelists.push(newCuelist);
  console.log('Cuelist criada:', newCuelist.id, newCuelist.name);
  saveCuelists();
  return newCuelist;
};

const updateCuelist = (id, updates) => {
  const index = cuelists.findIndex(cl => cl.id === id);
  if (index === -1) {
    throw new Error(`Cuelist com ID ${id} não encontrada.`);
  }

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim() === '') {
      throw new Error('Nome da cuelist inválido na atualização.');
    }
    if (cuelists.some(cl => cl.id !== id && cl.name === updates.name.trim())) {
      throw new Error(`Cuelist com o nome '${updates.name.trim()}' já existe.`);
    }
    updates.name = updates.name.trim();
  }

  if (updates.fade_out_time !== undefined) {
      if (typeof updates.fade_out_time !== 'number' || updates.fade_out_time < 0) {
          throw new Error('Fade out time da cuelist inválido na atualização. Deve ser um número não-negativo.');
      }
  }

  if (updates.cues !== undefined) {
      throw new Error('Cues devem ser modificados usando as funções específicas addCueToCuelist, updateCueInCuelist, deleteCueFromCuelist.');
  }

  cuelists[index] = { ...cuelists[index], ...updates };
  console.log('Cuelist atualizada:', id);
  saveCuelists();
  return cuelists[index];
};

const deleteCuelist = (id) => {
  const initialLength = cuelists.length;
  const index = cuelists.findIndex(cl => cl.id === id);
  if (index === -1) {
      return false;
  }
  cuelists.splice(index, 1);
  if (cuelists.length < initialLength) {
    console.log('Cuelist removida:', id);
    saveCuelists();
    return true;
  }
  return false;
};

// --- Funções para gerir Cues dentro de uma Cuelist ---

const addCueToCuelist = (cuelistId, cueData) => {
  const cuelist = getCuelistById(cuelistId);
  if (!cuelist) {
    throw new Error(`Cuelist com ID ${cuelistId} não encontrada para adicionar cue.`);
  }
  if (!cueData || !cueData.name || typeof cueData.name !== 'string' || cueData.name.trim() === '') {
    throw new Error('Nome do cue inválido.');
  }

  // VALIDAÇÕES AGORA PARA 'fade_in' E 'delay_in' DE ACORDO COM O PROTOCOLO
  if (typeof cueData.fade_in !== 'number' || cueData.fade_in < 0 || cueData.fade_in > 999.9) {
    throw new Error('Fade in time do cue inválido. Deve ser um número entre 0 e 999.9.');
  }
  if (typeof cueData.delay_in !== 'number' || cueData.delay_in < 0 || cueData.delay_in > 999.9) {
    throw new Error('Delay time do cue inválido. Deve ser um número entre 0 e 999.9.');
  }
  if (!Array.isArray(cueData.values)) {
      throw new Error('Os valores do cue devem ser um array.');
  }
  cueData.values.forEach(v => {
      if (!v.fixtureId || typeof v.fixtureId !== 'string' || !v.fixtureId.trim()) {
          throw new Error(`Valor de cue inválido: fixtureId é obrigatório. (${JSON.stringify(v)})`);
      }
      if (!v.attribute || typeof v.attribute !== 'string' || !v.attribute.trim()) {
          throw new Error(`Valor de cue inválido: atributo é obrigatório. (${JSON.stringify(v)})`);
      }
      if (typeof v.value !== 'number' || v.value < 0 || v.value > 255) {
          throw new Error(`Valor DMX inválido para o atributo ${v.attribute} do fixture ${v.fixtureId}. Deve ser entre 0 e 255.`);
      }
  });


  const newCue = {
    id: generateUniqueId('cue'),
    name: cueData.name.trim(),
    fade_in: cueData.fade_in,     // <-- AGORA USAR 'fade_in'
    delay_in: cueData.delay_in,   // <-- E AQUI 'delay_in'
    values: cueData.values || [],
    midi_actions: cueData.midi_actions || []
  };

  cuelist.cues.push(newCue);
  console.log(`Cue '${newCue.name}' (${newCue.id}) adicionado à cuelist '${cuelist.name}'.`);
  saveCuelists();
  return newCue;
};

const updateCueInCuelist = (cuelistId, cueId, updates) => {
  const cuelist = getCuelistById(cuelistId);
  if (!cuelist) {
    throw new Error(`Cuelist com ID ${cuelistId} não encontrada para atualizar cue.`);
  }

  const cueIndex = cuelist.cues.findIndex(c => c.id === cueId);
  if (cueIndex === -1) {
    throw new Error(`Cue com ID ${cueId} não encontrado na cuelist ${cuelistId}.`);
  }

  if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.trim() === '') {
          throw new Error('Nome do cue inválido na atualização.');
      }
      updates.name = updates.name.trim();
  }
  // VALIDAÇÕES AGORA PARA 'fade_in' E 'delay_in' DE ACORDO COM O PROTOCOLO
  if (updates.fade_in !== undefined) {
      if (typeof updates.fade_in !== 'number' || updates.fade_in < 0 || updates.fade_in > 999.9) {
          throw new Error('Fade in time do cue inválido na atualização. Deve ser um número entre 0 e 999.9.');
      }
  }
  if (updates.delay_in !== undefined) {
      if (typeof updates.delay_in !== 'number' || updates.delay_in < 0 || updates.delay_in > 999.9) {
          throw new Error('Delay time do cue inválido na atualização. Deve ser um número entre 0 e 999.9.');
      }
  }
  if (updates.values !== undefined) {
      if (!Array.isArray(updates.values)) {
          throw new Error('Os valores do cue atualizados devem ser um array.');
      }
      updates.values.forEach(v => {
          if (!v.fixtureId || typeof v.fixtureId !== 'string' || !v.fixtureId.trim()) {
              throw new Error(`Valor de cue atualizado inválido: fixtureId é obrigatório. (${JSON.stringify(v)})`);
          }
          if (!v.attribute || typeof v.attribute !== 'string' || !v.attribute.trim()) {
              throw new Error(`Valor de cue atualizado inválido: atributo é obrigatório. (${JSON.stringify(v)})`);
          }
          if (typeof v.value !== 'number' || v.value < 0 || v.value > 255) {
              throw new Error(`Valor DMX atualizado inválido para o atributo ${v.attribute} do fixture ${v.fixtureId}. Deve ser entre 0 e 255.`);
          }
      });
  }

  cuelist.cues[cueIndex] = { ...cuelist.cues[cueIndex], ...updates };
  console.log(`Cue '${cueId}' atualizado na cuelist '${cuelistId}'.`);
  saveCuelists();
  return cuelist.cues[cueIndex];
};

const deleteCueFromCuelist = (cuelistId, cueId) => {
  const cuelist = getCuelistById(cuelistId);
  if (!cuelist) {
    throw new Error(`Cuelist com ID ${cuelistId} não encontrada para remover cue.`);
  }

  const initialLength = cuelist.cues.length;
  cuelist.cues = cuelist.cues.filter(c => c.id !== cueId);
  if (cuelist.cues.length < initialLength) {
    console.log(`Cue '${cueId}' removido da cuelist '${cuelistId}'.`);
    saveCuelists();
    return true;
  }
  return false;
};

module.exports = {
  getAllCuelists,
  getCuelistById,
  createCuelist,
  updateCuelist,
  deleteCuelist,
  addCueToCuelist,
  updateCueInCuelist,
  deleteCueFromCuelist,
};