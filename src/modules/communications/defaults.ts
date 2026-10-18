export type TemplateKey =
  | 'application_received'
  | 'interview_invitation'
  | 'interview_cancelled'
  | 'stage_progress'
  | 'rejection'
  | 'hired'
  | 'dsr_verification'
  | 'information_request'

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  application_received: 'Confirmação de candidatura',
  interview_invitation: 'Convite para entrevista',
  interview_cancelled: 'Entrevista cancelada',
  stage_progress: 'Progressão no processo',
  rejection: 'Resposta final (não seleccionado)',
  hired: 'Resposta final (seleccionado)',
  dsr_verification: 'Verificação de pedido de dados',
  information_request: 'Pedido de informação',
}

export const TEMPLATE_VARIABLES = ['candidato', 'vaga', 'empresa', 'referencia', 'data_entrevista', 'local', 'etapa', 'link', 'mensagem'] as const

/** Modelos iniciais em português de Moçambique. Cada empresa pode editá-los. */
export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; body: string }> = {
  application_received: {
    subject: 'Recebemos a sua candidatura — {{vaga}}',
    body: `Olá {{candidato}},

Recebemos a sua candidatura para {{vaga}} na {{empresa}}.
Referência: {{referencia}}

A equipa de Recursos Humanos vai analisar o seu perfil. Receberá uma resposta por este canal, qualquer que seja o resultado.

Pode consultar o estado ou exercer os seus direitos sobre os seus dados em:
{{link}}

Obrigado pelo interesse,
{{empresa}}`,
  },
  interview_invitation: {
    subject: 'Convite para entrevista — {{vaga}}',
    body: `Olá {{candidato}},

Gostaríamos de o(a) convidar para uma entrevista para {{vaga}}.

Quando: {{data_entrevista}}
Onde: {{local}}

Em anexo segue o convite de calendário. Se não puder comparecer, responda a este email para reagendar.

Referência: {{referencia}}
{{empresa}}`,
  },
  interview_cancelled: {
    subject: 'Entrevista cancelada — {{vaga}}',
    body: `Olá {{candidato}},

A entrevista marcada para {{data_entrevista}} foi cancelada. Entraremos em contacto para combinar uma nova data, se aplicável.

Referência: {{referencia}}
{{empresa}}`,
  },
  stage_progress: {
    subject: 'Actualização da sua candidatura — {{vaga}}',
    body: `Olá {{candidato}},

A sua candidatura para {{vaga}} avançou para a etapa: {{etapa}}.
Entraremos em contacto com os próximos passos.

Referência: {{referencia}}
{{empresa}}`,
  },
  rejection: {
    subject: 'Resposta à sua candidatura — {{vaga}}',
    body: `Olá {{candidato}},

Agradecemos o tempo que dedicou ao processo para {{vaga}}. Após análise, decidimos avançar com outros candidatos nesta fase.

Esta decisão foi tomada por pessoas da nossa equipa, com base nos critérios publicados da vaga. Se pretender esclarecimentos ou exercer direitos sobre os seus dados, utilize:
{{link}}

Desejamos-lhe sucesso,
{{empresa}}`,
  },
  hired: {
    subject: 'Boas notícias sobre a sua candidatura — {{vaga}}',
    body: `Olá {{candidato}},

Temos o prazer de informar que foi seleccionado(a) para {{vaga}}. A equipa de Recursos Humanos vai contactá-lo(a) com a proposta e os próximos passos.

Referência: {{referencia}}
{{empresa}}`,
  },
  dsr_verification: {
    subject: 'Confirme o seu pedido sobre dados pessoais — {{empresa}}',
    body: `Olá,

Recebemos um pedido relativo aos seus dados pessoais na {{empresa}}. Para o confirmar, abra a ligação abaixo (válida durante 48 horas):
{{link}}

Se não fez este pedido, ignore esta mensagem.`,
  },
  information_request: {
    subject: '{{vaga}} — pedido de informação',
    body: `Olá {{candidato}},

{{mensagem}}

Referência: {{referencia}}
{{empresa}}`,
  },
}
