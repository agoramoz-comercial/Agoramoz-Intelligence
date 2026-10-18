import { NextResponse } from 'next/server'
import { appSql } from '@/server/db/client'

/** Verificação de saúde para o balanceador e monitorização (sem dados de negócio). */
export async function GET() {
  const started = Date.now()
  try {
    await appSql()`select 1`
    return NextResponse.json({ status: 'ok', database: 'ok', latencyMs: Date.now() - started }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
