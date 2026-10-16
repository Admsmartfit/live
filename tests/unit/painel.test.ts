import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sessoes } from '../../src/admin/auth.js';
import { registrarPainel, type ClientePainel } from '../../src/admin/routes.js';
import { atualizarTextoEnv, lerArquivoEnv } from '../../src/config/arquivoEnv.js';
import { envSchema, parseEnv } from '../../src/config/env.js';
import { abrirBanco, garantirCampanha, type Banco } from '../../src/db/repo.js';
import { EvolutionError } from '../../src/evolution/errors.js';

const SENHA = 'senha-de-teste-123';
const CHAVE = 'chave-secreta-ABCD';
const ENV_INICIAL = [
  '# comentário mantido',
  'EVOLUTION_BASE_URL=https://evolution.exemplo.test',
  'EVOLUTION_INSTANCE=ao vivo vv',
  `EVOLUTION_API_KEY=${CHAVE}`,
  `WEBHOOK_TOKEN=${'t'.repeat(32)}`,
  `ADMIN_PASSWORD=${SENHA}`,
  'ADMIN_PHONE=5527999887766',
  'CAMPANHA_DATA_FIM=2026-10-31',
  '',
].join('\n');

describe('atualizarTextoEnv', () => {
  it('troca valores, mantém comentários e acrescenta chaves novas', () => {
    const t = atualizarTextoEnv('# c\nA=1\nB=2\n', { B: '3', C: 'x y' });
    expect(t).toBe('# c\r\nA=1\r\nB=3\r\nC=x y\r\n');
  });

  it('não permite quebra de linha no valor', () => {
    expect(atualizarTextoEnv('A=1', { A: 'x\nB=2' })).toBe('A=xB=2\r\n');
  });
});

describe('painel', () => {
  let dir: string;
  let caminhoEnv: string;
  let app: FastifyInstance;
  let cliente: { [K in keyof ClientePainel]: ReturnType<typeof vi.fn> };
  let sair: ReturnType<typeof vi.fn<(codigo: number) => void>>;
  let cookie = '';
  let db: Banco;
  let enviados = 0;

  beforeEach(async () => {
    enviados = 0;
    dir = mkdtempSync(join(tmpdir(), 'painel-'));
    caminhoEnv = join(dir, '.env');
    writeFileSync(caminhoEnv, ENV_INICIAL);
    cliente = {
      getVersion: vi.fn(() => Promise.resolve({ version: '2.3.7', raw: {} })),
      connectionState: vi.fn(() => Promise.resolve({ state: 'open', raw: {} })),
      sendText: vi.fn(() => Promise.resolve({ messageId: `MSG${String(++enviados)}`, remoteJid: null, raw: {} })),
      setWebhook: vi.fn(() => Promise.resolve({})),
      findWebhook: vi.fn(() =>
        Promise.resolve({ enabled: true, url: `https://x.test/webhook/${'t'.repeat(32)}`, events: ['MESSAGES_UPSERT'], byEvents: false, base64: false, raw: {} }),
      ),
    };
    sair = vi.fn<(codigo: number) => void>();
    app = Fastify();
    db = abrirBanco(':memory:');
    const campanhaId = garantirCampanha(db, { nome: 'teste', dataLimite: '2026-10-31', hoje: '2026-10-16' });
    registrarPainel(app, {
      caminhoEnv,
      caminhoTemplates: () => resolve('templates'),
      pastaVoucher: () => join(dir, 'voucher'),
      db,
      campanhaId,
      envInicial: parseEnv(envSchema, lerArquivoEnv(caminhoEnv)),
      criarEvolution: () => cliente as unknown as ClientePainel,
      sair,
      sessoes: new Sessoes(),
    });
    await app.ready();
    const r = await app.inject({ method: 'POST', url: '/painel/api/login', payload: { senha: SENHA } });
    cookie = String(r.headers['set-cookie']).split(';')[0] ?? '';
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const chamar = (method: 'GET' | 'POST', url: string, payload?: object, comCookie = true) =>
    app.inject({ method, url: `/painel/api/${url}`, ...(payload ? { payload } : {}), headers: comCookie ? { cookie } : {} });

  it('serve a página e exige login nas APIs', async () => {
    expect((await app.inject({ method: 'GET', url: '/painel' })).headers['content-type']).toMatch(/text\/html/);
    expect((await chamar('GET', 'config', undefined, false)).statusCode).toBe(401);
    expect((await chamar('GET', 'sessao', undefined, false)).json()).toEqual({ logado: false });
    expect((await chamar('GET', 'sessao')).json()).toEqual({ logado: true });
  });

  it('senha errada é recusada e o cookie é HttpOnly', async () => {
    const r = await chamar('POST', 'login', { senha: 'errada' }, false);
    expect(r.statusCode).toBe(401);
    const ok = await chamar('POST', 'login', { senha: SENHA }, false);
    expect(String(ok.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Strict/);
  });

  it('limita tentativas de login', async () => {
    const codigos: number[] = [];
    for (let i = 0; i < 6; i++) codigos.push((await chamar('POST', 'login', { senha: 'x' }, false)).statusCode);
    expect(codigos.at(-1)).toBe(429);
  });

  it('mostra a configuração sem revelar o token', async () => {
    const r = await chamar('GET', 'config');
    expect(r.body).not.toContain(CHAVE);
    expect(r.json()).toMatchObject({
      evolution: { baseUrl: 'https://evolution.exemplo.test', instancia: 'ao vivo vv', chaveFinal: '••••ABCD' },
      webhook: { caminho: `/webhook/${'t'.repeat(32)}`, url: null },
      campanha: { dataFim: '2026-10-31', dryRun: true, ativa: false },
    });
  });

  it('testa a conexão e explica falhas', async () => {
    expect((await chamar('POST', 'config/testar', {})).json()).toMatchObject({ ok: true, versao: '2.3.7', conectado: true });
    cliente.connectionState.mockRejectedValueOnce(new EvolutionError('AUTENTICACAO', '401', { rota: '/x', status: 401 }));
    const r = await chamar('POST', 'config/testar', {});
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ classe: 'AUTENTICACAO', dica: expect.stringMatching(/Token/) as unknown });
  });

  it('salva no .env, mantém o token se vier vazio e valida antes de gravar', async () => {
    const ok = await chamar('POST', 'config', { valores: { EVOLUTION_BASE_URL: 'https://outra.test', EVOLUTION_INSTANCE: 'loja 2', EVOLUTION_API_KEY: '', DAILY_LIMIT: '25' } });
    expect(ok.statusCode).toBe(200);
    const arq = lerArquivoEnv(caminhoEnv);
    expect(arq).toMatchObject({ EVOLUTION_BASE_URL: 'https://outra.test', EVOLUTION_INSTANCE: 'loja 2', EVOLUTION_API_KEY: CHAVE, DAILY_LIMIT: '25' });
    expect(readFileSync(caminhoEnv, 'utf8')).toContain('# comentário mantido');

    const antes = readFileSync(caminhoEnv, 'utf8');
    const ruim = await chamar('POST', 'config', { valores: { EVOLUTION_BASE_URL: 'não é url' } });
    expect(ruim.statusCode).toBe(400);
    expect(readFileSync(caminhoEnv, 'utf8')).toBe(antes);
  });

  it('gera prévia da mensagem com o nome informado', async () => {
    const r = await chamar('POST', 'teste/previa', { nome: 'Mariana', versao: 'C1' });
    expect(r.json<{ texto: string }>().texto).toContain('Mariana');
    expect((await chamar('POST', 'teste/previa', { nome: 'Mariana', versao: 'B1' })).statusCode).toBe(400);
  });

  it('envia o teste, inclui o número na lista de teste e registra no histórico', async () => {
    const r = await chamar('POST', 'teste/enviar', { numero: '(27) 98877-6655', texto: 'Oi, teste!' });
    expect(r.json()).toMatchObject({ ok: true, messageId: 'MSG1', telefone: '5527988776655', adicionadoNaLista: true });
    expect(cliente.sendText).toHaveBeenCalledWith(expect.objectContaining({ number: '5527988776655', text: 'Oi, teste!' }));
    expect(lerArquivoEnv(caminhoEnv).TEST_ALLOWLIST).toBe('5527988776655');
    const hist = (await chamar('GET', 'teste/historico')).json<{ telefone: string; message_id: string }[]>();
    expect(hist[0]).toMatchObject({ telefone: '5527*****6655', message_id: 'MSG1' });

    const de_novo = await chamar('POST', 'teste/enviar', { numero: '27988776655', texto: 'Outro' });
    expect(de_novo.json()).toMatchObject({ adicionadoNaLista: false });
  });

  it('recusa número inválido, link e instância desconectada', async () => {
    expect((await chamar('POST', 'teste/enviar', { numero: '3299-0758', texto: 'x' })).statusCode).toBe(400);
    expect((await chamar('POST', 'teste/enviar', { numero: '27988776655', texto: 'veja https://x.com' })).statusCode).toBe(400);
    cliente.connectionState.mockResolvedValueOnce({ state: 'close', raw: {} });
    expect((await chamar('POST', 'teste/enviar', { numero: '27988776655', texto: 'oi' })).statusCode).toBe(409);
    expect(cliente.sendText).not.toHaveBeenCalled();
  });

  it('recusa o endereço da própria Evolution como endereço público', async () => {
    const r = await chamar('POST', 'config', { valores: { PUBLIC_BASE_URL: 'https://evolution.exemplo.test/' } });
    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toMatch(/DESTE computador/);
    expect(lerArquivoEnv(caminhoEnv).PUBLIC_BASE_URL).toBeUndefined();
  });

  it('registra o webhook só com endereço público', async () => {
    expect((await chamar('POST', 'webhook/registrar')).statusCode).toBe(400);
    await chamar('POST', 'config', { valores: { PUBLIC_BASE_URL: 'https://campanha.exemplo.test' } });
    expect((await chamar('POST', 'webhook/registrar')).statusCode).toBe(200);
    expect(cliente.setWebhook).toHaveBeenCalledWith({ url: `https://campanha.exemplo.test/webhook/${'t'.repeat(32)}` });
  });

  it('resumo e fila descrevem a situação da campanha', async () => {
    const r = (await chamar('GET', 'resumo')).json<Record<string, Record<string, unknown>>>();
    expect(r.campanha).toMatchObject({ ativa: false, simulacao: true, dataFim: '2026-10-31' });
    expect(r.base).toMatchObject({ total: 0 });
    expect(r).toMatchObject({ testesEnviados: 0, webhookInformado: false, reinicioPendente: false });
    const f = (await chamar('GET', 'fila?n=10')).json<{ itens: unknown[] }>();
    expect(f.itens).toEqual([]);
  });

  it('ligar a campanha fica salvo e pede reinício', async () => {
    const ok = await chamar('POST', 'config', { valores: { CAMPANHA_ATIVA: 'true', DRY_RUN: 'true', TEST_ALLOWLIST: '5527988776655' } });
    expect(ok.json()).toMatchObject({ ok: true, reinicioPendente: true });
    expect(lerArquivoEnv(caminhoEnv)).toMatchObject({ CAMPANHA_ATIVA: 'true', TEST_ALLOWLIST: '5527988776655' });
    expect((await chamar('GET', 'config')).json()).toMatchObject({ campanha: { ativa: true, allowlist: ['5527988776655'] }, reinicioPendente: true });
    expect((await chamar('POST', 'config', { valores: { CHAVE_DESCONHECIDA: 'x' } })).statusCode).toBe(400);
  });

  it('verifica o webhook na Evolution e aponta problemas', async () => {
    const r = (await chamar('POST', 'webhook/verificar')).json<{ ok: boolean; problemas: string[] }>();
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/MESSAGES_UPDATE/);
    cliente.findWebhook.mockResolvedValueOnce({
      enabled: true,
      url: `https://evolution.exemplo.test/webhook/${'t'.repeat(32)}`,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      byEvents: false,
      base64: false,
      raw: {},
    });
    expect((await chamar('POST', 'webhook/verificar')).json()).toMatchObject({ ok: false, problemas: [expect.stringMatching(/própria Evolution/) as unknown] });
    const eventos = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];
    const comUrl = (url: string) => ({ enabled: true, url, events: eventos, byEvents: false, base64: false, raw: {} });
    cliente.findWebhook.mockResolvedValueOnce(comUrl(`https://192.100.0.104/webhook/${'t'.repeat(32)}`));
    expect((await chamar('POST', 'webhook/verificar')).json()).toMatchObject({ ok: false, problemas: [expect.stringMatching(/não usa https/) as unknown] });
    cliente.findWebhook.mockResolvedValueOnce(comUrl(`http://192.168.0.50/webhook/${'t'.repeat(32)}`));
    expect((await chamar('POST', 'webhook/verificar')).json()).toMatchObject({ ok: false, problemas: [expect.stringMatching(/Falta a porta :3000/) as unknown] });
    cliente.findWebhook.mockResolvedValueOnce(comUrl(`http://192.168.0.50:3000/webhook/${'t'.repeat(32)}`));
    expect((await chamar('POST', 'webhook/verificar')).json()).toMatchObject({ ok: true });
    cliente.findWebhook.mockResolvedValueOnce(null);
    expect((await chamar('POST', 'webhook/verificar')).json()).toMatchObject({ ok: false, problemas: [expect.stringMatching(/Nenhum/) as unknown] });
  });

  it('lista respostas recebidas, marcando número de teste', async () => {
    await chamar('POST', 'config', { valores: { TEST_ALLOWLIST: '5527988776655' } });
    db.prepare("INSERT INTO inbound_desconhecido (jid, texto) VALUES ('5527988776655', 'Sim, quero!')").run();
    const r = (await chamar('GET', 'respostas')).json<{ total: number; itens: unknown[] }>();
    expect(r.total).toBe(1);
    expect(r.itens[0]).toMatchObject({ telefone: '5527*****6655', origem: 'TESTE', intencao: 'SIM', texto: 'Sim, quero!' });
    expect((await chamar('GET', 'resumo')).json()).toMatchObject({ webhookInformado: true });
  });

  it('recebe a imagem do voucher, mostra e gera a prévia das respostas', async () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect((await chamar('GET', 'voucher')).json()).toMatchObject({ imagem: null });
    expect((await chamar('POST', 'voucher/imagem', { arquivo: Buffer.from('texto').toString('base64') })).statusCode).toBe(400);
    const ok = await chamar('POST', 'voucher/imagem', { arquivo: `data:image/jpeg;base64,${jpg.toString('base64')}` });
    expect(ok.json()).toMatchObject({ ok: true, bytes: jpg.length });
    const img = await app.inject({ method: 'GET', url: '/painel/api/voucher/imagem', headers: { cookie } });
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.rawPayload.equals(jpg)).toBe(true);
    expect((await chamar('GET', 'resumo')).json()).toMatchObject({ voucherCadastrado: true });
    const previa = (await chamar('POST', 'voucher/previa', { nome: 'Joana' })).json<Record<string, string>>();
    expect(previa.r1).toContain('Joana');
    expect(previa.r2).toContain('Joana');
  });

  it('lista de bloqueados: adiciona, lista e remove; número bloqueado não recebe teste', async () => {
    expect((await chamar('POST', 'bloqueados', { numero: '27 98877-6655' })).json()).toMatchObject({ ok: true, novo: true });
    const lista = (await chamar('GET', 'bloqueados')).json<{ total: number; itens: { id: number; telefone: string; motivoTexto: string }[] }>();
    expect(lista.total).toBe(1);
    expect(lista.itens[0]).toMatchObject({ telefone: '5527*****6655', motivoTexto: 'Bloqueado no painel' });
    expect((await chamar('POST', 'teste/enviar', { numero: '27988776655', texto: 'oi' })).statusCode).toBe(409);
    expect(cliente.sendText).not.toHaveBeenCalled();
    expect((await chamar('POST', 'bloqueados/remover', { id: lista.itens[0]?.id })).statusCode).toBe(200);
    expect((await chamar('GET', 'bloqueados')).json()).toMatchObject({ total: 0 });
  });

  it('reiniciar encerra o processo com código de falha (o serviço volta sozinho)', async () => {
    vi.useFakeTimers();
    try {
      await chamar('POST', 'reiniciar');
      vi.advanceTimersByTime(600);
      expect(sair).toHaveBeenCalledWith(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
