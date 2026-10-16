import { describe, expect, it } from 'vitest';
import { POLITICA, classificarErro, type ClasseErro } from '../../src/evolution/errors.js';

describe('classificarErro (seção 8)', () => {
  const casos: [string, Parameters<typeof classificarErro>[0], ClasseErro][] = [
    ['timeout', { timeout: true }, 'TRANSITORIO'],
    ['erro de rede', { erroRede: true }, 'TRANSITORIO'],
    ['429', { status: 429 }, 'TRANSITORIO'],
    ['500 genérico', { status: 500, corpo: 'Internal Server Error' }, 'TRANSITORIO'],
    ['502', { status: 502 }, 'TRANSITORIO'],
    ['503', { status: 503 }, 'TRANSITORIO'],
    ['504', { status: 504 }, 'TRANSITORIO'],
    ['401', { status: 401 }, 'AUTENTICACAO'],
    ['403', { status: 403 }, 'AUTENTICACAO'],
    ['banned', { status: 500, corpo: { message: 'This account is banned' } }, 'AUTENTICACAO'],
    ['restricted', { status: 400, corpo: 'account restricted' }, 'AUTENTICACAO'],
    ['400 exists:false', { status: 400, corpo: { response: { message: [{ exists: false }] } } }, 'NUMERO'],
    ['400 not exists', { status: 400, corpo: 'number not exists' }, 'NUMERO'],
    ['400 jid inválido', { status: 400, corpo: 'Invalid JID' }, 'NUMERO'],
    ['Connection Closed', { status: 500, corpo: ['Error: Connection Closed'] }, 'CONEXAO'],
    ['state close', { status: 400, corpo: { state: 'close' } }, 'CONEXAO'],
    ['state connecting', { status: 400, corpo: { state: 'connecting' } }, 'CONEXAO'],
    ['instância inexistente', { status: 404, corpo: 'The "x" instance does not exist' }, 'CONEXAO'],
    ['400 genérico', { status: 400, corpo: { message: 'bad' } }, 'DESCONHECIDO'],
    ['404 genérico', { status: 404 }, 'DESCONHECIDO'],
  ];

  it.each(casos)('%s', (_nome, entrada, esperada) => {
    expect(classificarErro(entrada)).toBe(esperada);
  });

  it('palavras contendo "banned" como substring não disparam kill switch', () => {
    expect(classificarErro({ status: 400, corpo: 'unbannedx' })).toBe('DESCONHECIDO');
  });

  it('política segue a tabela da seção 8', () => {
    expect(POLITICA.TRANSITORIO).toEqual({ contaComoFalha: true, critico: false, retentavel: true });
    expect(POLITICA.NUMERO).toEqual({ contaComoFalha: false, critico: false, retentavel: false });
    expect(POLITICA.AUTENTICACAO).toEqual({ contaComoFalha: true, critico: true, retentavel: false });
    expect(POLITICA.CONEXAO).toEqual({ contaComoFalha: true, critico: true, retentavel: false });
  });
});
