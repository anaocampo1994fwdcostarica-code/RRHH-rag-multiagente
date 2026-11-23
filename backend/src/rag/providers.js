export function createDisabledDriveClient() { return { async listChanges() { throw new Error('Google Drive integration is not configured.') } } }
export function createDisabledEmbeddingProvider() { return { async embed() { throw new Error('Embedding provider is not configured.') } } }
export function createDisabledLlmProvider() { return { async generate() { throw new Error('LLM provider is not configured.') } } }
