// Espaçamento dos envios ao longo da janela (controles 1 e 3). Funções puras.

import type { DateTime } from 'luxon';
import { janelaDoDia, type ConfigJanela } from './window.js';

/**
 * Segundos até o próximo envio: divide o tempo que resta na janela pelas
 * mensagens que faltam no dia e aplica variação aleatória de 60% a 140%
 * (média de dois sorteios, para não ficar uniforme). Nunca menos que `minimoS`.
 */
export function intervaloAteProximo(p: {
  agora: DateTime;
  fimJanela: DateTime;
  restantesHoje: number;
  minimoS: number;
  rng: () => number;
}): number {
  const ate = Math.max(0, p.fimJanela.diff(p.agora, 'seconds').seconds);
  if (p.restantesHoje <= 0 || ate <= 0) return p.minimoS;
  const base = ate / p.restantesHoje;
  const fator = 0.6 + 0.8 * ((p.rng() + p.rng()) / 2);
  const teto = Math.max(p.minimoS, ate - 60);
  return Math.round(Math.min(Math.max(base * fator, p.minimoS), teto));
}

/** Tempo de "digitando" proporcional ao texto (~40 caracteres/s), entre min e max. */
export function duracaoDigitacaoMs(texto: string, c: { charsPorS: number; minMs: number; maxMs: number }): number {
  const ms = (texto.length / c.charsPorS) * 1000;
  return Math.round(Math.min(Math.max(ms, c.minMs), c.maxMs));
}

/** Horários previstos de envio num dia (usado pela simulação). */
export function planejarDia(p: {
  dia: DateTime;
  janela: ConfigJanela;
  limite: number;
  minimoS: number;
  rng: () => number;
}): DateTime[] {
  const j = janelaDoDia(p.dia, p.janela);
  if (!j || p.limite <= 0) return [];
  const horarios: DateTime[] = [];
  // Primeiro envio alguns minutos depois da abertura, para não começar sempre no mesmo minuto.
  let t = j.inicio.plus({ seconds: Math.round(p.rng() * 600) });
  while (horarios.length < p.limite && t < j.fim) {
    horarios.push(t);
    const s = intervaloAteProximo({
      agora: t,
      fimJanela: j.fim,
      restantesHoje: p.limite - horarios.length,
      minimoS: p.minimoS,
      rng: p.rng,
    });
    t = t.plus({ seconds: s });
  }
  return horarios;
}
