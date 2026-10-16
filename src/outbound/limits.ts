// Trava diária e por hora (controles 5 e 6). Funções puras.

/**
 * Limite de envios do dia: o menor entre a rampa (dia 1, 2, 3…) e o limite fixo (DAILY_LIMIT).
 * `diaDaCampanha` começa em 1. Depois do fim da rampa, vale o último valor.
 */
export function limiteDoDia(diaDaCampanha: number, rampa: readonly number[], limiteFixo: number): number {
  const i = Math.min(Math.max(1, diaDaCampanha), rampa.length) - 1;
  const daRampa = rampa[i] ?? limiteFixo;
  return Math.max(0, Math.min(daRampa, limiteFixo));
}

export type Bloqueio = 'LIMITE_DIA' | 'LIMITE_HORA';

export function verificarLimites(c: {
  enviadosHoje: number;
  limiteHoje: number;
  enviadosUltimaHora: number;
  limiteHora: number;
}): Bloqueio | null {
  if (c.enviadosHoje >= c.limiteHoje) return 'LIMITE_DIA';
  if (c.enviadosUltimaHora >= c.limiteHora) return 'LIMITE_HORA';
  return null;
}
