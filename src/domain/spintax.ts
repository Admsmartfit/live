// Spintax (RF06): {a|b|c} sorteia uma opção, com aninhamento.
// {{variavel}} não é spintax e é preservada para substituição posterior.

type No = string | No[][]; // texto literal ou escolha (lista de sequências)

const VAR_INI = '\u0001';
const VAR_FIM = '\u0002';

function protegerVariaveis(t: string): string {
  return t.replace(/\{\{(\w+)\}\}/g, `${VAR_INI}$1${VAR_FIM}`);
}

function restaurarVariaveis(t: string): string {
  return t.replace(new RegExp(`${VAR_INI}(\\w+)${VAR_FIM}`, 'g'), '{{$1}}');
}

function analisar(t: string): No[] {
  let i = 0;
  const sequencia = (dentro: boolean): No[] => {
    const nos: No[] = [];
    let buf = '';
    while (i < t.length) {
      const ch = t[i];
      if (ch === '{') {
        if (buf) nos.push(buf);
        buf = '';
        i++;
        const opcoes: No[][] = [sequencia(true)];
        while (t[i] === '|') {
          i++;
          opcoes.push(sequencia(true));
        }
        if (t[i] !== '}') throw new Error(`Spintax sem "}" na posição ${i}`);
        i++;
        nos.push(opcoes);
      } else if (dentro && (ch === '|' || ch === '}')) {
        break;
      } else if (!dentro && (ch === '|' || ch === '}')) {
        throw new Error(`"${ch}" fora de spintax na posição ${i}`);
      } else {
        buf += ch ?? '';
        i++;
      }
    }
    if (buf) nos.push(buf);
    return nos;
  };
  const resultado = sequencia(false);
  if (i < t.length) throw new Error(`Spintax inválido na posição ${i}`);
  return resultado;
}

function render(nos: No[], rng: () => number): string {
  return nos
    .map((n) => {
      if (typeof n === 'string') return n;
      const escolha = n[Math.min(n.length - 1, Math.floor(rng() * n.length))] ?? [];
      return render(escolha, rng);
    })
    .join('');
}

function contar(nos: No[]): number {
  return nos.reduce((total, n) => (typeof n === 'string' ? total : total * n.reduce((s, op) => s + contar(op), 0)), 1);
}

/** Resolve o spintax. As variáveis {{x}} continuam no texto. */
export function expandir(template: string, rng: () => number = Math.random): string {
  return restaurarVariaveis(render(analisar(protegerVariaveis(template)), rng));
}

/** Número de textos distintos que o template pode gerar. */
export function contarCombinacoes(template: string): number {
  return contar(analisar(protegerVariaveis(template)));
}

/** Substitui {{x}} por valores literais (um "{" ou "|" no nome não quebra nada). */
export function preencher(texto: string, valores: Readonly<Record<string, string>>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (orig, chave: string) => valores[chave] ?? orig);
}

/** Gerador pseudoaleatório com semente (mulberry32), para reproduzir uma mensagem. */
export function rngComSemente(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
