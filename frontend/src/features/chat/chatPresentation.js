const evidenceLabels = Object.freeze({
  supported: 'Respaldada por políticas',
  partial: 'Respaldo parcial',
  insufficient: 'Sin evidencia en las políticas',
  restricted: 'Acceso restringido',
  out_of_scope: 'Fuera de alcance',
  unavailable: 'Servicio no disponible',
})

const evidenceStyles = Object.freeze({
  supported: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  insufficient: 'bg-slate-200 text-slate-700',
  restricted: 'bg-rose-100 text-rose-800',
  out_of_scope: 'bg-slate-200 text-slate-700',
  unavailable: 'bg-rose-100 text-rose-800',
})

export function getEvidenceLabel(status, agent) {
  if (status === 'supported' && agent === 'data') return 'Datos de tu registro'
  return evidenceLabels[status] ?? evidenceLabels.unavailable
}

export function getEvidenceStyle(status) {
  return evidenceStyles[status] ?? evidenceStyles.unavailable
}

export function citationAnchorId(messageId, number) {
  return `cita-${messageId}-${number}`
}

/** Los enlaces del markdown solo se permiten con http(s) o mailto. */
export function isSafeMarkdownHref(value) {
  if (typeof value !== 'string') return false
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const markerPattern = /\[(\d{1,3})\]/g

/**
 * Plugin remark: convierte marcadores [n] (1..count) de los nodos de texto en
 * enlaces internos a la cita correspondiente. No genera HTML crudo.
 */
export function remarkCitationMarkers({ messageId, count }) {
  function transform(node) {
    if (!node.children || node.type === 'link' || node.type === 'linkReference' || node.type === 'inlineCode' || node.type === 'code') return
    const next = []
    for (const child of node.children) {
      if (child.type !== 'text') {
        transform(child)
        next.push(child)
        continue
      }
      let last = 0
      for (const match of child.value.matchAll(markerPattern)) {
        const n = Number(match[1])
        if (n < 1 || n > count) continue
        if (match.index > last) next.push({ type: 'text', value: child.value.slice(last, match.index) })
        next.push({ type: 'link', url: `#${citationAnchorId(messageId, n)}`, title: `Ir a la fuente ${n}`, children: [{ type: 'text', value: `[${n}]` }] })
        last = match.index + match[0].length
      }
      if (last === 0) next.push(child)
      else if (last < child.value.length) next.push({ type: 'text', value: child.value.slice(last) })
    }
    node.children = next
  }
  return (tree) => transform(tree)
}
