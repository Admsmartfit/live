// Janela de horário (controle 4), sempre no fuso America/Sao_Paulo (RNF12). Funções puras.

import type { DateTime } from 'luxon';
import { FUSO } from '../config/constants.js';

export interface Faixa {
  inicio: string; // HH:mm
  fim: string; // HH:mm
}

export interface ConfigJanela {
  semana: Faixa; // segunda a sexta
  sabado: Faixa | null;
  domingo: Faixa | null;
  feriados: readonly string[]; // AAAA-MM-DD
}

export interface EstadoJanela {
  aberta: boolean;
  /** Fim da janela atual (se aberta). */
  fim: DateTime | null;
  /** Próxima abertura (se fechada). */
  proximaAbertura: DateTime | null;
}

function emHorario(dia: DateTime, hhmm: string): DateTime {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return dia.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

export function janelaDoDia(dia: DateTime, cfg: ConfigJanela): { inicio: DateTime; fim: DateTime } | null {
  const d = dia.setZone(FUSO);
  if (cfg.feriados.includes(d.toISODate() ?? '')) return null;
  const faixa = d.weekday === 7 ? cfg.domingo : d.weekday === 6 ? cfg.sabado : cfg.semana;
  if (!faixa) return null;
  return { inicio: emHorario(d, faixa.inicio), fim: emHorario(d, faixa.fim) };
}

export function estadoJanela(agora: DateTime, cfg: ConfigJanela): EstadoJanela {
  const a = agora.setZone(FUSO);
  const hoje = janelaDoDia(a, cfg);
  if (hoje && a >= hoje.inicio && a < hoje.fim) return { aberta: true, fim: hoje.fim, proximaAbertura: null };
  if (hoje && a < hoje.inicio) return { aberta: false, fim: null, proximaAbertura: hoje.inicio };
  for (let d = 1; d <= 30; d++) {
    const j = janelaDoDia(a.plus({ days: d }).startOf('day'), cfg);
    if (j) return { aberta: false, fim: null, proximaAbertura: j.inicio };
  }
  return { aberta: false, fim: null, proximaAbertura: null };
}

/** Dia civil em São Paulo (chave dos contadores diários). */
export function diaSP(agora: DateTime): string {
  return agora.setZone(FUSO).toISODate() ?? '';
}
