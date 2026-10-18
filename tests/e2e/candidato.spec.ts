import { expect, test } from '@playwright/test'
import { cvFile } from './fixtures'

test('candidato candidata-se pelo telemóvel com CV e recebe referência', async ({ page }) => {
  const name = `Teste E2E ${Date.now().toString(36)}`
  await page.goto('/carreiras/demo-construcoes')
  await page.getByRole('link', { name: /Fiel de Armazém/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fiel de Armazém' })).toBeVisible()

  await page.getByRole('link', { name: 'Candidatar-me' }).click()
  await page.getByLabel('Nome completo').fill(name)
  await page.getByLabel('Telefone').fill('84 700 1234')
  await page.getByLabel(/^Email/).fill(`${name.replace(/\s+/g, '.').toLowerCase()}@exemplo.test`)

  // Sem consentimento e sem respostas obrigatórias, o formulário explica o que falta junto de cada campo.
  await page.getByRole('button', { name: 'Enviar candidatura' }).click()
  await expect(page.getByText('É necessário aceitar o tratamento dos dados para esta candidatura')).toBeVisible()

  for (const group of await page.getByRole('radiogroup').all()) await group.getByLabel('Sim').check()
  await page.getByLabel(/^CV/).setInputFiles(cvFile(name))
  await page.getByRole('checkbox', { name: /Autorizo/ }).check()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Enviar candidatura' }).click()

  await expect(page.getByText('Candidatura recebida')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/AGH-[2-9A-Z]{6}/)).toBeVisible()
})

test('rascunho sobrevive a um recarregamento da página', async ({ page }) => {
  await page.goto('/carreiras/demo-construcoes/espontanea')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Nome completo').fill('Rascunho Persistente')
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Nome completo')).toHaveValue('Rascunho Persistente')
  await expect(page.getByText('Recuperámos o rascunho')).toBeVisible()
})
