// Respostas automáticas (seções 5.4 e 5.5, RF13–RF15). Funções puras.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StatusCliente } from '../config/constants.js';
import type { Intencao } from './intent.js';
import { expandir, preencher } from './spintax.js';
import { validarMensagem } from './templates.js';

export type TipoResposta = 'R1' | 'R1_IMG' | 'R2' | 'R3' | 'R4';

export type ModelosResposta = Record<TipoResposta, string>;

const ARQUIVOS: Record<TipoResposta, string> = {
  R1: 'resposta-R1.txt',
  R1_IMG: 'resposta-R1-IMG.txt',
  R2: 'resposta-R2.txt',
  R3: 'resposta-R3.txt',
  R4: 'resposta-R4.txt',
};

export function carregarModelosResposta(dir: string): ModelosResposta {
  const ler = (t: TipoResposta) => readFileSync(join(dir, ARQUIVOS[t]), 'utf8').trim();
  return { R1: ler('R1'), R1_IMG: ler('R1_IMG'), R2: ler('R2'), R3: ler('R3'), R4: ler('R4') };
}

export interface DadosResposta {
  nome: string;
  loja: string;
  dataFim: string; // já formatada
  endereco: string;
}

/** Gera o texto; linhas cujo valor ficou vazio (ex.: "📍 " sem endereço) são removidas. */
export function gerarResposta(
  modelos: ModelosResposta,
  tipo: TipoResposta,
  dados: DadosResposta,
  rng: () => number = Math.random,
): string {
  const linhas = expandir(modelos[tipo], rng).split('\n');
  const usadas = linhas.filter((l) => !/\{\{endereco\}\}/.test(l) || dados.endereco.trim() !== '');
  const texto = preencher(usadas.join('\n'), {
    nome: dados.nome,
    loja: dados.loja,
    data_fim: dados.dataFim,
    endereco: dados.endereco.trim(),
  })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  validarMensagem(texto);
  return texto;
}

/**
 * O que fazer com uma resposta:
 * - VOUCHER: texto R1 e, 3 a 5 s depois, a imagem (RF13).
 * - VOUCHER_DE_NOVO: cliente que já recebeu pede de novo → R3 + a mesma imagem.
 * - BLOQUEAR: NÃO / SAIR → R2 uma única vez e lista de bloqueados (RF14).
 * - NAO_ENTENDIDO: 1ª resposta não entendida → R4 (RF15).
 * - HUMANO: 2ª não entendida, mídia, ou resposta depois do prazo → sem resposta automática.
 * - NADA: já bloqueado, ou estado em que não cabe resposta.
 */
export type AcaoResposta = 'VOUCHER' | 'VOUCHER_DE_NOVO' | 'BLOQUEAR' | 'NAO_ENTENDIDO' | 'HUMANO' | 'NADA';

/** `TESTE` = número da lista de teste que não está na base de clientes. */
export function decidirAcao(status: StatusCliente | 'TESTE', intencao: Intencao, midia: boolean): AcaoResposta {
  if (status === 'OPT_OUT' || status === 'SUPRIMIDO') return 'NADA';
  if (intencao === 'NAO' || intencao === 'OPT_OUT') return 'BLOQUEAR';

  if (status === 'TESTE') {
    if (intencao === 'SIM') return 'VOUCHER';
    return midia ? 'NADA' : 'NAO_ENTENDIDO';
  }
  if (status === 'SEM_RESPOSTA') return 'HUMANO';

  if (intencao === 'SIM') {
    if (status === 'ENVIADO' || status === 'DESCONHECIDO_1X' || status === 'AGUARDANDO_HUMANO') return 'VOUCHER';
    if (status === 'VOUCHER_ENVIADO') return 'VOUCHER_DE_NOVO';
    return 'NADA';
  }

  // Não entendido ou mídia.
  if (status === 'ENVIADO') return midia ? 'HUMANO' : 'NAO_ENTENDIDO';
  if (status === 'DESCONHECIDO_1X') return 'HUMANO';
  return 'NADA';
}

/** Momento a partir do qual um convite sem resposta é bloqueado. */
export function limitePrazoIso(agora: Date, dias: number): string {
  return new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}
