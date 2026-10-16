// Execução das respostas automáticas (RF13–RF15), uma de cada vez, fora do ack do webhook.
//
// Envio real só com DRY_RUN=false, ou para números da lista de teste (para testar o
// fluxo completo antes da campanha). Com DRY_RUN=true, para os demais, apenas registra
// o que faria. Bloquear (NÃO/SAIR) e encaminhar para humano valem sempre: só protegem.

import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { auditar, bloquear, estaBloqueado, transicaoPermitida, transicionar, type Banco } from '../db/repo.js';
import type { StatusCliente } from '../config/constants.js';
import type { Intencao } from '../domain/intent.js';
import { mascararTelefone } from '../domain/phone.js';
import {
  carregarModelosResposta,
  decidirAcao,
  gerarResposta,
  type AcaoResposta,
  type DadosResposta,
  type TipoResposta,
} from '../domain/respostas.js';
import { formatarDataFim } from '../domain/templates.js';
import type { EvolutionClient } from '../evolution/client.js';
import { lerImagemVoucher } from './voucherImagem.js';
import type { MonitorWebhook } from './webhook.js';

export type ClienteRespostas = Pick<EvolutionClient, 'sendText' | 'sendMedia'>;

export interface DepsRespostas {
  db: Banco;
  campanhaId: number;
  /** Configuração atual (lida a cada resposta, sem precisar reiniciar). */
  env: () => Env;
  criarEvolution: (env: Env) => ClienteRespostas;
  caminhoTemplates: (env: Env) => string;
  pastaVoucher: (env: Env) => string;
  log: FastifyBaseLogger;
  monitor: MonitorWebhook;
  dormir?: (ms: number) => Promise<void>;
  rng?: () => number;
  agora?: () => Date;
}

export interface PedidoResposta {
  telefone: string | null;
  jid: string | null;
  clienteId: number | null;
  intencao: Intencao;
  midia: boolean;
}

interface Contexto {
  env: Env;
  numero: string;
  quem: string;
  telefone: string | null;
  cliente: { id: number; status: StatusCliente; nome: string } | null;
  real: boolean;
  evolution: ClienteRespostas;
}

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Respondedor {
  private fila: Promise<void> = Promise.resolve();
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly rng: () => number;

  constructor(private readonly deps: DepsRespostas) {
    this.dormir = deps.dormir ?? dormirPadrao;
    this.rng = deps.rng ?? Math.random;
  }

  /** Enfileira; as respostas saem na ordem de chegada, uma de cada vez. */
  agendar(p: PedidoResposta): Promise<void> {
    this.fila = this.fila
      .then(() => this.tratar(p))
      .catch((err: unknown) => {
        this.deps.log.error({ evento: 'RESPOSTA_ERRO', erro: String(err) });
      });
    return this.fila;
  }

  private anotar(descricao: string, resultado: string): void {
    this.deps.monitor.registrar({ quando: (this.deps.agora?.() ?? new Date()).toISOString(), tipo: 'RESPOSTA_AUTOMATICA', descricao, resultado });
  }

  private alerta(ctx: Contexto, motivo: string): void {
    auditar(this.deps.db, 'ALERTA', { telefone: ctx.quem, motivo }, 'SISTEMA');
    this.deps.log.warn({ evento: 'ALERTA', telefone: ctx.quem, motivo });
    this.anotar(`Atenção (${ctx.quem}): ${motivo}`, 'ALERTA');
  }

  private mover(ctx: Contexto, para: StatusCliente): void {
    if (!ctx.cliente) return;
    const atual = this.deps.db.prepare('SELECT status FROM clientes WHERE id = ?').get(ctx.cliente.id) as { status: StatusCliente };
    if (atual.status !== para && transicaoPermitida(atual.status, para)) {
      transicionar(this.deps.db, ctx.cliente.id, para, {}, (this.deps.agora?.() ?? new Date()).toISOString());
    }
  }

  private async tratar(p: PedidoResposta): Promise<void> {
    const env = this.deps.env();
    const numero = p.telefone ?? p.jid;
    if (!numero) return;
    const linha = p.clienteId
      ? (this.deps.db.prepare('SELECT id, status, primeiro_nome FROM clientes WHERE id = ?').get(p.clienteId) as
          | { id: number; status: StatusCliente; primeiro_nome: string | null }
          | undefined)
      : undefined;
    const teste = p.telefone !== null && env.TEST_ALLOWLIST.includes(p.telefone);
    if (!linha && !teste) return; // fora da base: só registra (RF12)

    const ctx: Contexto = {
      env,
      numero,
      quem: p.telefone ? mascararTelefone(p.telefone) : numero,
      telefone: p.telefone,
      cliente: linha ? { id: linha.id, status: linha.status, nome: linha.primeiro_nome ?? '' } : null,
      real: !env.DRY_RUN || teste,
      evolution: this.deps.criarEvolution(env),
    };

    if (!ctx.cliente && p.telefone && estaBloqueado(this.deps.db, p.telefone) && p.intencao !== 'NAO' && p.intencao !== 'OPT_OUT') {
      this.anotar(`${ctx.quem} está na lista de bloqueados: nada enviado. Remova na aba Bloqueados para testar de novo.`, 'BLOQUEADO');
      return;
    }

    const acao = decidirAcao(ctx.cliente?.status ?? 'TESTE', p.intencao, p.midia);
    this.deps.log.info({ evento: 'RESPOSTA_ACAO', telefone: ctx.quem, intencao: p.intencao, acao, real: ctx.real });
    await this.executar(acao, ctx, p);
  }

  private dados(ctx: Contexto): DadosResposta | null {
    if (!ctx.env.CAMPANHA_DATA_FIM) return null;
    return {
      nome: ctx.cliente?.nome || 'Teste',
      loja: ctx.env.LOJA_NOME,
      dataFim: formatarDataFim(ctx.env.CAMPANHA_DATA_FIM),
      endereco: ctx.env.LOJA_ENDERECO ?? '',
    };
  }

  private texto(ctx: Contexto, tipo: TipoResposta, dados: DadosResposta): string {
    return gerarResposta(carregarModelosResposta(this.deps.caminhoTemplates(ctx.env)), tipo, dados, this.rng);
  }

  private registrarSaida(ctx: Contexto, tipo: TipoResposta, messageId: string, texto: string): void {
    this.deps.db
      .prepare("INSERT OR IGNORE INTO mensagens (cliente_id, direcao, tipo, message_id, texto) VALUES (?, 'OUT', ?, ?, ?)")
      .run(ctx.cliente?.id ?? null, tipo, messageId, texto);
  }

  private async enviarTexto(ctx: Contexto, tipo: TipoResposta, texto: string): Promise<void> {
    const delay = 1500 + Math.floor(this.rng() * 500); // digitação de 1,5 a 2 s
    const r = await ctx.evolution.sendText({ number: ctx.numero, text: texto, delay, linkPreview: false });
    this.registrarSaida(ctx, tipo, r.messageId, texto);
  }

  private async enviarImagem(ctx: Contexto, legenda: string): Promise<void> {
    const img = lerImagemVoucher(this.deps.pastaVoucher(ctx.env));
    if (!img) throw new Error('imagem do voucher não cadastrada');
    const r = await ctx.evolution.sendMedia({
      number: ctx.numero,
      mediatype: 'image',
      mimetype: img.mimetype,
      fileName: img.fileName,
      caption: legenda,
      media: img.base64,
      delay: 1500,
    });
    this.registrarSaida(ctx, 'R1_IMG', r.messageId, legenda);
  }

  private async executar(acao: AcaoResposta, ctx: Contexto, p: PedidoResposta): Promise<void> {
    const sim = ctx.real ? '' : 'Simulação: ';
    switch (acao) {
      case 'NADA':
        return;

      case 'HUMANO':
        this.mover(ctx, 'AGUARDANDO_HUMANO');
        this.anotar(`${ctx.quem} precisa de atendimento humano (sem resposta automática).`, 'HUMANO');
        return;

      case 'BLOQUEAR': {
        const tel = ctx.telefone;
        if (tel) bloquear(this.deps.db, tel, p.intencao === 'OPT_OUT' ? 'PEDIU_SAIR' : 'RESPONDEU_NAO');
        const jaEstava = ctx.cliente?.status === 'OPT_OUT';
        if (ctx.cliente) transicionar(this.deps.db, ctx.cliente.id, 'OPT_OUT');
        const dados = this.dados(ctx);
        if (ctx.real && !jaEstava && dados) await this.enviarTexto(ctx, 'R2', this.texto(ctx, 'R2', dados));
        this.anotar(`${sim}${ctx.quem} bloqueado (respondeu ${p.intencao === 'OPT_OUT' ? 'SAIR' : 'NÃO'}); confirmação enviada.`, 'BLOQUEADO');
        return;
      }

      case 'NAO_ENTENDIDO': {
        const dados = this.dados(ctx);
        if (!dados) {
          this.alerta(ctx, 'Defina o último dia da campanha para as respostas automáticas.');
          return;
        }
        if (ctx.real) {
          await this.enviarTexto(ctx, 'R4', this.texto(ctx, 'R4', dados));
          this.mover(ctx, 'DESCONHECIDO_1X');
        }
        this.anotar(`${sim}Resposta de ${ctx.quem} não entendida: pedimos para responder SIM.`, 'NAO_ENTENDIDO');
        return;
      }

      case 'VOUCHER':
      case 'VOUCHER_DE_NOVO': {
        const dados = this.dados(ctx);
        if (!dados) {
          this.mover(ctx, 'AGUARDANDO_HUMANO');
          this.alerta(ctx, 'Pediu o voucher, mas falta o último dia da campanha na configuração.');
          return;
        }
        if (!lerImagemVoucher(this.deps.pastaVoucher(ctx.env))) {
          this.mover(ctx, 'AGUARDANDO_HUMANO');
          this.alerta(ctx, 'Pediu o voucher, mas a imagem do voucher não foi cadastrada (aba Voucher).');
          return;
        }
        if (!ctx.real) {
          this.anotar(`Simulação: enviaria o voucher para ${ctx.quem}.`, 'VOUCHER');
          return;
        }
        const primeira = acao === 'VOUCHER';
        if (primeira) this.mover(ctx, 'VOUCHER_ENVIANDO');
        try {
          await this.enviarTexto(ctx, primeira ? 'R1' : 'R3', this.texto(ctx, primeira ? 'R1' : 'R3', dados));
          await this.dormir(3000 + Math.floor(this.rng() * 2000)); // imagem 3 a 5 s depois (N4)
          await this.enviarImagem(ctx, this.texto(ctx, 'R1_IMG', dados));
        } catch (err) {
          this.mover(ctx, 'AGUARDANDO_HUMANO');
          this.alerta(ctx, `Falha ao enviar o voucher: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        if (primeira) this.mover(ctx, 'VOUCHER_ENVIADO');
        if (ctx.cliente) {
          this.deps.db.prepare('UPDATE clientes SET respondido_em = COALESCE(respondido_em, ?) WHERE id = ?').run(new Date().toISOString(), ctx.cliente.id);
        }
        this.anotar(`Voucher ${primeira ? 'enviado' : 'reenviado'} para ${ctx.quem}.`, 'VOUCHER');
        return;
      }
    }
  }
}
