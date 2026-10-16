// Normalização de telefone (RF02). Funções puras.

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47,
  48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87,
  88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** DDD usado quando o número vem sem DDD (loja em Vila Velha/ES). */
export const DDD_PADRAO = '27';

export type MotivoTelefone = 'VAZIO' | 'FIXO' | 'INVALIDO' | 'FICTICIO';
export type AjusteTelefone = 'DDD_ASSUMIDO' | 'NONO_DIGITO_ADICIONADO' | 'DDD_REPETIDO';

export type ResultadoTelefone =
  | { ok: true; telefone: string; telefoneAlt: string; ajustes: AjusteTelefone[] }
  | { ok: false; motivo: MotivoTelefone };

const dddValido = (ddd: string) => DDDS.has(Number(ddd));

/** Assinante fictício: 9 + oito dígitos iguais (999999999, 966666666…) ou sequências óbvias. */
function ficticio(assinante: string): boolean {
  const resto = assinante.slice(1);
  return /^(\d)\1+$/.test(resto) || resto === '12345678' || resto === '87654321';
}

function montar(ddd: string, assinante: string, ajustes: AjusteTelefone[]): ResultadoTelefone {
  if (!dddValido(ddd)) return { ok: false, motivo: 'INVALIDO' };
  if (ficticio(assinante)) return { ok: false, motivo: 'FICTICIO' };
  return { ok: true, telefone: `55${ddd}${assinante}`, telefoneAlt: `55${ddd}${assinante.slice(1)}`, ajustes };
}

/**
 * Normaliza um celular brasileiro para E.164 sem "+" (5527999887766).
 * Aceita os formatos do relatório: "(27) 999887766", "() 2799988-7766",
 * "(27) 27999887766", "(279) 98490784", "(011) 950238948", "99988-7766".
 */
export function normalizarTelefone(bruto: string | null | undefined): ResultadoTelefone {
  if (!bruto) return { ok: false, motivo: 'VAZIO' };
  const m = /^\s*\(([^)]*)\)\s*(.*)$/.exec(bruto);
  const area = (m ? m[1] ?? '' : '').replace(/\D/g, '').replace(/^0+/, '');
  const resto = (m ? m[2] ?? '' : bruto).replace(/\D/g, '');
  if (area === '' && resto === '') return { ok: false, motivo: 'VAZIO' };

  let todos = (area + resto).replace(/^0+/, '');
  if (todos.length === 13 && todos.startsWith('55')) todos = todos.slice(2);

  // DDD repetido: "(27) 27999887766".
  if (resto.length === 11 && resto[2] === '9' && dddValido(resto.slice(0, 2))) {
    const ajustes: AjusteTelefone[] = area === resto.slice(0, 2) ? ['DDD_REPETIDO'] : [];
    return montar(resto.slice(0, 2), resto.slice(2), ajustes);
  }
  // Formato completo: DDD + 9 dígitos começando com 9.
  if (todos.length === 11 && todos[2] === '9') return montar(todos.slice(0, 2), todos.slice(2), []);
  // Sem DDD: 9 dígitos começando com 9.
  if (area === '' && resto.length === 9 && resto[0] === '9') return montar(DDD_PADRAO, resto, ['DDD_ASSUMIDO']);
  // Celular antigo sem o 9º dígito: DDD + 8 dígitos começando com 6–9.
  if (todos.length === 10 && /[6-9]/.test(todos[2] ?? '')) {
    return montar(todos.slice(0, 2), `9${todos.slice(2)}`, ['NONO_DIGITO_ADICIONADO']);
  }
  // DDD repetido + celular antigo: "(27) 2799977732".
  if (area.length === 2 && resto.length === 10 && resto.startsWith(area) && /[6-9]/.test(resto[2] ?? '')) {
    return montar(area, `9${resto.slice(2)}`, ['DDD_REPETIDO', 'NONO_DIGITO_ADICIONADO']);
  }
  // Fixo: DDD + 8 dígitos começando com 2–5.
  if (todos.length === 10 && /[2-5]/.test(todos[2] ?? '')) return { ok: false, motivo: 'FIXO' };
  if (area === '' && resto.length === 8 && /[2-5]/.test(resto[0] ?? '')) return { ok: false, motivo: 'FIXO' };
  return { ok: false, motivo: 'INVALIDO' };
}

/**
 * Um campo do relatório pode trazer mais de um número ("(73) 7334… (73) 7398…").
 * Devolve o primeiro válido; se nenhum servir, o motivo do primeiro.
 */
export function normalizarCampoTelefone(campo: string | null | undefined): ResultadoTelefone {
  const partes = (campo ?? '').split(/(?=\()/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return { ok: false, motivo: 'VAZIO' };
  const resultados = partes.map(normalizarTelefone);
  return resultados.find((r) => r.ok) ?? resultados.find((r) => r.ok || r.motivo !== 'VAZIO') ?? { ok: false, motivo: 'VAZIO' };
}

/** Máscara para logs (RNF06): 5527999887766 → 5527*****7766. */
export function mascararTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, '');
  if (d.length < 8) return '*'.repeat(d.length);
  return `${d.slice(0, 4)}${'*'.repeat(d.length - 8)}${d.slice(-4)}`;
}
