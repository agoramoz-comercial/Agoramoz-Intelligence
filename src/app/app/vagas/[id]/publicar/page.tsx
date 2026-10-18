import type { Metadata } from 'next'
import { requirePermission } from '@/server/auth/current'
import { getVacancy } from '@/modules/vacancies/service'
import { serializeScreeningQuestions } from '@/modules/vacancies/schema'
import { aiAvailable } from '@/modules/ai/service'
import { PageHeader } from '@/components/ui'
import { PublishForm } from './publish-form'
import { draftDescriptionAction, publishVacancyAction } from '../../actions'

export const metadata: Metadata = { title: 'Publicar vaga' }

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('vacancy.manage')
  const { id } = await params
  const vacancy = await getVacancy(ctx, id)
  const current = vacancy.currentVersion
  return (
    <>
      <PageHeader
        back={{ href: `/app/vagas/${id}`, label: vacancy.requisitionTitle }}
        title={current ? `Nova versão de "${current.title}"` : `Publicar "${vacancy.requisitionTitle}"`}
        description="Cada publicação cria uma versão imutável. Os candidatos ficam ligados à versão que viram; requisitos e competências vêm da requisição aprovada."
      />
      <div className="panel p-6">
        <PublishForm
          action={publishVacancyAction.bind(null, id)}
          draftAction={draftDescriptionAction.bind(null, id)}
          aiEnabled={aiAvailable() && ctx.user.role !== 'executive'}
          hasSalary={vacancy.salaryMax !== null || vacancy.salaryMin !== null}
          defaults={{
            summary: current?.summary ?? '',
            description: current?.description ?? '',
            salaryVisible: current?.salaryVisible ?? false,
            closesOn: current?.closesOn ?? '',
            screeningQuestions: current ? serializeScreeningQuestions(current.screeningQuestions) : '',
          }}
        />
      </div>
    </>
  )
}
