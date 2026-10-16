// Derivações da configuração usadas por worker, CLI e simulação.

import { resolve } from 'node:path';
import type { Env } from './env.js';
import type { ConfigJanela } from '../outbound/window.js';

export function configJanela(env: Env): ConfigJanela {
  const semana = { inicio: env.WINDOW_WEEKDAY_START, fim: env.WINDOW_WEEKDAY_END };
  return {
    semana,
    sabado: { inicio: env.WINDOW_SATURDAY_START, fim: env.WINDOW_SATURDAY_END },
    domingo: env.WINDOW_SUNDAY ? semana : null,
    feriados: env.HOLIDAYS,
  };
}

export function caminhoBanco(env: Pick<Env, 'DATA_DIR'>): string {
  return resolve(process.cwd(), env.DATA_DIR, 'campanha.db');
}

/** Pasta da imagem do voucher enviada pelo painel. */
export function pastaVoucher(env: Pick<Env, 'DATA_DIR'>): string {
  return resolve(process.cwd(), env.DATA_DIR, 'voucher');
}

export function caminhoTemplates(env: Pick<Env, 'TEMPLATES_DIR'>): string {
  return resolve(process.cwd(), env.TEMPLATES_DIR);
}
