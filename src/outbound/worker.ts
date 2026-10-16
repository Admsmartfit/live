// Worker de envio (RF08): um envio por vez, respeitando janela, trava diária,
// trava por hora e espaçamento. Com DRY_RUN=true nada é enviado nem gravado.

import { DateTime } from 'luxon';
import { configJanela } from '../config/campanha.js';
import { FUSO } from '../config/constants.js';
import type { Env } from '../config/env.js';
import {
  auditar,
  diasComEnvioAntes,
  enviadosDesde,
  enviadosNoDia,
  hashUsado,
  marcarTravados,
  proximoParaEnvio,
  registrarEnvio,
  registrarErroDoDia,
  transicionar,
  type Banco,
  type ClienteFila,
} from '../db/repo.js';
import { mascararTelefone } from '../domain/phone.js';
import { escolherVersao, formatarDataFim, gerarMensagem, hashTexto, type Modelos, type VersaoTexto } from '../domain/templates.js';
import type { EvolutionClient } from '../evolution/client.js';
import { EvolutionError } from '../evolution/errors.js';
import { limiteDoDia, verificarLimites } from './limits.js';
import { duracaoDigitacaoMs, intervaloAteProximo } from './scheduler.js';
import { diaSP, estadoJanela } from './window.js';

export interface Log {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}

export type ResultadoCiclo =
  | { tipo: 'ENVIADO' | 'SIMULADO'; clienteId: number; esperarS: number }
  | { tipo: 'FORA_JANELA' | 'LIMITE_DIA'; esperarAte: DateTime }
  | { tipo: 'LIMITE_HORA' | 'FILA_VAZIA' | 'PAUSA_FALHAS' | 'FALHA'; esperarS: number }
  | { tipo: 'PARADO'; motivo: string };

export interface DepsWorker {
  db: Banco;
  evolution: Pick<EvolutionClient, 'sendText' | 'connectionState'>;
  env: Env;
  modelos: Modelos;
  campanhaId: number;
  log: Log;
  agora?: () => DateTime;
  rng?: () => number;
}

export class WorkerEnvio {
  private readonly agora: () => DateTime;
  private readonly rng: () => number;
  private readonly dataFim: string;
  private falhasSeguidas = 0;
  // Simulação (DRY_RUN): controle em memória, o banco não é alterado.
  private readonly simulados: number[] = [];
  private readonly simuladosEm: DateTime[] = [];

  constructor(private readonly d: DepsWorker) {
    this.agora = d.agora ?? (() => DateTime.now().setZone(FUSO));
    this.rng = d.rng ?? Math.random;
    if (!d.env.CAMPANHA_DATA_FIM) throw new Error('Defina CAMPANHA_DATA_FIM (AAAA-MM-DD) no .env antes de enviar.');
    this.dataFim = formatarDataFim(d.env.CAMPANHA_DATA_FIM);
  }

  private get simulacao(): boolean {
    return this.d.env.DRY_RUN;
  }

  /** Limite de hoje (rampa + DAILY_LIMIT) e quantos já foram. */
  situacaoDoDia(agora = this.agora()): { dia: string; enviados: number; limite: number; diaDaCampanha: number } {
    const dia = diaSP(agora);
    const diaDaCampanha = diasComEnvioAntes(this.d.db, dia) + 1;
    const limite = limiteDoDia(diaDaCampanha, this.d.env.DAILY_RAMP, this.d.env.DAILY_LIMIT);
    const enviados = this.simulacao
      ? this.simuladosEm.filter((t) => diaSP(t) === dia).length
      : enviadosNoDia(this.d.db, dia);
    return { dia, enviados, limite, diaDaCampanha };
  }

  async ciclo(): Promise<ResultadoCiclo> {
    const { env, db, log } = this.d;
    const agora = this.agora();
    const janela = estadoJanela(agora, configJanela(env));
    if (!janela.aberta || !janela.fim) {
      if (!janela.proximaAbertura) return { tipo: 'PARADO', motivo: 'Nenhuma janela de envio configurada' };
      return { tipo: 'FORA_JANELA', esperarAte: janela.proximaAbertura.plus({ seconds: Math.round(this.rng() * 300) }) };
    }

    const { enviados, limite } = this.situacaoDoDia(agora);
    const umaHoraAtras = agora.minus({ hours: 1 });
    const ultimaHora = this.simulacao
      ? this.simuladosEm.filter((t) => t > umaHoraAtras).length
      : enviadosDesde(db, umaHoraAtras.toUTC().toISO() ?? '');
    const bloqueio = verificarLimites({
      enviadosHoje: enviados,
      limiteHoje: limite,
      enviadosUltimaHora: ultimaHora,
      limiteHora: env.HOURLY_CAP,
    });
    if (bloqueio === 'LIMITE_DIA') {
      const amanha = estadoJanela(agora.endOf('day').plus({ seconds: 1 }), configJanela(env)).proximaAbertura;
      if (!amanha) return { tipo: 'PARADO', motivo: 'Sem próxima janela' };
      return { tipo: 'LIMITE_DIA', esperarAte: amanha.plus({ seconds: Math.round(this.rng() * 300) }) };
    }
    if (bloqueio === 'LIMITE_HORA') return { tipo: 'LIMITE_HORA', esperarS: 600 };

    const cliente = proximoParaEnvio(db, {
      campanhaId: this.d.campanhaId,
      agoraIso: agora.toUTC().toISO() ?? '',
      maxTentativas: env.MAX_ATTEMPTS,
      allowlist: env.TEST_ALLOWLIST,
      excluirIds: this.simulacao ? this.simulados : [],
    });
    if (!cliente) return { tipo: 'FILA_VAZIA', esperarS: 3600 };

    let montado: { texto: string; versao: VersaoTexto; hash: string };
    try {
      montado = this.montarTexto(cliente);
    } catch (err) {
      return { tipo: 'PARADO', motivo: `Falha ao montar a mensagem: ${String(err)}` };
    }
    const { texto, versao, hash } = montado;
    const esperarS = intervaloAteProximo({
      agora,
      fimJanela: janela.fim,
      restantesHoje: limite - enviados - 1,
      minimoS: env.JITTER_MIN_S,
      rng: this.rng,
    });
    const tel = mascararTelefone(cliente.telefone);

    if (this.simulacao) {
      this.simulados.push(cliente.id);
      this.simuladosEm.push(agora);
      log.info({ evento: 'SIMULADO', telefone: tel, versao, proximoEmS: esperarS }, `[SIMULAÇÃO] ${cliente.primeiro_nome}`);
      log.debug({ evento: 'SIMULADO_TEXTO', texto });
      return { tipo: 'SIMULADO', clienteId: cliente.id, esperarS };
    }

    const inicio = Date.now();
    transicionar(db, cliente.id, 'ENVIANDO');
    try {
      const digitando = duracaoDigitacaoMs(texto, {
        charsPorS: env.TYPING_CHARS_PER_S,
        minMs: env.TYPING_MIN_MS,
        maxMs: env.TYPING_MAX_MS,
      });
      const r = await this.d.evolution.sendText({ number: cliente.telefone, text: texto, delay: digitando, linkPreview: false });
      const agoraEnvio = this.agora();
      registrarEnvio(db, {
        clienteId: cliente.id,
        messageId: r.messageId,
        texto,
        hash,
        versao,
        agoraIso: agoraEnvio.toUTC().toISO() ?? '',
        dia: diaSP(agoraEnvio),
      });
      this.falhasSeguidas = 0;
      log.info({ evento: 'ENVIADO', telefone: tel, versao, message_id: r.messageId, latencia_ms: Date.now() - inicio, proximoEmS: esperarS });
      return { tipo: 'ENVIADO', clienteId: cliente.id, esperarS };
    } catch (err) {
      return this.tratarFalha(cliente, err, agora);
    }
  }

  private montarTexto(c: ClienteFila): { texto: string; versao: VersaoTexto; hash: string } {
    const versao = escolherVersao(c.segmento, c.vendedora, this.rng);
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      const texto = gerarMensagem(
        this.d.modelos,
        { nome: c.primeiro_nome, vendedora: c.vendedora, loja: this.d.env.LOJA_NOME, dataFim: this.dataFim },
        versao,
        this.rng,
      );
      const hash = hashTexto(texto);
      if (!hashUsado(this.d.db, this.d.campanhaId, hash)) return { texto, versao, hash };
    }
    throw new Error('Não foi possível gerar um texto inédito em 10 tentativas');
  }

  private tratarFalha(c: ClienteFila, err: unknown, agora: DateTime): ResultadoCiclo {
    const { db, env, log } = this.d;
    const tel = mascararTelefone(c.telefone);
    registrarErroDoDia(db, diaSP(agora));

    if (!(err instanceof EvolutionError)) {
      transicionar(db, c.id, 'VERIFICAR', { ultimo_erro: String(err) });
      log.error({ evento: 'ERRO_INTERNO', telefone: tel, erro: String(err) });
      return { tipo: 'PARADO', motivo: `Erro interno: ${String(err)}` };
    }

    const erro = `${err.classe}: ${err.message}`;
    log.warn({ evento: 'FALHA_ENVIO', telefone: tel, classe: err.classe, status: err.status }, err.message);

    if (err.classe === 'NUMERO') {
      transicionar(db, c.id, 'SEM_WHATSAPP', { ultimo_erro: erro });
      return { tipo: 'FALHA', esperarS: 30 };
    }
    if (err.classe === 'AUTENTICACAO' || err.classe === 'CONEXAO') {
      // A API recusou antes de enviar: o cliente volta para a fila sem gastar tentativa.
      transicionar(db, c.id, 'ERRO', { ultimo_erro: erro, proxima_tentativa: null });
      auditar(db, 'KILL_SWITCH', { classe: err.classe, status: err.status }, 'SISTEMA');
      return { tipo: 'PARADO', motivo: `${err.classe}: envio interrompido. Verifique a instância e reinicie manualmente.` };
    }
    if (err.classe === 'TRANSITORIO' && err.status === undefined) {
      // Timeout ou queda de rede: a mensagem pode ter saído. Nunca reenviar automaticamente.
      transicionar(db, c.id, 'VERIFICAR', { ultimo_erro: erro });
    } else {
      const tentativas = c.tentativas + 1;
      const proxima = agora.plus({ minutes: env.RETRY_AFTER_MIN }).toUTC().toISO() ?? null;
      transicionar(db, c.id, 'ERRO', { tentativas, proxima_tentativa: proxima, ultimo_erro: erro });
      if (tentativas >= env.MAX_ATTEMPTS) transicionar(db, c.id, 'ESGOTADO');
    }

    this.falhasSeguidas++;
    if (this.falhasSeguidas >= env.BREAKER_CONSECUTIVE_FAILURES) {
      this.falhasSeguidas = 0;
      auditar(db, 'PAUSA_AUTO', { motivo: 'falhas consecutivas' }, 'SISTEMA');
      return { tipo: 'PAUSA_FALHAS', esperarS: env.BREAKER_CONSECUTIVE_PAUSE_MIN * 60 };
    }
    return { tipo: 'FALHA', esperarS: env.JITTER_MIN_S };
  }

  /** Loop até ser abortado ou parar por segurança. */
  async executar(sinal: AbortSignal, dormir: (ms: number, sinal: AbortSignal) => Promise<void> = dormirAbortavel): Promise<string> {
    const { db, log, evolution } = this.d;
    const travados = marcarTravados(db, this.agora().minus({ minutes: 5 }).toUTC().toISO() ?? '');
    if (travados > 0) log.warn({ evento: 'VERIFICAR', quantidade: travados }, 'Envios interrompidos marcados para revisão manual');

    if (!this.simulacao) {
      const { state } = await evolution.connectionState();
      if (state !== 'open') return `Instância não conectada (state: ${state}). Envio não iniciado.`;
    }
    log.info({ evento: 'WORKER_INICIADO', simulacao: this.simulacao, allowlist: this.d.env.TEST_ALLOWLIST.length, ...this.situacaoDoDia() });

    while (!sinal.aborted) {
      const r = await this.ciclo();
      if (r.tipo === 'PARADO') {
        log.error({ evento: 'WORKER_PARADO' }, r.motivo);
        return r.motivo;
      }
      const esperaMs = 'esperarAte' in r ? Math.max(0, r.esperarAte.diff(this.agora()).as('milliseconds')) : r.esperarS * 1000;
      if (r.tipo !== 'ENVIADO' && r.tipo !== 'SIMULADO') {
        log.info({ evento: r.tipo, retomaEm: this.agora().plus({ milliseconds: esperaMs }).toFormat('dd/MM HH:mm') });
      }
      await dormir(esperaMs, sinal);
    }
    return 'Encerrado';
  }
}

export function dormirAbortavel(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (sinal.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(fim, ms);
    function fim() {
      clearTimeout(t);
      sinal.removeEventListener('abort', fim);
      resolve();
    }
    sinal.addEventListener('abort', fim, { once: true });
  });
}
