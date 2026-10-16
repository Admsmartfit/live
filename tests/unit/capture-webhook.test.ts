import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarServidorCaptura, nomeEvento } from '../../scripts/capture-webhook.js';

const TOKEN = 't'.repeat(32);
const AGORA = new Date('2026-10-20T13:45:10.123Z');

describe('capture-webhook', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'captura-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('normaliza o nome do evento', () => {
    expect(nomeEvento('messages.upsert')).toBe('messages-upsert');
    expect(nomeEvento('MESSAGES_UPDATE')).toBe('messages-update');
    expect(nomeEvento('../../etc')).toBe('etc');
    expect(nomeEvento(undefined)).toBe('desconhecido');
    expect(nomeEvento('***')).toBe('desconhecido');
  });

  it('grava o payload em <evento>-<timestamp>.json', async () => {
    const app = criarServidorCaptura({ token: TOKEN, dir, agora: () => AGORA });
    const payload = { event: 'messages.upsert', instance: 'ao vivo vv', data: { key: { id: 'X' } } };

    const r = await app.inject({ method: 'POST', url: `/webhook/${TOKEN}`, payload });

    expect(r.statusCode).toBe(200);
    const arquivos = await readdir(dir);
    expect(arquivos).toEqual(['messages-upsert-2026-10-20T13-45-10-123Z-001.json']);
    const salvo = JSON.parse(await readFile(join(dir, arquivos[0] ?? ''), 'utf8')) as unknown;
    expect(salvo).toEqual(payload);
    await app.close();
  });

  it('não sobrescreve eventos no mesmo milissegundo', async () => {
    const app = criarServidorCaptura({ token: TOKEN, dir, agora: () => AGORA });
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'POST', url: `/webhook/${TOKEN}`, payload: { event: 'messages.update', i } });
    }
    expect(await readdir(dir)).toHaveLength(3);
    await app.close();
  });

  it('usa o evento da rota quando byEvents=true', async () => {
    const app = criarServidorCaptura({ token: TOKEN, dir, agora: () => AGORA });
    await app.inject({ method: 'POST', url: `/webhook/${TOKEN}/connection-update`, payload: { state: 'open' } });
    const [arquivo] = await readdir(dir);
    expect(arquivo).toMatch(/^connection-update-/);
    await app.close();
  });

  it('token errado responde 404 e não grava nada', async () => {
    const app = criarServidorCaptura({ token: TOKEN, dir });
    const r = await app.inject({ method: 'POST', url: '/webhook/errado', payload: { event: 'x' } });
    expect(r.statusCode).toBe(404);
    expect(await readdir(dir)).toEqual([]);
    await app.close();
  });
});
