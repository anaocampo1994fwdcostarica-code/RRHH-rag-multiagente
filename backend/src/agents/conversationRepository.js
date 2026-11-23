import { createUserDataClient } from '../services/supabaseDataClient.js'
import { throwDataApiError } from '../repositories/dataApiError.js'

// Memoria de conversación sobre assistant_conversations / assistant_messages.
// Usa el cliente del usuario: la RLS limita la lectura a sus conversaciones y solo permite
// insertar mensajes con role = 'user'. Las respuestas del asistente se guardan con el RPC
// append_assistant_message (SECURITY DEFINER, verifica owns_conversation()).
export function createConversationRepository({ createDataClient = createUserDataClient } = {}) {
  return {
    async getRecentMessages(auth, conversationId, limit = 6) {
      const { data, error } = await createDataClient(auth)
        .from('assistant_messages')
        .select('role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit)
      throwDataApiError(error)
      return (Array.isArray(data) ? data : []).reverse()
    },

    async createConversation(auth, title) {
      const { data, error } = await createDataClient(auth)
        .from('assistant_conversations')
        .insert({ owner_profile_id: auth.userId, title: title.slice(0, 120) })
        .select('id')
        .single()
      throwDataApiError(error)
      return data.id
    },

    async appendUserMessage(auth, conversationId, content) {
      const { error } = await createDataClient(auth)
        .from('assistant_messages')
        .insert({ conversation_id: conversationId, role: 'user', content })
      throwDataApiError(error)
    },

    async appendAssistantMessage(auth, conversationId, content) {
      const { error } = await createDataClient(auth).rpc('append_assistant_message', {
        p_conversation_id: conversationId,
        p_content: content.slice(0, 8000),
        p_model_name: null,
      })
      throwDataApiError(error)
    },
  }
}
