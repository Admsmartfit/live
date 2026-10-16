// Leitura e atualização do arquivo .env usado pelo painel.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseEnv as lerTextoEnv } from 'node:util';
import { envSchema, parseEnv, type Env } from './env.js';

/** Valor seguro para uma linha CHAVE=valor (sem quebra de linha). */
function valorLinha(v: string): string {
  return v.replace(/[\r\n]/g, '').trim();
}

/**
 * Atualiza as chaves no texto do .env mantendo comentários e ordem.
 * Chaves inexistentes são acrescentadas no fim. Função pura.
 */
export function atualizarTextoEnv(texto: string, valores: Readonly<Record<string, string>>): string {
  const pendentes = new Map(Object.entries(valores));
  const linhas = texto.split(/\r?\n/).map((linha) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(linha);
    const chave = m?.[1];
    if (chave === undefined || !pendentes.has(chave)) return linha;
    const novo = `${chave}=${valorLinha(pendentes.get(chave) ?? '')}`;
    pendentes.delete(chave);
    return novo;
  });
  while (linhas.length > 0 && linhas.at(-1) === '') linhas.pop();
  for (const [chave, v] of pendentes) linhas.push(`${chave}=${valorLinha(v)}`);
  return `${linhas.join('\r\n')}\r\n`;
}

export function lerArquivoEnv(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {};
  return lerTextoEnv(readFileSync(caminho, 'utf8')) as Record<string, string>;
}

/** Grava de forma atômica (arquivo temporário + renomear). */
export function gravarArquivoEnv(caminho: string, valores: Readonly<Record<string, string>>): void {
  const atual = existsSync(caminho) ? readFileSync(caminho, 'utf8') : '';
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, atualizarTextoEnv(atual, valores), 'utf8');
  renameSync(tmp, caminho);
}

/** Configuração atual: o arquivo .env tem prioridade sobre o ambiente do processo. */
export function envAtual(caminho: string, base: Readonly<Record<string, string | undefined>> = process.env): Env {
  return parseEnv(envSchema, { ...base, ...lerArquivoEnv(caminho) });
}
