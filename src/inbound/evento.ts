// Leitura tolerante dos eventos do webhook da Evolution API (PRD 10.4). Funções puras.

import { normalizarTelefone } from '../domain/phone.js';

export type Descarte = 'GRUPO' | 'BROADCAST' | 'NEWSLETTER';

export type EventoLido =
  | {
      tipo: 'MENSAGEM';
      instancia: string | null;
      id: string | null;
      jid: string | null;
      telefone: string | null;
      deMim: boolean;
      descarte: Descarte | null;
      /** Segundos desde 1970 (messageTimestamp). */
      timestamp: number | null;
      messageType: string | null;
      texto: string | null;
      botaoId: string | null;
    }
  | { tipo: 'STATUS'; instancia: string | null; id: string | null; status: string | null; deMim: boolean }
  | { tipo: 'CONEXAO'; instancia: string | null; estado: string | null }
  | { tipo: 'OUTRO'; instancia: string | null; evento: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined;
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** "messages.upsert" | "messages-upsert" | "MESSAGES_UPSERT" → "MESSAGES_UPSERT". */
export function nomeEventoPadrao(bruto: unknown): string {
  if (typeof bruto !== 'string' || bruto.trim() === '') return 'DESCONHECIDO';
  return bruto.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/** "5527999887766@s.whatsapp.net" ou "552799887766:12@s.whatsapp.net" → "5527999887766". */
export function telefoneDoJid(jid: string | null): string | null {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
  const digitos = (jid.split('@')[0] ?? '').split(':')[0] ?? '';
  if (!/^55\d{10,11}$/.test(digitos)) return null;
  const r = normalizarTelefone(digitos.slice(2));
  return r.ok ? r.telefone : null;
}

function descarteDoJid(jid: string | null): Descarte | null {
  if (!jid) return null;
  if (jid.endsWith('@g.us')) return 'GRUPO';
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) return 'BROADCAST';
  if (jid.endsWith('@newsletter')) return 'NEWSLETTER';
  return null;
}

function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  const low = obj(v)?.low;
  return typeof low === 'number' ? low >>> 0 : null;
}

function lerMensagem(instancia: string | null, d: Obj): EventoLido {
  const key = obj(d.key) ?? {};
  const jid = txt(key.remoteJid);
  const m = obj(d.message) ?? {};
  const botoes = obj(m.buttonsResponseMessage);
  const modelo = obj(m.templateButtonReplyMessage);
  const lista = obj(m.listResponseMessage);
  const texto =
    txt(m.conversation) ??
    txt(obj(m.extendedTextMessage)?.text) ??
    txt(botoes?.selectedDisplayText) ??
    txt(modelo?.selectedDisplayText) ??
    txt(lista?.title) ??
    txt(obj(m.imageMessage)?.caption) ??
    txt(obj(m.videoMessage)?.caption);
  // @lid: o telefone real vem em remoteJidAlt / senderPn.
  const telefone = telefoneDoJid(jid) ?? telefoneDoJid(txt(key.remoteJidAlt)) ?? telefoneDoJid(txt(key.senderPn));
  return {
    tipo: 'MENSAGEM',
    instancia,
    id: txt(key.id),
    jid,
    telefone,
    deMim: key.fromMe === true,
    descarte: descarteDoJid(jid),
    timestamp: numero(d.messageTimestamp),
    messageType: txt(d.messageType),
    texto,
    botaoId: txt(botoes?.selectedButtonId) ?? txt(modelo?.selectedId),
  };
}

export function lerEvento(corpo: unknown, eventoRota?: string): EventoLido {
  const c = obj(corpo) ?? {};
  const instancia = txt(c.instance);
  const evento = nomeEventoPadrao(c.event ?? eventoRota);
  const dados: unknown = Array.isArray(c.data) ? (c.data as unknown[])[0] : c.data;
  const d = obj(dados) ?? {};
  switch (evento) {
    case 'MESSAGES_UPSERT':
      return lerMensagem(instancia, d);
    case 'MESSAGES_UPDATE': {
      const key = obj(d.key);
      return {
        tipo: 'STATUS',
        instancia,
        id: txt(d.keyId) ?? txt(key?.id) ?? txt(d.messageId),
        status: txt(d.status),
        deMim: (d.fromMe ?? key?.fromMe) === true,
      };
    }
    case 'CONNECTION_UPDATE':
      return { tipo: 'CONEXAO', instancia, estado: txt(d.state) };
    default:
      return { tipo: 'OUTRO', instancia, evento };
  }
}
