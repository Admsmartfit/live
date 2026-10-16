// Montagem da mensagem de convite (seção 5): modelo do segmento + rodapé SIM/SAIR.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { FUSO } from '../config/constants.js';
import { expandir, preencher } from './spintax.js';

export type VersaoTexto = 'B1' | 'B2' | 'C1' | 'C2';

export interface Modelos {
  convites: Record<VersaoTexto, string>;
  rodapes: string[];
}

export interface DadosMensagem {
  nome: string;
  vendedora: string | null;
  loja: string;
  dataFim: string; // já formatada, ex.: "31/10 (sábado)"
}

export function carregarModelos(dir: string): Modelos {
  const ler = (arq: string) => readFileSync(join(dir, arq), 'utf8').trim();
  return {
    convites: { B1: ler('convite-B1.txt'), B2: ler('convite-B2.txt'), C1: ler('convite-C1.txt'), C2: ler('convite-C2.txt') },
    rodapes: [ler('rodape-1.txt'), ler('rodape-2.txt'), ler('rodape-3.txt')],
  };
}

/** Recentes com vendedora ativa → B (fala em nome dela); demais → C (fala em nome da loja). 50/50 entre os dois. */
export function escolherVersao(segmento: string | null, vendedora: string | null, rng: () => number): VersaoTexto {
  const metade = rng() < 0.5;
  if (segmento === 'RECENTE' && vendedora) return metade ? 'B1' : 'B2';
  return metade ? 'C1' : 'C2';
}

/** "2026-10-31" → "31/10 (sábado)": cabe em "em …", "até …" e "O prazo é …". */
export function formatarDataFim(iso: string): string {
  const d = DateTime.fromISO(iso, { zone: FUSO }).setLocale('pt-BR');
  if (!d.isValid) throw new Error(`CAMPANHA_DATA_FIM inválida: ${iso}`);
  return d.toFormat("dd/MM '('cccc')'");
}

const PROIBIDOS: [RegExp, string][] = [
  [/[{}]/, 'chave residual'],
  [/tudo 50\s*%/i, '"tudo 50%"'],
  [/https?:\/\/|www\./i, 'link'],
];

export class MensagemInvalida extends Error {}

/** Recusa texto com chave residual, "tudo 50%" ou link (seção 5.1). */
export function validarMensagem(texto: string): void {
  for (const [re, motivo] of PROIBIDOS) {
    if (re.test(texto)) throw new MensagemInvalida(`Mensagem recusada: contém ${motivo}`);
  }
}

export function gerarMensagem(
  modelos: Modelos,
  dados: DadosMensagem,
  versao: VersaoTexto,
  rng: () => number = Math.random,
): string {
  const rodape = modelos.rodapes[Math.floor(rng() * modelos.rodapes.length)] ?? modelos.rodapes[0] ?? '';
  const corpo = expandir(modelos.convites[versao], rng);
  const texto = preencher(`${corpo}\n\n${expandir(rodape, rng)}`, {
    nome: dados.nome,
    vendedora: dados.vendedora ?? '',
    loja: dados.loja,
    data_fim: dados.dataFim,
  });
  validarMensagem(texto);
  return texto;
}

export function hashTexto(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}
