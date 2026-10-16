import { resolve } from 'node:path';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envSchema, parseEnv } from '../../src/config/env.js';
import {
  abrirBanco,
  aplicarValidacao,
  enviadosNoDia,
  garantirCampanha,
  importarClientes,
  listarFila,
  transicionar,
  TransicaoInvalida,
  type Banco,
} from '../../src/db/repo.js';
import { rngComSemente } from '../../src/domain/spintax.js';
import { carregarModelos } from '../../src/domain/templates.js';
import type { EvolutionClient } from '../../src/evolution/client.js';
import { EvolutionError } from '../../src/evolution/errors.js';
import type { ClienteImportado } from '../../src/importacao/processar.js';
import { WorkerEnvio, type Log } from '../../src/outbound/worker.js';

const SP = 'America/Sao_Paulo';
const BASE_ENV = {
  EVOLUTION_BASE_URL: 'https://evolution.exemplo.test',
  EVOLUTION_INSTANCE: 'ao vivo vv',
  EVOLUTION_API_KEY: 'chave-de-teste',
  WEBHOOK_TOKEN: 'a'.repeat(32),
  ADMIN_PASSWORD: 'senha-de-teste-123',
  ADMIN_PHONE: '5527999887766',
  CAMPANHA_DATA_FIM: '2026-10-31',
  DRY_RUN: 'false',
};

function cliente(telefone: string, nome: string, prio: number, extra: Partial<ClienteImportado> = {}): ClienteImportado {
  return {
    telefone,
    telefoneAlt: telefone.slice(0, 4) + telefone.slice(5),
    nomeCompleto: nome,
    primeiroNome: nome.split(' ')[0] ?? nome,
    vendedora: 'Isabely',
    cidade: 'Vila Velha/ES',
    ultimaCompra: '2026-09-01',
    dias: 43,
    segmento: 'RECENTE',
    regiao: 'GV',
    prioridade: prio,
    ajustes: [],
    ...extra,
  };
}

function preparar(db: Banco, clientes: ClienteImportado[], validar = true): number {
  const campanhaId = garantirCampanha(db, { nome: 'LIVE!', dataLimite: '2026-10-31', hoje: '2026-10-14' });
  importarClientes(db, campanhaId, clientes);
  if (validar) {
    for (const { id } of db.prepare("SELECT id FROM clientes WHERE status = 'IMPORTADO'").all() as { id: number }[]) {
      aplicarValidacao(db, id, true, null);
    }
  }
  return campanhaId;
}

const status = (db: Banco, tel: string) =>
  (db.prepare('SELECT status, tentativas, proxima_tentativa FROM clientes WHERE telefone = ?').get(tel) as {
    status: string;
    tentativas: number;
    proxima_tentativa: string | null;
  });

const logMudo: Log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('repo', () => {
  let db: Banco;
  beforeEach(() => {
    db = abrirBanco(':memory:');
  });

  it('reimportar não duplica', () => {
    const lista = [cliente('5527911110001', 'Ana', 10), cliente('5527911110002', 'Bia', 5)];
    const id = preparar(db, lista, false);
    const r = importarClientes(db, id, lista);
    expect(r).toMatchObject({ novos: 0, atualizados: 2 });
    expect((db.prepare('SELECT COUNT(*) n FROM clientes').get() as { n: number }).n).toBe(2);
  });

  it('número na supressão entra como SUPRIMIDO', () => {
    db.prepare("INSERT INTO supressao (telefone, motivo) VALUES ('5527911110001', 'OPT_OUT')").run();
    preparar(db, [cliente('5527911110001', 'Ana', 10)], false);
    expect(status(db, '5527911110001').status).toBe('SUPRIMIDO');
  });

  it('transição inválida lança erro; opt-out vale de qualquer estado', () => {
    preparar(db, [cliente('5527911110001', 'Ana', 10)]);
    const { id } = db.prepare('SELECT id FROM clientes').get() as { id: number };
    expect(() => {
      transicionar(db, id, 'ENVIADO');
    }).toThrow(TransicaoInvalida);
    transicionar(db, id, 'OPT_OUT');
    expect(() => {
      transicionar(db, id, 'PRONTO');
    }).toThrow(TransicaoInvalida);
  });

  it('fila em ordem de prioridade, com allowlist', () => {
    const id = preparar(db, [cliente('5527911110001', 'Ana', 10), cliente('5527911110002', 'Bia', 50)]);
    const f = { campanhaId: id, agoraIso: new Date().toISOString(), maxTentativas: 3, allowlist: [] };
    expect(listarFila(db, f, 10).map((c) => c.primeiro_nome)).toEqual(['Bia', 'Ana']);
    expect(listarFila(db, { ...f, allowlist: ['5527911110001'] }, 10).map((c) => c.primeiro_nome)).toEqual(['Ana']);
  });
});

describe('WorkerEnvio', () => {
  let db: Banco;
  let agora: DateTime;
  let enviados: { number: string; text: string; delay?: number | undefined }[];
  let sendText: ReturnType<typeof vi.fn>;
  const modelos = carregarModelos(resolve('templates'));

  function criar(envExtra: Record<string, string> = {}) {
    const env = parseEnv(envSchema, { ...BASE_ENV, ...envExtra });
    const campanhaId = preparar(db, [
      cliente('5527911110001', 'Ana Souza', 30),
      cliente('5527911110002', 'Bia Lima', 20),
      cliente('5527911110003', 'Cris Melo', 10, { segmento: 'ANTIGO', vendedora: null }),
    ]);
    const evolution = {
      sendText,
      connectionState: vi.fn(() => Promise.resolve({ state: 'open', raw: {} })),
    } as unknown as Pick<EvolutionClient, 'sendText' | 'connectionState'>;
    return new WorkerEnvio({ db, evolution, env, modelos, campanhaId, log: logMudo, agora: () => agora, rng: rngComSemente(7) });
  }

  beforeEach(() => {
    db = abrirBanco(':memory:');
    agora = DateTime.fromISO('2026-10-14T10:00', { zone: SP }); // quarta-feira
    enviados = [];
    let n = 0;
    sendText = vi.fn((p: { number: string; text: string; delay?: number }) => {
      enviados.push(p);
      n++;
      return Promise.resolve({ messageId: `MSG${n}`, remoteJid: null, raw: {} });
    });
  });

  it('envia para o cliente de maior prioridade e grava ENVIADO + contador', async () => {
    const w = criar();
    const r = await w.ciclo();
    expect(r).toMatchObject({ tipo: 'ENVIADO' });
    expect(enviados[0]?.number).toBe('5527911110001');
    expect(enviados[0]?.text).toContain('Ana');
    expect(status(db, '5527911110001').status).toBe('ENVIADO');
    expect(enviadosNoDia(db, '2026-10-14')).toBe(1);
    expect((r as { esperarS: number }).esperarS).toBeGreaterThanOrEqual(120);
  });

  it('trava diária: ao atingir DAILY_LIMIT espera a janela do dia seguinte', async () => {
    const w = criar({ DAILY_LIMIT: '2' });
    expect((await w.ciclo()).tipo).toBe('ENVIADO');
    agora = agora.plus({ minutes: 20 });
    expect((await w.ciclo()).tipo).toBe('ENVIADO');
    agora = agora.plus({ minutes: 20 });
    const r = await w.ciclo();
    expect(r.tipo).toBe('LIMITE_DIA');
    const ate = (r as { esperarAte: DateTime }).esperarAte.setZone(SP);
    expect(ate.toISODate()).toBe('2026-10-15');
    expect(ate.hour).toBe(9);
    expect(sendText).toHaveBeenCalledTimes(2);
  });

  it('fora da janela não envia', async () => {
    agora = DateTime.fromISO('2026-10-14T20:30', { zone: SP });
    const r = await criar().ciclo();
    expect(r.tipo).toBe('FORA_JANELA');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('DRY_RUN simula sem chamar a API e sem alterar o banco', async () => {
    const w = criar({ DRY_RUN: 'true' });
    const r1 = await w.ciclo();
    const r2 = await w.ciclo();
    expect([r1.tipo, r2.tipo]).toEqual(['SIMULADO', 'SIMULADO']);
    expect((r1 as { clienteId: number }).clienteId).not.toBe((r2 as { clienteId: number }).clienteId);
    expect(sendText).not.toHaveBeenCalled();
    expect(status(db, '5527911110001').status).toBe('PRONTO');
    expect(enviadosNoDia(db, '2026-10-14')).toBe(0);
  });

  it('com TEST_ALLOWLIST só os números de teste recebem', async () => {
    const w = criar({ TEST_ALLOWLIST: '5527911110003' });
    await w.ciclo();
    expect(enviados.map((e) => e.number)).toEqual(['5527911110003']);
    expect((await w.ciclo()).tipo).toBe('FILA_VAZIA');
  });

  it('número sem WhatsApp vira SEM_WHATSAPP', async () => {
    sendText.mockRejectedValueOnce(new EvolutionError('NUMERO', 'not exists', { rota: '/x', status: 400 }));
    const r = await criar().ciclo();
    expect(r.tipo).toBe('FALHA');
    expect(status(db, '5527911110001').status).toBe('SEM_WHATSAPP');
  });

  it('401/403 para tudo (kill switch) sem gastar tentativa', async () => {
    sendText.mockRejectedValueOnce(new EvolutionError('AUTENTICACAO', 'Unauthorized', { rota: '/x', status: 401 }));
    const r = await criar().ciclo();
    expect(r.tipo).toBe('PARADO');
    expect(status(db, '5527911110001')).toMatchObject({ status: 'ERRO', tentativas: 0 });
  });

  it('timeout vai para VERIFICAR (pode ter saído; nunca reenvia)', async () => {
    sendText.mockRejectedValueOnce(new EvolutionError('TRANSITORIO', 'Timeout', { rota: '/x' }));
    await criar().ciclo();
    expect(status(db, '5527911110001').status).toBe('VERIFICAR');
  });

  it('erro 500 agenda nova tentativa em RETRY_AFTER_MIN', async () => {
    sendText.mockRejectedValueOnce(new EvolutionError('TRANSITORIO', 'HTTP 500', { rota: '/x', status: 500 }));
    const w = criar();
    await w.ciclo();
    const s = status(db, '5527911110001');
    expect(s).toMatchObject({ status: 'ERRO', tentativas: 1 });
    expect(DateTime.fromISO(s.proxima_tentativa ?? '').diff(agora, 'minutes').minutes).toBeCloseTo(60, 0);
    agora = agora.plus({ minutes: 5 });
    await w.ciclo();
    expect(enviados.at(-1)?.number).toBe('5527911110002'); // o que falhou espera a vez dele
  });

  it('3 falhas seguidas pausam o envio', async () => {
    const erro = new EvolutionError('TRANSITORIO', 'HTTP 502', { rota: '/x', status: 502 });
    sendText.mockRejectedValue(erro);
    const w = criar();
    expect((await w.ciclo()).tipo).toBe('FALHA');
    expect((await w.ciclo()).tipo).toBe('FALHA');
    const r = await w.ciclo();
    expect(r).toMatchObject({ tipo: 'PAUSA_FALHAS', esperarS: 30 * 60 });
  });

  it('ao iniciar, envio interrompido vai para VERIFICAR; sem conexão não começa', async () => {
    const w = criar();
    const { id } = db.prepare("SELECT id FROM clientes WHERE telefone = '5527911110001'").get() as { id: number };
    transicionar(db, id, 'ENVIANDO', {}, '2026-10-14T12:00:00.000Z');
    const evolution = (w as unknown as { d: { evolution: { connectionState: ReturnType<typeof vi.fn> } } }).d.evolution;
    evolution.connectionState.mockResolvedValueOnce({ state: 'close', raw: {} });
    const motivo = await w.executar(new AbortController().signal);
    expect(motivo).toMatch(/não conectada/);
    expect(status(db, '5527911110001').status).toBe('VERIFICAR');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('exige CAMPANHA_DATA_FIM', () => {
    expect(() => criar({ CAMPANHA_DATA_FIM: '' })).toThrow(/CAMPANHA_DATA_FIM/);
  });
});
