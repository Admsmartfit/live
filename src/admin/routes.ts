// Frontdesk / painel de operação (RF18): visão geral, configuração da Evolution API
// e da campanha, teste de mensagens e fila. Toda rota /painel/api/* (exceto login e
// sessão) exige login.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { configJanela } from '../config/campanha.js';
import { envAtual, gravarArquivoEnv, lerArquivoEnv } from '../config/arquivoEnv.js';
import { FUSO } from '../config/constants.js';
import { EnvError, envSchema, parseEnv, type Env } from '../config/env.js';
import { auditar, contagem, diasComEnvioAntes, enviadosNoDia, listarFila, type Banco } from '../db/repo.js';
import { mascararTelefone, normalizarTelefone } from '../domain/phone.js';
import { carregarModelos, formatarDataFim, gerarMensagem, MensagemInvalida, validarMensagem } from '../domain/templates.js';
import type { EvolutionClient } from '../evolution/client.js';
import { EvolutionError } from '../evolution/errors.js';
import { limiteDoDia } from '../outbound/limits.js';
import { duracaoDigitacaoMs } from '../outbound/scheduler.js';
import { diaSP, estadoJanela } from '../outbound/window.js';
import { cookieSair, cookieSessao, COOKIE, lerCookie, senhaConfere, Sessoes } from './auth.js';
import { PAGINA_PAINEL } from './pagina.js';

export type ClientePainel = Pick<EvolutionClient, 'getVersion' | 'connectionState' | 'sendText' | 'setWebhook'>;

export interface DepsPainel {
  caminhoEnv: string;
  caminhoTemplates: (env: Env) => string;
  db: Banco;
  campanhaId: number;
  /** Configuração com que o processo iniciou (para avisar quando falta reiniciar). */
  envInicial: Env;
  criarEvolution: (env: Env) => ClientePainel;
  /** Encerra o processo (o serviço do Windows reinicia sozinho). */
  sair: (codigo: number) => void;
  sessoes?: Sessoes;
  agora?: () => DateTime;
}

/** Chaves do .env que o painel pode alterar. */
export const CHAVES_EDITAVEIS = [
  'EVOLUTION_BASE_URL',
  'EVOLUTION_INSTANCE',
  'EVOLUTION_API_KEY',
  'PUBLIC_BASE_URL',
  'LOJA_NOME',
  'CAMPANHA_DATA_FIM',
  'DAILY_LIMIT',
  'DAILY_RAMP',
  'HOURLY_CAP',
  'WINDOW_WEEKDAY_START',
  'WINDOW_WEEKDAY_END',
  'WINDOW_SATURDAY_START',
  'WINDOW_SATURDAY_END',
  'WINDOW_SUNDAY',
  'DRY_RUN',
  'CAMPANHA_ATIVA',
  'TEST_ALLOWLIST',
] as const;
type ChaveEditavel = (typeof CHAVES_EDITAVEIS)[number];

/** Chaves que o serviço só lê ao iniciar. */
const CHAVES_DO_ENVIO: readonly (keyof Env)[] = [
  'EVOLUTION_BASE_URL',
  'EVOLUTION_INSTANCE',
  'EVOLUTION_API_KEY',
  'LOJA_NOME',
  'CAMPANHA_DATA_FIM',
  'DAILY_LIMIT',
  'DAILY_RAMP',
  'HOURLY_CAP',
  'WINDOW_WEEKDAY_START',
  'WINDOW_WEEKDAY_END',
  'WINDOW_SATURDAY_START',
  'WINDOW_SATURDAY_END',
  'WINDOW_SUNDAY',
  'DRY_RUN',
  'CAMPANHA_ATIVA',
  'TEST_ALLOWLIST',
];

const Login = z.object({ senha: z.string().max(200) });
const TestarConexao = z.object({
  baseUrl: z.string().max(300).optional(),
  instancia: z.string().max(200).optional(),
  apiKey: z.string().max(500).optional(),
});
const SalvarConfig = z.object({
  valores: z.partialRecord(z.enum(CHAVES_EDITAVEIS), z.string().max(2000)),
});
const Previa = z.object({
  nome: z.string().max(60).default('Teste'),
  vendedora: z.string().max(60).optional(),
  versao: z.enum(['B1', 'B2', 'C1', 'C2']).default('C1'),
});
const Enviar = z.object({ numero: z.string().max(40), texto: z.string().min(1).max(4000) });
const Fila = z.object({ n: z.coerce.number().int().min(1).max(200).default(30) });

function falhaEvolution(reply: FastifyReply, err: unknown) {
  if (err instanceof EvolutionError) {
    const dica =
      err.classe === 'AUTENTICACAO'
        ? 'Token recusado: confira a API Key da instância.'
        : err.classe === 'CONEXAO'
          ? 'Instância não encontrada ou desconectada: confira o nome e se está "Connected" no manager.'
          : err.classe === 'TRANSITORIO'
            ? 'Servidor não respondeu: confira o endereço e a internet.'
            : 'Erro da Evolution API.';
    return reply.code(502).send({ ok: false, classe: err.classe, erro: err.message, dica });
  }
  return reply.code(500).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
}

function reinicioPendente(inicial: Env, atual: Env): boolean {
  return CHAVES_DO_ENVIO.some((k) => JSON.stringify(inicial[k]) !== JSON.stringify(atual[k]));
}

export function registrarPainel(app: FastifyInstance, deps: DepsPainel): void {
  const sessoes = deps.sessoes ?? new Sessoes();
  const env = () => envAtual(deps.caminhoEnv);
  const agora = deps.agora ?? (() => DateTime.now().setZone(FUSO));
  const logado = (req: FastifyRequest) => sessoes.valida(lerCookie(req.headers.cookie, COOKIE));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ ok: false, erro: 'Dados inválidos no formulário.' });
    return reply.send(err);
  });

  app.get('/painel', (_req, reply) =>
    reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(PAGINA_PAINEL),
  );

  app.addHook('onRequest', async (req, reply) => {
    const rota = req.url.split('?')[0] ?? '';
    if (!rota.startsWith('/painel/api/') || rota === '/painel/api/login' || rota === '/painel/api/sessao') return;
    if (!logado(req)) await reply.code(401).send({ ok: false, erro: 'Sessão expirada. Entre de novo.' });
  });

  app.get('/painel/api/sessao', (req) => ({ logado: logado(req) }));

  app.post('/painel/api/login', (req, reply) => {
    if (!sessoes.podeTentar(req.ip)) return reply.code(429).send({ ok: false, erro: 'Muitas tentativas. Aguarde 1 minuto.' });
    const { senha } = Login.parse(req.body);
    if (!senhaConfere(senha, env().ADMIN_PASSWORD)) return reply.code(401).send({ ok: false, erro: 'Senha incorreta.' });
    return reply.header('set-cookie', cookieSessao(sessoes.criar(), req.protocol === 'https')).send({ ok: true });
  });

  app.post('/painel/api/sair', (_req, reply) => reply.header('set-cookie', cookieSair()).send({ ok: true }));

  // ------------------------------------------------------------ visão geral

  app.get('/painel/api/resumo', () => {
    const e = env();
    const a = agora();
    const dia = diaSP(a);
    const diaDaCampanha = diasComEnvioAntes(deps.db, dia) + 1;
    const janela = estadoJanela(a, configJanela(e));
    const testes = deps.db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE evento = 'TESTE_ENVIO'").get() as { n: number };
    const status = contagem(deps.db, deps.campanhaId, 'status');
    const total = Object.values(status).reduce((s, n) => s + n, 0);
    const diasRestantes = e.CAMPANHA_DATA_FIM
      ? Math.ceil(DateTime.fromISO(e.CAMPANHA_DATA_FIM, { zone: FUSO }).endOf('day').diff(a, 'days').days)
      : null;
    return {
      hoje: {
        dia,
        enviados: enviadosNoDia(deps.db, dia),
        limite: limiteDoDia(diaDaCampanha, e.DAILY_RAMP, e.DAILY_LIMIT),
        diaDaCampanha,
      },
      janela: {
        aberta: janela.aberta,
        fecha: janela.fim?.toFormat('HH:mm') ?? null,
        abre: janela.proximaAbertura?.setLocale('pt-BR').toFormat("ccc dd/MM 'às' HH:mm") ?? null,
      },
      base: { total, status, regiao: contagem(deps.db, deps.campanhaId, 'regiao') },
      campanha: {
        ativa: e.CAMPANHA_ATIVA,
        simulacao: e.DRY_RUN,
        dataFim: e.CAMPANHA_DATA_FIM ?? null,
        diasRestantes,
        allowlist: e.TEST_ALLOWLIST.length,
      },
      testesEnviados: testes.n,
      webhookInformado: Boolean(e.PUBLIC_BASE_URL),
      reinicioPendente: reinicioPendente(deps.envInicial, e),
    };
  });

  app.get('/painel/api/fila', (req) => {
    const { n } = Fila.parse(req.query);
    const e = env();
    const fila = listarFila(
      deps.db,
      {
        campanhaId: deps.campanhaId,
        agoraIso: new Date().toISOString(),
        maxTentativas: e.MAX_ATTEMPTS,
        allowlist: e.TEST_ALLOWLIST,
        incluirNaoValidados: true,
      },
      n,
    );
    return {
      somenteTeste: e.TEST_ALLOWLIST.length > 0,
      itens: fila.map((c, i) => ({
        ordem: i + 1,
        nome: c.nome_completo,
        telefone: mascararTelefone(c.telefone),
        segmento: c.segmento,
        regiao: c.regiao,
        vendedora: c.vendedora,
        status: c.status,
      })),
    };
  });

  // ------------------------------------------------------------ configuração

  app.get('/painel/api/config', () => {
    const e = env();
    const chave = e.EVOLUTION_API_KEY;
    return {
      evolution: {
        baseUrl: e.EVOLUTION_BASE_URL,
        instancia: e.EVOLUTION_INSTANCE,
        chaveFinal: chave.length > 4 ? `••••${chave.slice(-4)}` : '••••',
      },
      webhook: {
        publicBaseUrl: e.PUBLIC_BASE_URL ?? '',
        caminho: `/webhook/${e.WEBHOOK_TOKEN}`,
        url: e.PUBLIC_BASE_URL ? `${e.PUBLIC_BASE_URL}/webhook/${e.WEBHOOK_TOKEN}` : null,
        porta: e.PORT,
      },
      campanha: {
        loja: e.LOJA_NOME,
        dataFim: e.CAMPANHA_DATA_FIM ?? '',
        dailyLimit: e.DAILY_LIMIT,
        dailyRamp: e.DAILY_RAMP.join(','),
        hourlyCap: e.HOURLY_CAP,
        semana: [e.WINDOW_WEEKDAY_START, e.WINDOW_WEEKDAY_END],
        sabado: [e.WINDOW_SATURDAY_START, e.WINDOW_SATURDAY_END],
        domingo: e.WINDOW_SUNDAY,
        allowlist: e.TEST_ALLOWLIST,
        dryRun: e.DRY_RUN,
        ativa: e.CAMPANHA_ATIVA,
      },
      reinicioPendente: reinicioPendente(deps.envInicial, e),
    };
  });

  app.post('/painel/api/config/testar', async (req, reply) => {
    const b = TestarConexao.parse(req.body ?? {});
    const atual = env();
    let e: Env;
    try {
      e = parseEnv(envSchema, {
        ...process.env,
        ...lerArquivoEnv(deps.caminhoEnv),
        ...(b.baseUrl ? { EVOLUTION_BASE_URL: b.baseUrl } : {}),
        ...(b.instancia ? { EVOLUTION_INSTANCE: b.instancia } : {}),
        EVOLUTION_API_KEY: b.apiKey?.trim() ? b.apiKey.trim() : atual.EVOLUTION_API_KEY,
      });
    } catch (err) {
      if (err instanceof EnvError) return reply.code(400).send({ ok: false, erro: err.problemas.join('; ') });
      throw err;
    }
    try {
      const cliente = deps.criarEvolution(e);
      const { version } = await cliente.getVersion();
      const { state } = await cliente.connectionState();
      return {
        ok: true,
        versao: version,
        estado: state,
        conectado: state === 'open',
        aviso: state === 'open' ? null : 'A instância existe, mas não está conectada. Leia o QR Code no manager.',
      };
    } catch (err) {
      return falhaEvolution(reply, err);
    }
  });

  app.post('/painel/api/config', (req, reply) => {
    const { valores } = SalvarConfig.parse(req.body);
    const novos: Partial<Record<ChaveEditavel, string>> = {};
    for (const [k, v] of Object.entries(valores) as [ChaveEditavel, string][]) {
      // Token vazio = manter o atual.
      if (k === 'EVOLUTION_API_KEY' && !v.trim()) continue;
      novos[k] = v.trim();
    }
    try {
      parseEnv(envSchema, { ...process.env, ...lerArquivoEnv(deps.caminhoEnv), ...novos });
    } catch (err) {
      if (err instanceof EnvError) return reply.code(400).send({ ok: false, erro: err.problemas.join('; ') });
      throw err;
    }
    gravarArquivoEnv(deps.caminhoEnv, novos);
    auditar(deps.db, 'CONFIG', { chaves: Object.keys(novos) }, 'PAINEL');
    const pendente = reinicioPendente(deps.envInicial, env());
    return {
      ok: true,
      reinicioPendente: pendente,
      aviso: pendente ? 'Salvo. Reinicie o serviço para o envio da campanha usar a nova configuração.' : 'Salvo.',
    };
  });

  app.post('/painel/api/reiniciar', (_req, reply) => {
    auditar(deps.db, 'REINICIO', {}, 'PAINEL');
    void reply.send({ ok: true });
    setTimeout(() => {
      deps.sair(3);
    }, 500);
    return reply;
  });

  app.post('/painel/api/webhook/registrar', async (_req, reply) => {
    const e = env();
    if (!e.PUBLIC_BASE_URL) {
      return reply.code(400).send({ ok: false, erro: 'Informe e salve o endereço público (https://…) antes de registrar.' });
    }
    try {
      await deps.criarEvolution(e).setWebhook({ url: `${e.PUBLIC_BASE_URL}/webhook/${e.WEBHOOK_TOKEN}` });
      auditar(deps.db, 'WEBHOOK', { url: e.PUBLIC_BASE_URL }, 'PAINEL');
      return { ok: true };
    } catch (err) {
      return falhaEvolution(reply, err);
    }
  });

  // ------------------------------------------------------------ teste de mensagens

  app.post('/painel/api/teste/previa', (req, reply) => {
    const b = Previa.parse(req.body ?? {});
    const e = env();
    if (!e.CAMPANHA_DATA_FIM) {
      return reply.code(400).send({ ok: false, erro: 'Preencha e salve o último dia da campanha em Campanha.' });
    }
    const vendedora = b.vendedora?.trim() || null;
    if (b.versao.startsWith('B') && !vendedora) {
      return reply.code(400).send({ ok: false, erro: 'Os modelos B falam em nome da vendedora: preencha o nome dela.' });
    }
    const texto = gerarMensagem(
      carregarModelos(deps.caminhoTemplates(e)),
      { nome: b.nome.trim() || 'Teste', vendedora, loja: e.LOJA_NOME, dataFim: formatarDataFim(e.CAMPANHA_DATA_FIM) },
      b.versao,
    );
    return { ok: true, texto };
  });

  app.post('/painel/api/teste/enviar', async (req, reply) => {
    const b = Enviar.parse(req.body);
    const tel = normalizarTelefone(b.numero);
    if (!tel.ok) return reply.code(400).send({ ok: false, erro: 'Número inválido. Use DDD + número, por exemplo 27999887766.' });
    try {
      validarMensagem(b.texto);
    } catch (err) {
      if (err instanceof MensagemInvalida) return reply.code(400).send({ ok: false, erro: err.message });
      throw err;
    }

    let e = env();
    // Todo número de teste entra na lista de teste: com a lista preenchida,
    // a campanha só envia para esses números.
    let adicionado = false;
    if (!e.TEST_ALLOWLIST.includes(tel.telefone)) {
      gravarArquivoEnv(deps.caminhoEnv, { TEST_ALLOWLIST: [...e.TEST_ALLOWLIST, tel.telefone].join(',') });
      e = env();
      adicionado = true;
    }

    try {
      const cliente = deps.criarEvolution(e);
      const { state } = await cliente.connectionState();
      if (state !== 'open') {
        return await reply.code(409).send({ ok: false, erro: `Instância não conectada (state: ${state}). Leia o QR Code no manager.` });
      }
      const delay = duracaoDigitacaoMs(b.texto, { charsPorS: e.TYPING_CHARS_PER_S, minMs: e.TYPING_MIN_MS, maxMs: e.TYPING_MAX_MS });
      const r = await cliente.sendText({ number: tel.telefone, text: b.texto, delay, linkPreview: false });
      deps.db
        .prepare("INSERT INTO mensagens (direcao, tipo, message_id, texto) VALUES ('OUT', 'TESTE', ?, ?)")
        .run(r.messageId, b.texto);
      auditar(deps.db, 'TESTE_ENVIO', { telefone: mascararTelefone(tel.telefone), message_id: r.messageId }, 'PAINEL');
      return { ok: true, messageId: r.messageId, telefone: tel.telefone, adicionadoNaLista: adicionado };
    } catch (err) {
      return falhaEvolution(reply, err);
    }
  });

  app.get('/painel/api/teste/historico', () => {
    const linhas = deps.db
      .prepare("SELECT detalhe, criado_em FROM auditoria WHERE evento = 'TESTE_ENVIO' ORDER BY id DESC LIMIT 20")
      .all() as { detalhe: string; criado_em: string }[];
    return linhas.map((l) => ({
      ...(JSON.parse(l.detalhe) as Record<string, string>),
      quando: `${l.criado_em.replace(' ', 'T')}Z`,
    }));
  });
}
