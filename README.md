# AGORAMOZ HR — Human Resources Gateway

> Um processo. Todos os candidatos. Decisões com evidência.

Gateway de recrutamento para empresas em Moçambique: candidaturas da página de carreiras, email, WhatsApp e folhas de cálculo entram num único processo auditado — requisição aprovada, vaga versionada, pipeline, entrevistas com scorecards, comunicação com estado, painel, privacidade e exportação total.

Implementação do **AGORAMOZ HR Project Blueprint v1.0** (17/10/2026), escopo MVP (épicos E1–E9). Estado: **R0 Internal alpha completo, candidato a R1 Pilot beta** (ver [docs/backlog-status.md](docs/backlog-status.md) para o que falta antes do G5).

---

## O que está construído

| Épico | Entregue | Prova |
|---|---|---|
| E1 Organização e acesso | Multi-tenant, 6 papéis, departamentos, matriz de aprovação, RBAC + RLS | `tests/integration/tenant-isolation.test.ts` |
| E2 Requisições e vagas | Requisição justificada → aprovação sequencial com limiar salarial e separação de funções → vaga com versões imutáveis | `tests/integration/requisitions.test.ts` |
| E3 Candidaturas | Formulário móvel com rascunho no dispositivo e recuperação offline, CV verificado (tipo real, malware estático, quarentena), texto extraído de PDF/DOCX, registo manual (email/WhatsApp), importação CSV com dry-run, duplicados sugeridos e fusão humana | `tests/integration/applications.test.ts`, `tests/e2e/candidato.spec.ts` |
| E4 Selecção | Quadro com arrastar/teclado, responsável, etiquetas, comentários, rejeição com motivo obrigatório, contratação, reabertura fundamentada | `tests/e2e/rh.spec.ts` |
| E5 Entrevistas | Agendamento com convite **.ics** (Outlook/Google), scorecards por competência versionada, feedback oculto até submissão, consolidação com discordâncias | `tests/integration/interviews.test.ts` |
| E6 Comunicação | Outbox transaccional idempotente, retries 1/5/30/120 min, dead-letter, reenvio manual, modelos editáveis em português de Moçambique | `applications.test.ts` (ciclo completo) |
| E7 Painel | 9 KPIs do blueprint §14 com definição e meta do piloto, funil, séries semanais, origens, bloqueios, scorecards em atraso, exportação CSV | `/app` |
| E8 Auditoria | Registo só-de-acréscimo (permissões + trigger), sem dados pessoais em claro, pesquisa e exportação auditada | `tests/integration/audit.test.ts` |
| E9 IA assistiva | Evidência determinística "Cumpre N de M" com citações; Claude opcional para descrição de vaga e resumo de CV com citações verificadas, redacção de PII, registo de cada interacção e decisão humana | `src/modules/evidence`, `src/modules/ai` |
| Fluxo F (privacidade) | Pedidos do titular com confirmação por email, anonimização verificável, retenção com simulação, exportação JSON do titular e ZIP da organização | `tests/integration/privacy.test.ts` |

**Testes:** 32 unitários · 45 de integração contra PostgreSQL real · 5 ponta-a-ponta (Playwright, telemóvel e desktop).

---

## Arranque rápido (local)

Requisitos: Node.js ≥ 22.12, PostgreSQL 16 (com `citext`, `pg_trgm`, `unaccent`).

```bash
cp .env.example .env            # ajuste DATABASE_ADMIN_URL e SESSION_SECRET
npm install
npm run db:reset                # cria papel/BD, aplica migrações e dados de demonstração
npm run dev                     # http://localhost:3000
npm run worker                  # (opcional) entrega contínua da outbox
```

Contas de demonstração (dados **sintéticos**), palavra-passe `AgoramozDemo#2026` (altere com `SEED_PASSWORD`):

| Papel | Email |
|---|---|
| Administrador | `admin@demo-construcoes.test` |
| Recursos Humanos | `rh@demo-construcoes.test` |
| Gestor requisitante | `gestor@demo-construcoes.test`, `obras@demo-construcoes.test` |
| Entrevistador | `entrevistador@demo-construcoes.test` |
| Direcção | `direccao@demo-construcoes.test` |
| Encarregado de privacidade | `privacidade@demo-construcoes.test` |
| Outra empresa (isolamento) | `admin@logistica-exemplo.test` |

Página pública: `/carreiras/demo-construcoes` · Página do produto: `/`.

## Comandos

| Comando | O quê |
|---|---|
| `npm run check` | tipos + lint + todos os testes Vitest |
| `npm run test:unit` / `test:integration` / `test:e2e` | suites separadas (integração recria `agoramoz_hr_test`) |
| `npm run db:migrate` | migrações com checksum (falha se uma migração aplicada for alterada) |
| `npm run build && npm start` | produção |

## Arquitectura (resumo)

Monólito modular Next.js 16 + PostgreSQL 16 ([ADR-001](docs/adr/001-monolito-modular.md)).

```
src/
  server/      env validado, cliente BD com withTenant, auth (scrypt, sessões), RBAC, auditoria, ficheiros, email
  modules/     domínio por pasta: requisitions, vacancies, applications, candidates, evidence,
               interviews, communications, analytics, audit, privacy, ai, organizations, users
  app/         páginas (consola /app, carreiras públicas /carreiras/[org], produto /) e route handlers /api
db/migrations/ SQL com RLS, FKs compostas, triggers de imutabilidade e funções SECURITY DEFINER mínimas
tests/         unit · integration (PostgreSQL real) · e2e (Playwright)
```

Segurança em duas camadas: cada serviço verifica permissão e âmbito (need-to-know), e a base de dados aplica **Row-Level Security** com o tenant da transacção e **chaves estrangeiras compostas** `(tenant_id, id)` que impedem referências entre empresas ([ADR-002](docs/adr/002-isolamento-tenant.md)). Detalhe em [docs/security.md](docs/security.md).

## Como as três fontes pedidas foram aplicadas

- **REA (Reverse Engineer Anything)** — inspecção passiva (CDP) do formulário de candidatura de um concorrente citado no blueprint: 35 controlos na DOM (14 caixas de texto visíveis à acessibilidade), 5 grupos de rádio obrigatórios, sem rascunho observável. Daqui saiu o formulário mínimo com rascunho e recuperação offline. Relatório e limites: [docs/research/engenharia-reversa-rea.md](docs/research/engenharia-reversa-rea.md).
- **taste-skill** — direcção dada pelo `draw.mjs` ("The product performs", seed 1023065498), página do produto construída com fragmentos reais e funcionais, `lint.mjs` 0/0 e `inspect.mjs` 0 FAIL a 1440/768/390 px. Desvios justificados: [docs/design/direccao-visual.md](docs/design/direccao-visual.md).
- **ECC (Everything Claude Code)** — regras de engenharia aplicadas: validação zod nas fronteiras, imutabilidade, erros explícitos, sem segredos no código, consultas parametrizadas, rate limiting, TDD para a lógica pura, padrões PostgreSQL (índices parciais, RLS, `FOR UPDATE SKIP LOCKED` na outbox), checklist de segurança e pipeline de verificação (tipos → lint → testes → build → E2E).

## Documentação

- [Estado do backlog face ao blueprint](docs/backlog-status.md)
- [Segurança e privacidade](docs/security.md)
- [Operação e runbooks](docs/operacao.md)
- ADRs: [001](docs/adr/001-monolito-modular.md) · [002](docs/adr/002-isolamento-tenant.md) · [003](docs/adr/003-auditoria-e-privacidade.md) · [004](docs/adr/004-politica-ia.md) · [005](docs/adr/005-outbox-mensagens.md)
- Manual técnico-operacional (Word): [docs/AGORAMOZ_HR_Manual_Tecnico_Operacional_R0.docx](docs/AGORAMOZ_HR_Manual_Tecnico_Operacional_R0.docx)

> Este software não substitui parecer jurídico. Antes de qualquer piloto, a validação do quadro de protecção de dados em Moçambique (incluindo o estado da proposta de lei) é obrigatória — Blueprint §8.
