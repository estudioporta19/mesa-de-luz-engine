// mesa-de-luz-engine/src/modules/validation.js

const { v4: uuidv4 } = require('uuid'); // Necessário para validação de IDs que usam UUID

/**
 * Valida um canal DMX.
 * Range: 1-512 por universo.
 * Tipo: Número inteiro.
 * @param {number} channel - O número do canal DMX.
 * @returns {boolean} - True se o canal for válido, caso contrário lança um erro.
 */
function validateDMXChannel(channel) {
    if (typeof channel !== 'number' || !Number.isInteger(channel) || channel < 1 || channel > 512) {
        throw new Error('Canal DMX inválido: deve ser um número inteiro entre 1 e 512.');
    }
    return true;
}

/**
 * Valida um valor DMX.
 * Range: 0-255.
 * Tipo: Número inteiro.
 * @param {number} value - O valor DMX.
 * @returns {boolean} - True se o valor for válido, caso contrário lança um erro.
 */
function validateDMXValue(value) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error('Valor DMX inválido: deve ser um número inteiro entre 0 e 255.');
    }
    return true;
}

/**
 * Valida um ID de Fixture.
 * Formato: fix_UUID (ex: fix_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).
 * @param {string} id - O ID do fixture.
 * @returns {boolean} - True se o ID for válido, caso contrário lança um erro.
 */
function validateFixtureId(id) {
    // Regex para validar o formato 'fix_' seguido de um UUID v4
    if (typeof id !== 'string' || !/^fix_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('ID de Fixture inválido: deve seguir o formato fix_UUID (ex: fix_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).');
    }
    return true;
}

/**
 * Valida um Fade Time.
 * Range: 0-999.9 segundos.
 * Tipo: Número decimal.
 * Default: 0.0.
 * @param {number} fadeTime - O tempo de fade em segundos.
 * @returns {boolean} - True se o tempo de fade for válido, caso contrário lança um erro.
 */
function validateFadeTime(fadeTime) {
    if (typeof fadeTime !== 'number' || fadeTime < 0 || fadeTime > 999.9) {
        throw new Error('Fade Time inválido: deve ser um número decimal entre 0.0 e 999.9.');
    }
    return true;
}

/**
 * Valida um Delay Time.
 * Range: 0-999.9 segundos.
 * Tipo: Número decimal.
 * Default: 0.0.
 * @param {number} delayTime - O tempo de delay em segundos.
 * @returns {boolean} - True se o tempo de delay for válido, caso contrário lança um erro.
 */
function validateDelayTime(delayTime) {
    if (typeof delayTime !== 'number' || delayTime < 0 || delayTime > 999.9) {
        throw new Error('Delay Time inválido: deve ser um número decimal entre 0.0 e 999.9.');
    }
    return true;
}

/**
 * Valida um ID de Executor.
 * Formato ID: exec_UUID (ex: exec_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).
 * @param {string} id - O ID do executor.
 * @returns {boolean} - True se o ID for válido, caso contrário lança um erro.
 */
function validateExecutorId(id) {
    // Regex para validar o formato 'exec_' seguido de um UUID v4
    if (typeof id !== 'string' || !/^exec_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('ID de Executor inválido: deve seguir o formato exec_UUID (ex: exec_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).');
    }
    return true;
}

/**
 * Valida um ID de Cuelist.
 * Formato ID: clist_UUID (ex: clist_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).
 * @param {string} id - O ID da cuelist.
 * @returns {boolean} - True se o ID for válido, caso contrário lança um erro.
 */
function validateCuelistId(id) {
    // Regex para validar o formato 'clist_' seguido de um UUID v4
    if (typeof id !== 'string' || !/^clist_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('ID de Cuelist inválido: deve seguir o formato clist_UUID (ex: clist_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx).');
    }
    return true;
}

/**
 * Valida um objeto de atributo de personalidade.
 * @param {object} attribute - O objeto de atributo a validar.
 * @returns {boolean} - True se o atributo for válido, caso contrário lança um erro.
 */
function validateAttribute(attribute) {
    if (typeof attribute.name !== 'string' || attribute.name.trim() === '') {
        throw new Error('O nome do atributo é obrigatório e deve ser uma string não vazia.');
    }
    if (typeof attribute.offset !== 'number' || attribute.offset < 0) {
        throw new Error('O offset do atributo é obrigatório e deve ser um número não negativo.');
    }
    // Validar defaultValue, min, max se existirem
    if (attribute.defaultValue !== undefined && (typeof attribute.defaultValue !== 'number' || attribute.defaultValue < 0 || attribute.defaultValue > 255)) {
        throw new Error('O valor padrão do atributo deve ser um número entre 0 e 255.');
    }
    if (attribute.min !== undefined && (typeof attribute.min !== 'number' || attribute.min < 0 || attribute.min > 255)) {
        throw new Error('O valor mínimo do atributo deve ser um número entre 0 e 255.');
    }
    if (attribute.max !== undefined && (typeof attribute.max !== 'number' || attribute.max < 0 || attribute.max > 255)) {
        throw new Error('O valor máximo do atributo deve ser um número entre 0 e 255.');
    }
    return true;
}

/**
 * Valida a estrutura completa de uma personalidade, incluindo seus atributos.
 * @param {object} personality - O objeto de personalidade a validar.
 * @returns {boolean} - True se a personalidade for válida, caso contrário lança um erro.
 */
function validatePersonality(personality) {
    if (typeof personality.name !== 'string' || personality.name.trim() === '') {
        throw new Error('O nome da personalidade é obrigatório.');
    }
    if (typeof personality.model !== 'string' || personality.model.trim() === '') {
        throw new Error('O modelo da personalidade é obrigatório.');
    }
    if (typeof personality.numChannels !== 'number' || personality.numChannels <= 0 || personality.numChannels > 512) {
        throw new Error('O número de canais deve ser um número inteiro positivo entre 1 e 512.');
    }
    if (!Array.isArray(personality.attributes)) {
        throw new Error('Os atributos da personalidade devem ser um array.');
    }

    const seenOffsets = new Set();
    for (const attr of personality.attributes) {
        validateAttribute(attr); // Valida cada atributo individualmente
        if (seenOffsets.has(attr.offset)) {
            throw new Error(`Offset de atributo duplicado encontrado: ${attr.offset}. Cada offset deve ser único dentro de uma personalidade.`);
        }
        seenOffsets.add(attr.offset);
    }
    return true;
}


module.exports = {
    validateDMXChannel,
    validateDMXValue,
    validateFixtureId,
    validateFadeTime,
    validateDelayTime,
    validateExecutorId,
    validateCuelistId,
    validateAttribute, // EXPORTADO AGORA
    validatePersonality // EXPORTADO AGORA
};
