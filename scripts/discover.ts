// Etapa 0 — descoberta. Somente leitura: GET / e GET /instance/connectionState.
// Nenhum envio é feito. Uso: npm run discover

import { evolutionEnvSchema, loadEnv } from '../src/config/env.js';
import { createEvolutionClient } from '../src/evolution/client.js';
import { EvolutionError } from '../src/evolution/errors.js';

const env = loadEnv(evolutionEnvSchema);
const client = createEvolutionClient(env);

console.log(`Servidor:  ${env.EVOLUTION_BASE_URL}`);
console.log(`Instância: ${env.EVOLUTION_INSTANCE} (na URL: ${encodeURIComponent(env.EVOLUTION_INSTANCE)})`);

let codigo = 0;

try {
  const { version, raw } = await client.getVersion();
  console.log(`Versão da API: ${version ?? 'não informada'}`);
  if (version === null) {
    console.log('Resposta de GET /:', JSON.stringify(raw, null, 2));
  } else if (!version.startsWith('2.')) {
    console.warn('ATENÇÃO: o client segue o formato v2 (PRD seção 10). Revise os contratos para esta versão.');
    codigo = 2;
  }
} catch (err) {
  relatar('GET /', err);
  codigo = 1;
}

try {
  const { state } = await client.connectionState();
  console.log(`Estado da conexão: state: ${state}`);
  if (state !== 'open') {
    console.warn('ATENÇÃO: a instância não está "open". Reconecte pelo manager da Evolution antes de seguir.');
    codigo = codigo || 3;
  }
} catch (err) {
  relatar('connectionState', err);
  codigo = 1;
}

process.exit(codigo);

function relatar(onde: string, err: unknown): void {
  if (err instanceof EvolutionError) {
    console.error(`Erro em ${onde}: ${err.message} [classe ${err.classe}]`);
    if (err.classe === 'AUTENTICACAO') console.error('Verifique EVOLUTION_API_KEY.');
    if (err.classe === 'CONEXAO') console.error('Verifique EVOLUTION_INSTANCE e se a instância existe.');
  } else {
    console.error(`Erro inesperado em ${onde}:`, err);
  }
}
