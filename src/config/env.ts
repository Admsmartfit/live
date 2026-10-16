import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Validação de todas as variáveis de ambiente (PRD seções 6 e 8, RNF11).
// Parâmetros operacionais têm o padrão do PRD; segredos e identificação da
// instância são obrigatórios e não têm padrão.

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const TELEFONE = /^55\d{10,11}$/;

const inteiro = (padrao: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int('deve ser um número inteiro').min(min).max(max).default(padrao);

const fracao = (padrao: number) => z.coerce.number().gt(0).lt(1).default(padrao);

const booleano = (padrao: boolean) =>
  z
    .enum(['true', 'false', '1', '0'], { error: 'use true ou false' })
    .default(padrao ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const hora = (padrao: string) => z.string().regex(HORA, 'use o formato HH:mm').default(padrao);

const separar = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const lista = (re: RegExp, mensagem: string) =>
  z.string().default('').transform(separar).pipe(z.array(z.string().regex(re, mensagem)));

const segredo = (min: number) =>
  z.string({ error: 'obrigatória e não definida' }).min(min, `deve ter no mínimo ${min} caracteres`);

export const evolutionShape = {
  EVOLUTION_BASE_URL: z
    .url({ protocol: /^https?$/, error: 'deve ser uma URL http(s) válida' })
    .transform((u) => u.replace(/\/+$/, '')),
  EVOLUTION_INSTANCE: z.string({ error: 'obrigatória e não definida' }).min(1),
  EVOLUTION_API_KEY: segredo(1),
  EVOLUTION_TIMEOUT_MS: inteiro(10_000, 1_000, 60_000),
  EVOLUTION_MAX_RETRIES: inteiro(3, 0, 10),
};

export const servidorShape = {
  HOST: z.string().default('0.0.0.0'),
  PORT: inteiro(3000, 1, 65_535),
  WEBHOOK_TOKEN: segredo(32).regex(/^[A-Za-z0-9_-]+$/, 'use apenas letras, números, _ e -'),
};

const restanteShape = {
  // Servidor / webhook (RNF04, RNF08)
  PUBLIC_BASE_URL: z
    .url({ protocol: /^https$/, error: 'deve ser uma URL https (RNF08)' })
    .transform((u) => u.replace(/\/+$/, ''))
    .optional(),
  WEBHOOK_RATE_LIMIT_PER_S: inteiro(30, 1),
  WEBHOOK_BODY_LIMIT_BYTES: inteiro(1_048_576, 1_024),
  HEALTH_CHECK_INTERVAL_S: inteiro(30, 5),

  // Painel e alertas (RNF07, RNF09, 6.3)
  ADMIN_PASSWORD: segredo(12),
  ADMIN_PHONE: z
    .string({ error: 'obrigatória e não definida' })
    .regex(TELEFONE, 'use E.164 sem "+", ex.: 5527999887766'),

  // Dados e logs (RNF02, RNF05)
  DATA_DIR: z.string().default('./data'),
  TEMPLATES_DIR: z.string().default('./templates'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_RETENTION_DAYS: inteiro(30, 1),

  // Modo de operação (RF07, RF20, controle 11)
  DRY_RUN: booleano(true),
  // Chave geral: o worker de envio só roda com CAMPANHA_ATIVA=true.
  CAMPANHA_ATIVA: booleano(false),
  TEST_ALLOWLIST: lista(TELEFONE, 'telefone inválido na allowlist'),
  USE_BUTTONS: booleano(false),
  MARK_READ: booleano(true),

  // Cadência (6.1, controles 1–3 e 12)
  JITTER_MIN_S: inteiro(120, 1),
  JITTER_MAX_S: inteiro(300, 1),
  BREAK_EVERY_MIN: inteiro(8, 1),
  BREAK_EVERY_MAX: inteiro(15, 1),
  BREAK_MIN_MIN: inteiro(10, 0),
  BREAK_MAX_MIN: inteiro(25, 0),
  TYPING_MIN_MS: inteiro(3000, 0, 20_000),
  TYPING_MAX_MS: inteiro(6000, 0, 20_000),
  TYPING_CHARS_PER_S: inteiro(40, 1),
  REPLY_TYPING_MIN_MS: inteiro(1500, 0, 20_000),
  REPLY_TYPING_MAX_MS: inteiro(2000, 0, 20_000),

  // Janela de horário (controle 4), sempre em America/Sao_Paulo (RNF12)
  WINDOW_WEEKDAY_START: hora('09:00'),
  WINDOW_WEEKDAY_END: hora('20:00'),
  WINDOW_SATURDAY_START: hora('09:00'),
  WINDOW_SATURDAY_END: hora('20:00'),
  WINDOW_SUNDAY: booleano(false),
  HOLIDAYS: lista(DATA, 'feriado deve estar no formato AAAA-MM-DD'),

  // Volume (controles 5–7)
  DAILY_RAMP: z
    .string()
    .default('40,60,80,100')
    .transform((v) => separar(v).map(Number))
    .pipe(
      z
        .array(z.number({ error: 'use números separados por vírgula' }).int().positive())
        .min(1, 'informe ao menos um limite diário'),
    ),
  // Trava diária: no máximo X mensagens de convite por dia (a rampa pode reduzir nos primeiros dias).
  DAILY_LIMIT: inteiro(40, 1),
  HOURLY_CAP: inteiro(20, 1),

  // Campanha (textos da seção 5)
  LOJA_NOME: z.string().min(1).default('LIVE! Vila Velha'),
  CAMPANHA_DATA_FIM: z.string().regex(DATA, 'use o formato AAAA-MM-DD').optional(),
  SEND_ORDER: z.enum(['SEGMENTO', 'IMPORTACAO']).default('SEGMENTO'),

  // Tentativas (seção 8, classe Transitório)
  MAX_ATTEMPTS: inteiro(3, 1),
  RETRY_AFTER_MIN: inteiro(60, 1),

  // Disjuntores (6.2)
  BREAKER_CONSECUTIVE_FAILURES: inteiro(3, 1),
  BREAKER_CONSECUTIVE_PAUSE_MIN: inteiro(30, 1),
  BREAKER_ERROR_RATE: fracao(0.1),
  BREAKER_ERROR_WINDOW: inteiro(30, 1),
  BREAKER_OPTOUT_RATE: fracao(0.08),
  BREAKER_OPTOUT_WINDOW: inteiro(50, 1),
  BREAKER_HEALTH_FAILURES: inteiro(2, 1),
};

const minutos = (h: string) => {
  const [hh = 0, mm = 0] = h.split(':').map(Number);
  return hh * 60 + mm;
};

export const envSchema = z
  .object({ ...evolutionShape, ...servidorShape, ...restanteShape })
  .superRefine((e, ctx) => {
    const pares: [keyof typeof e, keyof typeof e][] = [
      ['JITTER_MIN_S', 'JITTER_MAX_S'],
      ['BREAK_EVERY_MIN', 'BREAK_EVERY_MAX'],
      ['BREAK_MIN_MIN', 'BREAK_MAX_MIN'],
      ['TYPING_MIN_MS', 'TYPING_MAX_MS'],
      ['REPLY_TYPING_MIN_MS', 'REPLY_TYPING_MAX_MS'],
    ];
    for (const [min, max] of pares) {
      if (Number(e[min]) > Number(e[max])) {
        ctx.addIssue({ code: 'custom', path: [min], message: `não pode ser maior que ${max}` });
      }
    }
    const janelas: [keyof typeof e, keyof typeof e][] = [
      ['WINDOW_WEEKDAY_START', 'WINDOW_WEEKDAY_END'],
      ['WINDOW_SATURDAY_START', 'WINDOW_SATURDAY_END'],
    ];
    for (const [ini, fim] of janelas) {
      if (minutos(String(e[ini])) >= minutos(String(e[fim]))) {
        ctx.addIssue({ code: 'custom', path: [ini], message: `deve ser anterior a ${fim}` });
      }
    }
  });

export const evolutionEnvSchema = z.object(evolutionShape);
export const captureEnvSchema = z.object(servidorShape);

export type Env = z.output<typeof envSchema>;
export type EvolutionEnv = z.output<typeof evolutionEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problemas: string[]) {
    super(`Configuração inválida (.env):\n${problemas.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

type Fonte = Record<string, string | undefined>;

/** Valida uma fonte de variáveis. Valores vazios contam como ausentes. Lança EnvError. */
export function parseEnv<T extends z.ZodType>(schema: T, fonte: Fonte): z.output<T> {
  const limpa: Fonte = {};
  for (const [k, v] of Object.entries(fonte)) {
    if (v !== undefined && v.trim() !== '') limpa[k] = v.trim();
  }
  const r = schema.safeParse(limpa);
  if (r.success) return r.data;

  const problemas = r.error.issues.map((i) => {
    const chave = i.path.map(String).join('.');
    const nome = chave.split('.')[0] ?? chave;
    const ausente = i.code === 'invalid_type' && limpa[nome] === undefined;
    const msg = ausente ? 'obrigatória e não definida' : i.message;
    return `${chave}: ${msg}`;
  });
  throw new EnvError([...new Set(problemas)]);
}

/**
 * Carrega .env (se existir) e valida process.env. Em caso de erro, imprime a
 * lista de problemas e encerra o processo (RNF11: valor inválido impede o start).
 */
export function loadEnv(): Env;
export function loadEnv<T extends z.ZodType>(schema: T): z.output<T>;
export function loadEnv(schema: z.ZodType = envSchema): unknown {
  const arquivo = resolve(process.cwd(), '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
  try {
    return parseEnv(schema, process.env);
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      console.error('Corrija o arquivo .env (veja .env.example) e inicie novamente.');
      process.exit(1);
    }
    throw err;
  }
}
