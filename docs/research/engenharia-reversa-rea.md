# Engenharia reversa do fluxo de candidatura de um concorrente (REA)

**Pergunta de decisão:** que atrito impõe hoje um ATS maduro ao candidato no telemóvel, e o que o formulário do AGORAMOZ HR deve fazer diferente? (Blueprint §2.2 "Candidatura bloqueada por captcha", §5.2 "Mobile-first", E3 "≤ 7 min em rede móvel")

## Método
1. Alvo: página pública de candidatura de uma vaga de armazém alojada na Workable (concorrente citado no blueprint, §2.1), sector alinhado com o ICP (logística).
2. A política de rede deste ambiente bloqueia `apply.workable.com` e `breezy.hr` (403 no proxy). Contorno: a página foi renderizada externamente (Firecrawl), os scripts foram removidos e a cópia inerte foi servida em `127.0.0.1`.
3. Ferramenta: **REA** `rea-agents@6.7.0`, `inspect-web-page` via Chrome DevTools Protocol, com árvore de acessibilidade. Evidência: `ev_c45867254b59721a3d42ea0305d9e25b5a20dfbbaa1b790b0499ba5fb1d1647a` (resumo em [rea-evidence-summary.json](rea-evidence-summary.json)).

## Observado (FATO, nesta captura)
| Medida | Valor |
|---|---|
| Controlos de formulário na DOM | 35 (30 `input`, 5 `textarea`) — 14 caixas de texto expostas na árvore de acessibilidade (as restantes pertencem a blocos repetíveis/ocultos) |
| Grupos de rádio (respostas obrigatórias de elegibilidade) | 5, incluindo uma declaração jurídica longa |
| Listas de escolha | 3 (contacto preferido, inglês, autorização de trabalho) |
| Secções | Personal information · Profile · Details |
| Blocos extra | Experiência e Educação repetíveis, "Autofill" por importação de CV, diálogo de cookies |
| Indicador de progresso | apenas de scroll |
| Sinais de captcha na DOM | nenhum |
| Sinais de rascunho/autosave na DOM | nenhum |

## Inferido (INFERÊNCIA — a validar em testes com candidatos)
- Num telemóvel com rede instável, 35 campos e uploads sem recuperação aumentam o abandono; uma falha de rede perde o trabalho.
- Perguntas de elegibilidade com rádio obrigatório tendem a funcionar como filtro automático.

## Limitações (DESCONHECIDO)
- Os scripts foram removidos: comportamento dinâmico (autosave real, validação, captcha adaptativo carregado por JS) **não** foi observado.
- Uma única vaga de um único cliente do concorrente; não generaliza para toda a base.

## Decisões de desenho tomadas a partir da evidência
| Evidência | Decisão no AGORAMOZ HR |
|---|---|
| 35 campos | 4 campos de dados + perguntas da vaga (máx. 8) + CV opcional; "Não tem CV digital? Pode candidatar-se na mesma." |
| Sem rascunho observável | Rascunho guardado no dispositivo a cada tecla; banner "Recuperámos o rascunho"; envio repetível quando a rede volta |
| Upload sem progresso | Progresso percentual do envio (XHR) e limite de 5 MB explicado antes |
| Rádios obrigatórios de elegibilidade | Respostas diferentes do esperado são **assinaladas** ao RH ("confirmar"), nunca rejeitam |
| Captcha (risco do §2.2) | Sem captcha: campo-armadilha, tempo mínimo de preenchimento, rate limit por IP, verificação do ficheiro no servidor |
| Declaração jurídica extensa | Consentimento curto e granular (processo · talent pool · WhatsApp) com ligação aos direitos |
