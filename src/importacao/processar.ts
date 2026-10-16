// Transforma as linhas do relatório em clientes prontos para a fila (RF01–RF05).
// Função pura: não acessa banco nem rede.

import { ehEmpresa, ehFuncionaria, nomeTitulo, normalizarTexto, primeiroNome, vendedoraValida } from '../domain/clientes.js';
import { normalizarCampoTelefone, type AjusteTelefone } from '../domain/phone.js';
import { diasEntre, prioridade, regiao, segmentar, type Regiao, type Segmento } from '../domain/segment.js';
import type { LinhaRelatorio } from './relatorio.js';

/** Vendedora só assina a mensagem se vendeu nos últimos N dias (ainda está na loja). */
export const DIAS_VENDEDORA_ATIVA = 120;

export interface ClienteImportado {
  telefone: string;
  telefoneAlt: string;
  nomeCompleto: string;
  primeiroNome: string;
  vendedora: string | null; // primeiro nome, só de vendedora ativa
  cidade: string;
  ultimaCompra: string | null; // AAAA-MM-DD
  dias: number;
  segmento: Segmento;
  regiao: Regiao;
  prioridade: number;
  ajustes: AjusteTelefone[];
}

export type MotivoRejeicao =
  | 'SEM_NOME'
  | 'NOME_INVALIDO'
  | 'EMPRESA'
  | 'FUNCIONARIA'
  | 'TELEFONE_VAZIO'
  | 'TELEFONE_FIXO'
  | 'TELEFONE_INVALIDO'
  | 'TELEFONE_FICTICIO'
  | 'TELEFONE_COMPARTILHADO';

export interface Rejeitado {
  pagina: number;
  nome: string;
  telefoneBruto: string;
  motivo: MotivoRejeicao;
}

export interface ResultadoImportacao {
  clientes: ClienteImportado[];
  rejeitados: Rejeitado[];
  duplicadosUnificados: number;
  linhasLidas: number;
}

/** "10/12/2024" (MM/DD/AAAA) → "2024-10-12". */
export function dataRelatorio(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, mes, dia, ano] = m;
  const iso = `${ano}-${mes}-${dia}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

const MOTIVO_TELEFONE = {
  VAZIO: 'TELEFONE_VAZIO',
  FIXO: 'TELEFONE_FIXO',
  INVALIDO: 'TELEFONE_INVALIDO',
  FICTICIO: 'TELEFONE_FICTICIO',
} as const;

export function processarRelatorio(linhas: LinhaRelatorio[], hojeIso: string): ResultadoImportacao {
  const vendedoras = [...new Set(linhas.map((l) => l.vendedora).filter(vendedoraValida))];
  const ativas = new Set(
    linhas
      .filter((l) => vendedoraValida(l.vendedora))
      .filter((l) => {
        const d = dataRelatorio(l.ultimaCompra);
        return d !== null && diasEntre(d, hojeIso) <= DIAS_VENDEDORA_ATIVA;
      })
      .map((l) => l.vendedora),
  );

  const rejeitados: Rejeitado[] = [];
  const candidatos: (ClienteImportado & { linha: LinhaRelatorio })[] = [];

  for (const l of linhas) {
    const rejeitar = (motivo: MotivoRejeicao) => {
      rejeitados.push({ pagina: l.pagina, nome: l.nome, telefoneBruto: l.celular || l.telefone, motivo });
    };
    if (!l.nome.trim()) {
      rejeitar('SEM_NOME');
      continue;
    }
    if (ehEmpresa(l.nome)) {
      rejeitar('EMPRESA');
      continue;
    }
    if (ehFuncionaria(l.nome, vendedoras)) {
      rejeitar('FUNCIONARIA');
      continue;
    }
    const primeiro = primeiroNome(l.nome);
    if (!primeiro) {
      rejeitar('NOME_INVALIDO');
      continue;
    }
    // Celular primeiro; se não servir, tenta a coluna Telefone.
    const porCelular = normalizarCampoTelefone(l.celular);
    const tel = porCelular.ok ? porCelular : normalizarCampoTelefone(l.telefone);
    if (!tel.ok) {
      // O motivo do celular prevalece, a menos que ele esteja vazio.
      const motivo = !porCelular.ok && porCelular.motivo !== 'VAZIO' ? porCelular.motivo : tel.motivo;
      rejeitar(MOTIVO_TELEFONE[motivo]);
      continue;
    }
    const ultimaCompra = dataRelatorio(l.ultimaCompra);
    const dias = ultimaCompra ? diasEntre(ultimaCompra, hojeIso) : 99_999;
    const segmento = segmentar(dias);
    const reg = regiao(l.cidade, tel.telefone.slice(2, 4));
    candidatos.push({
      linha: l,
      telefone: tel.telefone,
      telefoneAlt: tel.telefoneAlt,
      nomeCompleto: nomeTitulo(l.nome),
      primeiroNome: primeiro,
      vendedora: ativas.has(l.vendedora) ? primeiroNome(l.vendedora) : null,
      cidade: l.cidade,
      ultimaCompra,
      dias,
      segmento,
      regiao: reg,
      // DDD assumido pode cair em um desconhecido: vai para o fim da faixa.
      prioridade: prioridade(segmento, reg, dias) - (tel.ajustes.includes('DDD_ASSUMIDO') ? 50_000 : 0),
      ajustes: tel.ajustes,
    });
  }

  // Mesmo telefone em várias linhas: une se for a mesma pessoa (mesmo primeiro nome);
  // se forem pessoas diferentes, não envia para ninguém (risco de nome errado).
  const porTelefone = new Map<string, typeof candidatos>();
  for (const c of candidatos) {
    const grupo = porTelefone.get(c.telefone);
    if (grupo) grupo.push(c);
    else porTelefone.set(c.telefone, [c]);
  }

  const clientes: ClienteImportado[] = [];
  let duplicadosUnificados = 0;
  for (const grupo of porTelefone.values()) {
    const nomes = new Set(grupo.map((c) => normalizarTexto(c.primeiroNome)));
    if (nomes.size > 1) {
      for (const c of grupo) {
        rejeitados.push({
          pagina: c.linha.pagina,
          nome: c.linha.nome,
          telefoneBruto: c.linha.celular || c.linha.telefone,
          motivo: 'TELEFONE_COMPARTILHADO',
        });
      }
      continue;
    }
    duplicadosUnificados += grupo.length - 1;
    const maisRecente = [...grupo].sort((a, b) => a.dias - b.dias)[0];
    if (!maisRecente) continue;
    const { linha: _linha, ...cliente } = maisRecente;
    cliente.vendedora = maisRecente.vendedora ?? grupo.find((c) => c.vendedora)?.vendedora ?? null;
    clientes.push(cliente);
  }

  clientes.sort((a, b) => b.prioridade - a.prioridade);
  return { clientes, rejeitados, duplicadosUnificados, linhasLidas: linhas.length };
}
