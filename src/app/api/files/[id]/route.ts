import { NextResponse } from 'next/server'
import { authorize } from '@/server/auth/current'
import { isAppError } from '@/server/errors'
import { isUuid } from '@/server/db/client'
import { readCandidateFile } from '@/modules/candidates/service'

/** Download de CV: verifica sessão, permissão e need-to-know; regista o acesso na auditoria. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Ficheiro inválido' }, { status: 400 })
  try {
    const file = await readCandidateFile(await authorize(), id)
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[files] falha no download', error)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
