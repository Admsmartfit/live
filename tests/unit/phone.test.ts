import { describe, expect, it } from 'vitest';
import { mascararTelefone, normalizarCampoTelefone, normalizarTelefone } from '../../src/domain/phone.js';

const ok = (bruto: string) => {
  const r = normalizarTelefone(bruto);
  if (!r.ok) throw new Error(`esperado válido: ${bruto} (${r.motivo})`);
  return r;
};
const motivo = (bruto: string) => {
  const r = normalizarTelefone(bruto);
  return r.ok ? 'OK' : r.motivo;
};

describe('normalizarTelefone (RF02)', () => {
  it.each(['(27) 99988-7766', '27999887766', '+55 27 9 9988-7766'])('aceite do RF02: %s → 5527999887766', (bruto) => {
    expect(ok(bruto).telefone).toBe('5527999887766');
  });

  it('guarda a variante sem o 9º dígito', () => {
    expect(ok('(27) 999887766').telefoneAlt).toBe('552799887766');
  });

  it.each([
    ['(27) 999024411', '5527999024411', []],
    ['() 2799982-7257', '5527999827257', []],
    ['(27) 27998834422', '5527998834422', ['DDD_REPETIDO']],
    ['(279) 98490784', '5527998490784', []],
    ['(011) 950238948', '5511950238948', []],
    ['() 99273-4024', '5527992734024', ['DDD_ASSUMIDO']],
    ['(27) 99715456', '5527999715456', ['NONO_DIGITO_ADICIONADO']],
    ['(27) 2799977732', '5527999977732', ['DDD_REPETIDO', 'NONO_DIGITO_ADICIONADO']],
  ])('formato do relatório %s', (bruto, esperado, ajustes) => {
    const r = ok(bruto);
    expect(r.telefone).toBe(esperado);
    expect(r.ajustes).toEqual(ajustes);
  });

  it.each([
    ['', 'VAZIO'],
    ['()', 'VAZIO'],
    ['(27) 3299-0758', 'FIXO'],
    ['(27) 32393994', 'FIXO'],
    ['(00) 0000000000', 'INVALIDO'],
    ['(19) 999999999', 'FICTICIO'],
    ['(27) 99999999999', 'FICTICIO'],
    ['(28) 9999767298', 'INVALIDO'],
    ['LGPD', 'VAZIO'],
    ['(20) 999887766', 'INVALIDO'],
  ])('rejeita %s → %s', (bruto, esperado) => {
    expect(motivo(bruto)).toBe(esperado);
  });

  it('campo com dois números usa o primeiro válido', () => {
    const r = normalizarCampoTelefone('(73) 73345332122 (73) 73982562171');
    expect(r.ok && r.telefone).toBe('5573982562171');
  });

  it('mascara para logs', () => {
    expect(mascararTelefone('5527999887766')).toBe('5527*****7766');
  });
});
