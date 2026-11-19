import { useState } from 'react'
import { apiClient } from '../../api/client.js'
import { isSafeCitationUrl } from './citationUrl.js'

function CitationList({ citations = [] }) {
  if (!citations.length) return null
  return <ul className="mt-3 space-y-2 border-l-2 border-teal-700 pl-3 text-sm text-slate-600" aria-label="Fuentes documentales">
    {citations.map((citation, index) => <li key={`${citation.documentId ?? 'source'}-${index}`}>
      <span className="font-medium text-slate-700">{citation.documentTitle ?? 'Documento autorizado'}</span>
      {citation.section ? ` · ${citation.section}` : ''}{citation.version ? ` · v${citation.version}` : ''}
      {isSafeCitationUrl(citation.url) ? <> · <a className="text-teal-800 underline focus:outline-none focus:ring-2 focus:ring-teal-700" href={citation.url} target="_blank" rel="noreferrer">Abrir fuente</a></> : null}
    </li>)}
  </ul>
}

function ChatPage() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  async function send(event) {
    event.preventDefault()
    if (!question.trim() || loading) return
    const text = question.trim()
    setQuestion('')
    setLoading(true)
    try {
      const response = await apiClient.request('/chat', { method: 'POST', body: { question: text } })
      setMessages((current) => [...current, { question: text, ...response.data }])
    } catch {
      setMessages((current) => [...current, { question: text, answer: 'No fue posible procesar la consulta.', evidenceStatus: 'unavailable', citations: [] }])
    } finally {
      setLoading(false)
    }
  }

  return <div className="mx-auto max-w-3xl"><section className="rounded-lg bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold">Chat IA</h1><p className="mt-2 text-sm text-slate-600">Las respuestas documentales requieren fuentes verificables.</p><div className="mt-6 space-y-4">{messages.map((message, index) => <div key={index}><p className="font-medium">Tú: {message.question}</p><p className="mt-1 rounded bg-slate-50 p-3">{message.answer}</p><p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">Evidencia: {message.evidenceStatus ?? 'unavailable'}</p><CitationList citations={message.citations} /></div>)}</div><form onSubmit={send} className="mt-6 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} className="flex-1 rounded border p-2" placeholder="Escribe tu consulta" /><button disabled={loading} className="rounded bg-[#0f4c5c] px-4 text-white disabled:opacity-60">{loading ? 'Procesando…' : 'Enviar'}</button></form></section></div>
}

export default ChatPage
