# ADR-004 — IA assistiva sem decisão automática

- Estado: aceite · Blueprint §7.3–7.4

## Decisão
- **Evidência determinística (sempre activa)**: para cada requisito publicado, procura no texto do CV frases com os termos-chave (sem acentos, radicais simples, alternativas "ou") e cita o excerto. Saída: "Evidência textual encontrada para N de M requisitos obrigatórios; não encontrado: …; requer validação humana." Nunca percentagens, nunca rejeição.
- **Claude (opcional, `AI_ENABLED=true` + chave)**: modelo `claude-opus-5-5`, saída estruturada (zod), `fallbacks: "default"` para recusas, esforço `medium`. Dois casos: rascunho de descrição de vaga a partir da requisição aprovada; resumo de CV.
- **Salvaguardas**: nome, emails, telefones e números de documento removidos antes do envio; cada afirmação do resumo tem de trazer citação literal que é verificada contra o CV — as não verificadas são descartadas e contadas; toda a saída é marcada "Gerado por IA · validar"; acção humana explícita (útil / descartar / reportar erro) registada; cada chamada registada com modelo, versão do prompt, hash da entrada, tokens, latência e erro.
- **Proibido** (não implementado e bloqueado por desenho): rejeição automática, inferência de características protegidas, análise de foto/voz, contacto de referências, uso de dados para treino.
