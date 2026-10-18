import { NextResponse } from 'next/server'
import { authorize } from '@/server/auth/current'
import { isUuid } from '@/server/db/client'
import { download } from '@/server/http/download'
import { exportCandidateData } from '@/modules/privacy/service'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })
  return download(async () => {
    const { filename, json } = await exportCandidateData(await authorize('privacy.manage'), id)
    return { body: json, filename, contentType: 'application/json; charset=utf-8' }
  })
}
