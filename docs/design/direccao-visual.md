# Direcção visual (taste-skill v2)

## Página do produto (`/`)
- `draw.mjs --sector saas --have product-ui --keep palette` → três direcções; escolhida **The product performs** (seed `1023065498`, ficheiro `.taste-skill/direction.json`). Razão: o diferencial do produto é verificável — o motor de evidência — por isso o herói é esse motor a funcionar sobre o texto do visitante.
- **Ideia:** "Nesta página, a frase *'Cumpre N de M requisitos, com citação'* (a regra de saída do blueprint §7.3) torna-se o controlo do herói."
- **Coisa viva:** o visitante edita o excerto do CV e vê, em tempo real, que requisitos têm prova e porquê (mesmo código que corre no servidor).
- Secções pela ordem do argumento: herói (controlo que lê a página) → intro em coluna estreita → como funciona (fragmento fixo com três estados) → uma candidatura em três momentos (a do meio funciona) → lista de capacidades como menu de comandos (filtra a escrever, setas) → perguntas em mosaico → primeiro passo já aberto (pedido de piloto) → rodapé numa linha.
- Tipo: Albert Sans (servida localmente via @fontsource). Paleta: a da marca do blueprint (azul-marinho, azul, verde-água) mapeada nos papéis ground/ink/accent.

## Gate
- `lint.mjs`: 0 FAIL, 0 WARN.
- `inspect.mjs` (Chromium real a 1440/768/390): **0 FAIL**, 6 tamanhos de letra, corpo 17 px.
- Avisos que ficam, com defesa:
  - `no-real-pictures` / `no-footage`: as colecções abertas (Openverse, Wikimedia Commons, Met, Art Institute of Chicago) e os bancos de imagens estão bloqueados pela política de rede deste ambiente (`ENOTFOUND`/403). As imagens são fragmentos reais da interface (`data-ui`), como a direcção prevê para software. **Antes do lançamento:** acrescentar 2–4 fotografias reais de armazéns, obras e portos moçambicanos com licença e crédito.
- Desvio deliberado do blueprint do herói: no telemóvel o bloco com título e botão vem antes do fragmento, para cumprir a regra da acção no primeiro ecrã.

## Consola (`/app`) e carreiras (`/carreiras/[org]`)
A skill exclui painéis e ecrãs de aplicação; aplicam-se as regras da casa onde fazem sentido (sem gradientes, sem sombras em repouso, superfícies por passo de tom, um acento na acção). Gráficos seguem a skill **dataviz**: paleta validada pelo `validate_palette.js` (azul `#1F5FD0` + verde-água `#00A08A`, todas as verificações CVD/croma/contraste passam), barras ≤ 24 px com extremidade arredondada, legenda para 2+ séries, vista em tabela.
