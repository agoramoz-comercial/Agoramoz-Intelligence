'use server'

import { redirect } from 'next/navigation'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { saveScorecard } from '@/modules/interviews/service'

export async function saveScorecardAction(interviewId: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const submit = form.get('intent') === 'submit'
  const result = await runAction(async () => {
    await saveScorecard(await authorize('scorecard.submit'), interviewId, formDataToObject(form))
    return null
  }, submit ? 'Scorecard submetido.' : 'Rascunho guardado.')
  if (result.ok && submit) redirect('/app/entrevistas?submetido=1')
  return result
}
