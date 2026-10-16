// Ponto de entrada do serviço:
//   GET /health (RNF04) · POST /webhook/:token (respostas, modo monitor) ·
//   painel em /painel (configuração e testes) ·
//   worker de envio, só com CAMPANHA_ATIVA=true (com DRY_RUN=true apenas simula).

import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registrarPainel } from './admin/routes.js';
import { envAtual } from './config/arquivoEnv.js';
import { caminhoBanco, caminhoTemplates, pastaVoucher } from './config/campanha.js';
import { loadEnv } from './config/env.js';
import { abrirBanco, auditar, bloquearSemResposta, garantirCampanha } from './db/repo.js';
import { limitePrazoIso } from './domain/respostas.js';
import { carregarModelos } from './domain/templates.js';
import { createEvolutionClient } from './evolution/client.js';
import { Respondedor } from './inbound/respostas.js';
import { MonitorWebhook, registrarWebhook } from './inbound/webhook.js';
import { criarLog } from './log.js';
import { WorkerEnvio } from './outbound/worker.js';

const env = loadEnv();
const log = criarLog(env.LOG_LEVEL);
const app: FastifyInstance = Fastify({ loggerInstance: log, bodyLimit: env.WEBHOOK_BODY_LIMIT_BYTES });
const parada = new AbortController();
const db = abrirBanco(caminhoBanco(env));
const campanhaId = garantirCampanha(db, {
  nome: env.LOJA_NOME,
  dataLimite: env.CAMPANHA_DATA_FIM ?? '',
  hoje: new Date().toISOString().slice(0, 10),
});
let estadoWorker = env.CAMPANHA_ATIVA ? 'iniciando' : 'desligado (CAMPANHA_ATIVA=false)';

app.get('/health', () => ({ status: 'ok', dryRun: env.DRY_RUN, worker: estadoWorker }));
app.get('/', (_req, reply) => reply.redirect('/painel'));

const caminhoEnv = resolve(process.cwd(), '.env');
const monitor = new MonitorWebhook();
const respondedor = new Respondedor({
  db,
  campanhaId,
  env: () => envAtual(caminhoEnv),
  criarEvolution: (e) => createEvolutionClient(e),
  caminhoTemplates,
  pastaVoucher,
  log,
  monitor,
});
registrarWebhook(app, { db, campanhaId, token: env.WEBHOOK_TOKEN, instancia: env.EVOLUTION_INSTANCE, log, monitor, respondedor });

// Quem não responde ao convite no prazo vai para a lista de bloqueados (verifica de hora em hora).
const verificarPrazo = () => {
  try {
    const dias = envAtual(caminhoEnv).PRAZO_RESPOSTA_DIAS;
    const n = bloquearSemResposta(db, campanhaId, limitePrazoIso(new Date(), dias));
    if (n > 0) {
      auditar(db, 'BLOQUEIO_SEM_RESPOSTA', { quantidade: n, dias }, 'SISTEMA');
      log.info({ evento: 'BLOQUEIO_SEM_RESPOSTA', quantidade: n, dias });
    }
  } catch (err) {
    log.error({ evento: 'PRAZO_ERRO', erro: String(err) });
  }
};
verificarPrazo();
const timerPrazo = setInterval(verificarPrazo, 60 * 60 * 1000);
timerPrazo.unref();

registrarPainel(app, {
  monitor,
  caminhoEnv,
  caminhoTemplates,
  pastaVoucher,
  db,
  campanhaId,
  envInicial: env,
  // No painel, falha aparece na hora (sem as repetições usadas pelo envio).
  criarEvolution: (e) => createEvolutionClient({ ...e, EVOLUTION_MAX_RETRIES: 0 }),
  sair: (codigo) => {
    log.info({ evento: 'REINICIO_PAINEL' });
    parada.abort();
    void app.close().then(() => process.exit(codigo));
  },
});

const encerrar = (sinal: string) => {
  log.info({ evento: 'ENCERRANDO', sinal });
  parada.abort();
  void app.close().then(() => process.exit(0));
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  log.info({ evento: 'PAINEL' }, `Painel: http://localhost:${env.PORT}/painel`);
} catch (err) {
  log.fatal(err);
  process.exit(1);
}

if (env.CAMPANHA_ATIVA) {
  try {
    const worker = new WorkerEnvio({
      db,
      evolution: createEvolutionClient(env),
      env,
      modelos: carregarModelos(caminhoTemplates(env)),
      campanhaId,
      log,
    });
    estadoWorker = env.DRY_RUN ? 'simulando' : 'enviando';
    const motivo = await worker.executar(parada.signal);
    estadoWorker = `parado: ${motivo}`;
  } catch (err) {
    estadoWorker = `erro: ${String(err)}`;
    log.error({ evento: 'WORKER_ERRO', erro: String(err) });
  }
}
