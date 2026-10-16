// Tipos dos contratos da Evolution API v2 (PRD seção 10). Respostas são
// tipadas de forma tolerante: a Etapa 0 confirma o formato real em
// docs/contratos-evolution.md.

export type EstadoInstancia = 'open' | 'close' | 'connecting' | (string & {});

export interface VersaoApi {
  version: string | null;
  raw: unknown;
}

export interface EstadoConexao {
  state: EstadoInstancia;
  raw: unknown;
}

export interface NumeroWhatsApp {
  exists: boolean;
  jid: string;
  number: string;
  name?: string;
  lid?: string;
}

export interface MensagemEnviada {
  messageId: string;
  remoteJid: string | null;
  raw: unknown;
}

export interface SendPresenceParams {
  number: string;
  /** Duração do "digitando" em ms. */
  delay: number;
  presence?: 'composing' | 'recording' | 'paused' | 'available' | 'unavailable';
}

export interface SendTextParams {
  number: string;
  text: string;
  /** Atraso aplicado pela API antes do envio, em ms. */
  delay?: number;
  linkPreview?: boolean;
}

export interface Botao {
  type: 'reply';
  displayText: string;
  id: string;
}

export interface SendButtonsParams {
  number: string;
  title: string;
  description: string;
  footer: string;
  buttons: Botao[];
  delay?: number;
}

export interface SendMediaParams {
  number: string;
  mediatype: 'image' | 'video' | 'document' | 'audio';
  mimetype: string;
  fileName: string;
  caption?: string;
  /** Base64 do arquivo (preferível a URL pública, seção 10.2). */
  media: string;
  delay?: number;
}

export interface MensagemParaLer {
  remoteJid: string;
  id: string;
}

export type EventoWebhook = 'MESSAGES_UPSERT' | 'MESSAGES_UPDATE' | 'CONNECTION_UPDATE' | (string & {});

export interface SetWebhookParams {
  url: string;
  events?: EventoWebhook[];
  enabled?: boolean;
  byEvents?: boolean;
  base64?: boolean;
}

export interface WebhookAtual {
  enabled: boolean;
  url: string | null;
  events: string[];
  byEvents: boolean;
  base64: boolean;
  raw: unknown;
}
