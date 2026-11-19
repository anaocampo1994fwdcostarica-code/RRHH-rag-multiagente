// Contrato del agente de datos (se implementará en la sesión 3).
//
//   answer(auth, { question, scope }) → Promise<{ evidenceStatus, answer, sources? }>
//
//   scope:
//     'self'      → solo datos del usuario autenticado (único scope posible para un colaborador).
//     'aggregate' → cifras agregadas de la plantilla (solo RRHH).
//     'other'     → datos de otra persona (solo RRHH).
//
// Reglas: SQL de solo lectura con el cliente del usuario (RLS), filtrado por auth.uid();
// nunca redacta ni infiere políticas. El orquestador garantiza que un colaborador solo
// llega con scope 'self', y la RLS lo vuelve a garantizar en la base de datos.
export const DATA_SCOPES = Object.freeze(['self', 'aggregate', 'other'])

export function assertDataAgent(agent) {
  if (typeof agent?.answer !== 'function') throw new TypeError('Data agent must expose answer(auth, { question, scope }).')
  return agent
}

export function createDataAgentStub() {
  return {
    async answer(_auth, { scope } = {}) {
      if (!DATA_SCOPES.includes(scope)) throw new TypeError('Invalid data scope.')
      return { evidenceStatus: 'unavailable', answer: 'La consulta de datos personales todavía no está disponible en el asistente. Puedes revisarla en el portal o con RRHH.' }
    },
  }
}
