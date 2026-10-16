import { describe, expect, it, vi } from 'vitest';
import { EvolutionClient, createEvolutionClient } from '../../src/evolution/client.js';
import { EvolutionError } from '../../src/evolution/errors.js';

const BASE = 'https://evolution.exemplo.test';
const INSTANCIA = 'ao vivo vv';
const INSTANCIA_URL = 'ao%20vivo%20vv';
const CHAVE = 'chave-de-teste';

type Resposta = { status?: number; corpo?: unknown } | Error;

function mockFetch(...respostas: Resposta[]) {
  const fila = [...respostas];
  return vi.fn<typeof fetch>(() => {
    const r = fila.length > 1 ? fila.shift() : fila[0];
    if (r === undefined) throw new Error('mock sem resposta');
    if (r instanceof Error) return Promise.reject(r);
    const texto = r.corpo === undefined ? '' : typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo);
    return Promise.resolve(new Response(texto, { status: r.status ?? 200 }));
  });
}

function criar(fetchMock: typeof fetch, extra: Partial<ConstructorParameters<typeof EvolutionClient>[0]> = {}) {
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const client = new EvolutionClient({
    baseUrl: `${BASE}/`,
    apiKey: CHAVE,
    instance: INSTANCIA,
    fetch: fetchMock,
    sleep,
    ...extra,
  });
  return { client, sleep };
}

function chamada(f: ReturnType<typeof mockFetch>, i = 0) {
  const args = f.mock.calls[i];
  if (!args) throw new Error(`chamada ${i} não ocorreu`);
  const [url, init] = args;
  return {
    url: url as string,
    metodo: init?.method,
    headers: init?.headers as Record<string, string>,
    corpo: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
    signal: init?.signal,
  };
}

async function capturar(p: Promise<unknown>): Promise<EvolutionError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof EvolutionError) return err;
    throw err;
  }
  throw new Error('era esperado EvolutionError');
}

const ENVIADA = { key: { id: 'BAE5ABC123', remoteJid: '5527999887766@s.whatsapp.net', fromMe: true } };

describe('EvolutionClient — rotas e contratos (seção 10)', () => {
  it('getVersion faz GET / com apikey e devolve a versão', async () => {
    const f = mockFetch({ corpo: { status: 200, message: 'Welcome', version: '2.3.1' } });
    const { client } = criar(f);

    const r = await client.getVersion();

    expect(r.version).toBe('2.3.1');
    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/`);
    expect(c.metodo).toBe('GET');
    expect(c.headers.apikey).toBe(CHAVE);
    expect(c.corpo).toBeUndefined();
  });

  it('getVersion devolve null quando a resposta não traz versão', async () => {
    const { client } = criar(mockFetch({ corpo: { message: 'ok' } }));
    expect((await client.getVersion()).version).toBeNull();
  });

  it('codifica o nome da instância na URL', async () => {
    const f = mockFetch({ corpo: { instance: { instanceName: INSTANCIA, state: 'open' } } });
    const { client } = criar(f);

    const r = await client.connectionState();

    expect(r.state).toBe('open');
    expect(chamada(f).url).toBe(`${BASE}/instance/connectionState/${INSTANCIA_URL}`);
  });

  it('codifica caracteres especiais da instância (/, ?, #)', async () => {
    const f = mockFetch({ corpo: { state: 'open' } });
    const { client } = criar(f, { instance: 'loja/1?x#y' });
    await client.connectionState();
    expect(chamada(f).url).toBe(`${BASE}/instance/connectionState/loja%2F1%3Fx%23y`);
  });

  it('connectionState aceita o formato { state } e falha sem state', async () => {
    const { client } = criar(mockFetch({ corpo: { state: 'connecting' } }));
    expect((await client.connectionState()).state).toBe('connecting');

    const { client: c2 } = criar(mockFetch({ corpo: { foo: 1 } }));
    expect((await capturar(c2.connectionState())).classe).toBe('DESCONHECIDO');
  });

  it('assertConectado lança CONEXAO quando state != open', async () => {
    const { client } = criar(mockFetch({ corpo: { instance: { state: 'close' } } }));
    const err = await capturar(client.assertConectado());
    expect(err.classe).toBe('CONEXAO');
    expect(err.critico).toBe(true);
  });

  it('whatsappNumbers divide em lotes de 50 e junta os resultados', async () => {
    const numeros = Array.from({ length: 120 }, (_, i) => `55279990${String(i).padStart(5, '0')}`);
    const f = vi.fn<typeof fetch>((_url, init) => {
      const { numbers } = JSON.parse(init?.body as string) as { numbers: string[] };
      const corpo = numbers.map((n, i) => ({ exists: i % 2 === 0, jid: `${n}@s.whatsapp.net`, number: n }));
      return Promise.resolve(new Response(JSON.stringify(corpo)));
    });
    const { client } = criar(f);

    const r = await client.whatsappNumbers(numeros);

    expect(f).toHaveBeenCalledTimes(3);
    const tamanhos = f.mock.calls.map(([, init]) => (JSON.parse(init?.body as string) as { numbers: string[] }).numbers.length);
    expect(tamanhos).toEqual([50, 50, 20]);
    expect(f.mock.calls[0]?.[0] as string).toBe(`${BASE}/chat/whatsappNumbers/${INSTANCIA_URL}`);
    expect(r).toHaveLength(120);
    expect(r[0]).toEqual({ exists: true, jid: `${numeros[0]}@s.whatsapp.net`, number: numeros[0] });
  });

  it('whatsappNumbers preserva lid e não chama a API com lista vazia', async () => {
    const f = mockFetch({ corpo: [{ exists: true, jid: '123@lid', number: '5527999887766', lid: '123@lid' }] });
    const { client } = criar(f);
    expect(await client.whatsappNumbers([])).toEqual([]);
    expect(f).not.toHaveBeenCalled();

    const [n] = await client.whatsappNumbers(['5527999887766']);
    expect(n?.lid).toBe('123@lid');
  });

  it('whatsappNumbers rejeita resposta que não é array', async () => {
    const { client } = criar(mockFetch({ corpo: { erro: 'x' } }));
    expect((await capturar(client.whatsappNumbers(['5527999887766']))).classe).toBe('DESCONHECIDO');
  });

  it('sendPresence envia composing com delay', async () => {
    const f = mockFetch({ status: 201, corpo: {} });
    const { client } = criar(f);
    await client.sendPresence({ number: '5527999887766', delay: 4000 });

    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/chat/sendPresence/${INSTANCIA_URL}`);
    expect(c.metodo).toBe('POST');
    expect(c.corpo).toEqual({ number: '5527999887766', presence: 'composing', delay: 4000 });
  });

  it('sendText envia o corpo da seção 10.2 e devolve o message_id', async () => {
    const f = mockFetch({ status: 201, corpo: ENVIADA });
    const { client } = criar(f);

    const r = await client.sendText({ number: '5527999887766', text: 'Oi Mariana!', delay: 4200 });

    expect(r.messageId).toBe('BAE5ABC123');
    expect(r.remoteJid).toBe('5527999887766@s.whatsapp.net');
    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/message/sendText/${INSTANCIA_URL}`);
    expect(c.headers['content-type']).toBe('application/json');
    expect(c.corpo).toEqual({ number: '5527999887766', text: 'Oi Mariana!', delay: 4200, linkPreview: false });
  });

  it('sendText sem key.id na resposta é erro', async () => {
    const { client } = criar(mockFetch({ status: 201, corpo: { status: 'PENDING' } }));
    const err = await capturar(client.sendText({ number: '5527999887766', text: 'x' }));
    expect(err.classe).toBe('DESCONHECIDO');
  });

  it('sendButtons envia o corpo da seção 10.2', async () => {
    const f = mockFetch({ status: 201, corpo: ENVIADA });
    const { client } = criar(f);
    const p = {
      number: '5527999887766',
      title: 'Aviso da loja',
      description: 'texto',
      footer: 'Toque em uma opção ou responda SIM',
      buttons: [
        { type: 'reply' as const, displayText: 'Quero meu voucher 🎁', id: 'BTN_QUERO_VOUCHER' },
        { type: 'reply' as const, displayText: 'Não, obrigado', id: 'BTN_NAO_QUERO' },
      ],
    };

    await client.sendButtons(p);

    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/message/sendButtons/${INSTANCIA_URL}`);
    expect(c.corpo).toEqual(p);
  });

  it('sendMedia envia imagem em base64', async () => {
    const f = mockFetch({ status: 201, corpo: ENVIADA });
    const { client } = criar(f);
    const p = {
      number: '5527999887766',
      mediatype: 'image' as const,
      mimetype: 'image/jpeg',
      fileName: 'LIVE-7K3Q.jpg',
      caption: 'Seu voucher LIVE-7K3Q · Mariana',
      media: 'aGVsbG8=',
      delay: 1500,
    };

    const r = await client.sendMedia(p);

    expect(r.messageId).toBe('BAE5ABC123');
    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/message/sendMedia/${INSTANCIA_URL}`);
    expect(c.corpo).toEqual(p);
  });

  it('markAsRead envia readMessages com fromMe false', async () => {
    const f = mockFetch({ status: 201, corpo: { message: 'Read messages', read: 'success' } });
    const { client } = criar(f);

    await client.markAsRead([{ remoteJid: '5527999887766@s.whatsapp.net', id: 'ABC' }]);
    await client.markAsRead([]);

    expect(f).toHaveBeenCalledTimes(1);
    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/chat/markMessageAsRead/${INSTANCIA_URL}`);
    expect(c.corpo).toEqual({
      readMessages: [{ remoteJid: '5527999887766@s.whatsapp.net', fromMe: false, id: 'ABC' }],
    });
  });

  it('setWebhook envia a configuração da seção 10.3', async () => {
    const f = mockFetch({ status: 201, corpo: { id: 'x' } });
    const { client } = criar(f);

    await client.setWebhook({ url: 'https://campanha.exemplo.test/webhook/tok' });

    const c = chamada(f);
    expect(c.url).toBe(`${BASE}/webhook/set/${INSTANCIA_URL}`);
    expect(c.corpo).toEqual({
      webhook: {
        enabled: true,
        url: 'https://campanha.exemplo.test/webhook/tok',
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      },
    });
  });

  it('setWebhook recusa URL sem HTTPS sem chamar a API (RNF08)', async () => {
    const f = mockFetch({ corpo: {} });
    const { client } = criar(f);
    await expect(client.setWebhook({ url: 'http://campanha.exemplo.test/webhook/tok' })).rejects.toThrow(/HTTPS/);
    expect(f).not.toHaveBeenCalled();
  });

  it('findWebhook lê a configuração atual da instância', async () => {
    const f = mockFetch({
      corpo: { enabled: true, url: 'https://x.test/webhook/tok', events: ['MESSAGES_UPSERT'], webhookByEvents: false },
    });
    const { client } = criar(f);
    expect(await client.findWebhook()).toMatchObject({ enabled: true, url: 'https://x.test/webhook/tok', events: ['MESSAGES_UPSERT'] });
    expect(chamada(f).url).toBe(`${BASE}/webhook/find/${INSTANCIA_URL}`);

    const vazio = criar(mockFetch({ corpo: undefined })).client;
    expect(await vazio.findWebhook()).toBeNull();
  });

  it('createEvolutionClient usa as variáveis de ambiente', async () => {
    const f = mockFetch({ corpo: { state: 'open' } });
    const client = createEvolutionClient(
      {
        EVOLUTION_BASE_URL: BASE,
        EVOLUTION_INSTANCE: INSTANCIA,
        EVOLUTION_API_KEY: CHAVE,
        EVOLUTION_TIMEOUT_MS: 10_000,
        EVOLUTION_MAX_RETRIES: 3,
      },
      { fetch: f },
    );
    await client.connectionState();
    expect(chamada(f).url).toBe(`${BASE}/instance/connectionState/${INSTANCIA_URL}`);
    expect(chamada(f).headers.apikey).toBe(CHAVE);
  });
});

describe('EvolutionClient — classificação de erros (seção 8)', () => {
  it.each([401, 403])('HTTP %i → AUTENTICACAO, crítico, sem retry', async (status) => {
    const f = mockFetch({ status, corpo: { error: 'Unauthorized' } });
    const { client } = criar(f);

    const err = await capturar(client.getVersion());

    expect(err.classe).toBe('AUTENTICACAO');
    expect(err.status).toBe(status);
    expect(err.critico).toBe(true);
    expect(err.contaComoFalha).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('erro com "banned" → AUTENTICACAO (kill switch)', async () => {
    const { client } = criar(mockFetch({ status: 500, corpo: { response: { message: ['account banned'] } } }));
    expect((await capturar(client.sendText({ number: '5527999887766', text: 'x' }))).classe).toBe('AUTENTICACAO');
  });

  it('400 "exists: false" → NUMERO, não conta como falha', async () => {
    const corpo = {
      status: 400,
      error: 'Bad Request',
      response: { message: [{ jid: '5527999887766@s.whatsapp.net', exists: false, number: '5527999887766' }] },
    };
    const f = mockFetch({ status: 400, corpo });
    const { client } = criar(f);

    const err = await capturar(client.sendText({ number: '5527999887766', text: 'x' }));

    expect(err.classe).toBe('NUMERO');
    expect(err.contaComoFalha).toBe(false);
    expect(err.detalhes.corpo).toEqual(corpo);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('"Connection Closed" → CONEXAO, sem retry', async () => {
    const f = mockFetch({ status: 500, corpo: { response: { message: ['Error: Connection Closed'] } } });
    const { client } = criar(f);
    const err = await capturar(client.sendText({ number: '5527999887766', text: 'x' }));
    expect(err.classe).toBe('CONEXAO');
    expect(err.critico).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('404 de instância inexistente → CONEXAO', async () => {
    const corpo = { status: 404, response: { message: ['The "ao vivo vv" instance does not exist'] } };
    const { client } = criar(mockFetch({ status: 404, corpo }));
    expect((await capturar(client.connectionState())).classe).toBe('CONEXAO');
  });

  it('400 genérico → DESCONHECIDO, conta como falha, sem retry', async () => {
    const f = mockFetch({ status: 400, corpo: { message: 'number is required' } });
    const { client } = criar(f);
    const err = await capturar(client.sendText({ number: '', text: 'x' }));
    expect(err.classe).toBe('DESCONHECIDO');
    expect(err.contaComoFalha).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 502, 503, 504])('leitura: HTTP %i → TRANSITORIO com até 3 retries (1 s, 3 s, 9 s)', async (status) => {
    const f = mockFetch({ status, corpo: 'erro' });
    const { client, sleep } = criar(f);

    const err = await capturar(client.getVersion());

    expect(err.classe).toBe('TRANSITORIO');
    expect(err.retentavel).toBe(true);
    expect(err.detalhes.tentativas).toBe(4);
    expect(f).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 3000, 9000]);
  });

  it('leitura: recupera após erro transitório', async () => {
    const f = mockFetch({ status: 502 }, { status: 200, corpo: { version: '2.3.1' } });
    const { client, sleep } = criar(f);
    expect((await client.getVersion()).version).toBe('2.3.1');
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('respeita maxRetries', async () => {
    const f = mockFetch({ status: 503 });
    const { client } = criar(f, { maxRetries: 0 });
    await capturar(client.getVersion());
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503])('envio: HTTP %i (não processado) é repetido', async (status) => {
    const f = mockFetch({ status }, { status: 201, corpo: ENVIADA });
    const { client } = criar(f);
    const r = await client.sendText({ number: '5527999887766', text: 'x' });
    expect(r.messageId).toBe('BAE5ABC123');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([500, 502, 504])('envio: HTTP %i não é repetido (evita duplicar mensagem)', async (status) => {
    const f = mockFetch({ status, corpo: 'erro' });
    const { client } = criar(f);
    const err = await capturar(client.sendText({ number: '5527999887766', text: 'x' }));
    expect(err.classe).toBe('TRANSITORIO');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('falha de rede → TRANSITORIO; repetida na leitura, não no envio', async () => {
    const leitura = mockFetch(new TypeError('fetch failed'));
    const { client } = criar(leitura);
    const err = await capturar(client.connectionState());
    expect(err.classe).toBe('TRANSITORIO');
    expect(err.message).toMatch(/Falha de rede/);
    expect(leitura).toHaveBeenCalledTimes(4);

    const envio = mockFetch(new TypeError('fetch failed'));
    const { client: c2 } = criar(envio);
    expect((await capturar(c2.sendText({ number: '5527999887766', text: 'x' }))).classe).toBe('TRANSITORIO');
    expect(envio).toHaveBeenCalledTimes(1);
  });

  it('aborta a requisição no timeout → TRANSITORIO', async () => {
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const { client } = criar(f, { timeoutMs: 30, maxRetries: 0 });

    const inicio = Date.now();
    const err = await capturar(client.getVersion());

    expect(err.classe).toBe('TRANSITORIO');
    expect(err.message).toMatch(/Timeout/);
    expect(Date.now() - inicio).toBeLessThan(2000);
  });

  it('timeout padrão é 10 s e soma o delay do envio', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const { client } = criar(mockFetch({ status: 201, corpo: ENVIADA }));
      await client.sendText({ number: '5527999887766', text: 'x', delay: 4200 });
      await client.sendPresence({ number: '5527999887766', delay: 5000 }).catch(() => undefined);
      expect(spy.mock.calls.map(([ms]) => ms)).toEqual([14_200, 15_000]);

      spy.mockClear();
      const { client: c2 } = criar(mockFetch({ corpo: {} }));
      await c2.getVersion();
      expect(spy).toHaveBeenCalledWith(10_000);
    } finally {
      spy.mockRestore();
    }
  });

  it('mensagem de erro não expõe a apikey', async () => {
    const { client } = criar(mockFetch({ status: 401, corpo: { error: 'Unauthorized' } }));
    const err = await capturar(client.getVersion());
    expect(JSON.stringify({ m: err.message, d: err.detalhes })).not.toContain(CHAVE);
  });
});
