// Etapa 0 — captura de payloads reais do webhook para tests/fixtures/.
// Sobe um servidor temporário em POST /webhook/:token e grava cada evento em
// tests/fixtures/<evento>-<timestamp>.json. Não responde a ninguém nem chama a API.
// Uso: npm run capture-webhook  (aponte o webhook da instância para
// https://<seu-túnel>/webhook/<WEBHOOK_TOKEN>)
//
// LGPD: os payloads contêm telefones e textos reais. Anonimize antes de versionar.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { captureEnvSchema, loadEnv } from '../src/config/env.js';

export interface OpcoesCaptura {
  token: string;
  dir: string;
  bodyLimit?: number;
  agora?: () => Date;
  aoGravar?: (arquivo: string, evento: string) => void;
}

/** "messages.upsert" | "MESSAGES_UPSERT" | "messages-upsert" → "messages-upsert". */
export function nomeEvento(bruto: unknown): string {
  if (typeof bruto !== 'string' || bruto.trim() === '') return 'desconhecido';
  return (
    bruto
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'desconhecido'
  );
}

export function criarServidorCaptura(opts: OpcoesCaptura): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: opts.bodyLimit ?? 1_048_576 });
  const agora = opts.agora ?? (() => new Date());
  let sequencia = 0;

  const tratar = async (token: string, eventoRota: string | undefined, corpo: unknown) => {
    if (token !== opts.token) return false;
    const evento = nomeEvento((corpo as { event?: unknown } | null)?.event ?? eventoRota);
    const ts = agora().toISOString().replace(/[:.]/g, '-');
    sequencia += 1;
    const arquivo = join(opts.dir, `${evento}-${ts}-${String(sequencia).padStart(3, '0')}.json`);
    await mkdir(opts.dir, { recursive: true });
    await writeFile(arquivo, `${JSON.stringify(corpo, null, 2)}\n`, { flag: 'wx' });
    opts.aoGravar?.(arquivo, evento);
    return true;
  };

  // byEvents=false → /webhook/:token; byEvents=true → a API acrescenta /<evento>.
  app.post<{ Params: { token: string; evento?: string } }>('/webhook/:token/:evento?', async (req, reply) => {
    const ok = await tratar(req.params.token, req.params.evento, req.body);
    return ok ? reply.code(200).send({ ok: true }) : reply.code(404).send();
  });

  return app;
}

async function main(): Promise<void> {
  const env = loadEnv(captureEnvSchema);
  const dir = resolve(process.cwd(), 'tests', 'fixtures');
  const app = criarServidorCaptura({
    token: env.WEBHOOK_TOKEN,
    dir,
    aoGravar: (arquivo, evento) => {
      console.log(`[${new Date().toISOString()}] ${evento} → ${arquivo}`);
    },
  });
  await app.listen({ host: env.HOST, port: env.PORT });
  console.log(`Capturando em http://${env.HOST}:${env.PORT}/webhook/<WEBHOOK_TOKEN>`);
  console.log(`Gravando em ${dir}. Ctrl+C para encerrar.`);
  console.log(
    'Capture ao menos: texto, botão, áudio, figurinha, grupo, fromMe, entrega e leitura (PRD 10.4).',
  );
}

const executadoDireto = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDireto) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
