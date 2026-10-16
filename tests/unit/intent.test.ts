import { describe, expect, it } from 'vitest';
import { classificarIntencao, normalizarResposta, type Intencao } from '../../src/domain/intent.js';

const CASOS: [string, Intencao][] = [
  // positivos
  ['sim', 'SIM'],
  ['Sim!!', 'SIM'],
  ['SIM', 'SIM'],
  ['simmm', 'SIM'],
  ['s', 'SIM'],
  ['S', 'SIM'],
  ['ss', 'SIM'],
  ['👍', 'SIM'],
  ['🙏', 'SIM'],
  ['❤️', 'SIM'],
  ['quero sim', 'SIM'],
  ['quero', 'SIM'],
  ['Quero!', 'SIM'],
  ['eu quero', 'SIM'],
  ['sim por favor', 'SIM'],
  ['manda', 'SIM'],
  ['pode mandar', 'SIM'],
  ['Pode sim', 'SIM'],
  ['mande por favor', 'SIM'],
  ['envia ai', 'SIM'],
  ['claro!', 'SIM'],
  ['opa', 'SIM'],
  ['bora', 'SIM'],
  ['com certeza', 'SIM'],
  ['aceito', 'SIM'],
  ['ok', 'SIM'],
  ['Ok, obrigada', 'SIM'],
  ['beleza', 'SIM'],
  ['blz', 'SIM'],
  ['tenho interesse', 'SIM'],
  ['Gostaria sim', 'SIM'],
  ['Sim, quero o voucher', 'SIM'],
  ['oi, sim', 'SIM'],
  ['Sim 😍', 'SIM'],
  // opt-out forte
  ['SAIR', 'OPT_OUT'],
  ['sair', 'OPT_OUT'],
  ['pare', 'OPT_OUT'],
  ['pode parar', 'OPT_OUT'],
  ['para de mandar mensagem', 'OPT_OUT'],
  ['cancelar', 'OPT_OUT'],
  ['me descadastrar', 'OPT_OUT'],
  ['remover', 'OPT_OUT'],
  ['não quero', 'OPT_OUT'],
  ['nao quero nada', 'OPT_OUT'],
  ['não tenho interesse', 'OPT_OUT'],
  ['Não tenho interesse, obrigada', 'OPT_OUT'],
  ['vou bloquear', 'OPT_OUT'],
  ['vou denunciar', 'OPT_OUT'],
  ['isso é spam', 'OPT_OUT'],
  ['me tira dessa lista', 'OPT_OUT'],
  ['não mande mais', 'OPT_OUT'],
  ['sim, quero sair', 'OPT_OUT'],
  // negação
  ['não', 'NAO'],
  ['Naooo', 'NAO'],
  ['naoo obrigada', 'NAO'],
  ['NÃOOO QUERO', 'OPT_OUT'],
  ['Siiiim', 'SIM'],
  ['nao', 'NAO'],
  ['Não!', 'NAO'],
  ['nao obg', 'NAO'],
  ['não, obrigado', 'NAO'],
  ['n', 'NAO'],
  ['nem pensar', 'NAO'],
  ['obrigada mas não', 'NAO'],
  ['agora não', 'NAO'],
  ['claro que não', 'NAO'],
  ['jamais', 'NAO'],
  ['Obrigado, dispenso', 'NAO'],
  // desconhecido
  ['assim que der eu vejo', 'DESCONHECIDO'],
  ['quem é?', 'DESCONHECIDO'],
  ['onde fica a loja?', 'DESCONHECIDO'],
  ['qual o horário?', 'DESCONHECIDO'],
  ['bom dia', 'DESCONHECIDO'],
  ['oi', 'DESCONHECIDO'],
  ['', 'DESCONHECIDO'],
  ['???', 'DESCONHECIDO'],
  ['vocês têm calça jeans?', 'DESCONHECIDO'],
  ['passou', 'DESCONHECIDO'],
];

describe('classificarIntencao (RF11)', () => {
  it('tem pelo menos 60 frases de teste', () => {
    expect(CASOS.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASOS)('"%s" → %s', (texto, esperado) => {
    expect(classificarIntencao({ texto })).toBe(esperado);
  });

  it('botão vence o texto', () => {
    expect(classificarIntencao({ botaoId: 'BTN_QUERO_VOUCHER', texto: 'não' })).toBe('SIM');
    expect(classificarIntencao({ botaoId: 'BTN_NAO_QUERO', texto: 'sim' })).toBe('NAO');
  });

  it('normaliza acentos, pontuação e espaços', () => {
    expect(normalizarResposta('  Não,   OBRIGADÃO!! ')).toBe('nao obrigadao');
  });
});
