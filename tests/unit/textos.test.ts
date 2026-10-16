import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contarCombinacoes, expandir, preencher, rngComSemente } from '../../src/domain/spintax.js';
import {
  carregarModelos,
  escolherVersao,
  formatarDataFim,
  gerarMensagem,
  hashTexto,
  MensagemInvalida,
  validarMensagem,
} from '../../src/domain/templates.js';

describe('spintax (RF06)', () => {
  it('sorteia opções com aninhamento', () => {
    const t = '{Oi|Olá} {a|{b|c}}';
    const vistos = new Set(Array.from({ length: 200 }, (_, i) => expandir(t, rngComSemente(i))));
    expect(vistos).toEqual(new Set(['Oi a', 'Oi b', 'Oi c', 'Olá a', 'Olá b', 'Olá c']));
  });

  it('preserva {{variavel}} e conta combinações', () => {
    expect(expandir('{{nome}}, {a|b}', () => 0)).toBe('{{nome}}, a');
    expect(contarCombinacoes('{a|b} {c|d|e} {{x}}')).toBe(6);
    expect(contarCombinacoes('{a|{b|c}}')).toBe(3);
  });

  it('variáveis são literais: "{" ou "|" no valor não quebram', () => {
    expect(preencher('Oi {{nome}}!', { nome: 'Ana {x|y}' })).toBe('Oi Ana {x|y}!');
  });

  it('semente reproduz o mesmo texto', () => {
    const t = '{a|b|c|d} {e|f|g}';
    expect(expandir(t, rngComSemente(42))).toBe(expandir(t, rngComSemente(42)));
  });

  it('erro de sintaxe é detectado', () => {
    expect(() => expandir('{a|b')).toThrow();
    expect(() => expandir('a}b')).toThrow();
  });
});

describe('mensagens de convite (seção 5)', () => {
  const modelos = carregarModelos(resolve('templates'));
  const dados = { nome: 'Mariana', vendedora: 'Isabely', loja: 'LIVE! Vila Velha', dataFim: '31/10 (sábado)' };

  it('modelos da seção 5.3 são válidos e geram texto sem chaves, link ou "tudo 50%"', () => {
    for (const v of ['B1', 'B2', 'C1', 'C2'] as const) {
      for (let s = 0; s < 30; s++) {
        const texto = gerarMensagem(modelos, dados, v, rngComSemente(s));
        expect(texto).toContain('Mariana');
        expect(texto).toMatch(/SAIR/);
        expect(texto).not.toMatch(/[{}]|https?:|tudo 50/);
      }
    }
  });

  it('10 gerações para o mesmo cliente dão ao menos 9 textos distintos (TC-01)', () => {
    const textos = new Set(Array.from({ length: 10 }, (_, s) => gerarMensagem(modelos, dados, 'B1', rngComSemente(s * 7919))));
    expect(textos.size).toBeGreaterThanOrEqual(9);
  });

  it('cada modelo com rodapé passa de 200 combinações', () => {
    const rodapes = modelos.rodapes.reduce((s, r) => s + contarCombinacoes(r), 0);
    for (const v of ['B1', 'B2', 'C1', 'C2'] as const) {
      expect(contarCombinacoes(modelos.convites[v]) * rodapes).toBeGreaterThanOrEqual(200);
    }
  });

  it('modelo B só com vendedora e cliente recente', () => {
    expect(escolherVersao('RECENTE', 'Isabely', () => 0.1)).toBe('B1');
    expect(escolherVersao('RECENTE', null, () => 0.1)).toBe('C1');
    expect(escolherVersao('ANTIGO', 'Isabely', () => 0.9)).toBe('C2');
  });

  it('validador recusa texto proibido', () => {
    expect(() => {
      validarMensagem('tudo 50% off');
    }).toThrow(MensagemInvalida);
    expect(() => {
      validarMensagem('veja www.site.com');
    }).toThrow(MensagemInvalida);
  });

  it('data de fim por extenso e hash estável', () => {
    expect(formatarDataFim('2026-10-31')).toBe('31/10 (sábado)');
    expect(hashTexto('a')).toBe(hashTexto('a'));
    expect(hashTexto('a')).not.toBe(hashTexto('b'));
  });
});
