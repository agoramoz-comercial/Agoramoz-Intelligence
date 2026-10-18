import type { NextRequest } from 'next/server'
import { authorize } from '@/server/auth/current'
import { download } from '@/server/http/download'
import { exportAuditCsv } from '@/modules/audit/service'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  return download(async () => ({
    body: await exportAuditCsv(await authorize('audit.export'), {
      q: params.get('q') ?? undefined,
      action: params.get('accao') ?? undefined,
      from: params.get('de') ?? undefined,
      to: params.get('ate') ?? undefined,
    }),
    filename: `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
    contentType: 'text/csv; charset=utf-8',
  }))
}
