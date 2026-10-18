import type { Tx } from '@/server/db/client'

export interface DuplicateMatch {
  candidateId: string
  reasons: string[]
}

const NAME_SIMILARITY_THRESHOLD = 0.8

/**
 * Procura registos que podem ser a mesma pessoa. Gera sugestões; a fusão é sempre uma decisão humana (HR-023).
 */
export async function findDuplicates(
  tx: Tx,
  candidate: { id: string; fullName: string; email: string | null; phone: string | null },
): Promise<DuplicateMatch[]> {
  const rows = await tx<{ id: string; sameEmail: boolean; samePhone: boolean; nameSimilarity: number }[]>`
    select c.id,
      (${candidate.email}::citext is not null and c.email = ${candidate.email}::citext) as same_email,
      (${candidate.phone}::text is not null and c.phone = ${candidate.phone}) as same_phone,
      similarity(f_unaccent(lower(c.full_name)), f_unaccent(lower(${candidate.fullName}))) as name_similarity
    from candidates c
    where c.id <> ${candidate.id} and c.anonymized_at is null
      and (
        (${candidate.email}::citext is not null and c.email = ${candidate.email}::citext)
        or (${candidate.phone}::text is not null and c.phone = ${candidate.phone})
        or f_unaccent(lower(c.full_name)) % f_unaccent(lower(${candidate.fullName}))
      )
    limit 20
  `
  return rows.flatMap((row) => {
    const reasons = [
      ...(row.sameEmail ? ['mesmo email'] : []),
      ...(row.samePhone ? ['mesmo telefone'] : []),
      ...(row.nameSimilarity >= NAME_SIMILARITY_THRESHOLD ? ['nome muito semelhante'] : []),
    ]
    return reasons.length > 0 ? [{ candidateId: row.id, reasons }] : []
  })
}

export async function recordDuplicateSuggestions(tx: Tx, tenantId: string, candidateId: string, matches: readonly DuplicateMatch[]): Promise<number> {
  let created = 0
  for (const match of matches) {
    const [a, b] = [candidateId, match.candidateId].sort() as [string, string]
    const inserted = await tx`
      insert into duplicate_suggestions (tenant_id, candidate_a, candidate_b, reasons)
      values (${tenantId}, ${a}, ${b}, ${match.reasons})
      on conflict (candidate_a, candidate_b) do nothing
      returning id
    `
    created += inserted.length
  }
  return created
}
