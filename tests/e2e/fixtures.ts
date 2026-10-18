import { expect, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { textPdf } from '../../scripts/lib/pdf'

export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'AgoramozDemo#2026'

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/app/)
}

export function cvFile(name: string): string {
  const path = join(tmpdir(), `cv-${Date.now()}.pdf`)
  writeFileSync(path, textPdf([name, 'Fiel de armazem em distribuidora (2018-2024)', 'Carta de conducao profissional', 'Ensino medio concluido']))
  return path
}
