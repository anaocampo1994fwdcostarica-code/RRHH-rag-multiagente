export function createDocumentSyncService({ drive, ingestion, repository } = {}) {
  if (!drive?.listFiles || !ingestion?.ingest || !repository?.listKnownExternalIds) throw new TypeError('Document sync requires drive, ingestion, and repository services.')

  return {
    // This is intentionally caller-triggered. No scheduler is registered by this module.
    async sync(auth) {
      const run = await repository.startRun?.(auth)
      try {
        const files = await drive.listFiles()
        const outcomes = []
        for (const file of files) outcomes.push(await ingestion.ingest(auth, file, drive))
        const known = await repository.listKnownExternalIds(auth)
        const visible = new Set(files.map((file) => file.id))
        const archived = await ingestion.archiveMissing(auth, known.filter((id) => !visible.has(id)))
        await repository.finishRun?.(auth, run?.id, { status: 'completed', examined: files.length, changed: outcomes.filter((outcome) => outcome.outcome === 'changed').length })
        return { outcomes, archived }
      } catch (error) {
        await repository.finishRun?.(auth, run?.id, { status: 'failed' }).catch(() => {})
        throw error
      }
    },
  }
}
