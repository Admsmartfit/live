import { describe, expect, it } from 'vitest';
import { ehEmpresa, ehFuncionaria, nomeTitulo, primeiroNome, vendedoraValida } from '../../src/domain/clientes.js';
import { diasEntre, faixa, prioridade, regiao, segmentar } from '../../src/domain/segment.js';

const VENDEDORAS = ['Nathiele de Paula Fons', 'Ana Clara Teles de Oliv', 'Gabrielli Aragão Lima', 'Paola Gusmão Barrack'];

describe('nomes', () => {
  it('formato título com conectivos minúsculos', () => {
    expect(nomeTitulo('ALESSANDRA DE LIMA ELIAS VAZ')).toBe('Alessandra de Lima Elias Vaz');
    expect(nomeTitulo('aldair jose de almeida')).toBe('Aldair Jose de Almeida');
  });

  it('primeiro nome', () => {
    expect(primeiroNome('ANDRÉ SILVA JORGE')).toBe('André');
    expect(primeiroNome('Fl?via Barros')).toBeNull();
    expect(primeiroNome('.Rua Curitiba')).toBeNull();
  });

  it('empresa', () => {
    expect(ehEmpresa('Iq Industria E Comercio De Artigos Esportivos Ltda')).toBe(true);
    expect(ehEmpresa('Mitra Arquidiocesana')).toBe(true);
    expect(ehEmpresa('Erica De Sa Cavalcanti')).toBe(false);
    expect(ehEmpresa('Nathalia Sa')).toBe(false);
  });

  it('funcionária cadastrada como cliente', () => {
    expect(ehFuncionaria('Nathiele De Paula Fonseca', VENDEDORAS)).toBe(true);
    expect(ehFuncionaria('Paola Gusmao Barrack', VENDEDORAS)).toBe(true);
    expect(ehFuncionaria('Gabrielli Aragão', VENDEDORAS)).toBe(true);
    expect(ehFuncionaria('Isabelly Divina Santos De Freitas', ['Isabely Divina Santos d'])).toBe(true);
    expect(ehFuncionaria('Ana Clara', VENDEDORAS)).toBe(false);
    expect(ehFuncionaria('Karyna Gusmão Barrack', VENDEDORAS)).toBe(false);
    expect(ehFuncionaria('Ana Clara Almeida', VENDEDORAS)).toBe(false);
  });

  it('"Venda Funcionario" não é vendedora', () => {
    expect(vendedoraValida('Venda Funcionario')).toBe(false);
    expect(vendedoraValida('Isabely Divina Santos d')).toBe(true);
  });
});

describe('segmentação e prioridade', () => {
  it('segmentos por recência', () => {
    expect(diasEntre('2026-10-01', '2026-10-14')).toBe(13);
    expect(segmentar(10)).toBe('RECENTE');
    expect(segmentar(183)).toBe('RECENTE');
    expect(segmentar(184)).toBe('ANTIGO');
    expect(segmentar(731)).toBe('INATIVO');
  });

  it('região pela cidade, com DDD como reserva', () => {
    expect(regiao('Vila Velha/ES', '27')).toBe('GV');
    expect(regiao('Vitória/ES', '11')).toBe('GV');
    expect(regiao('Colatina/ES', '27')).toBe('ES');
    expect(regiao('Belo Horizonte/MG', '27')).toBe('FORA');
    expect(regiao('', '28')).toBe('ES');
    expect(regiao('', '31')).toBe('FORA');
  });

  it('ordem: GV recente > GV antigo > ES > GV inativo > fora do ES', () => {
    expect(faixa('RECENTE', 'GV')).toBeLessThan(faixa('ANTIGO', 'GV'));
    expect(faixa('ANTIGO', 'ES')).toBeLessThan(faixa('INATIVO', 'GV'));
    expect(faixa('INATIVO', 'ES')).toBeLessThan(faixa('RECENTE', 'FORA'));
    expect(prioridade('RECENTE', 'GV', 5)).toBeGreaterThan(prioridade('RECENTE', 'GV', 90));
    expect(prioridade('RECENTE', 'GV', 180)).toBeGreaterThan(prioridade('ANTIGO', 'GV', 200));
  });
});
