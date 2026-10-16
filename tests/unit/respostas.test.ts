import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envSchema, parseEnv, type Env } from '../../src/config/env.js';
import {
  abrirBanco,
  bloquearSemResposta,
  estaBloqueado,
  garantirCampanha,
  importarClientes,
  transicionar,
  type Banco,
} from '../../src/db/repo.js';
import { carregarModelosResposta, decidirAcao, gerarResposta, limitePrazoIso } from '../../src/domain/respostas.js';
import { Respondedor, type ClienteRespostas } from '../../src/inbound/respostas.js';
import { formatoImagem, ImagemInvalida, lerImagemVoucher, salvarImagemVoucher } from '../../src/inbound/voucherImagem.js';
import { MonitorWebhook } from '../../src/inbound/webhook.js';

const TEMPLATES = resolve('templates');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const CLIENTE = '5527988776655';
const TESTE = '5527911112222';

const dados = { nome: 'Mariana', loja: 'LIVE! Vila Velha', dataFim: '31/10 (sábado)', endereco: '' };

describe('gerarResposta (seção 5.4/5.5)', () => {
  const modelos = carregarModelosResposta(TEMPLATES);

  it('R1 traz nome, oferta e validade; sem endereço a linha some', () => {
    const r1 = gerarResposta(modelos, 'R1', dados, () => 0);
    expect(r1).toContain('Mariana');
    expect(r1).toContain('*35% off*');
    expect(r1).toContain('31/10 (sábado)');
    expect(r1).not.toContain('📍');
    expect(r1).not.toMatch(/\n{3,}/);
    expect(gerarResposta(modelos, 'R1', { ...dados, endereco: 'Shopping Vila Velha, loja 120' }, () => 0)).toContain('📍 Shopping Vila Velha, loja 120');
  });

  it('todas as respostas geram texto válido', () => {
    for (const t of ['R1', 'R1_IMG', 'R2', 'R3', 'R4'] as const) {
      for (let i = 0; i < 20; i++) expect(gerarResposta(modelos, t, dados).length).toBeGreaterThan(10);
    }
  });
});

describe('decidirAcao', () => {
  it.each([
    ['ENVIADO', 'SIM', false, 'VOUCHER'],
    ['DESCONHECIDO_1X', 'SIM', false, 'VOUCHER'],
    ['AGUARDANDO_HUMANO', 'SIM', false, 'VOUCHER'],
    ['VOUCHER_ENVIADO', 'SIM', false, 'VOUCHER_DE_NOVO'],
    ['VOUCHER_ENVIANDO', 'SIM', false, 'NADA'],
    ['ENVIADO', 'NAO', false, 'BLOQUEAR'],
    ['VOUCHER_ENVIADO', 'OPT_OUT', false, 'BLOQUEAR'],
    ['SEM_RESPOSTA', 'NAO', false, 'BLOQUEAR'],
    ['SEM_RESPOSTA', 'SIM', false, 'HUMANO'],
    ['OPT_OUT', 'SIM', false, 'NADA'],
    ['OPT_OUT', 'OPT_OUT', false, 'NADA'],
    ['ENVIADO', 'DESCONHECIDO', false, 'NAO_ENTENDIDO'],
    ['ENVIADO', 'DESCONHECIDO', true, 'HUMANO'],
    ['DESCONHECIDO_1X', 'DESCONHECIDO', false, 'HUMANO'],
    ['VOUCHER_ENVIADO', 'DESCONHECIDO', false, 'NADA'],
    ['TESTE', 'SIM', false, 'VOUCHER'],
    ['TESTE', 'NAO', false, 'BLOQUEAR'],
    ['TESTE', 'DESCONHECIDO', false, 'NAO_ENTENDIDO'],
  ] as const)('%s + %s (mídia=%s) → %s', (status, intencao, midia, esperado) => {
    expect(decidirAcao(status, intencao, midia)).toBe(esperado);
  });
});

describe('imagem do voucher', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'voucher-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reconhece JPG e PNG pelo conteúdo e recusa o resto', () => {
    expect(formatoImagem(JPG)?.mimetype).toBe('image/jpeg');
    expect(formatoImagem(PNG)?.mimetype).toBe('image/png');
    expect(formatoImagem(Buffer.from('GIF89a'))).toBeNull();
    expect(() => salvarImagemVoucher(dir, Buffer.from('<svg/>'))).toThrow(ImagemInvalida);
  });

  it('troca a imagem sem deixar duas versões', () => {
    salvarImagemVoucher(dir, JPG);
    salvarImagemVoucher(dir, PNG);
    expect(lerImagemVoucher(dir)).toMatchObject({ mimetype: 'image/png', fileName: 'voucher.png', base64: PNG.toString('base64') });
  });
});

describe('Respondedor', () => {
  let db: Banco;
  let dirVoucher: string;
  let campanhaId: number;
  let env: Env;
  let monitor: MonitorWebhook;
  let cliente: { sendText: ReturnType<typeof vi.fn>; sendMedia: ReturnType<typeof vi.fn> };
  let ordem: string[];
  let r: Respondedor;
  let idCliente: number;

  const criarEnv = (extra: Record<string, string> = {}) =>
    parseEnv(envSchema, {
      EVOLUTION_BASE_URL: 'https://evolution.exemplo.test',
      EVOLUTION_INSTANCE: 'loja',
      EVOLUTION_API_KEY: 'chave-de-teste',
      WEBHOOK_TOKEN: 'w'.repeat(32),
      ADMIN_PASSWORD: 'senha-de-teste-123',
      ADMIN_PHONE: '5527999887766',
      CAMPANHA_DATA_FIM: '2026-10-31',
      DRY_RUN: 'false',
      TEST_ALLOWLIST: TESTE,
      ...extra,
    });

  const status = () => (db.prepare('SELECT status FROM clientes WHERE id = ?').get(idCliente) as { status: string }).status;
  const pedido = (intencao: 'SIM' | 'NAO' | 'OPT_OUT' | 'DESCONHECIDO', tel = CLIENTE, midia = false) => ({
    telefone: tel,
    jid: `${tel}@s.whatsapp.net`,
    clienteId: tel === CLIENTE ? idCliente : null,
    intencao,
    midia,
  });

  beforeEach(() => {
    db = abrirBanco(':memory:');
    dirVoucher = mkdtempSync(join(tmpdir(), 'voucher-'));
    campanhaId = garantirCampanha(db, { nome: 't', dataLimite: '2026-10-31', hoje: '2026-10-16' });
    importarClientes(db, campanhaId, [
      { telefone: CLIENTE, telefoneAlt: '552788776655', primeiroNome: 'Ana', nomeCompleto: 'Ana Souza', vendedora: null, segmento: 'RECENTE', prioridade: 1, cidade: 'Vila Velha', regiao: 'GV', ultimaCompra: '2026-05-01', dias: 168, ajustes: [] },
    ]);
    idCliente = (db.prepare('SELECT id FROM clientes').get() as { id: number }).id;
    for (const s of ['PRONTO', 'ENVIANDO', 'ENVIADO'] as const) transicionar(db, idCliente, s, s === 'ENVIADO' ? { enviado_em: '2026-10-10T12:00:00.000Z' } : {});
    env = criarEnv();
    monitor = new MonitorWebhook();
    ordem = [];
    let n = 0;
    cliente = {
      sendText: vi.fn((p: { text: string }) => {
        ordem.push(`texto:${p.text.slice(0, 12)}`);
        return Promise.resolve({ messageId: `T${String(++n)}`, remoteJid: null, raw: {} });
      }),
      sendMedia: vi.fn(() => {
        ordem.push('imagem');
        return Promise.resolve({ messageId: `M${String(++n)}`, remoteJid: null, raw: {} });
      }),
    };
    r = new Respondedor({
      db,
      campanhaId,
      env: () => env,
      criarEvolution: () => cliente as unknown as ClienteRespostas,
      caminhoTemplates: () => TEMPLATES,
      pastaVoucher: () => dirVoucher,
      log: pino({ level: 'silent' }),
      monitor,
      dormir: () => Promise.resolve(),
      rng: () => 0,
    });
  });

  afterEach(() => {
    rmSync(dirVoucher, { recursive: true, force: true });
  });

  it('SIM: envia o texto R1 e depois a imagem, e marca VOUCHER_ENVIADO (RF13)', async () => {
    salvarImagemVoucher(dirVoucher, JPG);
    await r.agendar(pedido('SIM'));
    expect(ordem).toEqual([expect.stringMatching(/^texto:Oba, Ana/) as unknown, 'imagem']);
    expect(cliente.sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({ number: CLIENTE, mediatype: 'image', mimetype: 'image/jpeg', media: JPG.toString('base64') }),
    );
    expect(status()).toBe('VOUCHER_ENVIADO');
    const tipos = db.prepare("SELECT tipo FROM mensagens WHERE direcao = 'OUT' ORDER BY id").all();
    expect(tipos).toEqual([{ tipo: 'R1' }, { tipo: 'R1_IMG' }]);

    await r.agendar(pedido('SIM')); // pediu de novo → R3 + mesma imagem
    expect(ordem.slice(2)).toEqual([expect.stringMatching(/^texto:Oi Ana/) as unknown, 'imagem']);
    expect(status()).toBe('VOUCHER_ENVIADO');
  });

  it('SIM sem imagem cadastrada: não envia nada, alerta e passa para atendimento humano', async () => {
    await r.agendar(pedido('SIM'));
    expect(cliente.sendText).not.toHaveBeenCalled();
    expect(status()).toBe('AGUARDANDO_HUMANO');
    expect(monitor.eventos[0]?.descricao).toMatch(/imagem do voucher não foi cadastrada/);
  });

  it('falha ao enviar a imagem: alerta e atendimento humano', async () => {
    salvarImagemVoucher(dirVoucher, JPG);
    cliente.sendMedia.mockRejectedValueOnce(new Error('timeout'));
    await r.agendar(pedido('SIM'));
    expect(status()).toBe('AGUARDANDO_HUMANO');
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE evento = 'ALERTA'").get()).toEqual({ n: 1 });
  });

  it('NÃO: bloqueia, marca OPT_OUT e confirma uma única vez (RF14, TC-06)', async () => {
    await r.agendar(pedido('NAO'));
    expect(estaBloqueado(db, CLIENTE)).toBe(true);
    expect(status()).toBe('OPT_OUT');
    expect(cliente.sendText).toHaveBeenCalledTimes(1);
    await r.agendar(pedido('OPT_OUT'));
    await r.agendar(pedido('SIM'));
    expect(cliente.sendText).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT motivo FROM supressao').get()).toEqual({ motivo: 'RESPONDEU_NAO' });
  });

  it('não entendido: R4 na primeira, humano na segunda (RF15, TC-11)', async () => {
    await r.agendar(pedido('DESCONHECIDO'));
    expect(status()).toBe('DESCONHECIDO_1X');
    await r.agendar(pedido('DESCONHECIDO', CLIENTE, true));
    expect(status()).toBe('AGUARDANDO_HUMANO');
    expect(cliente.sendText).toHaveBeenCalledTimes(1);
  });

  it('com DRY_RUN=true não envia para clientes, mas bloqueio vale', async () => {
    env = criarEnv({ DRY_RUN: 'true' });
    salvarImagemVoucher(dirVoucher, JPG);
    await r.agendar(pedido('SIM'));
    expect(cliente.sendText).not.toHaveBeenCalled();
    expect(status()).toBe('ENVIADO');
    await r.agendar(pedido('NAO'));
    expect(cliente.sendText).not.toHaveBeenCalled();
    expect(estaBloqueado(db, CLIENTE)).toBe(true);
  });

  it('número de teste recebe o voucher mesmo com DRY_RUN=true; bloqueado não recebe mais', async () => {
    env = criarEnv({ DRY_RUN: 'true' });
    salvarImagemVoucher(dirVoucher, PNG);
    await r.agendar(pedido('SIM', TESTE));
    expect(ordem).toEqual([expect.stringMatching(/^texto:Oba, Teste/) as unknown, 'imagem']);
    await r.agendar(pedido('NAO', TESTE));
    expect(estaBloqueado(db, TESTE)).toBe(true);
    const antes = ordem.length;
    await r.agendar(pedido('SIM', TESTE));
    expect(ordem.length).toBe(antes);
    expect(monitor.eventos[0]?.descricao).toMatch(/lista de bloqueados/);
  });

  it('número fora da base e fora da lista de teste não recebe resposta (RF12)', async () => {
    await r.agendar(pedido('SIM', '5521977776666'));
    expect(cliente.sendText).not.toHaveBeenCalled();
  });
});

describe('bloquearSemResposta (prazo)', () => {
  it('bloqueia convites sem resposta após o prazo e não mexe nos recentes', () => {
    const db = abrirBanco(':memory:');
    const c = garantirCampanha(db, { nome: 't', dataLimite: '2026-10-31', hoje: '2026-10-16' });
    const base = { primeiroNome: 'X', nomeCompleto: 'X Y', vendedora: null, segmento: 'RECENTE' as const, prioridade: 1, cidade: 'Vitória', regiao: 'GV' as const, ultimaCompra: null, dias: 1, ajustes: [] };
    importarClientes(db, c, [
      { ...base, telefone: '5527911110001', telefoneAlt: '552711110001' },
      { ...base, telefone: '5527911110002', telefoneAlt: '552711110002' },
    ]);
    const ids = (db.prepare('SELECT id FROM clientes ORDER BY id').all() as { id: number }[]).map((l) => l.id);
    const envio = ['2026-10-01T12:00:00.000Z', '2026-10-14T12:00:00.000Z'];
    ids.forEach((id, i) => {
      transicionar(db, id, 'PRONTO');
      transicionar(db, id, 'ENVIANDO');
      transicionar(db, id, 'ENVIADO', { enviado_em: envio[i] ?? '' });
    });
    const limite = limitePrazoIso(new Date('2026-10-16T12:00:00Z'), 7);
    expect(limite).toBe('2026-10-09T12:00:00.000Z');
    expect(bloquearSemResposta(db, c, limite)).toBe(1);
    expect(db.prepare('SELECT status FROM clientes ORDER BY id').all()).toEqual([{ status: 'SEM_RESPOSTA' }, { status: 'ENVIADO' }]);
    expect(db.prepare('SELECT telefone, motivo FROM supressao').all()).toEqual([{ telefone: '5527911110001', motivo: 'SEM_RESPOSTA' }]);
    expect(bloquearSemResposta(db, c, limite)).toBe(0);
  });
});

