import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, garantirCampanha, importarClientes, type Banco } from '../../src/db/repo.js';
import { lerEvento, nomeEventoPadrao, telefoneDoJid } from '../../src/inbound/evento.js';
import { MonitorWebhook, processarEvento, registrarWebhook, type DepsWebhook } from '../../src/inbound/webhook.js';

const TOKEN = 'k'.repeat(32);
const AGORA = new Date('2026-10-16T15:00:00Z');
const TS = Math.floor(AGORA.getTime() / 1000) - 30;

function upsert(p: { id?: string; jid?: string; texto?: string; fromMe?: boolean; ts?: number; extra?: object; instance?: string }) {
  return {
    event: 'messages.upsert',
    instance: p.instance ?? 'ao vivo vv',
    data: {
      key: { remoteJid: p.jid ?? '5527988776655@s.whatsapp.net', fromMe: p.fromMe ?? false, id: p.id ?? 'IN1', ...p.extra },
      pushName: 'Fulana',
      message: p.texto === undefined ? { audioMessage: {} } : { conversation: p.texto },
      messageType: p.texto === undefined ? 'audioMessage' : 'conversation',
      messageTimestamp: p.ts ?? TS,
    },
  };
}

describe('lerEvento (PRD 10.4)', () => {
  it('padroniza o nome do evento', () => {
    expect(nomeEventoPadrao('messages.upsert')).toBe('MESSAGES_UPSERT');
    expect(nomeEventoPadrao('messages-update')).toBe('MESSAGES_UPDATE');
    expect(nomeEventoPadrao(undefined)).toBe('DESCONHECIDO');
  });

  it('extrai telefone do JID, inclusive sem o 9º dígito e com dispositivo', () => {
    expect(telefoneDoJid('5527988776655@s.whatsapp.net')).toBe('5527988776655');
    expect(telefoneDoJid('552788776655@s.whatsapp.net')).toBe('5527988776655');
    expect(telefoneDoJid('5527988776655:3@s.whatsapp.net')).toBe('5527988776655');
    expect(telefoneDoJid('123@g.us')).toBeNull();
    expect(telefoneDoJid('14155550000@s.whatsapp.net')).toBeNull();
  });

  it('lê texto, botão e @lid', () => {
    expect(lerEvento(upsert({ texto: 'Sim!' }))).toMatchObject({ tipo: 'MENSAGEM', texto: 'Sim!', telefone: '5527988776655', id: 'IN1' });
    const botao = lerEvento({
      event: 'messages.upsert',
      data: { key: { id: 'B', remoteJid: '9999@lid', remoteJidAlt: '5527988776655@s.whatsapp.net' }, message: { buttonsResponseMessage: { selectedButtonId: 'BTN_QUERO_VOUCHER', selectedDisplayText: 'Quero' } } },
    });
    expect(botao).toMatchObject({ botaoId: 'BTN_QUERO_VOUCHER', texto: 'Quero', telefone: '5527988776655' });
    expect(lerEvento(upsert({ jid: '1203@g.us', texto: 'oi' }))).toMatchObject({ descarte: 'GRUPO' });
  });

  it('lê status e conexão e tolera corpo vazio', () => {
    expect(lerEvento({ event: 'messages.update', data: { keyId: 'X', status: 'READ', fromMe: true } })).toMatchObject({ tipo: 'STATUS', id: 'X', status: 'READ', deMim: true });
    expect(lerEvento({ event: 'connection.update', data: { state: 'open' } })).toMatchObject({ tipo: 'CONEXAO', estado: 'open' });
    expect(lerEvento(null)).toMatchObject({ tipo: 'OUTRO' });
    expect(lerEvento({ data: { state: 'close' } }, 'connection-update')).toMatchObject({ tipo: 'CONEXAO', estado: 'close' });
  });
});

describe('webhook (modo monitor)', () => {
  let db: Banco;
  let deps: DepsWebhook;
  let campanhaId: number;

  beforeEach(() => {
    db = abrirBanco(':memory:');
    campanhaId = garantirCampanha(db, { nome: 't', dataLimite: '2026-10-31', hoje: '2026-10-16' });
    importarClientes(db, campanhaId, [
      { telefone: '5527988776655', telefoneAlt: '552788776655', primeiroNome: 'Ana', nomeCompleto: 'Ana Souza', vendedora: null, segmento: 'RECENTE', prioridade: 1, cidade: 'Vila Velha', regiao: 'GV', ultimaCompra: '2026-05-01', dias: 168, ajustes: [] },
    ]);
    deps = { db, campanhaId, token: TOKEN, instancia: 'ao vivo vv', log: pino({ level: 'silent' }), monitor: new MonitorWebhook(), agora: () => AGORA };
  });

  it('registra a resposta do cliente com a intenção, uma única vez (TC-09)', () => {
    expect(processarEvento(deps, upsert({ texto: 'quero sim' }))).toBe('RESPOSTA_CLIENTE');
    expect(processarEvento(deps, upsert({ texto: 'quero sim' }))).toBe('REPETIDA');
    expect(processarEvento(deps, upsert({ texto: 'quero sim' }))).toBe('REPETIDA');
    const linhas = db.prepare("SELECT texto, intencao FROM mensagens WHERE direcao = 'IN'").all();
    expect(linhas).toEqual([{ texto: 'quero sim', intencao: 'SIM' }]);
    expect(deps.monitor.eventos.at(-1)?.descricao).toContain('5527*****6655');
  });

  it('não muda o status do cliente nem responde', () => {
    processarEvento(deps, upsert({ texto: 'SAIR' }));
    expect(db.prepare('SELECT status FROM clientes').get()).toEqual({ status: 'IMPORTADO' });
  });

  it('número fora da base vai para inbound_desconhecido', () => {
    expect(processarEvento(deps, upsert({ id: 'X2', jid: '5511987651234@s.whatsapp.net', texto: 'não' }))).toBe('RESPOSTA_FORA_DA_BASE');
    expect(db.prepare('SELECT jid, texto FROM inbound_desconhecido').get()).toEqual({ jid: '5511987651234', texto: 'não' });
  });

  it('descarta própria, grupo, antiga e de outra instância (RF09, RF10)', () => {
    expect(processarEvento(deps, upsert({ id: 'a', fromMe: true, texto: 'x' }))).toBe('PROPRIA');
    expect(processarEvento(deps, upsert({ id: 'b', jid: '1@g.us', texto: 'x' }))).toBe('GRUPO');
    expect(processarEvento(deps, upsert({ id: 'c', jid: 'status@broadcast', texto: 'x' }))).toBe('BROADCAST');
    expect(processarEvento(deps, upsert({ id: 'd', texto: 'x', ts: TS - 3600 }))).toBe('ANTIGA');
    expect(processarEvento(deps, upsert({ id: 'e', texto: 'x', instance: 'outra' }))).toBe('OUTRA_INSTANCIA');
    expect(db.prepare('SELECT COUNT(*) AS n FROM eventos_processados').get()).toEqual({ n: 0 });
  });

  it('áudio é registrado como mídia', () => {
    processarEvento(deps, upsert({ id: 'f' }));
    expect(db.prepare("SELECT texto, intencao FROM mensagens WHERE direcao = 'IN'").get()).toEqual({ texto: '[audioMessage]', intencao: 'DESCONHECIDO' });
  });

  it('grava entrega e leitura do convite (RF16)', () => {
    db.prepare("UPDATE clientes SET message_id = 'OUT1'").run();
    expect(processarEvento(deps, { event: 'messages.update', data: { keyId: 'OUT1', status: 'DELIVERY_ACK', fromMe: true } })).toBe('STATUS');
    processarEvento(deps, { event: 'messages.update', data: { keyId: 'OUT1', status: 'READ', fromMe: true } });
    expect(db.prepare('SELECT entregue_em, lido_em FROM clientes').get()).toEqual({ entregue_em: AGORA.toISOString(), lido_em: AGORA.toISOString() });
  });

  describe('rota', () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      app = Fastify();
      registrarWebhook(app, deps);
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
    });

    it('token errado responde 404; certo responde 200 e processa', async () => {
      expect((await app.inject({ method: 'POST', url: '/webhook/errado', payload: upsert({ texto: 'sim' }) })).statusCode).toBe(404);
      const r = await app.inject({ method: 'POST', url: `/webhook/${TOKEN}`, payload: upsert({ texto: 'sim' }) });
      expect(r.statusCode).toBe(200);
      expect(deps.monitor.total).toBe(1);
      const porEvento = await app.inject({ method: 'POST', url: `/webhook/${TOKEN}/connection-update`, payload: { data: { state: 'open' } } });
      expect(porEvento.statusCode).toBe(200);
      expect(deps.monitor.eventos[0]?.tipo).toBe('CONEXAO');
    });

    it('payload estranho não derruba a rota', async () => {
      const r = await app.inject({ method: 'POST', url: `/webhook/${TOKEN}`, payload: { event: 'messages.upsert', data: [] } });
      expect(r.statusCode).toBe(200);
    });
  });
});
