// Constantes do domínio que não são configuráveis por ambiente.

/** Fuso de todas as regras de horário (RNF12). */
export const FUSO = 'America/Sao_Paulo';

/** IDs dos botões de resposta (seção 10.2, RF11). */
export const BOTAO = {
  QUERO_VOUCHER: 'BTN_QUERO_VOUCHER',
  NAO_QUERO: 'BTN_NAO_QUERO',
} as const;

/** Valores de clientes.status (seção 9.3). */
export const STATUS_CLIENTE = [
  'IMPORTADO',
  'SEM_WHATSAPP',
  'SUPRIMIDO',
  'PRONTO',
  'ENVIANDO',
  'ENVIADO',
  'ERRO',
  'VERIFICAR',
  'DESCONHECIDO_1X',
  'VOUCHER_ENVIANDO',
  'VOUCHER_ENVIADO',
  'OPT_OUT',
  'AGUARDANDO_HUMANO',
  'ESGOTADO',
  'NAO_CONTATADO',
] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

/** Eventos do webhook tratados pelo sistema (seção 10.3). */
export const EVENTOS_WEBHOOK = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'] as const;

/** Tamanho máximo do lote em /chat/whatsappNumbers (RF03). */
export const LOTE_VALIDACAO = 50;
