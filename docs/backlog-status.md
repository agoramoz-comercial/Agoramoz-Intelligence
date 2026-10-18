# Estado do backlog de lançamento (Blueprint §15)

Legenda: **Feito** = implementado e coberto por testes · **Parcial** = funcional com limitação declarada · **Não iniciado**.

| ID | Capacidade | Prioridade | Estado | Onde / nota |
|---|---|---|---|---|
| HR-001 | Criar organização e admin | Must | Feito | `provisionOrganization` (acção de plataforma); teste de isolamento |
| HR-002 | Departamentos e papéis | Must | Feito | 6 papéis, matriz `can()`; definições `/app/definicoes` |
| HR-010 | Criar requisição | Must | Feito | validação zod, código REQ-0001 por tenant |
| HR-011 | Aprovar vaga | Must | Feito | matriz sequencial com limiar, separação de funções, auditado |
| HR-012 | Publicar página pública | Must | Feito | só versão aprovada; versões imutáveis |
| HR-020 | Candidatura móvel ≤ 7 min, autosave | Must | Feito | rascunho no dispositivo, recuperação offline, E2E em Pixel 7 |
| HR-021 | Upload e malware scan | Must | Parcial | tipo real, tamanho, EICAR, executáveis, PDF com JS, macros. **Falta**: motor antivírus (ClamAV) no mesmo contrato antes do G5 |
| HR-022 | Importar CSV | Must | Feito | dry-run, erros por linha, `;` do Excel, confirmação da base de tratamento |
| HR-023 | Sugerir duplicados | Must | Feito | email, telefone, nome (trigram); fusão só humana e auditada |
| HR-030 | Mover pipeline | Must | Feito | arrastar + teclado, auditado |
| HR-031 | Motivo de rejeição | Must | Feito | obrigatório (constraint na BD) |
| HR-040 | Agendar entrevista | Should | Feito (via .ics) | idempotente; Microsoft Graph fica para após a prova técnica (D2) |
| HR-041 | Scorecard | Must | Feito | critérios da versão publicada, imutável após submissão |
| HR-050 | Enviar confirmação | Must | Feito | outbox com estado, retry e dead-letter |
| HR-051 | Lembrete WhatsApp | Should | Não iniciado | opt-in já recolhido; adaptador entra no contrato da outbox (R1.1, depende de conta Meta — D2) |
| HR-060 | Dashboard de funil | Must | Feito | definições visíveis, filtro temporal, CSV |
| HR-070 | Exportar dados | Must | Feito | ZIP da organização + JSON do titular, auditados |
| HR-071 | Aplicar retenção | Must | Feito | dry-run + execução com relatório |
| HR-080 | Resumo IA | Could | Feito (desligado por defeito) | citações verificadas, PII removida; precisa de avaliação de fidelidade com CVs reais antes de ligar |
| HR-090 | Audit search | Must | Feito | pesquisa, filtros, exportação auditada |

## Controlos G5 ainda em falta (antes de go-live com dados reais)
- MFA para administradores (TOTP ou identidade externa — decisão G4 "Identidade").
- Content-Security-Policy com nonces.
- Antivírus no upload (ClamAV/serviço gerido) e armazenamento de objectos gerido com encriptação e backups testados (RPO/RTO §8.3).
- Pentest externo, DAST e SCA no pipeline (o CI já corre `npm audit` de produção).
- Parecer jurídico sobre consentimento, retenção e transferências (D1).
- Observabilidade (OpenTelemetry) e status page.

## Release plan (§15.1)
- **R0 Internal alpha** — critério "fluxo completo com dados sintéticos": **cumprido** (seed + E2E).
- **R1 Pilot beta** — entrevistas, email, dashboard, auditoria e exportação: **implementados**; faltam UAT com cliente, controlos G5 acima e ensaio de migração.
