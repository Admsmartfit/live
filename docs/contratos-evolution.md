# Contratos da Evolution API

Referência: PRD seção 10. Todo acesso à API passa por `src/evolution/client.ts`.

## Versão instalada

> Preencher com a saída de `npm run discover` (Etapa 0).

| Item | Valor |
| --- | --- |
| Versão (`GET /`) | _pendente_ |
| Estado da instância | _pendente_ |
| Data da verificação | _pendente_ |

## Diferenças em relação à seção 10

> Registrar aqui qualquer campo/rota que difira do PRD, com o payload real.

_Nenhuma registrada ainda._

## Fixtures capturados (`tests/fixtures/`)

Capturar com `npm run capture-webhook` (servidor em `POST /webhook/<WEBHOOK_TOKEN>`).
Anonimizar telefones, nomes e textos antes de versionar (LGPD).

| Caso | Arquivo |
| --- | --- |
| Texto | _pendente_ |
| Botão | _pendente_ |
| Áudio | _pendente_ |
| Figurinha | _pendente_ |
| Grupo | _pendente_ |
| `fromMe` | _pendente_ |
| Update de entrega | _pendente_ |
| Update de leitura | _pendente_ |

## Decisões do client

- **Timeout:** 10 s (`EVOLUTION_TIMEOUT_MS`) somado ao `delay` do corpo, pois a API segura a
  resposta durante o `delay` de `sendText`/`sendMedia`/`sendButtons`/`sendPresence`.
- **Instância:** sempre `encodeURIComponent(EVOLUTION_INSTANCE)` (`ao vivo vv` → `ao%20vivo%20vv`).
- **Classificação (seção 8):** `TRANSITORIO` (429, 5xx, timeout, rede), `NUMERO` (400 com
  `exists: false`/JID inválido), `AUTENTICACAO` (401, 403, "banned"/"restricted"),
  `CONEXAO` ("Connection Closed", instância inexistente, `state` ≠ `open`). Fora da tabela:
  `DESCONHECIDO` (conta como falha, sem retry).
- **Retry (até `EVOLUTION_MAX_RETRIES`, backoff 1 s, 3 s, 9 s):**
  - leitura e operações idempotentes (`getVersion`, `connectionState`, `whatsappNumbers`,
    `sendPresence`, `markAsRead`, `setWebhook`): qualquer erro transitório;
  - envio de mensagem (`sendText`, `sendButtons`, `sendMedia`): só 429 e 503. Timeout, falha
    de rede e 500/502/504 não são repetidos, porque a mensagem pode ter saído (RF08, TC-08);
    o worker registra `ERRO` e reagenda.
- **setWebhook:** recusa URL sem HTTPS (RNF08).
