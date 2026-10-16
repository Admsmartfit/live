// Classificação de intenção da resposta do cliente (RF11). Função pura.
// Ordem: botão > opt-out forte > negação > positivo > desconhecido.

import { BOTAO } from '../config/constants.js';

export type Intencao = 'SIM' | 'NAO' | 'OPT_OUT' | 'DESCONHECIDO';

/** Minúsculas, sem acentos, sem pontuação, espaços colapsados. */
export function normalizarResposta(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})\1{2,}/gu, '$1') // letras esticadas: "naooo" → "nao", "simmm" → "sim"
    .replace(/\bnaoo\b/g, 'nao')
    .trim();
}

const termos = (lista: string[]) => new RegExp(`(?:^| )(?:${lista.join('|')})(?: |$)`);

const OPT_OUT = termos([
  'sair',
  'pare',
  'parar',
  'para de mandar',
  'para de enviar',
  'cancelar',
  'descadastrar',
  'descadastra',
  'remover',
  'remove',
  'me tira',
  'tira meu numero',
  'nao quero',
  'nao tenho interesse',
  'nao mande',
  'nao envie',
  'nao me mande',
  'bloquear',
  'denunciar',
  'spam',
]);

const NEGACAO_INICIAL = /^(?:nao|n|nem|jamais|nunca|obrigad[oa] mas|dispenso)(?: |$)/;
const NEGACAO_EM_QUALQUER_LUGAR = termos(['que nao', 'agora nao', 'nao obrigad[oa]', 'nao obg', 'dispenso']);

const POSITIVO = termos([
  'si+m+',
  'quero',
  'manda',
  'mande',
  'mandar',
  'envia',
  'envie',
  'pode',
  'claro',
  'opa',
  'bora',
  'com certeza',
  'aceito',
  'ok',
  'okay',
  'beleza',
  'blz',
  's',
  'ss',
  'tenho interesse',
  'gostaria',
  'interessad[oa]',
]);
const EMOJI_POSITIVO = /👍|🙏|❤|😍|🥰/u;

export interface Resposta {
  texto?: string | null;
  botaoId?: string | null;
}

export function classificarIntencao(r: Resposta): Intencao {
  if (r.botaoId === BOTAO.QUERO_VOUCHER) return 'SIM';
  if (r.botaoId === BOTAO.NAO_QUERO) return 'NAO';
  const bruto = r.texto ?? '';
  const t = normalizarResposta(bruto);
  if (t === '' && !EMOJI_POSITIVO.test(bruto)) return 'DESCONHECIDO';
  if (OPT_OUT.test(t)) return 'OPT_OUT';
  if (NEGACAO_INICIAL.test(t) || NEGACAO_EM_QUALQUER_LUGAR.test(t)) return 'NAO';
  if (POSITIVO.test(t) || EMOJI_POSITIVO.test(bruto)) return 'SIM';
  return 'DESCONHECIDO';
}
