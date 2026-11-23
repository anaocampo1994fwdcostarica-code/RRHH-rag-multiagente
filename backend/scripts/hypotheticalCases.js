// Preguntas hipotéticas o "qué me aplica" (no están en el banco ni en las del equipo) y controles.
// Regla 5 del prompt del orquestador (v1.1.0).
export const HYPOTHETICAL_CASES = Object.freeze([
  { question: 'Si me despiden después de dos años, ¿me pagan cesantía?', expected: ['policy'] },
  { question: '¿Qué me corresponde si renuncio en mi primer año?', expected: ['policy'] },
  { question: 'Si me enfermo durante mis vacaciones, ¿qué pasa con esos días?', expected: ['policy'] },
  { question: '¿Cuánto me toca de aguinaldo si entré en julio?', expected: ['policy'] },
  // Controles: piden un dato guardado del usuario.
  { question: '¿Cuántos días de vacaciones tengo disponibles ahora?', expected: ['personal_data'] },
  { question: 'Si pido vacaciones la otra semana, ¿me alcanzan los días que tengo?', expected: ['mixed', 'personal_data'] },
])
