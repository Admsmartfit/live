// CLI de operação (RF19). Uso: node dist/src/cli/index.js <comando> [opções]
//   importar <relatorio.pdf>   lê a listagem de clientes, limpa, prioriza e grava no banco
//   validar-numeros            consulta na Evolution quais números têm WhatsApp (não envia nada)
//   relatorio                  contagens por status, segmento e região
//   status                     janela, trava diária e modo de operação de hoje
//   simular [--dias N]         plano de envio dos próximos dias, com horários e textos (não envia)
//   teste-envio <numero>       mensagem de teste para um número da TEST_ALLOWLIST (--confirmar para enviar)

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DateTime } from 'luxon';
import { caminhoBanco, caminhoTemplates, configJanela } from '../config/campanha.js';
import { FUSO, LOTE_VALIDACAO } from '../config/constants.js';
import { loadEnv, type Env } from '../config/env.js';
import {
  abrirBanco,
  aplicarValidacao,
  auditar,
  contagem,
  diasComEnvioAntes,
  enviadosNoDia,
  garantirCampanha,
  importarClientes,
  listarFila,
  pendentesValidacao,
  type Banco,
} from '../db/repo.js';
import { mascararTelefone, normalizarTelefone } from '../domain/phone.js';
import { escolherVersao, carregarModelos, formatarDataFim, gerarMensagem, type VersaoTexto } from '../domain/templates.js';
import { createEvolutionClient } from '../evolution/client.js';
import { EvolutionError } from '../evolution/errors.js';
import { processarRelatorio } from '../importacao/processar.js';
import { lerRelatorioPdf } from '../importacao/relatorio.js';
import { limiteDoDia } from '../outbound/limits.js';
import { duracaoDigitacaoMs, planejarDia } from '../outbound/scheduler.js';
import { diaSP, estadoJanela, janelaDoDia } from '../outbound/window.js';

const hoje = () => DateTime.now().setZone(FUSO);

function abrir(env: Env): { db: Banco; campanhaId: number } {
  const db = abrirBanco(caminhoBanco(env));
  const campanhaId = garantirCampanha(db, {
    nome: env.LOJA_NOME,
    dataLimite: env.CAMPANHA_DATA_FIM ?? '',
    hoje: hoje().toISODate() ?? '',
  });
  return { db, campanhaId };
}

/** CSV com ";" e BOM, para abrir direto no Excel em português. */
function gravarCsv(caminho: string, cabecalho: string[], linhas: (string | number | null)[][]): void {
  const cel = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
  writeFileSync(caminho, `\uFEFF${conteudo}\r\n`, 'utf8');
}

const tabela = (obj: Record<string, number>) => {
  for (const [k, v] of Object.entries(obj)) console.log(`  ${k.padEnd(48)} ${String(v).padStart(6)}`);
};

const NOME_FAIXA: Record<string, string> = {
  'GV-RECENTE': '1. Grande Vitória · comprou nos últimos 6 meses',
  'GV-ANTIGO': '2. Grande Vitória · 6 a 24 meses',
  'ES-RECENTE': '3. Interior do ES · últimos 6 meses',
  'ES-ANTIGO': '4. Interior do ES · 6 a 24 meses',
  'GV-INATIVO': '5. Grande Vitória · mais de 24 meses',
  'ES-INATIVO': '6. Interior do ES · mais de 24 meses',
  'FORA-RECENTE': '7. Fora do ES · últimos 6 meses',
  'FORA-ANTIGO': '8. Fora do ES · 6 a 24 meses',
  'FORA-INATIVO': '9. Fora do ES · mais de 24 meses',
};

// ------------------------------------------------------------ comandos

async function importar(arquivo: string | undefined, opcoes: { hoje?: string | undefined }): Promise<void> {
  if (!arquivo) throw new Error('Informe o PDF: importar "C:\\caminho\\listagem.pdf"');
  const env = loadEnv();
  const ref = opcoes.hoje ?? hoje().toISODate() ?? '';
  console.log(`Lendo ${arquivo}…`);
  const linhas = await lerRelatorioPdf(resolve(arquivo));
  const r = processarRelatorio(linhas, ref);
  const { db, campanhaId } = abrir(env);
  const banco = importarClientes(db, campanhaId, r.clientes);
  auditar(db, 'IMPORT', { arquivo, linhas: r.linhasLidas, validos: r.clientes.length, ...banco }, 'CLI');

  const dir = resolve(process.cwd(), env.DATA_DIR);
  const csvFila = join(dir, 'fila-prioridade.csv');
  const csvRej = join(dir, 'import-rejeitados.csv');
  gravarCsv(
    csvFila,
    ['ordem', 'faixa', 'nome', 'telefone', 'cidade', 'ultima_compra', 'dias', 'vendedora', 'ajustes'],
    r.clientes.map((c, i) => [
      i + 1,
      NOME_FAIXA[`${c.regiao}-${c.segmento}`] ?? '',
      c.nomeCompleto,
      c.telefone,
      c.cidade,
      c.ultimaCompra,
      c.dias,
      c.vendedora,
      c.ajustes.join(','),
    ]),
  );
  gravarCsv(
    csvRej,
    ['pagina', 'nome', 'telefone_no_relatorio', 'motivo'],
    r.rejeitados.map((x) => [x.pagina, x.nome, x.telefoneBruto, x.motivo]),
  );

  const porFaixa: Record<string, number> = {};
  for (const c of r.clientes) {
    const k = NOME_FAIXA[`${c.regiao}-${c.segmento}`] ?? '?';
    porFaixa[k] = (porFaixa[k] ?? 0) + 1;
  }
  const porMotivo: Record<string, number> = {};
  for (const x of r.rejeitados) porMotivo[x.motivo] = (porMotivo[x.motivo] ?? 0) + 1;

  console.log(`\nLinhas no relatório:      ${r.linhasLidas}`);
  console.log(`Clientes aptos:           ${r.clientes.length}  (duplicados unificados: ${r.duplicadosUnificados})`);
  console.log(`Rejeitados:               ${r.rejeitados.length}`);
  tabela(porMotivo);
  console.log('\nOrdem de envio (prioridade):');
  tabela(Object.fromEntries(Object.entries(porFaixa).sort()));
  console.log(`\nBanco: ${banco.novos} novos, ${banco.atualizados} atualizados, ${banco.jaEmAndamento} já em andamento, ${banco.suprimidos} suprimidos (opt-out)`);
  console.log(`Fila completa:  ${csvFila}`);
  console.log(`Rejeitados:     ${csvRej}`);
  console.log('\nPróximo passo: validar-numeros (confere quais têm WhatsApp; não envia nada).');
}

async function validarNumeros(): Promise<void> {
  const env = loadEnv();
  const { db, campanhaId } = abrir(env);
  const pendentes = pendentesValidacao(db, campanhaId);
  if (pendentes.length === 0) {
    console.log('Nenhum número pendente de validação.');
    return;
  }
  const client = createEvolutionClient(env);
  console.log(`Validando ${pendentes.length} números em lotes de ${LOTE_VALIDACAO}…`);
  let comWhats = 0;
  let semWhats = 0;
  for (let i = 0; i < pendentes.length; i += LOTE_VALIDACAO) {
    const lote = pendentes.slice(i, i + LOTE_VALIDACAO);
    const resultado = await client.whatsappNumbers(lote.map((p) => p.telefone));
    for (const p of lote) {
      const achado = resultado.find((r) => r.number.replace(/\D/g, '') === p.telefone || r.jid.startsWith(p.telefone));
      const jid = achado?.exists === true ? achado.jid || null : null;
      const existe = achado?.exists === true;
      aplicarValidacao(db, p.id, existe, jid);
      if (existe) comWhats++;
      else semWhats++;
    }
    process.stdout.write(`\r  ${Math.min(i + LOTE_VALIDACAO, pendentes.length)}/${pendentes.length}`);
    await new Promise((r) => setTimeout(r, 1500)); // sem rajadas na API
  }
  console.log(`\nCom WhatsApp: ${comWhats} · Sem WhatsApp: ${semWhats}`);
}

function relatorio(): void {
  const env = loadEnv();
  const { db, campanhaId } = abrir(env);
  console.log('Por status:');
  tabela(contagem(db, campanhaId, 'status'));
  console.log('\nPor segmento:');
  tabela(contagem(db, campanhaId, 'segmento'));
  console.log('\nPor região:');
  tabela(contagem(db, campanhaId, 'regiao'));
}

function status(): void {
  const env = loadEnv();
  const { db } = abrir(env);
  const agora = hoje();
  const dia = diaSP(agora);
  const diaCampanha = diasComEnvioAntes(db, dia) + 1;
  const limite = limiteDoDia(diaCampanha, env.DAILY_RAMP, env.DAILY_LIMIT);
  const j = estadoJanela(agora, configJanela(env));
  console.log(`Modo:             ${env.DRY_RUN ? 'SIMULAÇÃO (DRY_RUN=true, nada é enviado)' : 'ENVIO REAL'}`);
  console.log(`Campanha ativa:   ${env.CAMPANHA_ATIVA ? 'sim' : 'não (CAMPANHA_ATIVA=false)'}`);
  console.log(`Allowlist:        ${env.TEST_ALLOWLIST.length > 0 ? `${env.TEST_ALLOWLIST.length} número(s) de teste — só eles recebem` : 'vazia (todos da fila)'}`);
  console.log(`Janela:           seg–sex ${env.WINDOW_WEEKDAY_START}–${env.WINDOW_WEEKDAY_END} · sáb ${env.WINDOW_SATURDAY_START}–${env.WINDOW_SATURDAY_END} · dom ${env.WINDOW_SUNDAY ? 'sim' : 'não'}`);
  console.log(`Agora:            ${j.aberta ? `janela ABERTA até ${j.fim?.toFormat('HH:mm') ?? ''}` : `fechada, abre ${j.proximaAbertura?.toFormat('dd/MM HH:mm') ?? '-'}`}`);
  console.log(`Trava de hoje:    ${enviadosNoDia(db, dia)} de ${limite} enviados (dia ${diaCampanha} da campanha; DAILY_LIMIT=${env.DAILY_LIMIT}, rampa=${env.DAILY_RAMP.join(',')})`);
  console.log(`Limite por hora:  ${env.HOURLY_CAP}`);
}

function simular(opcoes: { dias: number; mostrar: number }): void {
  const env = loadEnv();
  if (!env.CAMPANHA_DATA_FIM) throw new Error('Defina CAMPANHA_DATA_FIM (AAAA-MM-DD) no .env.');
  const { db, campanhaId } = abrir(env);
  const modelos = carregarModelos(caminhoTemplates(env));
  const dataFim = formatarDataFim(env.CAMPANHA_DATA_FIM);
  const janela = configJanela(env);
  const fila = listarFila(
    db,
    { campanhaId, agoraIso: new Date().toISOString(), maxTentativas: env.MAX_ATTEMPTS, allowlist: [], incluirNaoValidados: true },
    100_000,
  );
  console.log(`SIMULAÇÃO — nada é enviado. Fila: ${fila.length} clientes (PRONTO + ainda não validados).\n`);

  let cursor = 0;
  let diaCampanha = diasComEnvioAntes(db, diaSP(hoje())) + 1;
  let data = hoje().startOf('day');
  let diasMostrados = 0;
  for (let guarda = 0; diasMostrados < opcoes.dias && guarda < 60; guarda++, data = data.plus({ days: 1 })) {
    if (!janelaDoDia(data, janela)) continue;
    const limite = limiteDoDia(diaCampanha, env.DAILY_RAMP, env.DAILY_LIMIT);
    const horarios = planejarDia({ dia: data, janela, limite, minimoS: env.JITTER_MIN_S, rng: Math.random });
    console.log(`=== ${data.setLocale('pt-BR').toFormat('cccc dd/MM')} — ${horarios.length} envios (limite ${limite}) ===`);
    horarios.forEach((h, i) => {
      const c = fila[cursor++];
      if (!c) return;
      if (i < opcoes.mostrar) {
        const versao = escolherVersao(c.segmento, c.vendedora, Math.random);
        const texto = gerarMensagem(modelos, { nome: c.primeiro_nome, vendedora: c.vendedora, loja: env.LOJA_NOME, dataFim }, versao);
        console.log(`${h.toFormat('HH:mm')}  ${c.nome_completo.padEnd(32).slice(0, 32)} ${mascararTelefone(c.telefone)}  ${(c.regiao ?? '').padEnd(4)} ${(c.segmento ?? '').padEnd(8)} ${versao}`);
        if (diasMostrados === 0 && i < 3) console.log(`        ${texto.replace(/\n/g, '\n        ')}\n`);
      }
    });
    if (horarios.length > opcoes.mostrar) console.log(`… e mais ${horarios.length - opcoes.mostrar} envios até ${horarios.at(-1)?.toFormat('HH:mm') ?? ''}`);
    console.log('');
    diaCampanha++;
    diasMostrados++;
  }
  const restante = Math.max(0, fila.length - cursor);
  const porDia = Math.max(1, limiteDoDia(99, env.DAILY_RAMP, env.DAILY_LIMIT));
  console.log(`Depois desses dias ainda restariam ${restante} clientes (~${Math.ceil(restante / porDia)} dias de envio a ${porDia}/dia).`);
}

async function testeEnvio(numero: string | undefined, opcoes: { confirmar: boolean; nome: string; vendedora?: string | undefined; versao?: string | undefined }): Promise<void> {
  const env = loadEnv();
  const tel = normalizarTelefone(numero);
  if (!tel.ok) throw new Error(`Número inválido (${tel.motivo}). Use, por exemplo: 27999887766`);
  if (!env.TEST_ALLOWLIST.includes(tel.telefone)) {
    throw new Error(`${tel.telefone} não está na TEST_ALLOWLIST do .env. Só números de teste podem receber.`);
  }
  if (!env.CAMPANHA_DATA_FIM) throw new Error('Defina CAMPANHA_DATA_FIM (AAAA-MM-DD) no .env.');
  const modelos = carregarModelos(caminhoTemplates(env));
  const versao = (opcoes.versao?.toUpperCase() as VersaoTexto | undefined) ?? escolherVersao('RECENTE', opcoes.vendedora ?? null, Math.random);
  if (!['B1', 'B2', 'C1', 'C2'].includes(versao)) throw new Error('--versao deve ser B1, B2, C1 ou C2');
  if (versao.startsWith('B') && !opcoes.vendedora) throw new Error('Os modelos B usam vendedora: informe --vendedora Nome');
  const texto = gerarMensagem(
    modelos,
    { nome: opcoes.nome, vendedora: opcoes.vendedora ?? null, loja: env.LOJA_NOME, dataFim: formatarDataFim(env.CAMPANHA_DATA_FIM) },
    versao,
  );
  console.log(`Para: ${tel.telefone}  ·  modelo ${versao}\n----------------------------------------\n${texto}\n----------------------------------------`);
  if (!opcoes.confirmar) {
    console.log('Pré-visualização apenas. Para enviar de verdade, repita com --confirmar.');
    return;
  }

  const client = createEvolutionClient(env);
  const { state } = await client.connectionState();
  if (state !== 'open') throw new Error(`Instância não conectada (state: ${state}).`);
  const delay = duracaoDigitacaoMs(texto, { charsPorS: env.TYPING_CHARS_PER_S, minMs: env.TYPING_MIN_MS, maxMs: env.TYPING_MAX_MS });
  const r = await client.sendText({ number: tel.telefone, text: texto, delay, linkPreview: false });
  const { db } = abrir(env);
  auditar(db, 'TESTE_ENVIO', { telefone: mascararTelefone(tel.telefone), versao, message_id: r.messageId }, 'CLI');
  console.log(`Enviado. message_id: ${r.messageId}`);
}

// ------------------------------------------------------------ entrada

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      hoje: { type: 'string' },
      dias: { type: 'string', default: '2' },
      mostrar: { type: 'string', default: '15' },
      confirmar: { type: 'boolean', default: false },
      nome: { type: 'string', default: 'Teste' },
      vendedora: { type: 'string' },
      versao: { type: 'string' },
    },
  });
  const [comando, arg] = positionals;
  switch (comando) {
    case 'importar':
      return importar(arg, { hoje: values.hoje });
    case 'validar-numeros':
      return validarNumeros();
    case 'relatorio':
      relatorio();
      return;
    case 'status':
      status();
      return;
    case 'simular':
      simular({ dias: Number(values.dias), mostrar: Number(values.mostrar) });
      return;
    case 'teste-envio':
      return testeEnvio(arg, { confirmar: values.confirmar, nome: values.nome, vendedora: values.vendedora, versao: values.versao });
    default:
      console.log('Comandos: importar <pdf> | validar-numeros | relatorio | status | simular [--dias N] | teste-envio <numero> [--confirmar]');
      process.exitCode = comando ? 1 : 0;
  }
}

main().catch((err: unknown) => {
  if (err instanceof EvolutionError) console.error(`Erro da Evolution API [${err.classe}]: ${err.message}`);
  else console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
