// Regras de nome e cadastro do cliente. Funções puras.

const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const TERMOS_EMPRESA = /\b(ltda|eireli|epp|industria|comercio|mitra|arquidiocesana)\b|(^|\s)s\/a(\s|$)/;

// Segundos nomes comuns: "Ana Clara" não é a vendedora "Ana Clara Teles".
const SEGUNDO_NOME = new Set([
  'clara', 'maria', 'luiza', 'luisa', 'julia', 'paula', 'carolina', 'eduarda', 'beatriz', 'vitoria', 'cristina',
  'helena', 'lucia', 'laura', 'fernanda', 'gabriela', 'alice', 'rita', 'cecilia', 'flavia', 'claudia', 'luiz',
  'carlos', 'paulo', 'pedro', 'henrique', 'eduardo', 'antonio', 'jose', 'joao', 'vitor', 'victor',
]);

/** Minúsculas, sem acentos, espaços colapsados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "MARIA DA SILVA" → "Maria da Silva". */
export function nomeTitulo(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .map((p, i) => {
      const l = p.toLocaleLowerCase('pt-BR');
      if (i > 0 && CONECTIVOS.has(l)) return l;
      return l.charAt(0).toLocaleUpperCase('pt-BR') + l.slice(1);
    })
    .join(' ');
}

/** Primeiro nome em formato título, ou null se não parecer um nome. */
export function primeiroNome(nome: string): string | null {
  const p = nome.trim().split(/\s+/)[0] ?? '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]{2,}$/.test(p)) return null;
  return nomeTitulo(p);
}

export function ehEmpresa(nome: string): boolean {
  return TERMOS_EMPRESA.test(normalizarTexto(nome));
}

/** Vendedora "Venda Funcionario" não é uma pessoa. */
export function vendedoraValida(v: string | null | undefined): v is string {
  return !!v && v.trim() !== '' && !/venda funcionari/.test(normalizarTexto(v));
}

const tokens = (s: string) => normalizarTexto(s).split(' ').filter(Boolean);
const casa = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

/** Distância de edição até 1 ("Isabelly" × "Isabely"). */
function quaseIgual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/**
 * Detecta funcionária cadastrada como cliente comparando com a lista de
 * vendedoras (cujos nomes vêm truncados no relatório, ex.: "Nathiele de Paula Fons").
 * Exige 3 palavras em comum, ou 2 quando o cliente só tem 2.
 */
export function ehFuncionaria(nome: string, vendedoras: readonly string[]): boolean {
  const c = tokens(nome);
  if (c.length < 2) return false;
  return vendedoras.some((vendedora) => {
    const v = tokens(vendedora);
    const n = c.length === 2 ? 2 : 3;
    if (v.length < n) return false;
    if (n === 2 && SEGUNDO_NOME.has(c[1] ?? '')) return false;
    return Array.from({ length: n }, (_, i) => i).every((i) => {
      const a = c[i] ?? '';
      const b = v[i] ?? '';
      if (a.length < 2) return false;
      return casa(a, b) || (i === 0 && a.length >= 5 && quaseIgual(a, b));
    });
  });
}
