# Regras do projeto campanha-whatsapp

- Leia docs/PRD.md antes de qualquer mudança. Os IDs RFxx/RNFxx/TC-xx são a referência.
- Stack fixa: Node 20, TypeScript strict, Fastify, better-sqlite3, zod, pino, luxon, sharp, vitest. Não adicione dependências sem justificar no plano.
- Nunca escreva chaves, tokens ou senhas em código, testes, logs ou commits. Use process.env via src/config/env.ts.
- Nunca chame a Evolution API real em testes. Use os fixtures de tests/fixtures/ e mocks.
- Nunca execute envio real (start, sendText) sem DRY_RUN=false E TEST_ALLOWLIST preenchida, e só quando o usuário pedir explicitamente.
- Toda mudança de status de cliente passa por transicionar() em src/db/repo.ts.
- Toda função de domínio (phone, spintax, intent, window, limits, breakers) é pura e testada.
- Logs mascaram telefone. Mensagens em português do Brasil.
- Ao terminar uma tarefa: rode lint e testes, liste os critérios de aceite da etapa e diga quais passaram.
