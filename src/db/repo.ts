// Acesso ao banco SQLite (RNF02). Toda mudança de status passa por transicionar().

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { StatusCliente } from '../config/constants.js';
import type { ClienteImportado } from '../importacao/processar.js';
import { SCHEMA } from './schema.js';

export type Banco = Database.Database;

export function abrirBanco(caminho: string): Banco {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

// ------------------------------------------------------------ máquina de estados

const TRANSICOES: Readonly<Record<StatusCliente, readonly StatusCliente[]>> = {
  IMPORTADO: ['PRONTO', 'SEM_WHATSAPP', 'SUPRIMIDO'],
  PRONTO: ['ENVIANDO', 'SUPRIMIDO', 'NAO_CONTATADO', 'SEM_WHATSAPP'],
  ENVIANDO: ['ENVIADO', 'ERRO', 'SEM_WHATSAPP', 'VERIFICAR'],
  ERRO: ['ENVIANDO', 'ESGOTADO', 'SUPRIMIDO', 'NAO_CONTATADO'],
  VERIFICAR: ['ENVIADO', 'PRONTO'],
  ENVIADO: ['VOUCHER_ENVIANDO', 'DESCONHECIDO_1X', 'AGUARDANDO_HUMANO'],
  DESCONHECIDO_1X: ['VOUCHER_ENVIANDO', 'AGUARDANDO_HUMANO'],
  VOUCHER_ENVIANDO: ['VOUCHER_ENVIADO'],
  VOUCHER_ENVIADO: ['VOUCHER_ENVIANDO'],
  AGUARDANDO_HUMANO: ['VOUCHER_ENVIANDO'],
  SEM_WHATSAPP: [],
  SUPRIMIDO: [],
  ESGOTADO: [],
  NAO_CONTATADO: [],
  OPT_OUT: [],
};

export function transicaoPermitida(de: StatusCliente, para: StatusCliente): boolean {
  if (para === 'OPT_OUT') return de !== 'OPT_OUT'; // opt-out vale de qualquer estado
  return TRANSICOES[de].includes(para);
}

export class TransicaoInvalida extends Error {
  constructor(
    readonly clienteId: number,
    readonly de: string,
    readonly para: string,
  ) {
    super(`Transição inválida do cliente ${clienteId}: ${de} → ${para}`);
    this.name = 'TransicaoInvalida';
  }
}

export interface ExtrasTransicao {
  tentativas?: number;
  proxima_tentativa?: string | null;
  enviado_em?: string;
  message_id?: string;
  texto_hash?: string;
  versao_texto?: string;
  ultimo_erro?: string | null;
  jid?: string | null;
}

export function transicionar(
  db: Banco,
  clienteId: number,
  para: StatusCliente,
  extras: ExtrasTransicao = {},
  agoraIso = new Date().toISOString(),
): void {
  const atual = db.prepare('SELECT status FROM clientes WHERE id = ?').get(clienteId) as
    | { status: StatusCliente }
    | undefined;
  if (!atual) throw new Error(`Cliente ${clienteId} não existe`);
  if (!transicaoPermitida(atual.status, para)) throw new TransicaoInvalida(clienteId, atual.status, para);

  const campos = Object.keys(extras) as (keyof ExtrasTransicao)[];
  const sets = ['status = @para', 'atualizado_em = @agora', ...campos.map((c) => `${c} = @${c}`)];
  const r = db
    .prepare(`UPDATE clientes SET ${sets.join(', ')} WHERE id = @id AND status = @de`)
    .run({ ...extras, para, agora: agoraIso, id: clienteId, de: atual.status });
  if (r.changes !== 1) throw new TransicaoInvalida(clienteId, atual.status, para);
}

// ------------------------------------------------------------ campanha e importação

export function garantirCampanha(db: Banco, dados: { nome: string; dataLimite: string; hoje: string }): number {
  const existente = db.prepare('SELECT id FROM campanhas ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  if (existente) {
    if (dados.dataLimite) db.prepare('UPDATE campanhas SET data_limite = ? WHERE id = ?').run(dados.dataLimite, existente.id);
    return existente.id;
  }
  const r = db
    .prepare('INSERT INTO campanhas (nome, data_inicio, data_limite, percentual) VALUES (?, ?, ?, 50)')
    .run(dados.nome, dados.hoje, dados.dataLimite);
  return Number(r.lastInsertRowid);
}

export interface ResumoImportacaoBanco {
  novos: number;
  atualizados: number;
  jaEmAndamento: number;
  suprimidos: number;
}

/** Reimportar não duplica (RF01): a chave é o telefone normalizado. */
export function importarClientes(db: Banco, campanhaId: number, clientes: ClienteImportado[]): ResumoImportacaoBanco {
  const resumo: ResumoImportacaoBanco = { novos: 0, atualizados: 0, jaEmAndamento: 0, suprimidos: 0 };
  const agora = new Date().toISOString();
  const buscar = db.prepare('SELECT id, status FROM clientes WHERE campanha_id = ? AND telefone = ?');
  const suprimido = db.prepare('SELECT 1 FROM supressao WHERE telefone IN (?, ?)');
  const inserir = db.prepare(`
    INSERT INTO clientes (campanha_id, telefone, telefone_alt, primeiro_nome, nome_completo, vendedora, segmento,
      status, prioridade, cidade, regiao, ultima_compra, ajustes, atualizado_em)
    VALUES (@campanha, @telefone, @telefoneAlt, @primeiroNome, @nomeCompleto, @vendedora, @segmento,
      @status, @prioridade, @cidade, @regiao, @ultimaCompra, @ajustes, @agora)`);
  const atualizar = db.prepare(`
    UPDATE clientes SET primeiro_nome = @primeiroNome, nome_completo = @nomeCompleto, vendedora = @vendedora,
      segmento = @segmento, prioridade = @prioridade, cidade = @cidade, regiao = @regiao,
      ultima_compra = @ultimaCompra, ajustes = @ajustes, atualizado_em = @agora
    WHERE id = @id`);

  db.transaction(() => {
    for (const c of clientes) {
      const dados = { ...c, ajustes: c.ajustes.join(',') || null, campanha: campanhaId, agora };
      const existente = buscar.get(campanhaId, c.telefone) as { id: number; status: StatusCliente } | undefined;
      if (!existente) {
        const sup = suprimido.get(c.telefone, c.telefoneAlt) !== undefined;
        inserir.run({ ...dados, status: sup ? 'SUPRIMIDO' : 'IMPORTADO' });
        if (sup) resumo.suprimidos++;
        else resumo.novos++;
      } else if (existente.status === 'IMPORTADO' || existente.status === 'PRONTO') {
        atualizar.run({ ...dados, id: existente.id });
        resumo.atualizados++;
      } else {
        resumo.jaEmAndamento++;
      }
    }
  })();
  return resumo;
}

// ------------------------------------------------------------ validação no WhatsApp (RF03)

export function pendentesValidacao(db: Banco, campanhaId: number): { id: number; telefone: string }[] {
  return db
    .prepare("SELECT id, telefone FROM clientes WHERE campanha_id = ? AND status = 'IMPORTADO' ORDER BY prioridade DESC")
    .all(campanhaId) as { id: number; telefone: string }[];
}

export function aplicarValidacao(db: Banco, clienteId: number, existe: boolean, jid: string | null): void {
  transicionar(db, clienteId, existe ? 'PRONTO' : 'SEM_WHATSAPP', { jid });
}

// ------------------------------------------------------------ fila de envio

export interface ClienteFila {
  id: number;
  telefone: string;
  telefone_alt: string | null;
  primeiro_nome: string;
  nome_completo: string;
  vendedora: string | null;
  segmento: string | null;
  regiao: string | null;
  status: StatusCliente;
  tentativas: number;
  prioridade: number;
}

export interface FiltroFila {
  campanhaId: number;
  agoraIso: string;
  maxTentativas: number;
  /** Se não vazia, só esses telefones podem ser escolhidos (RF20). */
  allowlist: readonly string[];
  excluirIds?: readonly number[];
  /** Incluir também IMPORTADO (apenas para simulação). */
  incluirNaoValidados?: boolean;
}

function sqlFila(f: FiltroFila, limite: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.campanhaId];
  const estados = f.incluirNaoValidados ? "('PRONTO','IMPORTADO')" : "('PRONTO')";
  let sql = `
    SELECT id, telefone, telefone_alt, primeiro_nome, nome_completo, vendedora, segmento, regiao, status,
           tentativas, prioridade
    FROM clientes c
    WHERE campanha_id = ?
      AND (status IN ${estados} OR (status = 'ERRO' AND tentativas < ? AND (proxima_tentativa IS NULL OR proxima_tentativa <= ?)))
      AND NOT EXISTS (SELECT 1 FROM supressao s WHERE s.telefone IN (c.telefone, c.telefone_alt))`;
  params.push(f.maxTentativas, f.agoraIso);
  if (f.allowlist.length > 0) {
    sql += ` AND telefone IN (${f.allowlist.map(() => '?').join(',')})`;
    params.push(...f.allowlist);
  }
  if (f.excluirIds && f.excluirIds.length > 0) {
    sql += ` AND id NOT IN (${f.excluirIds.map(() => '?').join(',')})`;
    params.push(...f.excluirIds);
  }
  sql += ` ORDER BY prioridade DESC, id LIMIT ${Math.max(1, Math.floor(limite))}`;
  return { sql, params };
}

export function proximoParaEnvio(db: Banco, f: FiltroFila): ClienteFila | undefined {
  const { sql, params } = sqlFila(f, 1);
  return db.prepare(sql).get(...params) as ClienteFila | undefined;
}

export function listarFila(db: Banco, f: FiltroFila, limite: number): ClienteFila[] {
  const { sql, params } = sqlFila(f, limite);
  return db.prepare(sql).all(...params) as ClienteFila[];
}

export function hashUsado(db: Banco, campanhaId: number, hash: string): boolean {
  return db.prepare('SELECT 1 FROM clientes WHERE campanha_id = ? AND texto_hash = ?').get(campanhaId, hash) !== undefined;
}

export interface Envio {
  clienteId: number;
  messageId: string;
  texto: string;
  hash: string;
  versao: string;
  agoraIso: string;
  dia: string;
}

/** ENVIADO + histórico + contador do dia, numa transação (RF08, controle 5). */
export function registrarEnvio(db: Banco, e: Envio): void {
  db.transaction(() => {
    transicionar(
      db,
      e.clienteId,
      'ENVIADO',
      { enviado_em: e.agoraIso, message_id: e.messageId, texto_hash: e.hash, versao_texto: e.versao, ultimo_erro: null },
      e.agoraIso,
    );
    db.prepare(
      "INSERT INTO mensagens (cliente_id, direcao, tipo, message_id, texto, criado_em) VALUES (?, 'OUT', 'ABORDAGEM', ?, ?, ?)",
    ).run(e.clienteId, e.messageId, e.texto, e.agoraIso);
    db.prepare(
      'INSERT INTO contadores_diarios (dia, envios_ativos) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET envios_ativos = envios_ativos + 1',
    ).run(e.dia);
  })();
}

export function registrarErroDoDia(db: Banco, dia: string): void {
  db.prepare('INSERT INTO contadores_diarios (dia, erros) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET erros = erros + 1').run(dia);
}

export function enviadosNoDia(db: Banco, dia: string): number {
  const r = db.prepare('SELECT envios_ativos FROM contadores_diarios WHERE dia = ?').get(dia) as
    | { envios_ativos: number }
    | undefined;
  return r?.envios_ativos ?? 0;
}

/** Quantos dias anteriores já tiveram envio (para a rampa diária). */
export function diasComEnvioAntes(db: Banco, dia: string): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM contadores_diarios WHERE dia < ? AND envios_ativos > 0').get(dia) as {
    n: number;
  };
  return r.n;
}

export function enviadosDesde(db: Banco, desdeIso: string): number {
  const r = db
    .prepare("SELECT COUNT(*) AS n FROM mensagens WHERE direcao = 'OUT' AND tipo = 'ABORDAGEM' AND criado_em >= ?")
    .get(desdeIso) as { n: number };
  return r.n;
}

/** Ao reiniciar: ENVIANDO há mais de N minutos vai para revisão manual, nunca é reenviado (RF08). */
export function marcarTravados(db: Banco, antesDeIso: string): number {
  const travados = db
    .prepare("SELECT id FROM clientes WHERE status = 'ENVIANDO' AND atualizado_em < ?")
    .all(antesDeIso) as { id: number }[];
  for (const t of travados) transicionar(db, t.id, 'VERIFICAR', { ultimo_erro: 'Processo interrompido durante o envio' });
  return travados.length;
}

export function auditar(db: Banco, evento: string, detalhe: unknown, ator: 'SISTEMA' | 'CLI' | 'PAINEL'): void {
  db.prepare('INSERT INTO auditoria (evento, detalhe, ator) VALUES (?, ?, ?)').run(evento, JSON.stringify(detalhe), ator);
}

export function contagem(db: Banco, campanhaId: number, coluna: 'status' | 'segmento' | 'regiao'): Record<string, number> {
  const linhas = db
    .prepare(`SELECT COALESCE(${coluna}, '-') AS k, COUNT(*) AS n FROM clientes WHERE campanha_id = ? GROUP BY 1 ORDER BY 2 DESC`)
    .all(campanhaId) as { k: string; n: number }[];
  return Object.fromEntries(linhas.map((l) => [l.k, l.n]));
}
