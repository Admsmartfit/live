// Segmentação e prioridade de envio (RF04, seção 5.2). Funções puras.
//
// O relatório do Gestor da Franquia não traz quantidade de compras nem ticket,
// então o segmento VIP não é calculável; a prioridade usa a data da última
// compra e a região (a loja é física e está encerrando).

import { normalizarTexto } from './clientes.js';

export type Segmento = 'RECENTE' | 'ANTIGO' | 'INATIVO';
export type Regiao = 'GV' | 'ES' | 'FORA';

export const DIAS_RECENTE = 183; // 6 meses
export const DIAS_ANTIGO = 730; // 24 meses

const GRANDE_VITORIA = new Set(['vila velha', 'vitoria', 'serra', 'cariacica', 'viana', 'guarapari', 'fundao']);

export function diasEntre(dataIso: string, hojeIso: string): number {
  const ms = Date.parse(`${hojeIso}T00:00:00Z`) - Date.parse(`${dataIso}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function segmentar(dias: number): Segmento {
  if (dias <= DIAS_RECENTE) return 'RECENTE';
  if (dias <= DIAS_ANTIGO) return 'ANTIGO';
  return 'INATIVO';
}

/** Região pela cidade ("Vila Velha/ES"); sem cidade, usa o DDD (27/28 = ES). */
export function regiao(cidade: string | null | undefined, ddd: string): Regiao {
  const c = normalizarTexto(cidade ?? '');
  const [nome = '', uf = ''] = c.split('/').map((s) => s.trim());
  if (uf === 'es' || (!uf && nome)) return GRANDE_VITORIA.has(nome) ? 'GV' : uf === 'es' ? 'ES' : 'FORA';
  if (uf) return 'FORA';
  return ddd === '27' || ddd === '28' ? 'ES' : 'FORA';
}

/**
 * Ordem de envio (faixa 0 = primeiro):
 * 0 GV recente · 1 GV antigo · 2 ES recente · 3 ES antigo ·
 * 4 GV inativo · 5 ES inativo · 6 fora recente · 7 fora antigo · 8 fora inativo.
 */
const FAIXAS: Record<Regiao, Record<Segmento, number>> = {
  GV: { RECENTE: 0, ANTIGO: 1, INATIVO: 4 },
  ES: { RECENTE: 2, ANTIGO: 3, INATIVO: 5 },
  FORA: { RECENTE: 6, ANTIGO: 7, INATIVO: 8 },
};

export function faixa(seg: Segmento, reg: Regiao): number {
  return FAIXAS[reg][seg];
}

/** Maior = envia antes. Dentro da faixa, a compra mais recente vem primeiro. */
export function prioridade(seg: Segmento, reg: Regiao, dias: number): number {
  return (9 - faixa(seg, reg)) * 100_000 - Math.min(dias, 99_999);
}
