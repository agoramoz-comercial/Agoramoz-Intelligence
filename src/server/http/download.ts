import { NextResponse } from 'next/server'
import { isAppError } from '../errors'

/** Resposta de download privada; converte erros de domínio em JSON com o código certo. */
export async function download(run: () => Promise<{ body: BodyInit; filename: string; contentType: string }>): Promise<NextResponse> {
  try {
    const { body, filename, contentType } = await run()
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: unknown) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[download] falha', error)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
