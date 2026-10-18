# ADR-001 — Monólito modular em Next.js 16 + PostgreSQL 16

- Estado: aceite (R0) · Decisão do Blueprint §6 "Modular monolith no MVP"
- Data: 18/10/2026

## Contexto
O blueprint recomenda Next.js/React PWA no frontend e .NET 8 ou NestJS no backend, com decisão final no G4 conforme a equipa. O MVP precisa de entregar E1–E9 com uma equipa pequena, sem custo operacional de vários serviços.

## Decisão
Um único deployable Next.js 16 (App Router) com fronteiras de domínio explícitas em `src/modules/*`. Páginas e Server Actions chamam serviços de domínio; serviços nunca importam páginas. PostgreSQL 16 é a única dependência de infraestrutura obrigatória (fila de mensagens = tabela `messages` com `FOR UPDATE SKIP LOCKED`; armazenamento de ficheiros = adaptador local substituível por S3/Azure Blob).

## Consequências
- (+) Um só repositório, um só pipeline, transacções ACID entre domínio, auditoria e outbox.
- (+) Os módulos podem ser extraídos para serviços quando escala ou ownership o justificarem (contratos já são funções tipadas).
- (−) Backend em TypeScript em vez de .NET: se a equipa do G4 dominar .NET, os módulos servem de especificação executável (testes incluídos).
- Revisitar no G4: fila gerida, armazenamento gerido, identidade externa (Entra External ID/Keycloak) para SSO/MFA.
