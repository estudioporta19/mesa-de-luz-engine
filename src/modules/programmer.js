// mesa-de-luz-engine/src/modules/programmer.js - Com Debugging

// Estado interno do programador: { fixtureId: { attributeName: value, ... }, ... }
let programmerState = {};
let ioInstance; // Instância do Socket.IO
let sendDmxCommandFn; // Função para enviar comandos DMX
let patchModule; // Módulo de patch para obter fixtures
let personalityModule; // Módulo de personality para obter atributos

/**
 * Inicializa o módulo do programador com as dependências.
 * @param {object} io - Instância do Socket.IO.
 * @param {function} sendDmxCommand - Função para enviar comandos DMX.
 * @param {object} patchMod - O módulo de patch.
 * @param {object} personalityMod - O módulo de personalidade.
 */
function initProgrammerModule(io, sendDmxCommand, patchMod, personalityMod) {
  ioInstance = io;
  sendDmxCommandFn = sendDmxCommand;
  patchModule = patchMod;
  personalityModule = personalityMod;
  console.log('Programmer Module: Inicializado.');
}

/**
 * Retorna o estado atual do programador.
 * @returns {object} O estado atual do programador.
 */
function getProgrammerState() {
  return { ...programmerState };
}

/**
 * Retorna o valor de um atributo específico para um fixture no programador.
 * @param {string} fixtureId - O ID do fixture.
 * @param {string} attributeName - O nome do atributo.
 * @returns {number | undefined} O valor do atributo, ou undefined se não existir.
 */
function getProgrammerValue(fixtureId, attributeName) {
  // Se o fixture não estiver no programador, retorna 0 como valor padrão
  return programmerState[fixtureId] && programmerState[fixtureId][attributeName] !== undefined
         ? programmerState[fixtureId][attributeName]
         : 0; // Valor padrão 0 para atributos não definidos no programador
}

/**
 * Atualiza o valor de um atributo no programador e envia o comando DMX.
 * @param {string} fixtureId - O ID do fixture.
 * @param {string} attributeName - O nome do atributo.
 * @param {number} value - O novo valor (0-255).
 */
function updateProgrammerValue(fixtureId, attributeName, value) {
  const parsedValue = Math.max(0, Math.min(255, parseInt(value, 10))); // Garante 0-255

  if (!programmerState[fixtureId]) {
    programmerState[fixtureId] = {};
  }

  // Verifica se o valor realmente mudou para evitar DMX desnecessário
  if (programmerState[fixtureId][attributeName] === parsedValue) {
      console.log(`Programmer: Valor para Fixture ${fixtureId}, Atributo ${attributeName} já é ${parsedValue}. Nenhuma mudança DMX.`);
      return;
  }

  programmerState[fixtureId][attributeName] = parsedValue;
  console.log(`Programmer: Fixture ${fixtureId}, Atributo ${attributeName} definido para ${parsedValue}`);

  // Enviar comando DMX
  const fixture = patchModule.getFixtureById(fixtureId);
  if (!fixture) {
    console.warn(`Programmer: Fixture com ID ${fixtureId} não encontrado para atualização.`);
    return;
  }
  const personality = personalityModule.getPersonalityById(fixture.personalityId);
  if (!personality) {
    console.warn(`Programmer: Personalidade para Fixture ${fixture.name} (ID: ${fixture.id}) não encontrada.`);
    return;
  }
  const attributeInfo = personality.attributes.find(attr => attr.name === attributeName);
  if (!attributeInfo) {
    console.warn(`Programmer: Atributo ${attributeName} não encontrado na personalidade ${personality.name} para Fixture ${fixture.name}.`);
    return;
  }

  const dmxChannel = fixture.startChannel + attributeInfo.offset;
  console.log(`Programmer: Enviando DMX para canal ${dmxChannel} com valor ${parsedValue} (Fixture: ${fixture.name}, Atributo: ${attributeName}).`);
  sendDmxCommandFn(dmxChannel, parsedValue, 0.0); // Envia instantaneamente
  ioInstance.emit('server_message', `Programmer: DMX Canal ${dmxChannel} para ${parsedValue}`);

  // O frontend é atualizado via 'dmx_state_updated' que o server.js já emite.
  // Não precisamos de emitir 'programmer_state_updated' explicitamente aqui,
  // pois o frontend já escuta 'dmx_state_updated' e atualiza o programmerValues.
}

/**
 * Limpa o programador, zerando todos os valores.
 */
function clearProgrammer() {
  programmerState = {};
  console.log('Programmer: Limpo.');
  // Não envia DMX aqui, pois o programador apenas "sugere" valores.
  // O frontend pode precisar de uma atualização para refletir o programador limpo.
  // No entanto, o fluxo atual do frontend atualiza o programador com base no DMX.
}

module.exports = {
  initProgrammerModule,
  getProgrammerState,
  getProgrammerValue,
  updateProgrammerValue,
  clearProgrammer
};
