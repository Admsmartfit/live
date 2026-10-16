import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvError, captureEnvSchema, envSchema, evolutionEnvSchema, loadEnv, parseEnv } from '../../src/config/env.js';

const MINIMO = {
  EVOLUTION_BASE_URL: 'https://evolution.exemplo.test/',
  EVOLUTION_INSTANCE: 'ao vivo vv',
  EVOLUTION_API_KEY: 'chave-de-teste',
  WEBHOOK_TOKEN: 'a'.repeat(32),
  ADMIN_PASSWORD: 'senha-de-teste-123',
  ADMIN_PHONE: '5527999887766',
};

function problemas(fonte: Record<string, string | undefined>, schema = envSchema): string[] {
  try {
    parseEnv(schema, fonte);
  } catch (err) {
    if (err instanceof EnvError) return err.problemas;
    throw err;
  }
  return [];
}

describe('env (seções 6 e 8, RNF11)', () => {
  it('aplica os padrões do PRD', () => {
    const env = parseEnv(envSchema, MINIMO);
    expect(env).toMatchObject({
      EVOLUTION_BASE_URL: 'https://evolution.exemplo.test',
      EVOLUTION_TIMEOUT_MS: 10_000,
      EVOLUTION_MAX_RETRIES: 3,
      PORT: 3000,
      DRY_RUN: true,
      USE_BUTTONS: false,
      MARK_READ: true,
      TEST_ALLOWLIST: [],
      JITTER_MIN_S: 120,
      JITTER_MAX_S: 300,
      BREAK_EVERY_MIN: 8,
      BREAK_EVERY_MAX: 15,
      BREAK_MIN_MIN: 10,
      BREAK_MAX_MIN: 25,
      TYPING_MIN_MS: 3000,
      TYPING_MAX_MS: 6000,
      WINDOW_WEEKDAY_START: '09:00',
      WINDOW_WEEKDAY_END: '20:00',
      WINDOW_SATURDAY_START: '09:00',
      WINDOW_SATURDAY_END: '20:00',
      WINDOW_SUNDAY: false,
      DAILY_LIMIT: 40,
      CAMPANHA_ATIVA: false,
      LOJA_NOME: 'LIVE! Vila Velha',
      HOLIDAYS: [],
      DAILY_RAMP: [40, 60, 80, 100],
      HOURLY_CAP: 20,
      BREAKER_CONSECUTIVE_FAILURES: 3,
      BREAKER_ERROR_RATE: 0.1,
      BREAKER_OPTOUT_RATE: 0.08,
      BREAKER_HEALTH_FAILURES: 2,
    });
    expect(env.PUBLIC_BASE_URL).toBeUndefined();
  });

  it('lista todas as obrigatórias ausentes', () => {
    const p = problemas({});
    for (const chave of Object.keys(MINIMO)) {
      expect(p).toContain(`${chave}: obrigatória e não definida`);
    }
  });

  it('valor vazio conta como ausente', () => {
    expect(problemas({ ...MINIMO, EVOLUTION_API_KEY: '  ' })).toEqual(['EVOLUTION_API_KEY: obrigatória e não definida']);
    expect(parseEnv(envSchema, { ...MINIMO, HOURLY_CAP: '' }).HOURLY_CAP).toBe(20);
  });

  it('exige WEBHOOK_TOKEN com 32+ caracteres (RNF08)', () => {
    expect(problemas({ ...MINIMO, WEBHOOK_TOKEN: 'curto' })[0]).toMatch(/^WEBHOOK_TOKEN: .*32/);
  });

  it('valida formatos', () => {
    expect(problemas({ ...MINIMO, EVOLUTION_BASE_URL: 'não é url' })[0]).toMatch(/^EVOLUTION_BASE_URL/);
    expect(problemas({ ...MINIMO, PUBLIC_BASE_URL: 'http://x.test' })[0]).toMatch(/https/);
    expect(problemas({ ...MINIMO, ADMIN_PHONE: '27999887766' })[0]).toMatch(/^ADMIN_PHONE/);
    expect(problemas({ ...MINIMO, DRY_RUN: 'talvez' })[0]).toMatch(/^DRY_RUN: use true ou false/);
    expect(problemas({ ...MINIMO, HOURLY_CAP: 'abc' })[0]).toMatch(/^HOURLY_CAP/);
    expect(problemas({ ...MINIMO, WINDOW_WEEKDAY_START: '9h30' })[0]).toMatch(/HH:mm/);
    expect(problemas({ ...MINIMO, HOLIDAYS: '2026-11-02,15/11' })[0]).toMatch(/^HOLIDAYS/);
    expect(problemas({ ...MINIMO, TEST_ALLOWLIST: '5527999887766,123' })[0]).toMatch(/^TEST_ALLOWLIST/);
    expect(problemas({ ...MINIMO, BREAKER_ERROR_RATE: '10' })[0]).toMatch(/^BREAKER_ERROR_RATE/);
  });

  it('converte booleanos e listas', () => {
    const env = parseEnv(envSchema, {
      ...MINIMO,
      DRY_RUN: 'false',
      USE_BUTTONS: '1',
      TEST_ALLOWLIST: '5527999887766, 5527988776655',
      HOLIDAYS: '2026-11-02,2026-11-15',
      DAILY_RAMP: '10,20',
    });
    expect(env.DRY_RUN).toBe(false);
    expect(env.USE_BUTTONS).toBe(true);
    expect(env.TEST_ALLOWLIST).toEqual(['5527999887766', '5527988776655']);
    expect(env.HOLIDAYS).toEqual(['2026-11-02', '2026-11-15']);
    expect(env.DAILY_RAMP).toEqual([10, 20]);
  });

  it('rejeita mínimos maiores que máximos e janela invertida', () => {
    expect(problemas({ ...MINIMO, JITTER_MIN_S: '400' })).toEqual(['JITTER_MIN_S: não pode ser maior que JITTER_MAX_S']);
    expect(problemas({ ...MINIMO, TYPING_MIN_MS: '7000' })[0]).toMatch(/^TYPING_MIN_MS/);
    expect(problemas({ ...MINIMO, WINDOW_SATURDAY_END: '08:00' })).toEqual([
      'WINDOW_SATURDAY_START: deve ser anterior a WINDOW_SATURDAY_END',
    ]);
  });

  it('schemas parciais dos scripts exigem só o necessário', () => {
    const { WEBHOOK_TOKEN: _t, ADMIN_PASSWORD: _s, ADMIN_PHONE: _p, ...evo } = MINIMO;
    expect(parseEnv(evolutionEnvSchema, evo).EVOLUTION_INSTANCE).toBe('ao vivo vv');
    expect(parseEnv(captureEnvSchema, { WEBHOOK_TOKEN: MINIMO.WEBHOOK_TOKEN }).PORT).toBe(3000);
  });

  it('mensagem de erro não inclui valores de segredos', () => {
    const p = problemas({ ...MINIMO, WEBHOOK_TOKEN: 'segredo-curto' });
    expect(p.join('\n')).not.toContain('segredo-curto');
  });
});

describe('loadEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('encerra o processo com mensagem clara quando falta variável', () => {
    vi.stubEnv('EVOLUTION_API_KEY', '');
    vi.stubEnv('EVOLUTION_BASE_URL', '');
    vi.stubEnv('EVOLUTION_INSTANCE', '');
    const sair = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => loadEnv(evolutionEnvSchema)).toThrow('exit');
    expect(sair).toHaveBeenCalledWith(1);
    const saida = erro.mock.calls.flat().join('\n');
    expect(saida).toContain('EVOLUTION_API_KEY: obrigatória e não definida');
    expect(saida).toContain('.env.example');
  });

  it('devolve a configuração quando válida', () => {
    for (const [k, v] of Object.entries(MINIMO)) vi.stubEnv(k, v);
    expect(loadEnv().EVOLUTION_INSTANCE).toBe('ao vivo vv');
  });
});
