// Imagem do voucher enviada pelo painel e mandada ao cliente que responde SIM.
// Fica em DATA_DIR/voucher/voucher.jpg (ou .png) — fora do git, como os demais dados.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;

type Formato = { ext: 'jpg' | 'png'; mimetype: 'image/jpeg' | 'image/png' };

/** Reconhece o formato pelos primeiros bytes (não confia no nome do arquivo). */
export function formatoImagem(b: Uint8Array): Formato | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mimetype: 'image/jpeg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((v, i) => b[i] === v)) return { ext: 'png', mimetype: 'image/png' };
  return null;
}

export class ImagemInvalida extends Error {}

export interface ImagemVoucher {
  caminho: string;
  mimetype: string;
  fileName: string;
  bytes: number;
  atualizadaEm: string;
}

function arquivoAtual(pasta: string): { caminho: string; formato: Formato } | null {
  for (const formato of [
    { ext: 'jpg', mimetype: 'image/jpeg' },
    { ext: 'png', mimetype: 'image/png' },
  ] as const) {
    const caminho = join(pasta, `voucher.${formato.ext}`);
    if (existsSync(caminho)) return { caminho, formato };
  }
  return null;
}

export function infoImagemVoucher(pasta: string): ImagemVoucher | null {
  const a = arquivoAtual(pasta);
  if (!a) return null;
  const st = statSync(a.caminho);
  return {
    caminho: a.caminho,
    mimetype: a.formato.mimetype,
    fileName: `voucher.${a.formato.ext}`,
    bytes: st.size,
    atualizadaEm: st.mtime.toISOString(),
  };
}

export function lerImagemVoucher(pasta: string): (ImagemVoucher & { base64: string }) | null {
  const info = infoImagemVoucher(pasta);
  return info ? { ...info, base64: readFileSync(info.caminho).toString('base64') } : null;
}

export function salvarImagemVoucher(pasta: string, conteudo: Buffer): ImagemVoucher {
  if (conteudo.length === 0) throw new ImagemInvalida('Arquivo vazio.');
  if (conteudo.length > TAMANHO_MAXIMO_IMAGEM) throw new ImagemInvalida('A imagem passa de 5 MB. Reduza o tamanho e envie de novo.');
  const formato = formatoImagem(conteudo);
  if (!formato) throw new ImagemInvalida('Use uma imagem JPG ou PNG.');
  mkdirSync(pasta, { recursive: true });
  const destino = join(pasta, `voucher.${formato.ext}`);
  const tmp = `${destino}.tmp`;
  writeFileSync(tmp, conteudo);
  // Remove a versão no outro formato para não sobrar duas imagens.
  for (const ext of ['jpg', 'png']) {
    if (ext !== formato.ext) rmSync(join(pasta, `voucher.${ext}`), { force: true });
  }
  renameSync(tmp, destino);
  const info = infoImagemVoucher(pasta);
  if (!info) throw new Error('Falha ao gravar a imagem do voucher.');
  return info;
}
