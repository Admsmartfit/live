// Recebimento do webhook da Evolution API (RF09, RF10, RF12, RF16).
// Registra as respostas dos clientes e os status de entrega/leitura e entrega as
// respostas ao Respondedor (voucher, bloqueio, atendimento humano — RF13–RF15),
// que roda depois do ack, uma de cada vez.

import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Banco } from '../db/repo.js';
import { classificarIntencao, type Intencao } from '../domain/intent.js';
import { mascararTelefone } from '../domain/phone.js';
import { lerEvento } from './evento.js';
import type { Respondedor } from './respostas.js';

/** Mensagens mais antigas que isso são reentregas após queda (RF10). */
export const IDADE_MAXIMA_MS = 10 * 60 * 1000;
const LIMITE_MONITOR = 50;

export interface EventoMonitor {
  quando: string;
  tipo: string;
  descricao: string;
  resultado: string;
}

/** Últimos eventos recebidos, em memória, para o painel conferir que o webhook chega. */
export class MonitorWebhook {
  total = 0;
  private lista: EventoMonitor[] = [];

  registrar(e: EventoMonitor): void {
    this.total += 1;
    this.lista.unshift(e);
    if (this.lista.length > LIMITE_MONITOR) this.lista.length = LIMITE_MONITOR;
  }

  get eventos(): readonly EventoMonitor[] {
    return this.lista;
  }
}

export interface DepsWebhook {
  db: Banco;
  campanhaId: number;
  token: string;
  instancia: string;
  log: FastifyBaseLogger;
  monitor: MonitorWebhook;
  /** Sem respondedor, só registra (modo monitor). */
  respondedor?: Respondedor;
  agora?: () => Date;
}

export type ResultadoWebhook =
  | 'RESPOSTA_CLIENTE'
  | 'RESPOSTA_FORA_DA_BASE'
  | 'REPETIDA'
  | 'ANTIGA'
  | 'PROPRIA'
  | 'GRUPO'
  | 'BROADCAST'
  | 'NEWSLETTER'
  | 'SEM_ID'
  | 'OUTRA_INSTANCIA'
  | 'STATUS'
  | 'CONEXAO'
  | 'IGNORADO';

const NOME_STATUS: Record<string, string> = {
  SERVER_ACK: 'enviada ao servidor',
  DELIVERY_ACK: 'entregue',
  READ: 'lida',
  PLAYED: 'reproduzida',
};

function tokenConfere(recebido: string, correto: string): boolean {
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(correto).digest();
  return timingSafeEqual(a, b);
}

export function processarEvento(deps: DepsWebhook, corpo: unknown, eventoRota?: string): ResultadoWebhook {
  const agora = deps.agora?.() ?? new Date();
  const e = lerEvento(corpo, eventoRota);
  const anotar = (tipo: string, descricao: string, resultado: ResultadoWebhook) => {
    deps.monitor.registrar({ quando: agora.toISOString(), tipo, descricao, resultado });
    return resultado;
  };

  if (e.instancia !== null && e.instancia !== deps.instancia) {
    return anotar(e.tipo, `Evento da instância "${e.instancia}"`, 'OUTRA_INSTANCIA');
  }

  if (e.tipo === 'CONEXAO') {
    deps.log.info({ evento: 'WEBHOOK_CONEXAO', estado: e.estado });
    return anotar('CONEXAO', `Conexão do WhatsApp: ${e.estado ?? '?'}`, 'CONEXAO');
  }

  if (e.tipo === 'STATUS') {
    const nome = NOME_STATUS[e.status ?? ''] ?? e.status ?? '?';
    if (e.id && (e.status === 'DELIVERY_ACK' || e.status === 'READ' || e.status === 'PLAYED')) {
      const quando = agora.toISOString();
      deps.db.prepare('UPDATE clientes SET entregue_em = COALESCE(entregue_em, ?) WHERE message_id = ?').run(quando, e.id);
      if (e.status !== 'DELIVERY_ACK') {
        deps.db.prepare('UPDATE clientes SET lido_em = COALESCE(lido_em, ?) WHERE message_id = ?').run(quando, e.id);
      }
    }
    return anotar('STATUS', `Mensagem ${e.deMim ? 'enviada' : 'recebida'} ${nome}`, 'STATUS');
  }

  if (e.tipo === 'OUTRO') return anotar(e.evento, 'Evento não usado pela campanha', 'IGNORADO');

  const quem = e.telefone ? mascararTelefone(e.telefone) : (e.jid ?? '?');
  if (e.deMim) return anotar('MENSAGEM', `Mensagem enviada por este WhatsApp para ${quem}`, 'PROPRIA');
  if (e.descarte) return anotar('MENSAGEM', 'Mensagem de grupo, status ou canal', e.descarte);
  if (!e.id) return anotar('MENSAGEM', 'Mensagem sem identificador', 'SEM_ID');
  if (e.timestamp !== null && agora.getTime() - e.timestamp * 1000 > IDADE_MAXIMA_MS) {
    return anotar('MENSAGEM', `Mensagem antiga de ${quem} (reentrega)`, 'ANTIGA');
  }

  const intencao: Intencao = classificarIntencao({ texto: e.texto, botaoId: e.botaoId });
  const texto = e.texto ?? `[${e.messageType ?? 'mídia'}]`;
  const id = e.id;

  let clienteId: number | null = null;
  const resultado = deps.db.transaction((): ResultadoWebhook => {
    const nova = deps.db.prepare('INSERT OR IGNORE INTO eventos_processados (message_id) VALUES (?)').run(id);
    if (nova.changes === 0) return 'REPETIDA';
    const cliente = deps.db
      .prepare(
        `SELECT id FROM clientes WHERE campanha_id = @c
           AND (telefone = @t OR telefone_alt = @t OR jid = @j) LIMIT 1`,
      )
      .get({ c: deps.campanhaId, t: e.telefone ?? '-', j: e.jid ?? '-' }) as { id: number } | undefined;
    if (cliente) {
      deps.db
        .prepare(
          "INSERT INTO mensagens (cliente_id, direcao, tipo, message_id, texto, intencao) VALUES (?, 'IN', 'RESPOSTA', ?, ?, ?)",
        )
        .run(cliente.id, id, texto, intencao);
      deps.db.prepare('UPDATE clientes SET respondido_em = COALESCE(respondido_em, ?) WHERE id = ?').run(agora.toISOString(), cliente.id);
      clienteId = cliente.id;
      return 'RESPOSTA_CLIENTE';
    }
    deps.db.prepare('INSERT INTO inbound_desconhecido (jid, texto) VALUES (?, ?)').run(e.telefone ?? e.jid ?? '?', texto);
    return 'RESPOSTA_FORA_DA_BASE';
  })();

  deps.log.info({ evento: 'WEBHOOK_RESPOSTA', telefone: quem, intencao, resultado });
  if (resultado !== 'REPETIDA' && deps.respondedor) {
    void deps.respondedor.agendar({
      telefone: e.telefone,
      jid: e.jid,
      clienteId,
      intencao,
      midia: e.texto === null && e.botaoId === null,
    });
  }
  const rotulo = resultado === 'REPETIDA' ? 'Mensagem repetida' : `Resposta de ${quem}: ${intencao}`;
  return anotar('MENSAGEM', rotulo, resultado);
}

export function registrarWebhook(app: FastifyInstance, deps: DepsWebhook): void {
  // byEvents=false → /webhook/:token; byEvents=true → a API acrescenta /<evento>.
  app.post<{ Params: { token: string; evento?: string } }>('/webhook/:token/:evento?', (req, reply) => {
    if (!tokenConfere(req.params.token, deps.token)) return reply.code(404).send();
    try {
      processarEvento(deps, req.body, req.params.evento);
    } catch (err) {
      deps.log.error({ evento: 'WEBHOOK_ERRO', erro: String(err) });
    }
    return reply.code(200).send({ ok: true });
  });
}
