/**
 * Dados de DEMONSTRAÇÃO, totalmente sintéticos (empresas, pessoas e CVs fictícios).
 * Percorre os serviços reais do produto com o papel da aplicação (RLS activa), para que o seed
 * seja também um teste de ponta a ponta: requisição → aprovação → vaga → candidatura → entrevista → decisão.
 */
import { loadEnv } from './load-env'
import { textPdf } from './lib/pdf'

loadEnv()

const PASSWORD = process.env.SEED_PASSWORD ?? 'AgoramozDemo#2026'

async function main(): Promise<void> {
  const { adminSql, closeDb } = await import('@/server/db/client')
  const { provisionOrganization } = await import('@/modules/organizations/provision')
  const { createUser, listDepartments } = await import('@/modules/users/service')
  const { createRequisition, submitRequisition, decideRequisition } = await import('@/modules/requisitions/service')
  const { createVacancyFromRequisition, publishVacancy, getVacancy, getPublicVacancy } = await import('@/modules/vacancies/service')
  const { submitPublicApplication, intakeApplication } = await import('@/modules/applications/intake')
  const { moveApplication, rejectApplication, hireApplication, addComment } = await import('@/modules/applications/pipeline')
  const { scheduleInterview, saveScorecard } = await import('@/modules/interviews/service')
  const { processOutbox } = await import('@/modules/communications/service')
  type RequestContext = import('@/server/context').RequestContext
  type Role = import('@/server/auth/rbac').Role

  const admin = adminSql()
  const [existing] = await admin`select 1 from organizations where slug = 'demo-construcoes'`
  if (existing) {
    console.log('Seed já aplicado (organização demo-construcoes existe). Use npm run db:reset para recomeçar.')
    await closeDb()
    return
  }

  const meta = { ip: '127.0.0.1', userAgent: 'seed', correlationId: 'seed-demo-0001' }
  const ctxFor = (tenantId: string, id: string, role: Role, fullName: string, departmentId: string | null = null): RequestContext => ({
    tenantId,
    user: { id, tenantId, email: '', fullName, role, departmentId },
    ...meta,
  })

  // --- Organização principal ------------------------------------------------
  const org = await provisionOrganization(admin, {
    slug: 'demo-construcoes',
    name: 'Demo Construções Moçambique',
    sector: 'Construção e logística',
    admin: { email: 'admin@demo-construcoes.test', fullName: 'Amélia Nhantumbo', password: PASSWORD },
    departments: ['Recursos Humanos', 'Operações', 'Obras', 'Administração e Finanças'],
    settings: { privacyContactEmail: 'privacidade@demo-construcoes.test' },
  })
  const adminCtx = ctxFor(org.tenantId, org.adminId, 'org_admin', 'Amélia Nhantumbo')
  const departments = await listDepartments(adminCtx)
  const dept = (name: string) => departments.find((item) => item.name === name)!.id

  const people: { key: string; email: string; fullName: string; role: Role; department?: string }[] = [
    { key: 'hr', email: 'rh@demo-construcoes.test', fullName: 'Carlos Muianga', role: 'hr', department: 'Recursos Humanos' },
    { key: 'manager', email: 'gestor@demo-construcoes.test', fullName: 'Fátima Cossa', role: 'hiring_manager', department: 'Operações' },
    { key: 'engineer', email: 'obras@demo-construcoes.test', fullName: 'Helder Mondlane', role: 'hiring_manager', department: 'Obras' },
    { key: 'interviewer', email: 'entrevistador@demo-construcoes.test', fullName: 'Rui Tembe', role: 'interviewer', department: 'Operações' },
    { key: 'executive', email: 'direccao@demo-construcoes.test', fullName: 'Graça Machava', role: 'executive' },
    { key: 'privacy', email: 'privacidade@demo-construcoes.test', fullName: 'Inês Sitoe', role: 'privacy_officer' },
  ]
  const users: Record<string, RequestContext> = { admin: adminCtx }
  for (const person of people) {
    const id = await createUser(adminCtx, {
      email: person.email,
      fullName: person.fullName,
      role: person.role,
      departmentId: person.department ? dept(person.department) : '',
      password: PASSWORD,
    })
    users[person.key] = ctxFor(org.tenantId, id, person.role, person.fullName, person.department ? dept(person.department) : null)
  }
  const hr = users.hr!
  const manager = users.manager!

  // --- Requisições e aprovações (separação de funções) -----------------------
  const warehouseReq = await createRequisition(manager, {
    title: 'Fiel de Armazém',
    departmentId: dept('Operações'),
    location: 'Matola, Maputo',
    contractType: 'a_prazo',
    headcount: 2,
    salaryMin: '18000',
    salaryMax: '24000',
    reason: 'expansao',
    justification: 'Abertura do segundo armazém na Matola exige reforço do controlo de entradas e saídas de material.',
    requirementsMust: 'Ensino médio concluído\nExperiência em armazém ou gestão de stocks\nCarta de condução profissional',
    requirementsNice: 'Conhecimentos de Excel\nCertificação em operação de empilhadores',
    competencies: 'Rigor no controlo de stocks: regista entradas e saídas sem erros\nSegurança no trabalho: cumpre normas de HSE\nComunicação: coordena com motoristas e fornecedores',
  })
  const driverReq = await createRequisition(manager, {
    title: 'Motorista de Pesados',
    departmentId: dept('Operações'),
    location: 'Maputo e Gaza',
    contractType: 'sem_termo',
    headcount: 3,
    salaryMin: '22000',
    salaryMax: '30000',
    reason: 'substituicao',
    justification: 'Substituição de dois motoristas e reforço da rota Maputo-Xai-Xai para entregas de obra.',
    requirementsMust: 'Carta de condução profissional de pesados\nExperiência em transporte de carga\nDisponibilidade para viagens',
    requirementsNice: 'Conhecimento da EN1\nFormação em condução defensiva',
    competencies: 'Condução segura: demonstra práticas de condução defensiva\nResponsabilidade: cuida da viatura e da carga\nPontualidade: cumpre horários de entrega',
  })
  const engineerReq = await createRequisition(users.engineer!, {
    title: 'Engenheiro(a) Civil de Obra',
    departmentId: dept('Obras'),
    location: 'Beira, Sofala',
    contractType: 'a_prazo',
    headcount: 1,
    salaryMin: '95000',
    salaryMax: '140000',
    reason: 'projecto',
    justification: 'Direcção técnica da obra de reabilitação do armazém portuário na Beira durante 18 meses.',
    requirementsMust: 'Licenciatura em Engenharia Civil\nInscrição na Ordem dos Engenheiros de Moçambique\n5 anos de experiência em direcção de obra',
    requirementsNice: 'Experiência com obras portuárias\nAutoCAD e MS Project',
    competencies: 'Gestão de obra: planeia e controla prazos e custos\nLiderança: coordena equipas e subempreiteiros\nSegurança: implementa planos de HSE',
  })
  await createRequisition(hr, {
    title: 'Técnico(a) de HSE',
    departmentId: dept('Obras'),
    location: 'Maputo',
    contractType: 'sem_termo',
    headcount: 1,
    salaryMin: '',
    salaryMax: '',
    reason: 'nova_posicao',
    justification: 'Necessidade de acompanhamento permanente de segurança e saúde no trabalho nas obras de Maputo.',
    requirementsMust: 'Curso técnico em Higiene e Segurança no Trabalho\nExperiência em obra',
    requirementsNice: '',
    competencies: 'Prevenção: identifica riscos e propõe medidas',
  })

  for (const id of [warehouseReq, driverReq, engineerReq]) await submitRequisition(id === engineerReq ? users.engineer! : manager, id)
  // Passo 1 (gestor da área): quem requisitou não pode aprovar; o outro gestor aprova.
  await decideRequisition(users.engineer!, warehouseReq, { decision: 'approved', comment: 'Necessidade confirmada pela operação.' })
  await decideRequisition(users.engineer!, driverReq, { decision: 'approved' })
  await decideRequisition(manager, engineerReq, { decision: 'approved', comment: 'Projecto já contratado com o cliente.' })
  // Passo 2 (RH).
  await decideRequisition(hr, warehouseReq, { decision: 'approved', comment: 'Dentro da tabela salarial.' })
  await decideRequisition(hr, driverReq, { decision: 'approved' })
  await decideRequisition(hr, engineerReq, { decision: 'approved' })
  // A requisição de engenharia (tecto ≥ 100.000 MZN) fica à espera da Direcção (passo 3).

  // --- Vagas publicadas --------------------------------------------------------
  const warehouseVacancy = await createVacancyFromRequisition(hr, warehouseReq)
  await publishVacancy(hr, warehouseVacancy, {
    summary: 'Controlo de entradas, saídas e inventário no novo armazém da Matola. Contrato a prazo, início imediato.',
    description: [
      'Sobre a função',
      'Vai garantir que cada material que entra e sai do armazém da Matola fica registado e conferido, apoiando as equipas de obra.',
      '',
      'Principais responsabilidades',
      '- Receber e conferir mercadoria contra guias de remessa',
      '- Registar movimentos de stock e preparar inventários mensais',
      '- Organizar o armazém segundo as normas de segurança',
      '',
      'Como será avaliado(a)',
      'Entrevista estruturada sobre controlo de stocks, segurança e comunicação, com os mesmos critérios para todos os candidatos.',
    ].join('\n'),
    salaryVisible: 'on',
    closesOn: '',
    screeningQuestions: 'S/N Tem carta de condução profissional válida?\nS/N Tem disponibilidade para trabalhar por turnos?\n? Em que armazéns ou empresas já trabalhou?',
  })
  const driverVacancy = await createVacancyFromRequisition(hr, driverReq)
  await publishVacancy(hr, driverVacancy, {
    summary: 'Transporte de materiais de obra nas rotas de Maputo e Gaza com viatura pesada da empresa.',
    description: [
      'Sobre a função',
      'Conduz camiões da frota para entrega de materiais nas obras, cumprindo horários e normas de segurança rodoviária.',
      '',
      'Principais responsabilidades',
      '- Conduzir em segurança nas rotas Maputo, Matola e Xai-Xai',
      '- Verificar a viatura antes de cada viagem e registar ocorrências',
      '- Confirmar a entrega com o responsável de obra',
    ].join('\n'),
    salaryVisible: '',
    closesOn: '',
    screeningQuestions: 'S/N Tem carta de pesados válida?\nS/N! Teve alguma suspensão da carta nos últimos 3 anos?',
  })

  // --- Candidaturas sintéticas ----------------------------------------------
  const warehouse = (await getPublicVacancy(org.tenantId, (await getVacancy(hr, warehouseVacancy)).slug))!
  const driver = (await getPublicVacancy(org.tenantId, (await getVacancy(hr, driverVacancy)).slug))!
  const target = (vacancy: typeof warehouse) => ({
    orgSlug: 'demo-construcoes',
    orgName: 'Demo Construções Moçambique',
    vacancy: { vacancyId: vacancy.vacancyId, versionId: vacancy.versionId, title: vacancy.title, requirements: vacancy.requirements, screeningQuestions: vacancy.screeningQuestions },
  })
  const candidateActor = (n: number) => ({ tenantId: org.tenantId, actorType: 'candidate' as const, actorId: null, ip: `10.0.0.${n}`, userAgent: 'Mozilla/5.0 (Android 13; Mobile)', correlationId: `seed-candidate-${n}` })

  const warehouseCvs: { name: string; email: string; phone: string; location: string; lines: string[]; answers: [string, string] }[] = [
    { name: 'Joana Macuácua', email: 'joana.macuacua@exemplo.test', phone: '841234501', location: 'Matola', answers: ['yes', 'yes'], lines: ['Joana Macuacua', 'Fiel de armazem - Distribuidora do Sul, Matola (2021-2024)', 'Gestao de stocks e inventarios mensais em Excel', 'Carta de conducao profissional (categoria C)', 'Ensino medio concluido na Escola Secundaria da Matola'] },
    { name: 'Ernesto Chissano Langa', email: 'ernesto.langa@exemplo.test', phone: '842345602', location: 'Maputo', answers: ['yes', 'yes'], lines: ['Ernesto Langa', 'Ajudante de armazem - Ferragens Central (2019-2023)', 'Operacao de empilhadores com certificacao em empilhadores (2022)', 'Ensino medio concluido', 'Carta de conducao profissional'] },
    { name: 'Lurdes Mabunda', email: 'lurdes.mabunda@exemplo.test', phone: '843456703', location: 'Boane', answers: ['no', 'yes'], lines: ['Lurdes Mabunda', 'Caixa de supermercado (2020-2024)', 'Controlo de caixa e atendimento ao cliente', 'Ensino medio concluido'] },
    { name: 'Tomás Nhamuave', email: 'tomas.nhamuave@exemplo.test', phone: '844567804', location: 'Matola', answers: ['yes', 'no'], lines: ['Tomas Nhamuave', 'Conferente de mercadorias no porto de Maputo (2018-2024)', 'Experiencia em armazem portuario e gestao de stocks', 'Carta de conducao profissional', 'Conhecimentos de Excel intermedio'] },
    { name: 'Célia Bila', email: 'celia.bila@exemplo.test', phone: '845678905', location: 'Maputo', answers: ['yes', 'yes'], lines: ['Celia Bila', 'Assistente de logistica - Transportes Rapidos (2022-2024)', 'Registo de entradas e saidas em sistema ERP', 'Ensino medio concluido', 'Carta de conducao profissional'] },
    { name: 'Aurélio Zandamela', email: 'aurelio.z@exemplo.test', phone: '846789006', location: 'Marracuene', answers: ['yes', 'yes'], lines: ['Aurelio Zandamela', 'Fiel de armazem em obra de construcao (2017-2024)', 'Experiencia em armazem de materiais de construcao', 'Carta de conducao profissional', 'Ensino medio concluido', 'Excel basico'] },
    { name: 'Marta Uamusse', email: 'marta.uamusse@exemplo.test', phone: '847890107', location: 'Matola', answers: ['yes', 'yes'], lines: ['Marta Uamusse', 'Estudante finalista de Gestao Logistica', 'Estagio em armazem de distribuicao (2024)', 'Ensino medio concluido'] },
  ]
  const warehouseApps: string[] = []
  for (const [index, cv] of warehouseCvs.entries()) {
    const result = await submitPublicApplication(
      candidateActor(index + 1),
      target(warehouse),
      {
        fullName: cv.name,
        email: cv.email,
        phone: cv.phone,
        location: cv.location,
        consent: true,
        consentTalentPool: index % 3 === 0,
        consentWhatsapp: index % 2 === 0,
        coverNote: index === 0 ? 'Tenho experiência em armazém e conheço bem a Matola.' : null,
        answers: [
          { questionId: warehouse.screeningQuestions[0]!.id, answer: cv.answers[0] },
          { questionId: warehouse.screeningQuestions[1]!.id, answer: cv.answers[1] },
          { questionId: warehouse.screeningQuestions[2]!.id, answer: 'Distribuidoras na Matola e Maputo' },
        ],
      },
      { name: `CV ${cv.name}.pdf`, data: textPdf(cv.lines) },
    )
    warehouseApps.push(result.applicationId)
  }
  // Duplicado deliberado: a mesma pessoa chega por WhatsApp, registada pelo RH com outro email.
  await intakeApplication(
    { tenantId: org.tenantId, actorType: 'user', actorId: hr.user.id, ...meta },
    target(warehouse),
    {
      candidate: { fullName: 'Joana Macuacua', email: 'joana.m@exemplo.test', phone: '+258841234501', location: 'Matola' },
      consentTalentPool: false,
      consentWhatsapp: true,
      consentRecordedAt: new Date(),
      coverNote: 'Recebida por WhatsApp; CV a pedir.',
      answers: [],
      source: 'whatsapp',
      ownerId: hr.user.id,
      notifyCandidate: false,
    },
    null,
  ).catch(() => undefined)

  const driverNames = ['Armando Nhaca', 'Benedito Cumbe', 'Sérgio Matsinhe', 'Paulino Muchanga', 'Alberto Sitoe']
  const driverApps: string[] = []
  for (const [index, name] of driverNames.entries()) {
    const result = await submitPublicApplication(
      candidateActor(20 + index),
      target(driver),
      {
        fullName: name,
        email: `${name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '.')}@exemplo.test`,
        phone: `8${5 + (index % 3)}${String(5550000 + index * 17).padStart(7, '0')}`,
        location: index % 2 ? 'Xai-Xai' : 'Maputo',
        consent: true,
        consentTalentPool: false,
        consentWhatsapp: true,
        answers: [
          { questionId: driver.screeningQuestions[0]!.id, answer: index === 3 ? 'no' : 'yes' },
          { questionId: driver.screeningQuestions[1]!.id, answer: index === 4 ? 'yes' : 'no' },
        ],
      },
      index === 2
        ? null
        : { name: `CV_${index}.pdf`, data: textPdf([name, `Motorista de camiao em empresa de transporte de carga (${2014 + index}-2024)`, 'Carta de conducao profissional de pesados', 'Disponibilidade para viagens em Maputo e Gaza', index % 2 ? 'Formacao em conducao defensiva (2021)' : 'Rota EN1 Maputo - Xai-Xai']) },
    )
    driverApps.push(result.applicationId)
  }

  // --- Movimento no pipeline ------------------------------------------------
  const stagesOf = async (vacancyId: string) => (await getVacancy(hr, vacancyId)).stages
  const wStages = await stagesOf(warehouseVacancy)
  const dStages = await stagesOf(driverVacancy)
  const stage = (stages: typeof wStages, kind: string) => stages.find((item) => item.kind === kind)!.id

  for (const id of [warehouseApps[0]!, warehouseApps[1]!, warehouseApps[3]!, warehouseApps[5]!, warehouseApps[4]!]) await moveApplication(hr, id, { stageId: stage(wStages, 'screening') })
  for (const id of [warehouseApps[0]!, warehouseApps[1]!, warehouseApps[5]!]) await moveApplication(hr, id, { stageId: stage(wStages, 'interview'), notify: 'on' })
  await rejectApplication(hr, warehouseApps[2]!, { reason: 'requisitos_obrigatorios', note: 'Sem experiência em armazém nem carta profissional.', notify: 'on' })
  await addComment(hr, warehouseApps[0]!, 'Perfil forte; confirmar referências da Distribuidora do Sul.')
  await addComment(manager, warehouseApps[5]!, 'Conheço o trabalho do Aurélio em obra; vale a entrevista.')

  for (const id of [driverApps[0]!, driverApps[1]!, driverApps[3]!]) await moveApplication(hr, id, { stageId: stage(dStages, 'screening') })
  await moveApplication(hr, driverApps[0]!, { stageId: stage(dStages, 'interview') })
  await moveApplication(hr, driverApps[0]!, { stageId: stage(dStages, 'assessment') })
  await moveApplication(hr, driverApps[0]!, { stageId: stage(dStages, 'offer') })
  await hireApplication(hr, driverApps[0]!, true)
  await rejectApplication(hr, driverApps[4]!, { reason: 'outro', note: 'Declarou suspensão recente da carta; requisito legal para a função.', notify: 'on' })

  // --- Entrevistas e scorecards ---------------------------------------------
  const tomorrow = new Date(Date.now() + 24 * 3_600_000)
  const local = (date: Date, hour: number) => `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`
  const pastInterview = await scheduleInterview(hr, warehouseApps[0]!, { startsAt: local(tomorrow, 9), durationMinutes: 45, mode: 'presencial', location: 'Armazém da Matola, Av. das Indústrias', participantIds: [users.interviewer!.user.id, manager.user.id], notifyCandidate: 'on' })
  const pastInterview2 = await scheduleInterview(hr, warehouseApps[1]!, { startsAt: local(tomorrow, 11), durationMinutes: 45, mode: 'presencial', location: 'Armazém da Matola, Av. das Indústrias', participantIds: [users.interviewer!.user.id, manager.user.id], notifyCandidate: 'on' })
  await scheduleInterview(hr, warehouseApps[5]!, { startsAt: local(new Date(Date.now() + 3 * 86_400_000), 10), durationMinutes: 30, mode: 'video', location: 'Videochamada (ligação enviada por email)', participantIds: [users.interviewer!.user.id], notifyCandidate: 'on' })
  // Simula que as duas primeiras entrevistas já aconteceram (apenas dados de demonstração).
  await admin`update interviews set starts_at = now() - interval '2 days', status = 'completed' where id in (${pastInterview}, ${pastInterview2})`

  const warehouseDetail = await getVacancy(hr, warehouseVacancy)
  const competencies = warehouseDetail.currentVersion!.competencies
  const scorecard = (ratings: number[], recommendation: string, notes: string[]) => ({
    intent: 'submit',
    recommendation,
    summary: 'Avaliação baseada nas respostas da entrevista estruturada.',
    ...Object.fromEntries(competencies.flatMap((competency, index) => [
      [`rating_${competency.id}`, String(ratings[index])],
      [`evidence_${competency.id}`, notes[index] ?? 'Exemplo concreto apresentado durante a entrevista.'],
    ])),
  })
  await saveScorecard(users.interviewer!, pastInterview, scorecard([4, 3, 3], 'yes', ['Descreveu inventário mensal com reconciliação em Excel.', 'Explicou uso de EPI e arrumação segura.', 'Deu exemplo de coordenação com motoristas.']))
  await saveScorecard(manager, pastInterview, scorecard([3, 2, 4], 'strong_yes', ['Conhece controlo de entradas e saídas.', 'Hesitou nas normas de HSE para cargas pesadas.', 'Comunicação clara e organizada.']))
  await saveScorecard(users.interviewer!, pastInterview2, scorecard([2, 4, 2], 'no', ['Pouca experiência de registo em sistema.', 'Certificação de empilhadores e boas práticas.', 'Respostas curtas sobre coordenação.']))
  await moveApplication(hr, warehouseApps[0]!, { stageId: stage(wStages, 'assessment') })

  // --- Distribuição temporal (só demonstração: dá forma às séries do painel) ---
  await admin`
    update applications set created_at = now() - (random() * interval '55 days') - interval '3 days',
      stage_entered_at = now() - (random() * interval '12 days')
    where tenant_id = ${org.tenantId} and status = 'active'
  `
  await admin`
    update applications set created_at = now() - interval '40 days', decided_at = now() - interval '6 days'
    where tenant_id = ${org.tenantId} and status in ('hired', 'rejected')
  `
  await admin`update users set last_login_at = now() - interval '1 day' where tenant_id = ${org.tenantId} and role in ('hr', 'org_admin')`

  // --- Segunda organização: prova de isolamento ----------------------------
  const other = await provisionOrganization(admin, {
    slug: 'logistica-exemplo',
    name: 'Logística Exemplo, SA',
    sector: 'Logística',
    admin: { email: 'admin@logistica-exemplo.test', fullName: 'Paulo Chongo', password: PASSWORD },
  })
  const otherAdmin = ctxFor(other.tenantId, other.adminId, 'org_admin', 'Paulo Chongo')
  const otherHr = await createUser(otherAdmin, { email: 'rh@logistica-exemplo.test', fullName: 'Sónia Manhiça', role: 'hr', departmentId: '', password: PASSWORD })
  const otherHrCtx = ctxFor(other.tenantId, otherHr, 'hr', 'Sónia Manhiça')
  const otherReq = await createRequisition(otherAdmin, {
    title: 'Operador(a) de Empilhador',
    location: 'Nacala, Nampula',
    contractType: 'a_prazo',
    headcount: 1,
    salaryMin: '15000',
    salaryMax: '20000',
    reason: 'nova_posicao',
    justification: 'Aumento de movimentação de contentores no terminal de Nacala.',
    requirementsMust: 'Certificação em operação de empilhadores',
    competencies: 'Segurança: opera com prevenção de acidentes',
  })
  await submitRequisition(otherAdmin, otherReq)
  await admin`update approval_steps set role = 'hr' where tenant_id = ${other.tenantId} and position = 1`
  await decideRequisition(otherHrCtx, otherReq, { decision: 'approved' })
  await decideRequisition(otherHrCtx, otherReq, { decision: 'approved' }).catch(() => undefined)
  const [otherStatus] = await admin<{ status: string }[]>`select status from requisitions where id = ${otherReq}`
  if (otherStatus?.status === 'approved') {
    const otherVacancy = await createVacancyFromRequisition(otherHrCtx, otherReq)
    await publishVacancy(otherHrCtx, otherVacancy, {
      summary: 'Operação de empilhadores no terminal de Nacala, com turnos rotativos e formação contínua.',
      description: 'Sobre a função\nOperar empilhadores no parque de contentores do terminal, garantindo segurança e registo das movimentações diárias.',
      salaryVisible: '',
      closesOn: '',
      screeningQuestions: '',
    })
  }

  const delivered = await processOutbox(100)
  console.log(`Mensagens processadas: ${JSON.stringify(delivered)}`)
  console.log('\nSeed concluído (dados sintéticos). Contas de demonstração — palavra-passe:', PASSWORD)
  for (const email of ['admin@demo-construcoes.test', ...people.map((person) => person.email), 'admin@logistica-exemplo.test']) console.log(`  ${email}`)
  console.log('\nPágina pública: /carreiras/demo-construcoes')
  await closeDb()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
