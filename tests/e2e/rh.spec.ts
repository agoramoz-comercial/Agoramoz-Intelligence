import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test('RH vê o painel, abre o pipeline e decide com motivo obrigatório', async ({ page }) => {
  await signIn(page, 'rh@demo-construcoes.test')
  await expect(page.getByRole('heading', { name: /Bom dia/ })).toBeVisible()
  await expect(page.getByText('Candidaturas recebidas')).toBeVisible()

  await page.getByRole('link', { name: 'Vagas e pipeline' }).click()
  await page.getByRole('link', { name: /Fiel de Armazém/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible()

  await page.getByRole('link', { name: 'Marta Uamusse' }).click()
  await expect(page.getByRole('heading', { name: 'Evidência face aos requisitos' })).toBeVisible()
  await expect(page.getByText(/requisitos obrigatórios/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Não seleccionar' }).click()
  await expect(page.getByText('Escolha o motivo da rejeição')).toBeVisible()
  await page.getByLabel('Motivo de não selecção').selectOption('experiencia_insuficiente')
  await page.getByRole('button', { name: 'Não seleccionar' }).click()
  await expect(page.getByText('Não seleccionado').first()).toBeVisible()
  await expect(page.getByText(/Rejeitada: Experiência insuficiente/)).toBeVisible()
})

test('entrevistador vê apenas as suas entrevistas (need-to-know)', async ({ page }) => {
  await signIn(page, 'entrevistador@demo-construcoes.test')
  await expect(page).toHaveURL(/\/app\/entrevistas/)
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link')).toHaveCount(1)
  await page.goto('/app/candidatos')
  await expect(page.getByRole('heading', { name: 'Sem acesso a esta área' })).toBeVisible()
})

test('a página de privacidade aceita pedidos sem revelar se o email existe', async ({ page }) => {
  await page.goto('/carreiras/demo-construcoes/privacidade')
  await page.getByLabel('Email usado na candidatura').fill('qualquer.pessoa@exemplo.test')
  await page.getByLabel('O que pretende').selectOption('erasure')
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByText(/Se o email estiver correcto/)).toBeVisible()
})
