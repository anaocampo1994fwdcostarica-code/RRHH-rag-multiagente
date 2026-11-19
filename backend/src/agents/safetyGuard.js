// Capa de seguridad determinista del orquestador.
// Se ejecuta ANTES de cualquier LLM y solo puede endurecer la decisión, nunca relajarla.
// Objetivo: que un colaborador sin rol RRHH jamás llegue a un agente con una consulta
// sobre datos de otra persona o sobre datos agregados de la plantilla.

// Normaliza a minúsculas sin tildes para que "compañero", "companero" y "COMPAÑERO" coincidan.
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Referencias a terceros (sobre texto normalizado).
const thirdPartyNouns = String.raw`(?:companer[oa]s?|colegas?|jef[ea]s?|jefatura|gerentes?|gerencia general|supervisor(?:a|es|as)?|director(?:a|es|as)?|coordinador(?:a|es|as)?|subordinad[oa]s?|ceo|president[ea]|dueno|duena|otr[oa]s? (?:empleado|colaborador|persona|trabajador|companer)[a-z]*|los demas|las demas|alguien mas|cualquier (?:empleado|colaborador|persona)|senor(?:a|ita)?|don|dona|__pronombre__)`

// Datos personales que no se pueden revelar de otra persona.
const personalDataTerms = String.raw`(?:salario|sueldo|ingresos?|planilla|pago|aguinaldo|bono|aumento|liquidacion|vacaciones|dias|saldo|incapacidad(?:es)?|evaluacion(?:es)?|desempeno|calificacion|solicitud(?:es)?|permisos?|direccion|domicilio|telefono|celular|correo|email|cedula|edad|cumpleanos|expediente|contrato|sancion(?:es)?|amonestacion(?:es)?|despido|datos|informacion)`

// Verbos en tercera persona que indican que se pregunta por la situación de otro.
const thirdPersonVerbs = String.raw`(?:tiene|tienen|gana|ganan|cobra|cobran|recibe|reciben|devenga|le queda|le quedan|les queda|les quedan|tomo|pidio|solicito|esta de|estan de|esta incapacitad[oa]|lleva|saco|le pagan|le dieron|le toca|le corresponden?)`

// Excepciones: obligación o capacidad ("mi jefe tiene que aprobar") no es pedir un dato del jefe.
const obligationAfterVerb = /^\s*(?:que|derecho a aprobar|la obligacion)/

// Nombres propios frecuentes (detecta "juan" aunque venga en minúscula o al inicio de la frase).
const commonFirstNames = new Set(`juan jose luis carlos jorge pedro pablo miguel andres diego daniel david mario manuel francisco javier fernando ricardo roberto alejandro sergio rafael eduardo antonio alberto oscar esteban mauricio adrian gabriel kevin bryan randall marco marcos josue maria ana laura sofia valeria camila daniela andrea paola carolina gabriela fernanda monica patricia silvia veronica natalia diana karla rebeca melissa tatiana alejandra lucia elena isabel rosa carmen marta raquel adriana`.split(' '))

// Términos permitidos de varias palabras (instituciones, feriados de Costa Rica, leyes y documentos).
// Se sustituyen por un marcador neutro ANTES de buscar nombres propios, para que
// "Día de Juan Santamaría" o "Código de Trabajo" no cuenten como personas.
const allowedPhrases = [
  // Instituciones
  'Caja Costarricense de Seguro Social', 'Instituto Nacional de Seguros', 'Ministerio de Trabajo y Seguridad Social',
  'Ministerio de Trabajo', 'Ministerio de Hacienda', 'Banco Popular', 'Banco Nacional', 'Banco de Costa Rica',
  'Poder Judicial', 'Sala Constitucional', 'Defensoría de los Habitantes', 'Operadora de Pensiones',
  'Recursos Humanos', 'Costa Rica', 'Google Drive',
  // Feriados y fechas de Costa Rica
  'Día de Juan Santamaría', 'Juan Santamaría', 'Batalla de Rivas', 'Semana Santa', 'Jueves Santo', 'Viernes Santo',
  'Día del Trabajador', 'Día del Trabajo', 'Anexión del Partido de Nicoya', 'Anexión de Nicoya', 'Partido de Nicoya',
  'Virgen de los Ángeles', 'Día de la Virgen', 'Día de la Madre', 'Día de la Independencia', 'Día de las Culturas',
  'Día de la Persona Negra', 'Día de la Abolición del Ejército', 'Año Nuevo', 'Fin de Año',
  // Leyes y documentos
  'Código de Trabajo', 'Código de Ética', 'Código de Conducta', 'Constitución Política', 'Ley de Protección al Trabajador',
  'Ley de Hostigamiento Sexual', 'Ley de Igualdad Social de la Mujer', 'Reglamento Interno de Trabajo',
  'Reglamento Interior de Trabajo', 'Convención Colectiva', 'Manual del Colaborador', 'Política de Vacaciones',
]

const accentInsensitive = (phrase) => phrase
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  .replace(/a/g, '[aá]').replace(/e/g, '[eé]').replace(/i/g, '[ií]').replace(/o/g, '[oó]').replace(/u/g, '[uúü]').replace(/n/g, '[nñ]')
  .replace(/ /g, '\\s+')
const allowedPhrasesRegex = new RegExp(`(?<![\\p{L}])(?:${[...allowedPhrases].sort((a, b) => b.length - a.length).map(accentInsensitive).join('|')})(?![\\p{L}])`, 'giu')

// Palabras sueltas con mayúscula que no son nombres de personas.
const capitalizedAllowlist = new Set(`rrhh recursos humanos drive google gemini costa rica ccss ins ina ice mtss aya imas pani inamu bcr bncr rop fcl ministerio trabajo caja seguro social banco popular hacienda gobierno codigo ley leyes reglamento politica manual procedimiento convencion constitucion decreto articulo capitulo seccion anexo feriado feriados navidad semana santa jueves viernes ano nuevo independencia nicoya guanacaste culturas virgen angeles madre aguinaldo enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre lunes martes miercoles sabado domingo dios`.split(' '))

const thirdPartyNounRegex = new RegExp(String.raw`\b${thirdPartyNouns}\b`, 'g')
// "salario del gerente", "vacaciones de mi compañero", "evaluación de Juan" (Juan se sustituye por un marcador).
const possessionRegex = new RegExp(String.raw`\b${personalDataTerms}\b(?:\s+\S+){0,3}?\s+(?:de|del|de la|de los|de las)\s+(?:mi|mis|nuestro|nuestra|el|la|los|las|un|una|otro|otra)?\s*(?:${thirdPartyNouns}|__persona__)\b`)
const salaryOfOthersRegex = /\b(?:cuanto|cuantos|que) (?:gana|ganan|cobra|cobran|devenga)\b/
const aggregateRegex = /\b(?:cuant[oa]s|quien(?:es)?|cuales|lista(?:do)?|total de|numero de|porcentaje de|promedio de)\b(?:\s+\S+){0,3}?\s+(?:personas|empleados|colaboradores|trabajadores|gente|funcionarios|esta|estan|tiene|tienen|ha|han)\b/
const aggregateSubjectRegex = /\b(?:personas|empleados|colaboradores|trabajadores|gente|funcionarios|plantilla|equipo completo|toda la empresa|todos)\b/
const firstPersonRegex = /\b(?:mi|mis|me|yo|tengo|quedan? me|mio|mia)\b/

// Sustituye nombres propios por el marcador __persona__ en el texto normalizado.
function markProperNames(original) {
  // "él" (con tilde) es pronombre; "el" sin tilde es artículo y no debe contar como tercero.
  const withPronouns = String(original ?? '').replace(allowedPhrasesRegex, '__termino__').replace(/(^|[^\p{L}])(él|ella|ellos|ellas)(?=[^\p{L}]|$)/giu, '$1__pronombre__')
  const tokens = withPronouns.split(/(\s+)/)
  let sentenceStart = true
  const marked = tokens.map((token) => {
    if (/^\s+$/.test(token) || token === '') return token
    const clean = token.replace(/^[¿¡"'(«]+|[?!.,;:"')»]+$/g, '')
    const normalized = normalize(clean)
    const startsUpper = /^\p{Lu}\p{Ll}+$/u.test(clean)
    const isName = commonFirstNames.has(normalized)
      || (startsUpper && !sentenceStart && !capitalizedAllowlist.has(normalized))
    const startsSentence = /^[¿¡]/.test(token)
    sentenceStart = /[.?!]$/.test(token)
    if (isName && !(startsSentence && !commonFirstNames.has(normalized))) return '__persona__'
    return normalize(token)
  })
  return marked.join('').replace(/[¿?¡!.,;:"'()«»]/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasThirdPersonVerbNear(text, mentionIndex, mentionLength) {
  const windowBefore = text.slice(Math.max(0, mentionIndex - 45), mentionIndex)
  const windowAfter = text.slice(mentionIndex + mentionLength, mentionIndex + mentionLength + 45)
  const verbRegex = new RegExp(String.raw`\b${thirdPersonVerbs}\b`, 'g')
  for (const match of windowAfter.matchAll(verbRegex)) {
    const rest = windowAfter.slice(match.index + match[0].length)
    if (!obligationAfterVerb.test(rest)) return true
  }
  for (const match of windowBefore.matchAll(verbRegex)) {
    const rest = windowBefore.slice(match.index + match[0].length)
    if (!obligationAfterVerb.test(rest)) return true
  }
  return false
}

/**
 * Evalúa una consulta (y opcionalmente sus reformulaciones) sin LLM.
 * @returns {{ decision: 'allow' | 'restricted' | 'aggregate' | 'third_party', reason: string|null, suspicious: boolean }}
 *  - restricted: un colaborador pide datos de otra persona o agregados → negar sin llamar agentes.
 *  - aggregate / third_party: solo se devuelven a un usuario RRHH (para él se permite enrutar).
 *  - suspicious: menciona a un tercero sin pedir un dato; el respaldo nunca será "policy".
 */
export function evaluateQuerySafety(question, { isHr = false } = {}) {
  const text = markProperNames(question)
  const mentions = [...text.matchAll(thirdPartyNounRegex), ...text.matchAll(/__persona__/g)]
  const mentionsPerson = mentions.some((m) => !['__pronombre__', 'don', 'dona'].includes(m[0])) || /__persona__/.test(text)

  let reason = null
  if (possessionRegex.test(text)) reason = 'third_party_possession'
  else if (salaryOfOthersRegex.test(text)) reason = 'third_party_salary'
  else if (mentions.some((m) => hasThirdPersonVerbNear(text, m.index, m[0].length))) reason = 'third_party_subject'

  if (reason) return { decision: isHr ? 'third_party' : 'restricted', reason, suspicious: true }

  const asksWhoAmongStaff = /\bquienes (?:estan|tienen|han|pidieron|tomaron|faltaron)\b/.test(text)
  if ((asksWhoAmongStaff || (aggregateRegex.test(text) && aggregateSubjectRegex.test(text))) && !firstPersonRegex.test(text)) {
    return { decision: isHr ? 'aggregate' : 'restricted', reason: 'aggregate_data', suspicious: true }
  }

  return { decision: 'allow', reason: null, suspicious: mentionsPerson }
}
