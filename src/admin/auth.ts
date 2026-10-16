// Sessão do painel (RNF09): cookie HttpOnly assinado com HMAC, válido por 8 horas.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'painel_sessao';
const VALIDADE_MS = 8 * 60 * 60 * 1000;

export class Sessoes {
  // Segredo novo a cada início do processo: reiniciar o serviço encerra as sessões.
  private readonly segredo = randomBytes(32);
  private readonly tentativas = new Map<string, number[]>();

  constructor(private readonly agora: () => number = Date.now) {}

  private assinar(validade: number): string {
    return createHmac('sha256', this.segredo).update(String(validade)).digest('base64url');
  }

  criar(): string {
    const validade = this.agora() + VALIDADE_MS;
    return `${validade}.${this.assinar(validade)}`;
  }

  valida(valor: string | undefined): boolean {
    if (!valor) return false;
    const [v, assinatura = ''] = valor.split('.');
    const validade = Number(v);
    if (!Number.isFinite(validade) || validade < this.agora()) return false;
    const esperado = Buffer.from(this.assinar(validade));
    const recebido = Buffer.from(assinatura);
    return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
  }

  /** Máximo de 5 tentativas de login por minuto por IP. */
  podeTentar(ip: string): boolean {
    const limite = this.agora() - 60_000;
    const recentes = (this.tentativas.get(ip) ?? []).filter((t) => t > limite);
    recentes.push(this.agora());
    this.tentativas.set(ip, recentes);
    return recentes.length <= 5;
  }
}

/** Comparação de senha em tempo constante. */
export function senhaConfere(digitada: string, correta: string): boolean {
  const a = createHash('sha256').update(digitada).digest();
  const b = createHash('sha256').update(correta).digest();
  return timingSafeEqual(a, b);
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  for (const parte of (cabecalho ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function cookieSessao(valor: string, seguro: boolean): string {
  return `${COOKIE}=${encodeURIComponent(valor)}; Path=/painel; HttpOnly; SameSite=Strict; Max-Age=${VALIDADE_MS / 1000}${seguro ? '; Secure' : ''}`;
}

export function cookieSair(): string {
  return `${COOKIE}=; Path=/painel; HttpOnly; SameSite=Strict; Max-Age=0`;
}
