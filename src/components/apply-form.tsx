'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

interface Question {
  id: string
  text: string
  kind: 'yes_no' | 'text'
  required: boolean
}

interface ApplyFormProps {
  orgSlug: string
  orgName: string
  vacancySlug: string | null
  vacancyTitle: string | null
  questions: Question[]
}

type Phase = { kind: 'editing' } | { kind: 'sending'; progress: number } | { kind: 'done'; reference: string; alreadyApplied: boolean } | { kind: 'offline' }

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = /\.(pdf|docx?|odt|jpe?g|png)$/i
const DRAFT_FIELDS = ['fullName', 'email', 'phone', 'location', 'coverNote']

function readDraft(key: string): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, string>) : null
  } catch {
    return null
  }
}

function writeDraft(key: string, value: Record<string, string> | null): void {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value))
    else window.localStorage.removeItem(key)
  } catch {
    // Armazenamento indisponível (modo privado): o formulário funciona na mesma.
  }
}

function formatSize(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

/**
 * Candidatura móvel de baixo atrito: rascunho guardado no dispositivo a cada alteração, recuperação após
 * falha de rede, progresso do envio do CV e mensagens de erro junto de cada campo.
 */
export function ApplyForm({ orgSlug, orgName, vacancySlug, vacancyTitle, questions }: ApplyFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const startedAt = useRef<number>(0)
  const draftKey = `agoramoz-hr:candidatura:${orgSlug}:${vacancySlug ?? 'espontanea'}`
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    startedAt.current = Date.now()
    const draft = readDraft(draftKey)
    const form = formRef.current
    if (!draft || !form) return
    for (const [name, value] of Object.entries(draft)) {
      const element = form.elements.namedItem(name)
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) continue
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) element.value = value
      else if (element instanceof RadioNodeList) element.value = value
    }
    setRestored(true)
  }, [draftKey])

  useEffect(() => {
    const online = () => setPhase((current) => (current.kind === 'offline' ? { kind: 'editing' } : current))
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])

  function saveDraft() {
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    const draft: Record<string, string> = {}
    for (const name of [...DRAFT_FIELDS, ...questions.map((question) => `answer_${question.id}`)]) {
      const value = data.get(name)
      if (typeof value === 'string' && value) draft[name] = value
    }
    writeDraft(draftKey, Object.keys(draft).length ? draft : null)
  }

  function validate(data: FormData): Record<string, string> {
    const found: Record<string, string> = {}
    const name = String(data.get('fullName') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const phone = String(data.get('phone') ?? '').trim()
    if (name.length < 3) found.fullName = 'Indique o nome completo'
    if (!email && !phone) found.email = 'Indique um email ou um telefone para podermos responder'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = 'Email inválido'
    for (const question of questions) {
      if (question.required && !String(data.get(`answer_${question.id}`) ?? '').trim()) found[`answer_${question.id}`] = 'Resposta obrigatória'
    }
    if (file && file.size > MAX_BYTES) found.cv = 'O ficheiro excede 5 MB'
    if (file && !ACCEPTED.test(file.name)) found.cv = 'Use PDF, DOCX, DOC, ODT, JPG ou PNG'
    if (data.get('consent') !== 'on') found.consent = 'É necessário aceitar o tratamento dos dados para esta candidatura'
    return found
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const found = validate(data)
    setErrors(found)
    setMessage(null)
    if (Object.keys(found).length > 0) {
      const first = form.querySelector<HTMLElement>(`[name="${Object.keys(found)[0]}"]`)
      first?.focus()
      return
    }
    if (!navigator.onLine) {
      saveDraft()
      setPhase({ kind: 'offline' })
      return
    }
    data.set('startedAt', String(startedAt.current))
    if (vacancySlug) data.set('vacancy', vacancySlug)
    if (!file) data.delete('cv')

    const request = new XMLHttpRequest()
    request.open('POST', `/api/public/${orgSlug}/candidatura`)
    request.responseType = 'json'
    request.upload.onprogress = (progress) => {
      if (progress.lengthComputable) setPhase({ kind: 'sending', progress: Math.round((progress.loaded / progress.total) * 100) })
    }
    request.onerror = () => {
      saveDraft()
      setPhase({ kind: 'offline' })
    }
    request.ontimeout = request.onerror
    request.onload = () => {
      const body = request.response as { ok: boolean; reference?: string; alreadyApplied?: boolean; error?: string; fieldErrors?: Record<string, string> } | null
      if (request.status === 200 && body?.ok && body.reference) {
        writeDraft(draftKey, null)
        setPhase({ kind: 'done', reference: body.reference, alreadyApplied: Boolean(body.alreadyApplied) })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setPhase({ kind: 'editing' })
      setErrors(body?.fieldErrors ?? {})
      setMessage(body?.error ?? 'Não foi possível enviar. Tente novamente.')
    }
    request.timeout = 120_000
    setPhase({ kind: 'sending', progress: 0 })
    request.send(data)
  }

  if (phase.kind === 'done') {
    return (
      <div role="status" className="rounded-xl bg-[var(--ok-bg)] p-6 text-[var(--ink)]">
        <p className="text-[24px] font-semibold leading-tight">{phase.alreadyApplied ? 'Já tínhamos a sua candidatura' : 'Candidatura recebida'}</p>
        <p className="mt-3 text-[17px]">
          A sua referência é <strong className="tracking-wide">{phase.reference}</strong>. Guarde-a para qualquer contacto com a {orgName}.
        </p>
        <p className="mt-2 text-[16px]">
          {phase.alreadyApplied
            ? 'Não criámos uma candidatura duplicada. Se quiser actualizar o CV, responda ao email de confirmação.'
            : 'Se indicou email, enviámos uma confirmação. Receberá uma resposta qualquer que seja o resultado.'}
        </p>
      </div>
    )
  }

  const sending = phase.kind === 'sending'
  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    ) : null
  const describedBy = (name: string) => (errors[name] ? `${name}-error` : undefined)

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={saveDraft} noValidate className="space-y-8" aria-label={vacancyTitle ? `Candidatura a ${vacancyTitle}` : 'Candidatura espontânea'}>
      {restored ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--info-bg)] px-4 py-3 text-[15px] text-[var(--info)]">
          Recuperámos o rascunho guardado neste dispositivo.
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              writeDraft(draftKey, null)
              formRef.current?.reset()
              setRestored(false)
            }}
          >
            Começar de novo
          </button>
        </p>
      ) : null}
      {phase.kind === 'offline' ? (
        <p role="alert" className="rounded-lg bg-[var(--warn-bg)] px-4 py-3 text-[15px] text-[var(--warn)]">
          Sem ligação à internet. Os seus dados ficaram guardados neste dispositivo: quando a rede voltar, toque em “Enviar candidatura” de novo.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-4 py-3 text-[15px] font-medium text-[var(--danger)]">
          {message}
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-[20px] font-semibold">Os seus dados</legend>
        <div>
          <label className="label" htmlFor="fullName">
            Nome completo
          </label>
          <input id="fullName" name="fullName" autoComplete="name" className="input min-h-12 text-[17px]" aria-invalid={Boolean(errors.fullName)} aria-describedby={describedBy('fullName')} />
          {fieldError('fullName')}
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Telefone
          </label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="84 123 4567" className="input min-h-12 text-[17px]" aria-invalid={Boolean(errors.phone)} aria-describedby={describedBy('phone')} />
          {fieldError('phone')}
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email <span className="font-normal text-[var(--muted)]">(recomendado para receber a confirmação)</span>
          </label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" className="input min-h-12 text-[17px]" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('email')} />
          {fieldError('email')}
        </div>
        <div>
          <label className="label" htmlFor="location">
            Onde vive <span className="font-normal text-[var(--muted)]">(cidade ou bairro)</span>
          </label>
          <input id="location" name="location" autoComplete="address-level2" className="input min-h-12 text-[17px]" />
        </div>
      </fieldset>

      {questions.length > 0 ? (
        <fieldset className="space-y-5">
          <legend className="mb-2 text-[20px] font-semibold">Perguntas da vaga</legend>
          {questions.map((question) =>
            question.kind === 'yes_no' ? (
              <div key={question.id} role="radiogroup" aria-labelledby={`q-${question.id}`} aria-describedby={describedBy(`answer_${question.id}`)}>
                <p id={`q-${question.id}`} className="label text-[15px]">
                  {question.text}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['yes', 'Sim'],
                    ['no', 'Não'],
                  ].map(([value, label]) => (
                    <label key={value} className="check min-h-12 items-center rounded-lg bg-[var(--panel)] px-4 text-[16px] has-[:checked]:bg-[var(--info-bg)]">
                      <input type="radio" name={`answer_${question.id}`} value={value} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {fieldError(`answer_${question.id}`)}
              </div>
            ) : (
              <div key={question.id}>
                <label className="label text-[15px]" htmlFor={`answer_${question.id}`}>
                  {question.text} {question.required ? null : <span className="font-normal text-[var(--muted)]">(opcional)</span>}
                </label>
                <textarea id={`answer_${question.id}`} name={`answer_${question.id}`} rows={3} className="textarea text-[16px]" />
                {fieldError(`answer_${question.id}`)}
              </div>
            ),
          )}
        </fieldset>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-[20px] font-semibold">CV e apresentação</legend>
        <div>
          <label className="label" htmlFor="cv">
            CV <span className="font-normal text-[var(--muted)]">(opcional: PDF, Word ou fotografia, até 5 MB)</span>
          </label>
          <input
            id="cv"
            name="cv"
            type="file"
            accept=".pdf,.doc,.docx,.odt,.jpg,.jpeg,.png,application/pdf,image/*"
            className="input min-h-12 py-2.5"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            aria-invalid={Boolean(errors.cv)}
            aria-describedby={describedBy('cv')}
          />
          {file ? (
            <p className="hint">
              {file.name} · {formatSize(file.size)}
            </p>
          ) : (
            <p className="hint">Não tem CV digital? Pode candidatar-se na mesma; pediremos documentos se avançar.</p>
          )}
          {fieldError('cv')}
        </div>
        <div>
          <label className="label" htmlFor="coverNote">
            Algo que queira acrescentar <span className="font-normal text-[var(--muted)]">(opcional)</span>
          </label>
          <textarea id="coverNote" name="coverNote" rows={3} maxLength={2000} className="textarea text-[16px]" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-[20px] font-semibold">Os seus dados, as suas regras</legend>
        <label className="check text-[15px]">
          <input type="checkbox" name="consent" aria-invalid={Boolean(errors.consent)} aria-describedby={describedBy('consent')} />
          <span>
            Autorizo a {orgName} a tratar os meus dados para avaliar esta candidatura. Posso pedir acesso, correcção ou eliminação a qualquer momento em{' '}
            <a className="link" href={`/carreiras/${orgSlug}/privacidade`} target="_blank" rel="noreferrer">
              privacidade
            </a>
            .
          </span>
        </label>
        {fieldError('consent')}
        <label className="check text-[15px]">
          <input type="checkbox" name="consentTalentPool" />
          <span>Guardar o meu perfil para futuras oportunidades (opcional).</span>
        </label>
        <label className="check text-[15px]">
          <input type="checkbox" name="consentWhatsapp" />
          <span>Aceito receber lembretes por WhatsApp (opcional).</span>
        </label>
      </fieldset>

      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencher
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="space-y-3">
        <button type="submit" className="btn min-h-13 w-full text-[17px] sm:w-auto sm:px-10" disabled={sending} aria-busy={sending}>
          {sending ? (phase.progress > 0 && phase.progress < 100 ? `A enviar… ${phase.progress}%` : 'A enviar…') : 'Enviar candidatura'}
        </button>
        {sending ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]" role="progressbar" aria-valuenow={phase.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do envio">
            <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${phase.progress}%` }} />
          </div>
        ) : null}
        <p className="text-[14px] text-[var(--muted)]">O rascunho fica guardado neste dispositivo enquanto escreve. Leva cerca de 3 minutos.</p>
      </div>
    </form>
  )
}
