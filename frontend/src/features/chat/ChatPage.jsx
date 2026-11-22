import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiClient } from '../../api/client.js'
import { isSafeCitationUrl } from './citationUrl.js'
import { citationAnchorId, getEvidenceLabel, getEvidenceStyle, isSafeMarkdownHref, remarkCitationMarkers } from './chatPresentation.js'
import { buildChatRequestBody, ESCALATION_PROMPT, nextConversationId, shouldOfferEscalation } from './chatState.js'

// Por ahora solo visual: todavía no existe el flujo de contacto con RRHH.
function EscalationNotice() {
  return <div role="status" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    <p className="font-medium">{ESCALATION_PROMPT}</p>
    <p className="mt-1 text-amber-800">Puedes escribir directamente al equipo de Recursos Humanos con tu consulta.</p>
  </div>
}

const markdownComponents = {
  a({ href, children }) {
    if (typeof href === 'string' && href.startsWith('#cita-')) {
      return <sup><a href={href} className="mx-0.5 rounded bg-[#e8f1f3] px-1 text-xs font-semibold text-[#0f4c5c] no-underline hover:bg-[#d3e6ea] focus:outline-none focus:ring-2 focus:ring-[#0f4c5c]">{children}</a></sup>
    }
    if (!isSafeMarkdownHref(href)) return <span>{children}</span>
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#0f4c5c] underline">{children}</a>
  },
  table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="min-w-full border-collapse text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-slate-300 px-2 py-1">{children}</td>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
}

function AnswerMarkdown({ text, messageId, citationCount }) {
  const plugins = useMemo(() => [remarkGfm, [remarkCitationMarkers, { messageId, count: citationCount }]], [messageId, citationCount])
  return <ReactMarkdown remarkPlugins={plugins} components={markdownComponents}>{text ?? ''}</ReactMarkdown>
}

function CitationList({ citations = [], messageId }) {
  if (!citations.length) return null
  return <ol className="mt-3 space-y-2 border-l-2 border-[#0f4c5c] pl-3 text-sm text-slate-600" aria-label="Fuentes documentales">
    {citations.map((citation, index) => {
      const n = index + 1
      const title = citation.documentTitle ?? 'Documento autorizado'
      return <li key={n} id={citationAnchorId(messageId, n)} className="scroll-mt-4 target:rounded target:bg-amber-50">
        <span className="font-semibold text-[#0f4c5c]">[{n}]</span>{' '}
        <span className="font-medium text-slate-700">{citation.documentCode ? `${citation.documentCode} — ` : ''}{title}</span>
        {citation.section ? <span> · {citation.section}</span> : null}
        {' · '}
        {isSafeCitationUrl(citation.url)
          ? <a className="text-[#0f4c5c] underline focus:outline-none focus:ring-2 focus:ring-[#0f4c5c]" href={citation.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver en Drive: ${title}`}>Ver en Drive</a>
          : <span className="text-slate-500">Enlace no disponible</span>}
      </li>
    })}
  </ol>
}

function ChatPage() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }) }, [messages, loading])

  async function send(event) {
    event.preventDefault()
    if (!question.trim() || loading) return
    const text = question.trim()
    setQuestion('')
    setLoading(true)
    setMessages((current) => [...current, { role: 'user', text }])
    try {
      const response = await apiClient.request('/chat', { method: 'POST', body: buildChatRequestBody(text, conversationId) })
      setConversationId((current) => nextConversationId(current, response.data))
      setMessages((current) => [...current, { role: 'assistant', ...response.data }])
    } catch {
      setMessages((current) => [...current, { role: 'assistant', answer: 'No fue posible procesar la consulta.', evidenceStatus: 'unavailable', citations: [] }])
    } finally {
      setLoading(false)
    }
  }

  return <div className="mx-auto max-w-3xl"><section className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
    <h1 className="text-2xl font-semibold">Chat IA</h1>
    <p className="mt-2 text-sm text-slate-600">Las respuestas documentales requieren fuentes verificables.</p>
    <div role="log" aria-live="polite" aria-label="Conversación" className="mt-6 max-h-[60vh] min-h-40 space-y-4 overflow-y-auto pr-1">
      {messages.length === 0 && !loading ? <p className="text-sm text-slate-500">Escribe tu consulta para comenzar.</p> : null}
      {messages.map((message, index) => message.role === 'user'
        ? <div key={index} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#0f4c5c] px-4 py-2 text-sm text-white">{message.text}</p></div>
        : <div key={index} className="flex justify-start"><div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 text-sm text-slate-800">
          <AnswerMarkdown text={message.answer} messageId={index} citationCount={(message.citations ?? []).length} />
          <p className="mt-3"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getEvidenceStyle(message.evidenceStatus)}`}>{getEvidenceLabel(message.evidenceStatus, message.agent)}</span></p>
          <CitationList citations={message.citations} messageId={index} />
          {shouldOfferEscalation(message) ? <EscalationNotice /> : null}
        </div></div>)}
      {loading ? <div className="flex justify-start"><p className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm italic text-slate-500">Pensando…</p></div> : null}
      <div ref={endRef} />
    </div>
    <form onSubmit={send} className="mt-6 flex gap-2"><label className="sr-only" htmlFor="chat-question">Consulta</label><input id="chat-question" value={question} onChange={(event) => setQuestion(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 p-2" placeholder="Escribe tu consulta" /><button disabled={loading} className="rounded bg-[#0f4c5c] px-4 text-white disabled:opacity-60">{loading ? 'Procesando…' : 'Enviar'}</button></form>
  </section></div>
}

export default ChatPage
