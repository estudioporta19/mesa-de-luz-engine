// mesa-de-luz-engine/src/modules/preset.js

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'presets.json'); // Ficheiro para guardar os presets

let presets = []; // Array para armazenar os presets em memória

// Garante que a pasta de dados existe
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Pasta de dados criada: ${DATA_DIR}`);
}

// Função para carregar presets do ficheiro
const loadPresets = () => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            presets = JSON.parse(data);
            console.log(`Presets carregados de ${DATA_FILE}`);
        } else {
            presets = [];
            console.log('Ficheiro presets.json não encontrado. Iniciando com presets vazios.');
        }
    } catch (error) {
        console.error('Erro ao carregar presets:', error);
        presets = []; // Reseta em caso de erro de parsing
    }
};

// Função para guardar presets no ficheiro
const savePresets = () => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(presets, null, 2), 'utf8');
        console.log(`Presets guardados em ${DATA_FILE}`);
    } catch (error) {
        console.error('Erro ao guardar presets:', error);
    }
};

// Carrega os presets ao inicializar o módulo
loadPresets();

// --- Funções do Módulo ---

const getAllPresets = () => {
    return presets;
};

const createPreset = (presetData) => {
    // Validações (conforme protocolo_mesa_de_luz_v1.md)
    if (!presetData.name || presetData.name.trim() === '') {
        throw new Error('Nome do Preset é obrigatório.');
    }
    if (presets.some(p => p.name === presetData.name)) {
        throw new Error(`Preset com o nome '${presetData.name}' já existe.`);
    }
    if (!presetData.type || presetData.type.trim() === '') {
        throw new Error('Tipo do Preset é obrigatório.');
    }
    if (!Array.isArray(presetData.values) || presetData.values.length === 0) {
        throw new Error('Valores do Preset são obrigatórios e devem ser um array não vazio.');
    }
    presetData.values.forEach(val => {
        if (!val.attribute || val.attribute.trim() === '') {
            throw new Error('Atributo do valor do Preset é obrigatório.');
        }
        if (isNaN(val.value) || val.value < 0 || val.value > 255) {
            throw new Error(`Valor do atributo '${val.attribute}' inválido. Deve ser um número entre 0 e 255.`);
        }
    });


    const newPreset = {
        id: `preset_${uuidv4()}`, // Gera um ID único para o preset
        ...presetData
    };
    presets.push(newPreset);
    savePresets(); // Guarda após a criação
    return newPreset;
};

const updatePreset = (id, updates) => {
    const presetIndex = presets.findIndex(p => p.id === id);
    if (presetIndex === -1) {
        throw new Error(`Preset com ID '${id}' não encontrado.`);
    }

    const currentPreset = presets[presetIndex];
    const updatedPreset = { ...currentPreset, ...updates };

    // Validações para updates
    if (updates.name && updates.name.trim() === '') {
        throw new Error('Nome do Preset não pode ser vazio.');
    }
    if (updates.name && updates.name !== currentPreset.name && presets.some(p => p.name === updates.name && p.id !== id)) {
        throw new Error(`Preset com o nome '${updates.name}' já existe.`);
    }
    if (updates.type && updates.type.trim() === '') {
        throw new Error('Tipo do Preset não pode ser vazio.');
    }
    if (updates.values) {
        if (!Array.isArray(updates.values) || updates.values.length === 0) {
            throw new Error('Valores do Preset são obrigatórios e devem ser um array não vazio.');
        }
        updates.values.forEach(val => {
            if (!val.attribute || val.attribute.trim() === '') {
                throw new Error('Atributo do valor do Preset é obrigatório.');
            }
            if (isNaN(val.value) || val.value < 0 || val.value > 255) {
                throw new Error(`Valor do atributo '${val.attribute}' inválido. Deve ser um número entre 0 e 255.`);
            }
        });
    }

    presets[presetIndex] = updatedPreset;
    savePresets(); // Guarda após a atualização
    return updatedPreset;
};

const deletePreset = (id) => {
    const initialLength = presets.length;
    presets = presets.filter(p => p.id !== id);
    if (presets.length < initialLength) {
        savePresets(); // Guarda após a eliminação
        return true;
    }
    return false;
};

module.exports = {
    getAllPresets,
    createPreset,
    updatePreset,
    deletePreset
};
