'use server'

import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { createDepartment, createUser, resetUserPassword, updateUser } from '@/modules/users/service'
import { updateSettings } from '@/modules/organizations/service'

export async function createUserAction(_: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await createUser(await authorize('org.manage'), formDataToObject(form))
    return null
  }, 'Utilizador criado. Partilhe a palavra-passe inicial por um canal seguro.')
  refresh()
  return result
}

export async function updateUserAction(userId: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await updateUser(await authorize('org.manage'), userId, formDataToObject(form))
    return null
  }, 'Utilizador actualizado.')
  refresh()
  return result
}

export async function resetPasswordAction(userId: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await resetUserPassword(await authorize('org.manage'), userId, String(form.get('password') ?? ''))
    return null
  }, 'Palavra-passe redefinida; sessões activas terminadas.')
}

export async function departmentAction(_: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await createDepartment(await authorize('org.manage'), String(form.get('name') ?? ''))
    return null
  }, 'Departamento criado.')
  refresh()
  return result
}

export async function settingsAction(_: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await updateSettings(await authorize('org.manage'), formDataToObject(form))
    return null
  }, 'Regras guardadas.')
  refresh()
  return result
}
