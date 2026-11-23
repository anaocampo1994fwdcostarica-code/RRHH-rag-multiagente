import { withUserTransaction } from '../services/withUserTransaction.js'

// Catálogo de políticas publicadas. La consulta vive en la base
// (public.list_published_policies, migración 20261122100000): solo metadatos de políticas publicadas
// y vigentes, con el enlace de Drive validado. Filtros y paginación se aplican sobre ese resultado
// (son 11 políticas; no hay SQL escrito aquí).
const listSql = `select slug, document_code, title, category, doc_version, revision, effective_from::text as effective_from,
  drive_url, published_at from public.list_published_policies()`

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function createPoliciesRepository({ transaction = withUserTransaction } = {}) {
  const all = (auth) => transaction(auth, async (client) => (await client.query(listSql)).rows)
  return {
    async list(auth, { category, search, limit, offset }) {
      const rows = (await all(auth)).filter((row) =>
        (!category || normalize(row.category) === normalize(category))
        && (!search || normalize(`${row.title} ${row.document_code}`).includes(normalize(search))))
      return { rows: rows.slice(offset, offset + limit), total: rows.length }
    },

    async findBySlug(auth, slug) {
      return (await all(auth)).find((row) => row.slug === slug) ?? null
    },
  }
}

export const policiesRepository = createPoliciesRepository()
