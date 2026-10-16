// Leitura do relatório "LISTAGEM DOS CLIENTES" (Gestor da Franquia) em PDF.
// As colunas são identificadas pela posição horizontal do cabeçalho.

import { readFile } from 'node:fs/promises';

export interface ItemTexto {
  x: number;
  y: number;
  texto: string;
}

export interface LinhaRelatorio {
  pagina: number;
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  telefone: string;
  celular: string;
  cep: string;
  ultimaCompra: string; // MM/DD/AAAA, como no relatório
  vendedora: string;
}

type Coluna = Exclude<keyof LinhaRelatorio, 'pagina'>;

const CABECALHOS: [string, Coluna][] = [
  ['nome do cliente', 'nome'],
  ['endereco', 'endereco'],
  ['bairro', 'bairro'],
  ['cidade', 'cidade'],
  ['telefone', 'telefone'],
  ['celular', 'celular'],
  ['cep', 'cep'],
  ['ult. compra', 'ultimaCompra'],
  ['vendedor(a)', 'vendedora'],
];

const RE_DATA = /^\d{2}\/\d{2}\/\d{4}$/;
const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Agrupa itens por linha (mesmo y, com tolerância). Ordem: de cima para baixo. */
function agruparLinhas(itens: ItemTexto[]): ItemTexto[][] {
  const ordenados = [...itens].filter((i) => i.texto.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: ItemTexto[][] = [];
  for (const item of ordenados) {
    const atual = linhas.at(-1);
    if (atual && Math.abs((atual[0]?.y ?? 0) - item.y) <= 2) atual.push(item);
    else linhas.push([item]);
  }
  return linhas.map((l) => l.sort((a, b) => a.x - b.x));
}

/** Converte os itens de texto de uma página em linhas do relatório. Função pura. */
export function linhasDaPagina(itens: ItemTexto[], pagina: number): LinhaRelatorio[] {
  const linhas = agruparLinhas(itens);
  const iCab = linhas.findIndex((l) => l.some((i) => semAcento(i.texto) === 'nome do cliente'));
  if (iCab < 0) return [];

  const colunas: { x: number; coluna: Coluna }[] = [];
  for (const item of linhas[iCab] ?? []) {
    const achado = CABECALHOS.find(([rotulo]) => semAcento(item.texto) === rotulo);
    if (achado) colunas.push({ x: item.x, coluna: achado[1] });
  }
  colunas.sort((a, b) => a.x - b.x);
  const xEndereco = colunas.find((c) => c.coluna === 'endereco')?.x ?? Infinity;

  const resultado: LinhaRelatorio[] = [];
  for (const linha of linhas.slice(iCab + 1)) {
    const reg: LinhaRelatorio = {
      pagina,
      nome: '',
      endereco: '',
      bairro: '',
      cidade: '',
      telefone: '',
      celular: '',
      cep: '',
      ultimaCompra: '',
      vendedora: '',
    };
    for (const item of linha) {
      const col = [...colunas].reverse().find((c) => c.x <= item.x + 4)?.coluna ?? 'nome';
      reg[col] = reg[col] ? `${reg[col]} ${item.texto.trim()}` : item.texto.trim();
    }
    // Linha de cliente: começa na coluna do nome e tem data de compra ou celular.
    const primeiro = linha[0];
    if (!primeiro || primeiro.x >= xEndereco || !reg.nome) continue;
    if (/^(total de clientes|software gestor|page \d)/i.test(reg.nome)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(reg.nome)) continue; // rodapé com data/hora
    if (!RE_DATA.test(reg.ultimaCompra) && !reg.celular && !reg.telefone) continue;
    resultado.push(reg);
  }
  return resultado;
}

/** Lê o PDF inteiro. */
export async function lerRelatorioPdf(caminho: string): Promise<LinhaRelatorio[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const dados = new Uint8Array(await readFile(caminho));
  const doc = await getDocument({ data: dados, useSystemFonts: true, verbosity: 0 }).promise;
  const todas: LinhaRelatorio[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    const itens: ItemTexto[] = [];
    for (const it of conteudo.items) {
      if ('str' in it) itens.push({ x: it.transform[4] as number, y: it.transform[5] as number, texto: it.str });
    }
    todas.push(...linhasDaPagina(itens, p));
  }
  await doc.destroy();
  return todas;
}
