// Logs JSON estruturados, um evento por linha (RNF05). Telefones sempre mascarados (RNF06).

import type { FastifyBaseLogger } from 'fastify';
import pino from 'pino';

export function criarLog(nivel: string): FastifyBaseLogger {
  return pino({ level: nivel, base: null, timestamp: pino.stdTimeFunctions.isoTime });
}
