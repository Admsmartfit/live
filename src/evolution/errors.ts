// Classificação de erros da Evolution API (PRD seção 8), usada pelos disjuntores.

export type ClasseErro = 'TRANSITORIO' | 'NUMERO' | 'AUTENTICACAO' | 'CONEXAO' | 'DESCONHECIDO';

export interface PoliticaErro {
  /** Conta para os disjuntores de falha (6.2). */
  contaComoFalha: boolean;
  /** Exige pausa/kill switch e alerta imediato. */
  critico: boolean;
  /** Pode ser repetido com backoff. */
  retentavel: boolean;
}

export const POLITICA: Readonly<Record<ClasseErro, PoliticaErro>> = {
  TRANSITORIO: { contaComoFalha: true, critico: false, retentavel: true },
  NUMERO: { contaComoFalha: false, critico: false, retentavel: false },
  AUTENTICACAO: { contaComoFalha: true, critico: true, retentavel: false },
  CONEXAO: { contaComoFalha: true, critico: true, retentavel: false },
  // Fora da tabela da seção 8 (ex.: 400 genérico, 404 de rota). Conta como
  // falha, sem retry, para não mascarar bug de contrato.
  DESCONHECIDO: { contaComoFalha: true, critico: false, retentavel: false },
};

const STATUS_TRANSITORIO = new Set([429, 500, 502, 503, 504]);
const RE_RESTRICAO = /\b(banned|restricted)\b/i;
const RE_CONEXAO =
  /connection closed|not connected|instance .*(does not exist|not found)|"state"\s*:\s*"(close|connecting)"/i;
const RE_NUMERO = /"exists"\s*:\s*false|not exists|invalid (jid|number)|jid (invalid|malformed)|bad jid/i;

export interface EntradaClassificacao {
  status?: number | undefined;
  corpo?: unknown;
  timeout?: boolean;
  erroRede?: boolean;
}

function textoDoCorpo(corpo: unknown): string {
  if (corpo === undefined || corpo === null) return '';
  if (typeof corpo === 'string') return corpo;
  try {
    return JSON.stringify(corpo);
  } catch {
    return '';
  }
}

/** Função pura: decide a classe a partir do status HTTP e do corpo da resposta. */
export function classificarErro(e: EntradaClassificacao): ClasseErro {
  if (e.timeout || e.erroRede) return 'TRANSITORIO';
  const texto = textoDoCorpo(e.corpo);
  if (e.status === 401 || e.status === 403 || RE_RESTRICAO.test(texto)) return 'AUTENTICACAO';
  if (RE_CONEXAO.test(texto)) return 'CONEXAO';
  if (e.status !== undefined && STATUS_TRANSITORIO.has(e.status)) return 'TRANSITORIO';
  if (e.status === 400 && RE_NUMERO.test(texto)) return 'NUMERO';
  return 'DESCONHECIDO';
}

export class EvolutionError extends Error {
  readonly contaComoFalha: boolean;
  readonly critico: boolean;
  readonly retentavel: boolean;

  constructor(
    readonly classe: ClasseErro,
    mensagem: string,
    readonly detalhes: {
      rota: string;
      status?: number | undefined;
      /** Corpo da resposta. Pode conter telefone: mascarar antes de logar (RNF06). */
      corpo?: unknown;
      tentativas?: number;
      cause?: unknown;
    },
  ) {
    super(mensagem, { cause: detalhes.cause });
    this.name = 'EvolutionError';
    const p = POLITICA[classe];
    this.contaComoFalha = p.contaComoFalha;
    this.critico = p.critico;
    this.retentavel = p.retentavel;
  }

  get status(): number | undefined {
    return this.detalhes.status;
  }
}
