# PRD v2.0 — Motor de Campanha WhatsApp (Evolution API)

Oct 13, 2026 · @ricardo

## 1. Análise crítica do PRD v1.0

O PRD v1.0 tem boa base de negócio e de copy, mas tem 1 falha de segurança crítica (chave de API exposta) e 16 lacunas técnicas que, sem correção, quebram o anti-loop, o opt-out ou a medição dos KPIs. Esta versão 2.0 corrige todas e reorganiza a entrega em 8 etapas executáveis pelo Antigravity.

**Ação imediata, antes de qualquer código:** a `apikey` da instância está escrita no PRD. Gere uma nova chave no painel da Evolution API, invalide a antiga e nunca mais coloque credenciais em documentos ou no repositório.

**Pontos fortes mantidos:** 5 eixos de copy por segmento, jitter entre envios, simulação de digitação, janela de horário, stop-loss, limite diário, fila persistida e plano de testes com cenários claros.

| # | Severidade | Problema no v1.0 | Impacto | Correção no v2.0 |
| --- | --- | --- | --- | --- |
| 1 | Crítica | `apikey` em texto claro no PRD (seção 8) | Qualquer pessoa com o documento controla o número | Rotacionar chave; usar `.env` e cofre; nunca versionar |
| 2 | Alta | Botões interativos via Baileys são instáveis: o WhatsApp deixou de renderizar botões em contas não oficiais em vários clientes | Cliente vê mensagem sem botão, ou a API retorna erro | Texto vira o canal principal; botão é tentativa opcional com flag `USE_BUTTONS` (RF07) |
| 3 | Alta | Endpoint `/message/sendInteractive` e o objeto `options` não existem em todas as versões da Evolution API (v2 usa `sendButtons` e campos `delay` na raiz) | Integração quebra em produção | Etapa 0 descobre a versão real e congela os contratos (seção 10) |
| 4 | Alta | Regex positivo inclui "tenho" e "pode ser": "não tenho interesse" seria lido como SIM | Voucher enviado para quem recusou; risco de denúncia | Negativo tem precedência; limites de palavra; normalização de acentos (RF11) |
| 5 | Alta | IDs de botão inconsistentes: RF08 usa `QUERO_VOUCHER`, contrato usa `BTN_QUERO_VOUCHER` | Clique no botão não é reconhecido | IDs únicos em constante: `BTN_QUERO_VOUCHER`, `BTN_NAO_QUERO` |
| 6 | Alta | Mensagem inicial não ensina como sair | Cliente sem saída clara denuncia como spam, que é a principal causa de banimento | Toda mensagem ativa termina com instrução "responda SAIR" |
| 7 | Alta | Webhook sem autenticação e sem deduplicação | Qualquer um pode forjar eventos; reentregas geram voucher duplicado | Token secreto no webhook; idempotência por `message.id` (RF09, RF10) |
| 8 | Média | Spintax só na saudação; Eixo 3 não tem spintax | TC-01 falha; textos quase idênticos | Spintax em 4 a 6 pontos por eixo, aninhado (seção 5) |
| 9 | Média | Voucher único (`DESPEDIDA20`) para todos | Sem rastreio de conversão por cliente; código vaza em grupos | Código único por cliente (ex.: `ADEUS-7K3Q`) e baixa no PDV |
| 10 | Média | Latência com 3 metas diferentes (< 4 s, < 3 s) e delay de digitação de 2,5 s dentro do orçamento | Meta impossível de testar | Ack HTTP < 200 ms; voucher entregue < 4 s incluindo digitação de 1,5 a 2 s |
| 11 | Média | Faltam estados: número inválido, sem WhatsApp, resposta não entendida | Contatos ficam presos ou recebem repetição | Máquina de estados completa (seção 4) |
| 12 | Média | Sem tratamento de: grupos, `status@broadcast`, áudio, figurinha, contato fora da base, número com/sem 9º dígito, JID `@lid` | Bot responde onde não deve ou ignora quem respondeu | Filtros e resolução de contato (RF09, RF12) |
| 13 | Média | Stop-loss só por falhas consecutivas | Desconexão, ban parcial ou onda de opt-out passam despercebidos | Disjuntores por conexão, taxa de opt-out e taxa de erro (seção 6) |
| 14 | Média | Sem LGPD: base legal, retenção, exclusão | Risco jurídico e reclamação no Procon/ANPD | Seção 3.4 |
| 15 | Média | KPI "0% de banimento" é garantia impossível; "abertura" sem forma de medir | Metas não verificáveis | Metas com fonte de medição (seção 2) |
| 16 | Baixa | RF02 sorteia o eixo, mas a seção 3 recomenda eixo por segmento | Copy errada para o perfil | Atribuição por segmento, sorteio só como fallback (RF04) |
| 17 | Baixa | Copy com prazos fixos ("esta semana", "preço de custo") | Mensagem desatualizada; promessa sem lastro (CDC) | Prazos via variável `{{data_limite}}`; afirmar "preço de custo" só se for verdade |

## 2. Visão geral, objetivos e métricas

**Produto:** Motor de Campanha Ativa e Conversação Automatizada (WhatsApp Outbound + Inbound). **Versão:** 2.0.0. **Integração:** Evolution API (engine Baileys), instância `ao vivo vv`.

### 2.1 Contexto

A loja física está encerrando as operações e precisa liquidar o estoque restante. A estratégia é contatar a base de clientes já atendidos, usando a relação com a vendedora que os atendeu, e oferecer um voucher de despedida com prazo definido.

### 2.2 Desafio

Envios em massa por API não oficial (Baileys) têm alto risco de banimento quando os textos são idênticos, os envios vêm em rajada, não há sinais de digitação ou o cliente não consegue sair facilmente. A defesa mais eficaz não é técnica: é mandar só para quem conhece a loja, com mensagem relevante e saída fácil. A camada técnica (seção 6) reduz o risco, mas não o elimina.

### 2.3 Objetivos e métricas

| Métrica | Meta | Como medir | Fonte |
| --- | --- | --- | --- |
| Número banido ou restrito | Nenhum evento durante a campanha | Evento `CONNECTION_UPDATE` com `close` + código 401/403; teste diário de envio | Webhook + health check |
| Taxa de entrega | ≥ 95% dos envios | Status `DELIVERY_ACK` ÷ enviados | `MESSAGES_UPDATE` |
| Taxa de leitura | ≥ 70% (meta v1.0 de 85% só se o cliente tiver confirmação de leitura ligada) | Status `READ` ÷ entregues; subestima quem desativou recibos | `MESSAGES_UPDATE` |
| Taxa de resgate | ≥ 28% dos entregues | `RESPONDIDO_SIM` ÷ entregues | Banco |
| Taxa de opt-out | ≤ 5%; acima de 8% pausa automática | `OPT_OUT` ÷ entregues, janela móvel de 50 envios | Banco |
| Conversão em loja | Medir; meta a definir pelo lojista | Vouchers usados no PDV ÷ vouchers enviados | Planilha de baixa ou rota `/admin/voucher/usar` |
| Tempo de resposta automática | p95 < 4 s do recebimento do webhook até a entrega do voucher | Timestamps no log de auditoria | Logs |

### 2.4 Princípios de projeto

- **Segurança do número acima de velocidade.** Na dúvida, o sistema pausa.
- **Nunca enviar duas vezes a mesma mensagem ao mesmo cliente.** Toda ação é idempotente.
- **Saída sempre visível.** Toda mensagem ativa ensina como parar de receber.
- **Tudo auditável.** Cada envio, resposta e erro fica registrado com horário.

### 2.5 Regras de negócio da campanha LIVE!

A loja é uma franquia LIVE! (moda fitness e lifestyle) em encerramento. Estas regras valem para todo o sistema e prevalecem sobre exemplos genéricos do restante do documento.

| # | Regra | Onde é aplicada |
| --- | --- | --- |
| N1 | Oferta: **35% em coleção nova e linha permanente; 50% em todas as demais peças**. Validade até `data_fim` ou fim do estoque | Templates (seção 5), imagem do voucher (RF21), regras impressas |
| N2 | Fluxo em duas etapas: convite **só em texto** perguntando se o cliente quer o voucher; a **imagem do voucher** só é enviada após SIM | RF07, RF13, RF21 |
| N3 | A imagem do voucher é **personalizada por cliente** (nome + código único). Nenhuma imagem idêntica é enviada para dois clientes | RF21 |
| N4 | Entrega após SIM: texto R1 e, 3 a 5 s depois, imagem com legenda R1-IMG | RF13 |
| N5 | Quem não responde ao convite **nunca** recebe nova mensagem (sem reenvio, sem lembrete) | RF08, RF22 |
| N6 | Lembrete R6 único em D-2, só para quem recebeu voucher e não teve uso registrado | RF22 |
| N7 | Convites novos param em D-4; webhook e respostas seguem até `data_fim` | RF23 |
| N8 | Ordem de envio por segmento: VIP → Recentes → Antigos → Inativos | RF04 |
| N9 | Toda mensagem ativa tem rodapé com SIM e SAIR | Seção 5.3 |
| N10 | Oferta, layout do voucher e uso da base aprovados por escrito pela franqueadora antes do go-live | Checklist 12.2 |
| N11 | Identidade visual (logo, cores, fontes) somente do manual enviado pela franqueadora; o sistema recebe o fundo do voucher pronto, não recria a marca | RF21 |

## 3. Escopo, premissas e conformidade

### 3.1 Dentro do escopo

- Importação e saneamento da base de clientes (CSV/XLSX).
- Validação de números no WhatsApp antes do envio.
- Fila de envio com cadência, janela de horário, limites e disjuntores.
- Geração de mensagens com 5 eixos e spintax.
- Webhook para respostas: voucher, opt-out, encaminhamento para humano.
- Geração e controle de códigos de voucher únicos.
- Painel web simples (status, métricas, pausar/retomar) e CLI de operação.
- Logs de auditoria e exportação de relatório final.

### 3.2 Fora do escopo

- Migração para a API oficial (WhatsApp Cloud API). Fica como recomendação se a base passar de \~1.000 contatos ou se houver nova campanha depois desta.
- Integração automática com o PDV. A baixa do voucher será manual (planilha ou tela do painel).
- Chatbot com IA para conversas abertas. Respostas não reconhecidas vão para atendimento humano.
- Múltiplos números ou rodízio de chips.

### 3.3 Premissas

- A instância `ao vivo vv` está conectada a um número com histórico de uso real (não um chip novo). Chip novo exige aquecimento de 2 a 3 semanas, fora do prazo da campanha.
- A base contém apenas clientes que compraram na loja e forneceram o telefone.
- Uma pessoa da loja (de preferência a vendedora citada) acompanha o celular para responder casos encaminhados ao humano.
- Servidor com acesso à Evolution API e URL pública com HTTPS para o webhook.
- Fuso horário: `America/Sao_Paulo`.

### 3.4 LGPD e defesa do consumidor

- **Base legal:** legítimo interesse (art. 7º, IX, LGPD) para comunicar clientes existentes sobre o encerramento. Registrar essa justificativa no repositório (`docs/lgpd.md`).
- **Opt-out:** atendido no mesmo instante, sem nova mensagem promocional. A confirmação de saída é a última mensagem enviada.
- **Minimização:** guardar só telefone, primeiro nome, vendedora, segmento e histórico da campanha.
- **Retenção:** apagar ou anonimizar a base em até 30 dias após o fim da campanha (comando `cli purge`). Manter só métricas agregadas.
- **Lista de supressão:** números em opt-out ficam numa tabela separada e permanente, consultada em qualquer campanha futura.
- **Ofertas:** só afirmar "preço de custo", percentual e validade se forem verdadeiros (CDC, arts. 30 e 37). Validade sempre com data explícita.
- Este PRD não substitui orientação jurídica; vale validar o texto com um advogado se a base for grande.

## 4. Jornada do cliente e máquina de estados

Cada contato tem exatamente um status por vez, e só as transições abaixo são permitidas. O opt-out vale a partir de qualquer estado e é definitivo.

&#91;embedded content: máquina de estados do contato · 11 estados\]

Um estado fica fora do desenho por ser raro: `VERIFICAR` (o processo caiu durante um envio; revisão manual, nunca reenvio automático). A função `transicionar()` recusa qualquer transição que não esteja aqui.

**Jornada resumida:** o cliente recebe uma mensagem personalizada da vendedora → responde SIM (texto ou botão) e recebe o código em menos de 4 s → apresenta o código na loja até a data limite. Se responder SAIR ou NÃO, recebe uma confirmação e nunca mais é contatado. Se responder algo inesperado, recebe uma orientação; na segunda vez, uma pessoa da loja assume.

## 5. Matriz de textos e variações (campanha LIVE!)

A abordagem tem 6 modelos (2 por segmento), cada um com spintax em 6 a 9 pontos, mais 3 rodapés variados. Isso gera milhares de combinações por segmento, e nenhum cliente recebe texto idêntico a outro. A primeira mensagem é **sempre texto puro**; a imagem do voucher só sai depois do SIM.

### 5.1 Regras de template

- Sintaxe: `{a|b|c}` sorteia uma opção; aceita aninhamento. Variáveis: `{{nome}}` (primeiro nome), `{{vendedora}}`, `{{loja}}` (ex.: "LIVE! Shopping Vila Velha"), `{{data_fim}}` (ex.: "sábado, 31/10"), `{{endereco}}`, `{{codigo}}`.
- Oferta fixa em todos os textos: **35% em coleção nova e permanentes · 50% em todas as outras peças**. Nunca escrever "tudo 50%". "Até 50% off" é permitido.
- Linguagem neutra em gênero ("você", sem "querida/querido"), tom positivo e grato, alinhado ao propósito da marca de vida ativa e saudável.
- Sem link, sem imagem, sem áudio na mensagem de convite. No máximo 1 emoji no convite.
- `{{nome}}` vazio ou inválido: a saudação vira apenas "{Oi|Olá}!". `{{vendedora}}` vazia: usar o modelo C (fala em nome da loja).
- Rodapé obrigatório: um dos 3 modelos de 5.3, sorteado.
- O validador recusa modelo com menos de 200 combinações e qualquer texto final que contenha "tudo 50%", link ou `{`/`}`.

### 5.2 Segmentos e modelos

| Ordem de envio | Segmento | Critério | Modelos |
| --- | --- | --- | --- |
| 1 | VIP | 3+ compras ou ticket alto nos últimos 12 meses | A1, A2 |
| 2 | Recentes | Comprou nos últimos 6 meses | B1, B2 |
| 3 | Antigos | Última compra entre 6 e 24 meses | C1, C2 |
| 4 | Inativos | Sem compra há mais de 24 meses | C1, C2 (só se sobrar capacidade) |

Dentro do segmento, alternar os dois modelos 50/50 e gravar qual foi usado (`versao_texto`). Após 3 dias, o modelo com mais SIM e menos SAIR passa a 70%.

### 5.3 Convite (mensagem 1)

**A1 — VIP, gratidão**

```
{Oi|Olá|Oie} {{nome}}, {tudo bem|tudo certo por aí|como você está}? Aqui é a {{vendedora}}, da {{loja}}. {Queria te contar em primeira mão|Você é uma das primeiras pessoas a saber|Antes de todo mundo, quis te avisar}: {nossa loja vai encerrar as atividades|vamos fechar as portas da loja} em {{data_fim}}. {Como agradecimento|Para agradecer} por {todos esses anos de treino juntos|toda a sua confiança|ter feito parte da nossa história}, {separei|reservei|guardei} um voucher de despedida {para você|só seu}: {até 50% off|descontos de até 50%}, {inclusive na coleção nova|valendo até para a coleção nova}. {Quer que eu te envie?|Posso te mandar?|Te envio agora?}
```

**A2 — VIP, prioridade**

```
{{nome}}, {bom dia|tudo bem}? {{vendedora}} {aqui|falando}, da {{loja}}! {Tenho uma notícia agridoce|Passando com uma notícia importante}: {vamos nos despedir da loja|a loja vai fechar} em {{data_fim}}. {Antes de abrir para o público|Antes de divulgar para todo mundo|Antes de anunciar}, {quis priorizar|estou chamando} {quem sempre esteve com a gente|os clientes mais especiais da loja}, e você {está na lista|é uma dessas pessoas}. {Preparei|Separei} um voucher com *35% na coleção nova e permanentes* e *50% em todo o resto*. {Quer receber o seu?|Posso te enviar?}
```

**B1 — Recentes, coleção nova**

```
{Oi|Olá} {{nome}}! {{vendedora}} {aqui|falando}, da {{loja}}. {Lembra daquela peça que você ficou de olho?|Sabe aquelas peças da coleção nova?} {Agora é a hora|Chegou o momento}: estamos {encerrando a loja|nos despedindo da loja física} e {preparei|reservei} um voucher {para você|exclusivo para clientes} com *35% na coleção nova e permanentes* e *50% nas outras peças*. {Vale até|O prazo é} {{data_fim}}. {Te mando o seu?|Quer receber?|Posso enviar?}
```

**B2 — Recentes, direto**

```
{Oi|Olá|Ei} {{nome}}, {tudo bem|como vai}? {Aviso rápido|Recado rápido} da {{vendedora}}, da {{loja}}: {a loja vai fechar em {{data_fim}}|vamos encerrar a loja em {{data_fim}}} e {liberamos|tem} um voucher {de despedida|especial} {só para quem já é cliente|para clientes da loja}. {São|É} *35% em coleção nova e permanentes* e *50% no restante*. {Quer o seu?|Posso te passar?}
```

**C1 — Antigos, saudade**

```
{Oi|Olá} {{nome}}, {quanto tempo|que saudade}! {Aqui é da|Quem fala é da equipe da} {{loja}}. {A loja vai fechar|Vamos encerrar a loja} em {{data_fim}} e {liberamos|separamos} um voucher de despedida {para clientes|para quem já comprou com a gente}: {até 50% off|descontos de até 50%}, {inclusive em lançamentos|valendo também para a coleção nova}. {Quer que eu te envie?|Posso mandar o seu?}
```

**C2 — Antigos e inativos, curtíssimo**

```
{Oi|Olá} {{nome}}! {{loja}} {aqui|falando}. {Estamos fechando|Vamos encerrar} a loja em {{data_fim}} e {tem|liberamos} um voucher {de até 50% off|com até 50% de desconto} para {clientes|você}. {Quer receber?|Te envio?}
```

**Rodapés (sortear 1)**

```
R-1: É só responder *SIM*. _Se não quiser receber mensagens, responda SAIR._
R-2: {Responda|Manda um} *SIM* que eu te envio. _Para não receber mais, responda SAIR._
R-3: Para receber, responda *SIM*. _Prefere não receber avisos? Responda SAIR._
```

### 5.4 Entrega do voucher (após SIM)

Duas mensagens: primeiro o texto (R1), depois de 3 a 5 s a imagem personalizada com legenda (R1-IMG).

**R1 — texto**

```
{Oba|Eba|Que bom}, {{nome}}! 💚 {Aqui está|Segue} o seu voucher de despedida.

✅ *35% off* na coleção nova e nas peças permanentes
✅ *50% off* em todas as outras peças
📅 Válido até *{{data_fim}}* ou enquanto houver estoque
📍 {{endereco}}

{É só mostrar a imagem no caixa.|Mostre a imagem no caixa e pronto.} {Salva nosso número para não perder!|Salve este contato para não perder o voucher.} {Quer que eu já separe algum tamanho para você?|Se quiser, me fala seu tamanho que eu separo!}
```

**R1-IMG — legenda da imagem**

```
{Seu voucher|Voucher de despedida} {{codigo}} · {{nome}}
```

### 5.5 Respostas de apoio

**R2 — opt-out** (última mensagem para esse número)

```
{Tudo bem|Combinado|Entendido}, {{nome}}! {Não vamos mais te enviar mensagens|Você não vai receber mais avisos nossos}. {Obrigada por tudo!|Agradecemos muito por ter sido nossa cliente!} 💚
```

**R3 — voucher já enviado** (reenviar a mesma imagem logo depois)

```
{Oi|Olá} {{nome}}! Seu voucher {continua valendo|ainda vale} até {{data_fim}}. {Aqui está de novo:|Te mando de novo:}
```

**R4 — não entendido** (uma vez; na segunda, humano)

```
{Oi|Olá} {{nome}}! {Não entendi bem|Acho que não entendi}. {Para receber o voucher, é só responder *SIM*|Se quiser o voucher, responda *SIM*}. {A {{vendedora}} também te responde por aqui em breve.|Se preferir, a equipe da loja te responde em breve.}
```

**R5 — "quem é?"**

```
{Oi|Olá}! Aqui é a {{vendedora}}, da {{loja}}. {Você já comprou com a gente|Você é cliente da nossa loja} 😊 Estamos {nos despedindo|encerrando a loja} e {separei|reservei} um voucher de até 50% off para você. Quer receber? Responda *SIM*.
```

**R6 — lembrete D-2** (só para quem recebeu voucher e não comprou; nunca para quem ignorou o convite)

```
{Oi|Olá} {{nome}}! {Lembrete rápido|Passando para lembrar}: seu voucher {{codigo}} vale só até {{data_fim}}. {Ainda tem peças lindas|A grade está acabando}, {quer que eu separe algo?|passa aqui!} 💚
```

**Áudio, figurinha ou imagem do cliente:** sem resposta automática; status `AGUARDANDO_HUMANO`.

## 6. Protocolo anti-bloqueio

O protocolo passa de 5 para 12 controles, todos configuráveis por variável de ambiente. Com jitter de 120 a 300 s numa janela de 9 h, o teto físico é \~150 envios/dia; o limite diário (rampa até 100) é quem realmente limita o volume.

### 6.1 Controles de tráfego

| # | Controle | Parâmetro padrão | Variável | Finalidade |
| --- | --- | --- | --- | --- |
| 1 | Jitter entre envios | Aleatório 120–300 s, distribuição não uniforme (soma de 2 sorteios) | `JITTER_MIN_S`, `JITTER_MAX_S` | Evitar intervalo regular |
| 2 | Pausa longa periódica | A cada 8–15 envios, pausa de 10–25 min | `BREAK_EVERY_MIN/MAX`, `BREAK_MIN/MAX_MIN` | Imitar pausas humanas |
| 3 | Presença "digitando" | 3–6 s proporcional ao tamanho do texto (\~40 caracteres/s) | `TYPING_MIN_MS`, `TYPING_MAX_MS` | Sinal de usuário real |
| 4 | Janela de horário | Seg–sex 09:30–18:30; sáb 09:30–13:00; sem domingo e feriados nacionais/municipais | `WINDOW_*`, `HOLIDAYS` | Evitar denúncia por horário |
| 5 | Rampa diária | Dia 1: 40 · Dia 2: 60 · Dia 3: 80 · Dia 4+: 100 | `DAILY_RAMP` | Não saltar de volume do nada |
| 6 | Limite por hora | Máx. 20 envios ativos/h | `HOURLY_CAP` | Suavizar picos |
| 7 | Ordem de envio | Primeiro os clientes mais recentes e engajados | `SEND_ORDER` | Respostas cedo melhoram a reputação |
| 8 | Validação prévia | Só envia para números confirmados no WhatsApp | — | Reduzir falhas e sinais ruins |
| 9 | Unicidade | Hash do texto final nunca se repete na campanha | — | Evitar impressão digital idêntica |
| 10 | Sem link e sem mídia na 1ª mensagem | Link só na resposta ao SIM, se houver | — | Mensagem fria com link é mais denunciada |
| 11 | Marcar como lida | Ao receber resposta, marcar como lida antes de responder | `MARK_READ` | Comportamento humano |
| 12 | Respostas não contam no limite | Respostas inbound (R1–R4) não consomem a cota diária, mas respeitam 1,5–2 s de digitação | — | Atender rápido quem pediu |

**Controles adicionais da campanha LIVE!**

| # | Controle | Regra | Finalidade |
| --- | --- | --- | --- |
| 13 | Mídia só após consentimento | Imagem do voucher enviada apenas depois do SIM, dentro da conversa iniciada pela resposta do cliente | Mídia em mensagem fria é o maior gatilho de denúncia |
| 14 | Imagem única por cliente | Nome + código na imagem; `imagem_hash` único no banco | O WhatsApp não vê o mesmo arquivo repetido centenas de vezes |
| 15 | Sem insistência | Quem não respondeu ao convite nunca recebe outra mensagem; lembrete só para quem pediu o voucher | Reenvio para quem ignorou gera denúncia |
| 16 | Pedido para salvar o contato | R1 pede para salvar o número | Contato salvo melhora a entrega das próximas mensagens |

### 6.2 Disjuntores (pausa automática)

| Disjuntor | Gatilho | Ação |
| --- | --- | --- |
| Falhas consecutivas | 3 falhas seguidas | Pausa 30 min; na 2ª ocorrência do dia, pausa até o dia seguinte |
| Taxa de erro | > 10% de erro nos últimos 30 envios | Pausa até intervenção manual |
| Opt-out alto | > 8% de OPT\_OUT nos últimos 50 entregues | Pausa até intervenção manual; revisar copy |
| Conexão | `CONNECTION_UPDATE` com estado diferente de `open`, ou health check falha 2× | Pausa imediata; alerta |
| Sinal de restrição | HTTP 401/403 da API, ou erro contendo "banned"/"restricted" | Kill switch: para tudo, alerta, exige retomada manual |
| Fora da janela | Horário fora da janela configurada | Fila dorme até a próxima abertura |

### 6.3 Alertas

Toda pausa automática gera alerta para o operador. Canal padrão: mensagem de texto da própria instância para o número do gestor (`ADMIN_PHONE`), mais registro no painel. Se a instância estiver desconectada, o alerta fica apenas no painel e no log (opcional: e-mail ou Telegram na Etapa 7).

## 7. Requisitos funcionais

São 23 requisitos em 5 módulos (RF21 a RF23 são específicos da campanha LIVE!). Cada um tem critério de aceite verificável por teste automatizado, exceto onde indicado como teste manual.

### 7.1 Módulo de base de dados

**RF01 — Importação da base.** Importar CSV ou XLSX com colunas: `telefone` (obrigatório), `nome` (obrigatório), `vendedora`, `segmento`, `ultima_compra`, `primeira_compra`, `qtd_compras`, `id_cliente`. Mapeamento de colunas por arquivo de configuração. Reimportar não duplica: chave única é o telefone normalizado.

- Aceite: importar 2× o mesmo arquivo resulta no mesmo número de linhas; linhas inválidas vão para `import_rejeitados.csv` com o motivo.

**RF02 — Normalização de telefone.** Remover tudo que não for dígito; adicionar DDI 55 se ausente; validar DDD brasileiro (11–99 válidos); celular com 9 dígitos após o DDD. Guardar também a variante sem o 9º dígito para casar respostas (algumas contas antigas usam o JID sem o 9).

- Aceite: `(27) 99988-7766`, `27999887766` e `+55 27 9 9988-7766` viram `5527999887766`; fixos (8 dígitos começando com 2–5) são rejeitados.

**RF03 — Validação no WhatsApp.** Antes de entrar na fila, consultar em lotes de até 50 números se cada um tem conta no WhatsApp. Guardar o JID retornado (pode vir sem o 9º dígito ou como `@lid`). Números sem conta recebem status `SEM_WHATSAPP` e nunca são enviados.

- Aceite: número inexistente nunca chega a `ENVIADO`.

**RF04 — Segmentação e modelo de texto.** Classificar cada cliente em VIP, Recentes, Antigos ou Inativos (tabela 5.2) a partir de `qtd_compras`, `ultima_compra` e ticket. Definir a prioridade de envio nessa ordem (N8). Sortear o modelo do segmento (A1/A2, B1/B2, C1/C2) em 50/50 e gravar em `versao_texto`. Sem vendedora: forçar C1/C2. Após 3 dias de campanha, o comando `cli rebalance` passa o modelo vencedor de cada segmento para 70%.

**RF05 — Supressão.** Antes de cada envio, checar a tabela `supressao` (opt-outs de qualquer campanha). Número suprimido vira `SUPRIMIDO`.

### 7.2 Módulo de envio (outbound)

**RF06 — Motor de spintax.** Resolver `{a|b}` com aninhamento e depois substituir `{{variavel}}`. Valores de variáveis são tratados como texto literal (um nome com `{` ou `|` não quebra o parser). Semente aleatória registrável para reproduzir uma mensagem em debug. Calcular hash SHA-256 do texto final; se repetir na campanha, sortear de novo (até 10 tentativas).

- Aceite: 10 gerações para o mesmo cliente produzem ≥ 9 textos distintos (TC-01); cada modelo (A1 a C2) gera ≥ 200 combinações.

**RF07 — Envio híbrido.** Modo padrão: texto puro com rodapé SIM/SAIR. Com `USE_BUTTONS=true`, tentar envio com botões; se a API recusar, reenviar como texto na mesma hora (sem novo jitter) e registrar a falha do botão. Após 3 falhas de botão, desligar botões automaticamente para o resto da campanha.

**RF08 — Fila e agendador.** Um único worker processa a fila, um envio por vez. Ciclo: verifica janela → limites → disjuntores → pega próximo `PRONTO` → marca `ENVIANDO` (trava) → presença "digitando" → envia → grava `ENVIADO` com `message_id` da API → agenda próximo com jitter. Ao reiniciar, contatos em `ENVIANDO` há mais de 5 min vão para revisão manual (`VERIFICAR`), nunca são reenviados automaticamente.

- Aceite: matar o processo no meio do envio e reiniciar não gera mensagem duplicada (TC-08).

### 7.3 Módulo de recepção (inbound)

**RF09 — Webhook seguro.** Rota `POST /webhook/:token`. Token errado responde 404. Responder HTTP 200 em < 200 ms e processar o evento de forma assíncrona. Eventos tratados: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`. Ignorar evento de outra instância.

**RF10 — Filtros e idempotência.** Descartar: `key.fromMe == true` (anti-loop), JIDs de grupo (`@g.us`), `status@broadcast`, newsletters, mensagens com mais de 10 min (reentrega após queda). Gravar `message.id` em `eventos_processados`; se já existir, descartar.

- Aceite: o mesmo evento entregue 3× gera 1 resposta (TC-09).

**RF11 — Classificação de intenção.** Ordem de avaliação:

1. Clique de botão: `BTN_QUERO_VOUCHER` → SIM; `BTN_NAO_QUERO` → NÃO.
2. Texto normalizado (minúsculas, sem acentos, sem pontuação, espaços colapsados).
3. **Opt-out forte** (vence tudo): `sair`, `pare`, `parar`, `cancelar`, `descadastrar`, `remover`, `nao quero`, `nao tenho interesse`, `bloquear`, `denunciar`, `spam`, `para de mandar`.
4. **Negação** antes de qualquer positivo: frase começando com `nao`, `nem`, `jamais`, `obrigad[oa] mas`.
5. **Positivo** com limite de palavra (`\b`): `sim`, `quero`, `manda`, `mande`, `envia`, `pode`, `pode mandar`, `claro`, `opa`, `bora`, `com certeza`, `aceito`, `ok`, `s`, `👍`, `🙏`, `❤️`.
6. Nada casou → `DESCONHECIDO`.

- Aceite: "sim por favor" → SIM; "não tenho interesse" → OPT\_OUT; "assim que der eu vejo" → DESCONHECIDO (não casa `sim` dentro de `assim`); "pode parar" → OPT\_OUT. Suíte com ≥ 60 frases reais de teste.

**RF12 — Resolução do contato.** Casar o JID recebido com a base pelo telefone, pela variante sem 9º dígito ou pelo JID salvo no RF03. Mensagem de número fora da base: não responder, registrar em `inbound_desconhecido` e mostrar no painel.

**RF13 — Despacho do voucher em duas etapas.** Intenção SIM e status `ENVIADO` ou `DESCONHECIDO_1X` → em uma transação, reservar o código e marcar `VOUCHER_ENVIANDO`; enviar o texto R1 (digitação 1,5 a 2 s); aguardar 3 a 5 s; enviar a imagem personalizada (RF21) com legenda R1-IMG; gravar `VOUCHER_ENVIADO`. Se a imagem falhar após 3 tentativas (backoff 1 s, 3 s, 9 s), enviar o código em texto ("Seu código é {{codigo}}"), registrar o erro e alertar o operador. Se o cliente já recebeu voucher → R3 seguido da mesma imagem.

- Aceite: p95 < 4 s do webhook até a resposta da API (TC-03).

**RF14 — Opt-out.** Intenção NÃO/opt-out em qualquer estado → R2 (uma única vez), status `OPT_OUT`, inserir em `supressao`. Nenhuma mensagem depois disso, nem do disparo, nem de respostas automáticas.

**RF15 — Fallback humano.** Primeira resposta `DESCONHECIDO` → R4 e status `DESCONHECIDO_1X`. Segunda resposta não reconhecida, mídia ou áudio → `AGUARDANDO_HUMANO`, sem resposta automática, alerta para o operador e item na fila de atendimento do painel.

**RF16 — Status de entrega.** Usar `MESSAGES_UPDATE` para gravar `entregue_em` e `lido_em` (base das métricas de entrega e leitura).

### 7.4 Módulo de operação

**RF17 — Vouchers.** Gerar N códigos únicos (formato `LIVE-XXXX`, alfabeto sem caracteres ambíguos 0/O/1/I), com percentual e validade por lote. Um código por cliente. Tela e rota para marcar como usado no PDV.

**RF18 — Painel web.** Protegido por senha. Mostra: status da conexão, contadores por status, envios hoje vs. limite, próximo envio previsto, disjuntores ativos, funil (enviados → entregues → lidos → SIM → usados), fila de atendimento humano. Botões: pausar, retomar, kill switch.

**RF19 — CLI.** Comandos: `import`, `validate-numbers`, `assign-axis`, `preview --n 20` (gera mensagens sem enviar), `dry-run`, `start`, `pause`, `resume`, `status`, `report`, `purge`.

**RF20 — Modo de teste.** `DRY_RUN=true` grava tudo mas não chama a API. `TEST_ALLOWLIST` restringe envios a números de homologação; com allowlist ativa, nenhum outro número recebe mensagem, mesmo que esteja na fila.

### 7.5 Requisitos da campanha LIVE!

**RF21 — Imagem personalizada do voucher.** Gerar um JPG 1080 × 1350 px por cliente a partir de um fundo aprovado pela franqueadora (`assets/voucher-base.png`, com logo e cores já aplicados) e de um arquivo de layout (`assets/voucher-layout.json`) com posição, fonte e cor de cada campo: nome, código, oferta (N1), validade, endereço e regras impressas ("válido somente na {{loja}} até {{data\_fim}} ou enquanto durarem os estoques; uso único; não cumulativo; desconto sobre o preço de etiqueta"). Biblioteca: `sharp` com sobreposição de SVG de texto. Gerar em lote antes da campanha (`cli vouchers render`) e salvar em `data/vouchers/<codigo>.jpg`, até 300 KB.

- Aceite: duas imagens de clientes diferentes têm hash SHA-256 diferente; nome com acento e 30 caracteres cabe no campo; `cli vouchers preview --n 5` gera amostras para aprovação.

**RF22 — Lembrete D-2.** Em `data_fim` − 2 dias, às 10h, enfileirar R6 apenas para clientes `VOUCHER_ENVIADO` sem `voucher_usado_em`. Um lembrete por cliente, no máximo. Respeita janela, jitter e limite diário (conta como envio ativo). Nunca para `ENVIADO` sem resposta, `OPT_OUT` ou `AGUARDANDO_HUMANO` (N5, N6).

- Aceite: TC-17.

**RF23 — Corte de convites em D-4.** A partir de `data_fim` − 4 dias, o worker não envia novos convites; clientes ainda `PRONTO` vão para `NAO_CONTATADO`. Webhook, entregas de voucher e o lembrete RF22 continuam ativos até o fim de `data_fim`.

- Aceite: TC-18.

## 8. Requisitos não funcionais e segurança

| ID | Requisito | Meta verificável |
| --- | --- | --- |
| RNF01 | Latência do webhook | Ack HTTP 200 em < 200 ms (p99); voucher entregue à API em < 4 s (p95), digitação incluída |
| RNF02 | Persistência | SQLite em modo WAL, em volume persistente; reinício não perde estado nem duplica envio |
| RNF03 | Tratamento de erros | Todo HTTP 4xx/5xx e timeout (10 s) da Evolution API é capturado, logado e classificado; nenhuma exceção derruba o processo |
| RNF04 | Disponibilidade | Processo supervisionado (Docker `restart: unless-stopped`); health check `GET /health` a cada 30 s |
| RNF05 | Logs de auditoria | JSON estruturado (pino), um evento por linha, com `ts`, `nivel`, `evento`, `telefone_mascarado`, `message_id`, `latencia_ms`; rotação diária; 30 dias |
| RNF06 | Privacidade em logs | Telefone mascarado (`5527*****7766`); texto completo das mensagens só em nível debug |
| RNF07 | Segredos | `EVOLUTION_API_KEY`, `WEBHOOK_TOKEN`, `ADMIN_PASSWORD` só em `.env` (fora do git) ou secrets do Docker; `.env.example` sem valores |
| RNF08 | Webhook | Token de 32+ caracteres na URL; HTTPS obrigatório; limite de 30 req/s por IP; payload máx. 1 MB |
| RNF09 | Painel | Senha com hash (bcrypt), cookie de sessão `HttpOnly` + `Secure`; acessível só via HTTPS ou rede local |
| RNF10 | Testabilidade | Cobertura ≥ 80% nos módulos `spintax`, `intent`, `phone`, `scheduler`, `breakers`; cliente da Evolution API com mock |
| RNF11 | Configuração | Todo parâmetro de cadência, janela, limite e disjuntor via variável de ambiente, validado na inicialização (zod); valor inválido impede o start |
| RNF12 | Relógio | Toda regra de horário usa `America/Sao_Paulo`, independente do fuso do servidor |
| RNF13 | Concorrência | Um único worker de envio (trava em arquivo/tabela); o webhook pode rodar em paralelo, com transações curtas |

**Classificação de erros da Evolution API** (usada pelos disjuntores):

| Classe | Exemplos | Conta como falha? | Ação |
| --- | --- | --- | --- |
| Transitório | 429, 500, 502, 503, 504, timeout | Sim | Retry com backoff (até 3×); depois `ERRO` com `tentativas+1`, volta à fila em 1 h, máx. 3 tentativas |
| Número | 400 "not exists", JID inválido | Não | `SEM_WHATSAPP`, sem retry |
| Autenticação | 401, 403 | Sim (crítico) | Kill switch |
| Conexão | instância `close`/`connecting` | Sim (crítico) | Pausa e alerta |

## 9. Arquitetura, stack e modelo de dados

Um único serviço Node.js com dois componentes (worker de envio e servidor HTTP) compartilhando um SQLite, empacotado em Docker. É simples o bastante para uma campanha de semanas e robusto o bastante para reinícios.

&#91;embedded content: arquitetura · 1 serviço, 3 componentes, 1 banco\]

O webhook é o componente crítico: ele responde aos clientes e precisa funcionar mesmo quando o worker está pausado.

### 9.1 Stack

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Linguagem | Node.js 20 LTS + TypeScript (strict) | Mesmo ecossistema da Evolution API; tipagem dos payloads |
| HTTP | Fastify | Rápido, schema de validação nativo |
| Banco | SQLite + better-sqlite3 (WAL) | Arquivo único, transações síncronas, atende RNF02 |
| Validação | zod | Config e payloads do webhook |
| HTTP client | undici (fetch) com timeout | Nativo, sem dependência extra |
| Logs | pino + pino-roll | JSON estruturado, rotação |
| Datas | luxon | Fuso `America/Sao_Paulo` explícito |
| Testes | vitest + nock/msw | Mock da Evolution API |
| Painel | HTML servido pelo Fastify + htmx | Sem build de front-end |
| Deploy | Docker Compose, volume `./data` | Reinício automático, persistência |

### 9.2 Estrutura de pastas

```
campanha-whatsapp/
├── src/
│   ├── config/        # env.ts (zod), constants.ts (IDs de botão, status)
│   ├── db/            # schema.sql, migrations/, repo.ts
│   ├── evolution/     # client.ts, types.ts, errors.ts
│   ├── domain/        # phone.ts, spintax.ts, templates.ts, intent.ts, vouchers.ts, axis.ts
│   ├── outbound/      # scheduler.ts, window.ts, limits.ts, breakers.ts, worker.ts
│   ├── inbound/       # webhook.ts, filters.ts, resolver.ts, handlers.ts
│   ├── admin/         # routes.ts, views/, auth.ts
│   ├── cli/           # index.ts (commander)
│   └── main.ts
├── templates/         # eixo1.txt … eixo5.txt, r1.txt … r4.txt, rodape.txt
├── tests/             # unit/, integration/, fixtures/ (payloads reais do webhook)
├── docs/              # lgpd.md, runbook.md, contratos-evolution.md
├── data/              # campanha.db, logs/ (fora do git)
├── .env.example
├── docker-compose.yml
└── AGENTS.md          # regras para o agente do Antigravity
```

### 9.3 Modelo de dados

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE campanhas (
  id              INTEGER PRIMARY KEY,
  nome            TEXT NOT NULL,
  data_inicio     TEXT NOT NULL,          -- ISO 8601
  data_limite     TEXT NOT NULL,          -- validade do voucher
  percentual      INTEGER NOT NULL CHECK (percentual BETWEEN 1 AND 90),
  status          TEXT NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, ATIVA, PAUSADA, PARADA, ENCERRADA
  motivo_pausa    TEXT
);

CREATE TABLE clientes (
  id                INTEGER PRIMARY KEY,
  campanha_id       INTEGER NOT NULL REFERENCES campanhas(id),
  id_externo        TEXT,
  telefone          TEXT NOT NULL,         -- E.164 sem '+': 5527999887766
  telefone_alt      TEXT,                  -- variante sem 9º dígito
  jid               TEXT,                  -- retornado pela validação (pode ser @lid)
  primeiro_nome     TEXT,
  nome_completo     TEXT NOT NULL,
  vendedora         TEXT,
  segmento          TEXT,
  versao_texto      TEXT CHECK (versao_texto IN ('A1','A2','B1','B2','C1','C2')),
  status            TEXT NOT NULL DEFAULT 'IMPORTADO',
  prioridade        INTEGER NOT NULL DEFAULT 0,
  tentativas        INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa TEXT,
  enviado_em        TEXT,
  entregue_em       TEXT,
  lido_em           TEXT,
  respondido_em     TEXT,
  message_id        TEXT,                  -- id da 1ª mensagem na API
  texto_hash        TEXT,
  ultimo_erro       TEXT,
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campanha_id, telefone)
);
CREATE INDEX idx_clientes_fila ON clientes (campanha_id, status, prioridade DESC, id);
CREATE INDEX idx_clientes_jid  ON clientes (jid);
CREATE INDEX idx_clientes_alt  ON clientes (telefone_alt);
CREATE UNIQUE INDEX idx_hash   ON clientes (campanha_id, texto_hash) WHERE texto_hash IS NOT NULL;

CREATE TABLE mensagens (                  -- todo envio e recebimento
  id            INTEGER PRIMARY KEY,
  cliente_id    INTEGER REFERENCES clientes(id),
  direcao       TEXT NOT NULL CHECK (direcao IN ('OUT','IN')),
  tipo          TEXT NOT NULL,             -- ABORDAGEM, R1, R1_IMG, R2, R3, R4, R5, R6, ALERTA, RESPOSTA_CLIENTE
  message_id    TEXT UNIQUE,
  texto         TEXT,
  intencao      TEXT,                      -- SIM, NAO, OPT_OUT, DESCONHECIDO, MIDIA
  http_status   INTEGER,
  latencia_ms   INTEGER,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE vouchers (
  codigo        TEXT PRIMARY KEY,          -- ADEUS-7K3Q
  campanha_id   INTEGER NOT NULL REFERENCES campanhas(id),
  cliente_id    INTEGER UNIQUE REFERENCES clientes(id),
  percentual    INTEGER NOT NULL,
  valido_ate    TEXT NOT NULL,
  enviado_em    TEXT,
  imagem_path   TEXT,                      -- data/vouchers/<codigo>.jpg
  imagem_hash   TEXT UNIQUE,               -- garante imagem diferente por cliente
  lembrete_em   TEXT,                      -- RF22
  usado_em      TEXT
);

CREATE TABLE supressao (                  -- permanente, entre campanhas
  telefone      TEXT PRIMARY KEY,
  motivo        TEXT NOT NULL,             -- OPT_OUT, DENUNCIA, MANUAL
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE eventos_processados (        -- idempotência do webhook
  message_id    TEXT PRIMARY KEY,
  recebido_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE inbound_desconhecido (
  id            INTEGER PRIMARY KEY,
  jid           TEXT NOT NULL,
  texto         TEXT,
  recebido_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contadores_diarios (
  dia           TEXT PRIMARY KEY,          -- 2026-10-20 (fuso SP)
  envios_ativos INTEGER NOT NULL DEFAULT 0,
  erros         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE auditoria (
  id            INTEGER PRIMARY KEY,
  evento        TEXT NOT NULL,             -- PAUSA_AUTO, RETOMADA, KILL_SWITCH, IMPORT, CONFIG
  detalhe       TEXT,                      -- JSON
  ator          TEXT NOT NULL,             -- SISTEMA, CLI, PAINEL
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Valores de `clientes.status`: `IMPORTADO`, `SEM_WHATSAPP`, `SUPRIMIDO`, `PRONTO`, `ENVIANDO`, `ENVIADO`, `ERRO`, `VERIFICAR`, `DESCONHECIDO_1X`, `VOUCHER_ENVIADO`, `OPT_OUT`, `AGUARDANDO_HUMANO`, `ESGOTADO` (atingiu 3 tentativas), VOUCHER\_ENVIANDO (entre o texto R1 e a imagem) e NAO\_CONTATADO (corte de D-4, RF23). As transições permitidas estão na seção 4 e devem ser validadas no código (função única `transicionar(cliente, novoStatus)`).

## 10. Contratos de API

Os contratos abaixo seguem o formato da Evolution API v2, que difere do PRD v1.0 (sem objeto `options`; `sendButtons` em vez de `sendInteractive`). **A Etapa 0 confirma a versão instalada** (`GET /` retorna a versão) e grava os payloads reais em `docs/contratos-evolution.md`; se a versão for 1.x, o cliente HTTP usa o formato antigo. Nenhum outro módulo conhece o formato da API: tudo passa por `src/evolution/client.ts`.

Base: `EVOLUTION_BASE_URL=https://evolution.ricardo.home.nom.br` · Instância: `EVOLUTION_INSTANCE=ao vivo vv` (codificada como `ao%20vivo%20vv` na URL) · Header: `apikey: ${EVOLUTION_API_KEY}`.

### 10.1 Chamadas de saída

| Uso | Método e rota | Corpo (resumo) |
| --- | --- | --- |
| Versão / saúde do servidor | `GET /` | — |
| Estado da conexão | `GET /instance/connectionState/{instancia}` | — (espera `state: "open"`) |
| Validar números | `POST /chat/whatsappNumbers/{instancia}` | `{"numbers": ["5527999887766", …]}` (lotes de 50) |
| Presença digitando | `POST /chat/sendPresence/{instancia}` | `{"number", "presence": "composing", "delay": 4000}` |
| Enviar texto | `POST /message/sendText/{instancia}` | `{"number", "text", "delay": 4000, "linkPreview": false}` |
| Enviar botões (opcional) | `POST /message/sendButtons/{instancia}` | ver 10.2 |
| Marcar como lida | `POST /chat/markMessageAsRead/{instancia}` | `{"readMessages": [{"remoteJid", "fromMe": false, "id"}]}` |
| Configurar webhook | `POST /webhook/set/{instancia}` | ver 10.3 |

### 10.2 Exemplos de payload

Abordagem em texto (modo padrão):

```json
{
  "number": "5527999887766",
  "text": "Oi Mariana! Recado da Juliana: a loja física está encerrando e tem um voucher só para quem já é cliente, até 25/10. Te mando o código?\n\nÉ só responder *SIM* que eu te mando o código.\n_Para não receber mais, é só responder SAIR._",
  "delay": 4200,
  "linkPreview": false
}
```

Abordagem com botões (`USE_BUTTONS=true`):

```json
{
  "number": "5527999887766",
  "title": "Aviso da loja",
  "description": "<texto do eixo + rodapé SIM/SAIR>",
  "footer": "Toque em uma opção ou responda SIM",
  "buttons": [
    { "type": "reply", "displayText": "Quero meu voucher 🎁", "id": "BTN_QUERO_VOUCHER" },
    { "type": "reply", "displayText": "Não, obrigado",        "id": "BTN_NAO_QUERO" }
  ]
}
```

Entrega do voucher (R1):

```json
{
  "number": "5527999887766",
  "text": "Que bom, Mariana! 🎉\n\nSeu voucher é: *ADEUS-7K3Q*\n\nEle dá *20% de desconto* em qualquer peça do estoque da loja física. Válido até *25/10* ou enquanto houver peças.\n\n📍 Rua Exemplo, 123\n\nA Juliana te espera na loja!",
  "delay": 1800,
  "linkPreview": false
}
```

Imagem do voucher, 3 a 5 s após o R1 (`POST /message/sendMedia/{instancia}`; enviar o arquivo em base64 para não expor URL pública dos vouchers):

```json
{
  "number": "5527999887766",
  "mediatype": "image",
  "mimetype": "image/jpeg",
  "fileName": "LIVE-7K3Q.jpg",
  "caption": "Seu voucher LIVE-7K3Q · Mariana",
  "media": "<base64 do JPG gerado pelo RF21>",
  "delay": 1500
}
```

### 10.3 Configuração do webhook

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://<seu-dominio>/webhook/<WEBHOOK_TOKEN>",
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"]
  }
}
```

### 10.4 Leitura do evento recebido

Campos usados de `MESSAGES_UPSERT` (o parser deve tolerar campos ausentes):

| Campo | Uso |
| --- | --- |
| `instance` | Ignorar se diferente de `EVOLUTION_INSTANCE` |
| `data.key.remoteJid` | Identificar o contato; descartar `@g.us`, `status@broadcast`, `@newsletter` |
| `data.key.remoteJidAlt` / `data.key.senderPn` (quando presentes) | Telefone real quando o JID vier como `@lid` |
| `data.key.fromMe` | `true` → descartar (anti-loop) |
| `data.key.id` | Idempotência |
| `data.messageTimestamp` | Descartar se > 10 min |
| `data.messageType` | `conversation`, `extendedTextMessage`, `buttonsResponseMessage`, `templateButtonReplyMessage`, mídia |
| `data.message.conversation` ou `data.message.extendedTextMessage.text` | Texto do cliente |
| `data.message.buttonsResponseMessage.selectedButtonId` ou `data.message.templateButtonReplyMessage.selectedId` | ID do botão clicado |
| `data.pushName` | Apenas log; nunca substitui o nome da base |

A Etapa 0 deve capturar pelo menos 8 eventos reais (texto, botão, áudio, figurinha, grupo, mensagem própria, update de entrega, update de leitura) e salvá-los em `tests/fixtures/` para os testes de contrato.

## 11. Implementação em etapas no Antigravity

A implementação é dividida em 9 etapas (0 a 8), cada uma pequena o bastante para uma sessão do agente, com prompt pronto e critério de aceite. A regra de ouro: **o inbound (respostas) fica pronto e testado antes de qualquer envio ativo**, para que nenhum cliente responda SIM sem receber o voucher.

### 11.1 Como conduzir cada etapa

1. Abra o repositório no Antigravity e crie o arquivo `AGENTS.md` (abaixo) e copie este PRD para `docs/PRD.md`. O agente lê ambos em toda sessão.
2. Para cada etapa, use o modo de planejamento: cole o prompt da etapa, peça o plano de implementação e **revise o plano antes de aprovar**.
3. Ao final, exija que o agente rode `npm run lint && npm test` e mostre o resultado. Só avance com tudo verde e os critérios de aceite marcados.
4. Faça um commit por etapa (`etapa-N: <resumo>`) e uma tag (`v0.N`). Se a etapa seguinte quebrar algo, volte para a tag.
5. Nunca permita que o agente execute envios reais antes da Etapa 7, e só com `TEST_ALLOWLIST` preenchida.

### 11.2 Arquivo AGENTS.md

```markdown
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
```

### 11.3 Etapas

**Etapa 0 — Fundação e descoberta** (≈ 0,5 dia)

- Entregáveis: repositório com TypeScript, lint, vitest, Docker Compose; `src/config/env.ts` com todas as variáveis da seção 6 e 8 validadas por zod; `.env.example`; `src/evolution/client.ts` com `getVersion`, `connectionState`, `sendText`, `sendPresence`, `whatsappNumbers`, `setWebhook`; script `scripts/capture-webhook.ts` que sobe um servidor temporário e grava eventos recebidos em `tests/fixtures/`.
- Prompt:

```
Leia docs/PRD.md (seções 8, 9 e 10) e AGENTS.md. Implemente a Etapa 0:
1) Estruture o projeto conforme a seção 9.2, com TypeScript strict, ESLint, vitest e Docker Compose (volume ./data).
2) Crie src/config/env.ts validando com zod todas as variáveis das seções 6 e 8; o processo deve falhar no start com mensagem clara se faltar algo. Gere .env.example sem valores secretos.
3) Crie src/evolution/client.ts com timeout de 10 s, classificação de erros da seção 8 (Transitório, Número, Autenticação, Conexão) e os métodos: getVersion, connectionState, whatsappNumbers, sendPresence, sendText, sendButtons, sendMedia, markAsRead, setWebhook. O nome da instância deve ser codificado na URL.
4) Crie scripts/discover.ts que imprime a versão da API e o estado da conexão (somente leitura, nenhum envio).
5) Crie scripts/capture-webhook.ts que sobe um servidor em /webhook/:token e salva cada payload recebido em tests/fixtures/<evento>-<timestamp>.json.
Escreva testes do client com mocks. Não chame a API real nos testes.
```

- Aceite: `npm test` verde; `discover` mostra a versão e `state: open`; pelo menos 8 fixtures reais capturados (texto, botão, áudio, figurinha, grupo, fromMe, entrega, leitura); `docs/contratos-evolution.md` atualizado com a versão real e qualquer diferença em relação à seção 10.

**Etapa 1 — Banco e importação** (≈ 1 dia) — RF01 a RF05

- Prompt:

```
Implemente a Etapa 1 do docs/PRD.md: RF01 a RF05 e o schema da seção 9.3.
- src/db: migrations com o schema completo, repo.ts com transicionar(cliente, novoStatus) validando a máquina de estados da seção 4 (transição inválida lança erro).
- src/domain/phone.ts: normalização e variante sem 9º dígito (RF02), com testes para todos os exemplos do aceite.
- src/domain/segment.ts: segmentação VIP/Recentes/Antigos/Inativos, prioridade de envio e sorteio do modelo de texto A1–C2 (RF04, tabela 5.2).
- CLI: import <arquivo> (CSV e XLSX, mapeamento de colunas configurável, rejeitados em import_rejeitados.csv), validate-numbers (lotes de 50, usa o client da Etapa 0; em DRY_RUN usa mock), assign-axis.
- Checagem de supressão (RF05).
Crie fixtures de base com 30 linhas, incluindo telefones malformados, fixos, duplicados e nomes em maiúsculas.
```

- Aceite: importar 2× não duplica; os 3 formatos de telefone do RF02 viram o mesmo número; fixo rejeitado; transição inválida (ex.: `OPT_OUT` → `PRONTO`) lança erro.

**Etapa 2 — Motor de mensagens e classificador** (≈ 1 dia) — RF06, RF11, seção 5

- Prompt:

```
Implemente a Etapa 2 do docs/PRD.md.
- src/domain/spintax.ts: parser com aninhamento, variáveis {{x}} tratadas como literais, semente reproduzível, contagem de combinações.
- templates/: crie os arquivos A1, A2, B1, B2, C1, C2, os 3 rodapés e R1, R1-IMG, R2 a R6 exatamente como na seção 5, mais o validador da seção 5.1 (≥ 200 combinações por modelo; recusar "tudo 50%", links e chaves residuais).
- src/domain/voucherImage.ts: RF21 com sharp (fundo aprovado + layout JSON), comandos cli vouchers render e cli vouchers preview --n 5.
- src/domain/templates.ts: monta abordagem = eixo + rodapé; primeiro_nome em formato título; regras de fallback de nome e vendedora (5.1); hash SHA-256 com nova tentativa se repetir.
- src/domain/intent.ts: classificador conforme a ordem do RF11 (botão > opt-out forte > negação > positivo > desconhecido), com normalização de acentos e limites de palavra.
- tests/unit/intent.test.ts com no mínimo 60 frases, incluindo todos os exemplos do aceite do RF11 e casos como "sim", "Sim!!", "s", "👍", "quero sim", "não", "nao obg", "pode parar", "assim que der", "quem é?", "onde fica a loja?".
- CLI preview --n 20: imprime 20 mensagens geradas para clientes da base, sem enviar.
```

- Aceite: TC-01 passa; cada modelo ≥ 200 combinações; 5 amostras de voucher geradas para aprovação da franqueadora; hashes das imagens todos diferentes; 100% da suíte de intenção verde; nenhuma mensagem gerada contém `{`, `}` ou `{{`.

**Etapa 3 — Webhook e respostas automáticas** (≈ 1,5 dia) — RF09, RF10, RF12 a RF16

- Prompt:

```
Implemente a Etapa 3 do docs/PRD.md (módulo inbound). Use os fixtures reais de tests/fixtures/.
- POST /webhook/:token com ack < 200 ms e processamento assíncrono (fila em memória + persistência do evento antes do ack).
- filters.ts (RF10), resolver.ts (RF12, inclusive @lid e variante sem 9º dígito), handlers.ts (RF13 voucher em duas etapas: texto R1 e, 3 a 5 s depois, imagem via sendMedia, com fallback para código em texto; R3 + mesma imagem para repetição; R5 para "quem é?"; RF14 opt-out com R2 única, RF15 fallback humano, RF16 status de entrega/leitura).
- Marcar mensagem como lida antes de responder (controle 11 da seção 6); digitação de 1,5 a 2 s nas respostas.
- Vouchers: gerar lote de códigos (RF17) para os testes.
Testes de integração: TC-03, TC-04, TC-05, TC-06, TC-09, TC-10, TC-11 e TC-16 da seção 12 com mock da API, medindo latência.
```

- Aceite: os 7 testes de integração verdes; p95 simulado < 4 s; evento repetido 3× gera 1 resposta; nenhum `fromMe` gera resposta.

**Etapa 4 — Motor de envio** (≈ 1,5 dia) — RF07, RF08, seção 6

- Prompt:

```
Implemente a Etapa 4 do docs/PRD.md (outbound).
- window.ts: janela de horário e feriados no fuso America/Sao_Paulo.
- limits.ts: rampa diária, limite por hora, contadores_diarios.
- breakers.ts: todos os disjuntores da seção 6.2, com estado persistido em campanhas.status/motivo_pausa e registro em auditoria.
- scheduler.ts: jitter (soma de dois sorteios), pausas longas a cada 8–15 envios, cálculo do próximo horário.
- worker.ts: ciclo do RF08 com trava de worker único, recuperação de ENVIANDO → VERIFICAR, envio híbrido do RF07 com auto-desligamento de botões.
- Respeitar DRY_RUN e TEST_ALLOWLIST (RF20) no nível mais baixo, dentro do client.
- RF22 (lembrete D-2 só para VOUCHER_ENVIADO sem uso) e RF23 (corte de convites novos em D-4).
Injete relógio e gerador aleatório para testar sem esperar. Testes: TC-02, TC-07, TC-08, TC-12, TC-13, TC-14, TC-17, TC-18.
```

- Aceite: testes com relógio simulado verdes; com `DRY_RUN=true`, um dia simulado gera entre 40 e o limite da rampa de envios, todos dentro da janela; nenhum envio para número fora da allowlist.

**Etapa 5 — Painel e CLI de operação** (≈ 1 dia) — RF17 a RF19

- Prompt:

```
Implemente a Etapa 5 do docs/PRD.md.
- Painel em /admin (Fastify + htmx), login com ADMIN_PASSWORD (bcrypt) e cookie HttpOnly/Secure.
- Telas: visão geral (conexão, contadores por status, envios hoje vs limite, próximo envio, disjuntores, funil), atendimento humano (lista de AGUARDANDO_HUMANO com último texto), vouchers (buscar código, marcar como usado), configuração somente leitura.
- Botões pausar, retomar e kill switch, todos registrados em auditoria.
- CLI completa do RF19, incluindo report (CSV com métricas e funil) e purge (LGPD, pede confirmação).
```

- Aceite: todas as ações do painel refletem no banco e na auditoria; kill switch para o worker em < 5 s; `report` gera CSV com as métricas da seção 2.3.

**Etapa 6 — Observabilidade, alertas e deploy** (≈ 0,5 dia)

- Prompt:

```
Implemente a Etapa 6 do docs/PRD.md.
- Logs pino conforme RNF05/RNF06 com rotação diária.
- GET /health (processo, banco, estado da conexão Evolution) e health check no Docker Compose.
- Alertas da seção 6.3 para ADMIN_PHONE em toda pausa automática, kill switch e AGUARDANDO_HUMANO (agrupar no máximo 1 alerta a cada 10 min).
- docs/runbook.md com: como iniciar, pausar, retomar, trocar a chave da API, recuperar de desconexão e encerrar a campanha.
- Script de backup diário do campanha.db.
```

- Aceite: derrubar a conexão da instância gera pausa e alerta; `docker compose restart` retoma sem duplicar; backup restaurável.

**Etapa 7 — Homologação com números reais** (≈ 1 dia)

- Feita por você, com o agente ajudando a ler logs. Base de homologação com 5 a 10 números de pessoas conhecidas (Android, iPhone e WhatsApp Web), `TEST_ALLOWLIST` com esses números, jitter reduzido para 30–60 s só nesta etapa.
- Executar manualmente TC-03, TC-04, TC-06 e TC-15 (seção 12) e conferir a renderização de botões e da imagem do voucher (código legível, nome com acento) em cada aparelho. Decidir `USE_BUTTONS` com base no resultado.
- Aceite: todos os TCs manuais aprovados; nenhum duplicado; decisão sobre botões registrada.

**Etapa 8 — Go-live gradual** (≈ 1 semana de campanha)

- Dia 1: lote piloto de 40 clientes mais engajados; acompanhar painel de hora em hora. Critério para continuar: opt-out < 5% e nenhuma restrição no número.
- Dias 2 a 4: rampa 60 → 80 → 100.
- Encerramento: convites novos param em D-4 (RF23) e o lembrete sai em D-2 (RF22), antes de `{{data_limite}}`; manter o webhook ativo até o fim da validade; rodar `report`; rodar `purge` em até 30 dias.

## 12. Testes, go-live e runbook

O plano passa de 6 para 18 casos de teste (TC-16 a TC-18 cobrem as regras da campanha LIVE!); os 6 originais foram mantidos e tornados mensuráveis.

### 12.1 Casos de teste

| ID | Cenário | Ação | Resultado esperado | Tipo | Etapa |
| --- | --- | --- | --- | --- | --- |
| TC-01 | Spintax | Gerar 10 mensagens para o mesmo cliente | ≥ 9 textos distintos; nenhum resíduo de `{`, `}`, `{{` | Unitário | 2 |
| TC-02 | Cadência | Simular 3 envios com relógio falso | Intervalo ≥ 120 s entre cada um; digitação 3–6 s antes de cada envio | Unitário | 4 |
| TC-03 | Botão no celular | Clicar "Quero meu voucher" (Android e iOS) | Webhook lê `BTN_QUERO_VOUCHER`; voucher entregue em < 4 s | Integração + manual | 3, 7 |
| TC-04 | Resposta por texto | Responder "sim por favor" | Intenção SIM; voucher entregue | Integração + manual | 3, 7 |
| TC-05 | Anti-loop | Evento com `fromMe: true` | Descartado, nenhuma resposta | Integração | 3 |
| TC-06 | Opt-out | Responder "não quero", "pare", "SAIR" | `OPT_OUT`, R2 enviada uma vez, número em `supressao`, nenhuma mensagem depois | Integração + manual | 3, 7 |
| TC-07 | Janela de horário | Relógio às 18:31 de sexta e no domingo | Nenhum envio; próximo agendado para a abertura seguinte | Unitário | 4 |
| TC-08 | Queda no meio do envio | Matar o processo com contato em `ENVIANDO` e reiniciar | Contato vai para `VERIFICAR`; zero duplicados | Integração | 4 |
| TC-09 | Webhook repetido | Mesmo evento 3× | 1 resposta | Integração | 3 |
| TC-10 | Pedido repetido | Cliente com voucher responde "sim" de novo | R3 com o mesmo código; nenhum código novo | Integração | 3 |
| TC-11 | Resposta não entendida | "quem é?" e depois um áudio | R4 na 1ª; `AGUARDANDO_HUMANO` e alerta na 2ª | Integração | 3 |
| TC-12 | Disjuntor de falhas | Mock retorna 500 três vezes | Pausa de 30 min registrada em auditoria; alerta | Unitário | 4 |
| TC-13 | Rampa diária | Simular dia 1 com 200 contatos prontos | Exatamente 40 envios; o resto fica para o dia 2 | Unitário | 4 |
| TC-14 | Proteção de teste | `TEST_ALLOWLIST` com 2 números e fila com 50 | Só os 2 recebem; os outros 48 não são tocados | Integração | 4 |
| TC-15 | Fora de contexto | Mensagem de grupo e de número fora da base | Nenhuma resposta; número fora da base aparece no painel | Integração + manual | 3, 7 |
| TC-16 | Voucher em duas etapas | Responder SIM; depois simular falha no sendMedia | R1 chega antes; imagem 3–5 s depois com legenda; na falha, código enviado em texto e alerta | Integração + manual | 3, 7 |
| TC-17 | Lembrete D-2 | Relógio em D-2 com clientes VOUCHER\_ENVIADO (usado e não usado), ENVIADO sem resposta e OPT\_OUT | Só VOUCHER\_ENVIADO sem uso recebe R6, uma única vez | Unitário | 4 |
| TC-18 | Corte em D-4 | Relógio em D-4 com 30 clientes PRONTO; cliente antigo responde SIM | Nenhum convite novo; os 30 viram NAO\_CONTATADO; o SIM recebe voucher normalmente | Unitário | 4 |

### 12.2 Checklist de go-live

- [ ] Chave antiga da Evolution API revogada; nova chave apenas no `.env` do servidor
- [ ] `docs/lgpd.md` escrito; texto das ofertas (percentual, validade, "preço de custo") confirmado pelo lojista; oferta, layout do voucher e uso da base aprovados por escrito pela franqueadora (N10)
- [ ] Lote de vouchers gerado com percentual e `data_limite` corretos; endereço da loja em R1
- [ ] Base importada, números validados, eixos atribuídos; `preview --n 20` revisado por uma pessoa
- [ ] Todos os TCs verdes; Etapa 7 aprovada; decisão sobre `USE_BUTTONS` registrada
- [ ] Webhook configurado com token e HTTPS; `/health` verde; backup diário ativo
- [ ] Responsável pelo atendimento humano avisado e com o painel aberto
- [ ] `TEST_ALLOWLIST` esvaziada e `DRY_RUN=false` somente no momento do start

### 12.3 Runbook resumido

| Situação | O que fazer |
| --- | --- |
| Disjuntor de falhas disparou | Ver `ultimo_erro` no painel; checar `connectionState`; se `open`, retomar; se repetir no dia, deixar para o dia seguinte |
| Instância desconectou | Reconectar pelo painel da Evolution (QR code); conferir `/health`; retomar manualmente |
| Opt-out acima de 8% | Manter pausado; revisar eixo com mais opt-out no `report`; desativar o eixo ou ajustar o texto; retomar |
| Sinal de restrição/banimento | Kill switch já acionado. Não retomar no mesmo dia. Usar o número apenas para conversas normais por 48–72 h antes de qualquer novo disparo |
| Cliente reclama por outro canal | Inserir o número em `supressao` pelo painel (motivo `MANUAL`) |
| Fim da campanha | Convites param em D-4; lembrete D-2 só para quem recebeu voucher; manter webhook até a validade; `report`; `purge` em até 30 dias |

### 12.4 Recomendação para próximas campanhas

Se a loja continuar com vendas online após o fechamento, migre para a WhatsApp Cloud API oficial com templates aprovados. Ela elimina o risco de banimento por automação, tem botões estáveis e relatórios nativos de entrega. O código desta campanha foi isolado em `src/evolution/client.ts` justamente para facilitar essa troca.
