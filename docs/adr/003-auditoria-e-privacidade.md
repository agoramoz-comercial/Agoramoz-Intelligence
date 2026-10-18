# ADR-003 — Auditoria imutável sem dados pessoais em claro

- Estado: aceite · Blueprint E8, §8.2

## Problema
Logs imutáveis e direito à eliminação colidem: se o log guardar nomes e emails, a anonimização fica incompleta; se o log for editável, deixa de ser prova.

## Decisão
- `audit_events` é só-de-acréscimo: o papel da aplicação só tem SELECT/INSERT, e um trigger recusa UPDATE/DELETE/TRUNCATE mesmo ao owner.
- Os eventos guardam actor, instante UTC, acção, entidade (UUID), resumo legível **sem dados pessoais**, diferenças de campos com valores pessoais substituídos por `[dados pessoais]`, fundamento, IP, user-agent e correlation ID.
- O evento é escrito na mesma transacção da alteração.
- A anonimização remove identificação e conteúdos livres das tabelas de negócio e apaga ficheiros; o histórico de auditoria permanece válido porque nunca conteve esses dados.
- Consultas a perfis, dossiers e downloads de CV também são auditadas ("ver acesso").
