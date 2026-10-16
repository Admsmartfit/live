// Único ponto do sistema que conhece o formato da Evolution API (PRD seção 10).

import { EVENTOS_WEBHOOK, LOTE_VALIDACAO } from '../config/constants.js';
import type { EvolutionEnv } from '../config/env.js';
import { EvolutionError, classificarErro } from './errors.js';
import type {
  EstadoConexao,
  MensagemEnviada,
  MensagemParaLer,
  NumeroWhatsApp,
  SendButtonsParams,
  SendMediaParams,
  SendPresenceParams,
  SendTextParams,
  SetWebhookParams,
  VersaoApi,
  WebhookAtual,
} from './types.js';

export interface EvolutionClientOptions {
  baseUrl: string;
  apiKey: string;
  instance: string;
  /** Timeout por requisição (RNF03). O `delay` do corpo é somado a ele. */
  timeoutMs?: number;
  /** Repetições extras em erro transitório (seção 8: até 3×). */
  maxRetries?: number;
  /** Atraso antes da repetição n (1-based). Padrão: 1 s, 3 s, 9 s. */
  backoffMs?: (tentativa: number) => number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Política de repetição:
 * - 'sempre': leitura e operações idempotentes; repete qualquer erro transitório.
 * - 'envio': envio de mensagem; só repete 429 e 503 (a API recusou sem processar).
 *   Timeout, falha de rede e 500/502/504 não são repetidos, pois a mensagem pode
 *   ter saído; o worker trata como ERRO e reagenda (RF08, TC-08).
 */
type Repeticao = 'sempre' | 'envio';

interface Requisicao {
  metodo: 'GET' | 'POST';
  rota: string;
  corpo?: unknown;
  repeticao: Repeticao;
  timeoutExtraMs?: number;
}

const REPETE_NO_ENVIO = new Set([429, 503]);

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function registro(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instanciaUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: (tentativa: number) => number;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: EvolutionClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.instanciaUrl = encodeURIComponent(opts.instance);
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffMs = opts.backoffMs ?? ((n) => 1000 * 3 ** (n - 1));
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? dormir;
  }

  // ---------------------------------------------------------------- leitura

  /** GET / — versão do servidor. */
  async getVersion(): Promise<VersaoApi> {
    const raw = await this.request({ metodo: 'GET', rota: '/', repeticao: 'sempre' });
    const version = registro(raw)?.version;
    return { version: typeof version === 'string' ? version : null, raw };
  }

  /** GET /instance/connectionState/{instancia} — espera `state: "open"`. */
  async connectionState(): Promise<EstadoConexao> {
    const rota = this.rotaInstancia('/instance/connectionState');
    const raw = await this.request({ metodo: 'GET', rota, repeticao: 'sempre' });
    const r = registro(raw);
    const state = registro(r?.instance)?.state ?? r?.state;
    if (typeof state !== 'string') {
      throw new EvolutionError('DESCONHECIDO', `Resposta sem "state" em GET ${rota}`, { rota, corpo: raw });
    }
    return { state, raw };
  }

  /** Lança EvolutionError CONEXAO se a instância não estiver `open` (6.2). */
  async assertConectado(): Promise<void> {
    const { state, raw } = await this.connectionState();
    if (state !== 'open') {
      throw new EvolutionError('CONEXAO', `Instância não conectada (state: ${state})`, {
        rota: this.rotaInstancia('/instance/connectionState'),
        corpo: raw,
      });
    }
  }

  /** POST /chat/whatsappNumbers/{instancia} — divide em lotes de 50 (RF03). */
  async whatsappNumbers(numbers: string[]): Promise<NumeroWhatsApp[]> {
    const rota = this.rotaInstancia('/chat/whatsappNumbers');
    const resultado: NumeroWhatsApp[] = [];
    for (let i = 0; i < numbers.length; i += LOTE_VALIDACAO) {
      const lote = numbers.slice(i, i + LOTE_VALIDACAO);
      const raw = await this.request({ metodo: 'POST', rota, corpo: { numbers: lote }, repeticao: 'sempre' });
      if (!Array.isArray(raw)) {
        throw new EvolutionError('DESCONHECIDO', `Resposta inesperada em POST ${rota}: esperado array`, {
          rota,
          corpo: raw,
        });
      }
      for (const item of raw) {
        const r = registro(item);
        if (!r) continue;
        const n: NumeroWhatsApp = {
          exists: r.exists === true,
          jid: typeof r.jid === 'string' ? r.jid : '',
          number: typeof r.number === 'string' ? r.number : '',
        };
        if (typeof r.name === 'string') n.name = r.name;
        if (typeof r.lid === 'string') n.lid = r.lid;
        resultado.push(n);
      }
    }
    return resultado;
  }

  // ---------------------------------------------------------------- escrita

  /** POST /chat/sendPresence/{instancia} — a API segura a resposta por `delay` ms. */
  async sendPresence(p: SendPresenceParams): Promise<void> {
    await this.request({
      metodo: 'POST',
      rota: this.rotaInstancia('/chat/sendPresence'),
      corpo: { number: p.number, presence: p.presence ?? 'composing', delay: p.delay },
      repeticao: 'sempre',
      timeoutExtraMs: p.delay,
    });
  }

  /** POST /message/sendText/{instancia} */
  async sendText(p: SendTextParams): Promise<MensagemEnviada> {
    const corpo: Record<string, unknown> = { number: p.number, text: p.text, linkPreview: p.linkPreview ?? false };
    if (p.delay !== undefined) corpo.delay = p.delay;
    return this.enviar('/message/sendText', corpo, p.delay);
  }

  /** POST /message/sendButtons/{instancia} (USE_BUTTONS, RF07). */
  async sendButtons(p: SendButtonsParams): Promise<MensagemEnviada> {
    const { delay, ...resto } = p;
    const corpo: Record<string, unknown> = { ...resto };
    if (delay !== undefined) corpo.delay = delay;
    return this.enviar('/message/sendButtons', corpo, delay);
  }

  /** POST /message/sendMedia/{instancia} — mídia em base64 (seção 10.2). */
  async sendMedia(p: SendMediaParams): Promise<MensagemEnviada> {
    const { delay, ...resto } = p;
    const corpo: Record<string, unknown> = { ...resto };
    if (delay !== undefined) corpo.delay = delay;
    return this.enviar('/message/sendMedia', corpo, delay);
  }

  /** POST /chat/markMessageAsRead/{instancia} (controle 11). */
  async markAsRead(mensagens: MensagemParaLer[]): Promise<void> {
    if (mensagens.length === 0) return;
    await this.request({
      metodo: 'POST',
      rota: this.rotaInstancia('/chat/markMessageAsRead'),
      corpo: { readMessages: mensagens.map((m) => ({ remoteJid: m.remoteJid, fromMe: false, id: m.id })) },
      repeticao: 'sempre',
    });
  }

  /** POST /webhook/set/{instancia} (seção 10.3). Exige HTTPS (RNF08). */
  async setWebhook(p: SetWebhookParams): Promise<unknown> {
    const rota = this.rotaInstancia('/webhook/set');
    if (!p.url.startsWith('https://')) {
      throw new EvolutionError('DESCONHECIDO', 'URL do webhook deve usar HTTPS (RNF08)', { rota });
    }
    return this.request({
      metodo: 'POST',
      rota,
      corpo: {
        webhook: {
          enabled: p.enabled ?? true,
          url: p.url,
          byEvents: p.byEvents ?? false,
          base64: p.base64 ?? false,
          events: p.events ?? [...EVENTOS_WEBHOOK],
        },
      },
      repeticao: 'sempre',
    });
  }

  /** GET /webhook/find/{instancia} — webhook configurado na instância (null se nenhum). */
  async findWebhook(): Promise<WebhookAtual | null> {
    const raw = await this.request({ metodo: 'GET', rota: this.rotaInstancia('/webhook/find'), repeticao: 'sempre' });
    const r = registro(raw);
    if (!r) return null;
    const w = registro(r.webhook) ?? r;
    const eventos = Array.isArray(w.events) ? w.events.filter((x): x is string => typeof x === 'string') : [];
    return {
      enabled: w.enabled === true,
      url: typeof w.url === 'string' && w.url !== '' ? w.url : null,
      events: eventos,
      byEvents: w.webhookByEvents === true || w.byEvents === true,
      base64: w.webhookBase64 === true || w.base64 === true,
      raw,
    };
  }

  // ---------------------------------------------------------------- interno

  private rotaInstancia(prefixo: string): string {
    return `${prefixo}/${this.instanciaUrl}`;
  }

  private async enviar(prefixo: string, corpo: unknown, delay: number | undefined): Promise<MensagemEnviada> {
    const rota = this.rotaInstancia(prefixo);
    const raw = await this.request({ metodo: 'POST', rota, corpo, repeticao: 'envio', timeoutExtraMs: delay ?? 0 });
    const key = registro(registro(raw)?.key);
    const id = key?.id;
    if (typeof id !== 'string' || id === '') {
      throw new EvolutionError('DESCONHECIDO', `Resposta sem key.id em POST ${rota}`, { rota, corpo: raw });
    }
    return { messageId: id, remoteJid: typeof key?.remoteJid === 'string' ? key.remoteJid : null, raw };
  }

  private async request(req: Requisicao): Promise<unknown> {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await this.executar(req, tentativa);
      } catch (err) {
        if (!(err instanceof EvolutionError) || tentativa > this.maxRetries || !this.podeRepetir(err, req)) {
          throw err;
        }
        await this.sleep(this.backoffMs(tentativa));
      }
    }
  }

  private podeRepetir(err: EvolutionError, req: Requisicao): boolean {
    if (!err.retentavel) return false;
    if (req.repeticao === 'sempre') return true;
    return err.status !== undefined && REPETE_NO_ENVIO.has(err.status);
  }

  private async executar(req: Requisicao, tentativa: number): Promise<unknown> {
    const { metodo, rota } = req;
    const init: RequestInit = {
      method: metodo,
      headers: { apikey: this.apiKey, accept: 'application/json', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs + (req.timeoutExtraMs ?? 0)),
    };
    if (req.corpo !== undefined) init.body = JSON.stringify(req.corpo);

    let resposta: Response;
    let corpo: unknown;
    try {
      resposta = await this.fetchFn(`${this.baseUrl}${rota}`, init);
      const texto = await resposta.text();
      corpo = texto === '' ? undefined : parseJson(texto);
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new EvolutionError(
        'TRANSITORIO',
        timeout ? `Timeout em ${metodo} ${rota}` : `Falha de rede em ${metodo} ${rota}`,
        { rota, tentativas: tentativa, cause: err },
      );
    }

    if (!resposta.ok) {
      const classe = classificarErro({ status: resposta.status, corpo });
      throw new EvolutionError(classe, `Evolution API respondeu ${resposta.status} em ${metodo} ${rota}`, {
        rota,
        status: resposta.status,
        corpo,
        tentativas: tentativa,
      });
    }
    return corpo;
  }
}

function parseJson(texto: string): unknown {
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

export function createEvolutionClient(
  env: EvolutionEnv,
  extra: Partial<Pick<EvolutionClientOptions, 'fetch' | 'sleep' | 'backoffMs'>> = {},
): EvolutionClient {
  return new EvolutionClient({
    baseUrl: env.EVOLUTION_BASE_URL,
    apiKey: env.EVOLUTION_API_KEY,
    instance: env.EVOLUTION_INSTANCE,
    timeoutMs: env.EVOLUTION_TIMEOUT_MS,
    maxRetries: env.EVOLUTION_MAX_RETRIES,
    ...extra,
  });
}
