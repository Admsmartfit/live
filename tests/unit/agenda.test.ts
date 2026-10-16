import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { limiteDoDia, verificarLimites } from '../../src/outbound/limits.js';
import { duracaoDigitacaoMs, intervaloAteProximo, planejarDia } from '../../src/outbound/scheduler.js';
import { diaSP, estadoJanela, type ConfigJanela } from '../../src/outbound/window.js';
import { rngComSemente } from '../../src/domain/spintax.js';

const SP = 'America/Sao_Paulo';
const em = (iso: string) => DateTime.fromISO(iso, { zone: SP });
const JANELA: ConfigJanela = {
  semana: { inicio: '09:00', fim: '20:00' },
  sabado: { inicio: '09:00', fim: '20:00' },
  domingo: null,
  feriados: ['2026-11-02'],
};

describe('janela de horário (09:00–20:00, fuso de São Paulo)', () => {
  it('aberta dentro do horário', () => {
    const e = estadoJanela(em('2026-10-14T10:00'), JANELA); // quarta
    expect(e.aberta).toBe(true);
    expect(e.fim?.toFormat('HH:mm')).toBe('20:00');
  });

  it('antes das 9h abre no mesmo dia; depois das 20h abre no dia seguinte', () => {
    expect(estadoJanela(em('2026-10-14T08:30'), JANELA).proximaAbertura?.toISO()).toBe(em('2026-10-14T09:00').toISO());
    expect(estadoJanela(em('2026-10-14T20:00'), JANELA).proximaAbertura?.toISO()).toBe(em('2026-10-15T09:00').toISO());
  });

  it('pula domingo e feriado', () => {
    // sábado 31/10 às 21h → domingo 01/11 fechado → segunda 02/11 feriado → terça 03/11
    expect(estadoJanela(em('2026-10-31T21:00'), JANELA).proximaAbertura?.toISO()).toBe(em('2026-11-03T09:00').toISO());
  });

  it('usa o fuso de São Paulo mesmo com horário em UTC', () => {
    const utc = DateTime.fromISO('2026-10-14T23:30:00Z'); // 20:30 em SP
    expect(estadoJanela(utc, JANELA).aberta).toBe(false);
    expect(diaSP(DateTime.fromISO('2026-10-15T02:00:00Z'))).toBe('2026-10-14');
  });
});

describe('trava diária e por hora', () => {
  it('limite do dia é o menor entre rampa e DAILY_LIMIT', () => {
    const rampa = [40, 60, 80, 100];
    expect(limiteDoDia(1, rampa, 100)).toBe(40);
    expect(limiteDoDia(3, rampa, 100)).toBe(80);
    expect(limiteDoDia(10, rampa, 100)).toBe(100);
    expect(limiteDoDia(10, rampa, 50)).toBe(50);
    expect(limiteDoDia(1, rampa, 25)).toBe(25);
  });

  it('bloqueia ao atingir o limite', () => {
    expect(verificarLimites({ enviadosHoje: 40, limiteHoje: 40, enviadosUltimaHora: 0, limiteHora: 20 })).toBe('LIMITE_DIA');
    expect(verificarLimites({ enviadosHoje: 5, limiteHoje: 40, enviadosUltimaHora: 20, limiteHora: 20 })).toBe('LIMITE_HORA');
    expect(verificarLimites({ enviadosHoje: 5, limiteHoje: 40, enviadosUltimaHora: 3, limiteHora: 20 })).toBeNull();
  });
});

describe('espaçamento ao longo da janela', () => {
  it('distribui o restante do dia entre as mensagens que faltam', () => {
    const s = intervaloAteProximo({
      agora: em('2026-10-14T09:00'),
      fimJanela: em('2026-10-14T20:00'),
      restantesHoje: 40,
      minimoS: 120,
      rng: () => 0.5,
    });
    expect(s).toBe(990); // 11h / 40 = 16,5 min
  });

  it('nunca menos que o mínimo', () => {
    const s = intervaloAteProximo({
      agora: em('2026-10-14T19:59'),
      fimJanela: em('2026-10-14T20:00'),
      restantesHoje: 30,
      minimoS: 120,
      rng: () => 0,
    });
    expect(s).toBe(120);
  });

  it('o dia planejado cabe na janela e respeita o limite', () => {
    for (const limite of [10, 40, 100]) {
      const horarios = planejarDia({ dia: em('2026-10-14T00:00'), janela: JANELA, limite, minimoS: 120, rng: rngComSemente(limite) });
      expect(horarios.length).toBeLessThanOrEqual(limite);
      expect(horarios.length).toBeGreaterThanOrEqual(Math.floor(limite * 0.85));
      expect(horarios[0]?.hour).toBe(9);
      expect(horarios.every((h) => h >= em('2026-10-14T09:00') && h < em('2026-10-14T20:00'))).toBe(true);
      // espaçados ao longo do dia, não concentrados no início
      expect(horarios.at(-1)?.hour).toBeGreaterThanOrEqual(17);
      for (let i = 1; i < horarios.length; i++) {
        expect((horarios[i]?.diff(horarios[i - 1] ?? em('2026-10-14T09:00'), 'seconds').seconds ?? 0)).toBeGreaterThanOrEqual(120);
      }
    }
  });

  it('domingo não tem envios', () => {
    expect(planejarDia({ dia: em('2026-10-18T00:00'), janela: JANELA, limite: 40, minimoS: 120, rng: Math.random })).toEqual([]);
  });

  it('digitação proporcional ao texto', () => {
    const c = { charsPorS: 40, minMs: 3000, maxMs: 6000 };
    expect(duracaoDigitacaoMs('x'.repeat(40), c)).toBe(3000);
    expect(duracaoDigitacaoMs('x'.repeat(200), c)).toBe(5000);
    expect(duracaoDigitacaoMs('x'.repeat(1000), c)).toBe(6000);
  });
});
