// Página única do painel. Sem dependências externas (funciona sem internet).
// O JavaScript abaixo não usa template literals para não conflitar com a string TS.

export const PAGINA_PAINEL = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel da Campanha</title>
<style>
:root {
  --fundo: #f4f5f7; --cartao: #ffffff; --texto: #1d2129; --suave: #5f6673; --borda: #d9dce1;
  --primaria: #0f7b5f; --primaria-texto: #ffffff; --perigo: #b42318; --aviso: #8a5a00;
  --ok-fundo: #e6f4ee; --erro-fundo: #fdecea; --aviso-fundo: #fff4e0; --campo: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #14161a; --cartao: #1d2026; --texto: #e7e9ec; --suave: #a0a6b1; --borda: #343943;
    --primaria: #2bb38a; --primaria-texto: #08130f; --perigo: #ff8a80; --aviso: #ffcf70;
    --ok-fundo: #12302a; --erro-fundo: #3a1d1b; --aviso-fundo: #3a2e15; --campo: #171a1f;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); color: var(--texto); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { background: var(--cartao); border-bottom: 1px solid var(--borda); padding: 12px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
header h1 { font-size: 17px; margin: 0; flex: 1; }
main { max-width: 860px; margin: 0 auto; padding: 16px; }
.abas { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--borda); }
.abas button { background: none; border: 0; border-bottom: 3px solid transparent; padding: 10px 14px; color: var(--suave); font: inherit; cursor: pointer; }
.abas button[aria-selected="true"] { color: var(--texto); border-bottom-color: var(--primaria); font-weight: 600; }
section.cartao { background: var(--cartao); border: 1px solid var(--borda); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
section.cartao h2 { font-size: 16px; margin: 0 0 4px; }
.ajuda { color: var(--suave); font-size: 13px; margin: 0 0 12px; }
label { display: block; font-weight: 600; font-size: 13px; margin: 12px 0 4px; }
input, select, textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--borda); border-radius: 8px; background: var(--campo); color: var(--texto); font: inherit; }
textarea { min-height: 180px; resize: vertical; }
input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--primaria); outline-offset: 1px; }
.linha { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 12px; }
.acoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
button.btn { border: 1px solid var(--borda); background: var(--cartao); color: var(--texto); padding: 9px 14px; border-radius: 8px; font: inherit; cursor: pointer; }
button.btn.primario { background: var(--primaria); border-color: var(--primaria); color: var(--primaria-texto); font-weight: 600; }
button.btn:disabled { opacity: .6; cursor: wait; }
.msg { margin-top: 12px; padding: 10px 12px; border-radius: 8px; font-size: 14px; display: none; white-space: pre-wrap; }
.msg.ok { display: block; background: var(--ok-fundo); }
.msg.erro { display: block; background: var(--erro-fundo); color: var(--perigo); }
.msg.aviso { display: block; background: var(--aviso-fundo); color: var(--aviso); }
.selo { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--borda); color: var(--suave); }
.selo.ligado { border-color: var(--perigo); color: var(--perigo); }
code { background: var(--fundo); padding: 2px 6px; border-radius: 6px; word-break: break-all; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--borda); }
.oculto { display: none !important; }
#login { max-width: 360px; margin: 10vh auto; }
</style>
</head>
<body>
<header>
  <h1>Campanha WhatsApp · Painel</h1>
  <span id="seloModo" class="selo"></span>
  <button class="btn oculto" id="btnSair" type="button">Sair</button>
</header>

<main>
  <section class="cartao oculto" id="login">
    <h2>Entrar</h2>
    <p class="ajuda">Use a senha de administrador (ADMIN_PASSWORD no arquivo .env).</p>
    <form id="formLogin">
      <label for="senha">Senha</label>
      <input id="senha" type="password" autocomplete="current-password" required>
      <div class="acoes"><button class="btn primario" type="submit">Entrar</button></div>
      <div class="msg" id="msgLogin" role="status"></div>
    </form>
  </section>

  <div id="app" class="oculto">
    <div class="abas" role="tablist">
      <button role="tab" aria-selected="true" data-aba="config" id="abaConfig">Configuração da API</button>
      <button role="tab" aria-selected="false" data-aba="teste" id="abaTeste">Teste de mensagens</button>
    </div>

    <div data-painel="config">
      <section class="cartao">
        <h2>Evolution API</h2>
        <p class="ajuda">Copie do manager da Evolution, no dashboard da instância. O token só é trocado se você digitar um novo.</p>
        <form id="formApi">
          <label for="baseUrl">Endereço do servidor</label>
          <input id="baseUrl" type="url" required placeholder="https://evolution.seudominio.com">
          <div class="linha">
            <div>
              <label for="instancia">Nome da instância</label>
              <input id="instancia" required placeholder="como aparece no manager">
            </div>
            <div>
              <label for="apiKey">Token da instância (API Key)</label>
              <input id="apiKey" type="password" autocomplete="off" placeholder="">
            </div>
          </div>
          <div class="acoes">
            <button class="btn" type="button" id="btnTestar">Testar conexão</button>
            <button class="btn primario" type="submit">Salvar</button>
          </div>
          <div class="msg" id="msgApi" role="status"></div>
        </form>
      </section>

      <section class="cartao">
        <h2>Campanha</h2>
        <p class="ajuda">Usado nos textos das mensagens e na trava diária.</p>
        <form id="formCampanha">
          <div class="linha">
            <div><label for="loja">Nome da loja</label><input id="loja" required></div>
            <div><label for="dataFim">Último dia da campanha</label><input id="dataFim" type="date"></div>
            <div><label for="dailyLimit">Máximo de mensagens por dia</label><input id="dailyLimit" type="number" min="1" step="1"></div>
          </div>
          <div class="acoes"><button class="btn primario" type="submit">Salvar</button></div>
          <div class="msg" id="msgCampanha" role="status"></div>
        </form>
      </section>

      <section class="cartao">
        <h2>Receber respostas (webhook)</h2>
        <p class="ajuda">A Evolution avisa este programa quando chega mensagem. Se a Evolution está na mesma rede, use o IP deste computador; fora dela, um endereço público com https.</p>
        <p>Caminho do webhook: <code id="caminhoWebhook"></code></p>
        <form id="formWebhook">
          <label for="publicBaseUrl">Endereço público deste computador (opcional)</label>
          <input id="publicBaseUrl" type="url" placeholder="https://campanha.seudominio.com">
          <p class="ajuda" id="urlCompleta"></p>
          <div class="acoes">
            <button class="btn" type="submit">Salvar endereço</button>
            <button class="btn primario" type="button" id="btnRegistrar">Registrar webhook na Evolution</button>
          </div>
          <div class="msg" id="msgWebhook" role="status"></div>
        </form>
      </section>

      <section class="cartao">
        <h2>Aplicar no envio da campanha</h2>
        <p class="ajuda">Os testes deste painel já usam a configuração salva. O serviço de envio só carrega a nova configuração ao reiniciar.</p>
        <div class="acoes"><button class="btn" type="button" id="btnReiniciar">Reiniciar serviço</button></div>
        <div class="msg" id="msgReiniciar" role="status"></div>
      </section>
    </div>

    <div data-painel="teste" class="oculto">
      <section class="cartao">
        <h2>Enviar mensagem de teste</h2>
        <p class="ajuda">Gere a mensagem como um cliente receberia, revise e envie para um número. O número entra na lista de teste (TEST_ALLOWLIST): enquanto a lista tiver números, a campanha só envia para eles.</p>
        <div class="linha">
          <div><label for="numero">Número (com DDD)</label><input id="numero" inputmode="tel" placeholder="27 99988-7766"></div>
          <div><label for="nome">Nome do cliente na mensagem</label><input id="nome" value="Teste"></div>
        </div>
        <div class="linha">
          <div>
            <label for="versao">Modelo do texto</label>
            <select id="versao">
              <option value="C1">C1 · loja, "que saudade"</option>
              <option value="C2">C2 · loja, curto</option>
              <option value="B1">B1 · vendedora, coleção nova</option>
              <option value="B2">B2 · vendedora, direto</option>
            </select>
          </div>
          <div><label for="vendedora">Vendedora (modelos B)</label><input id="vendedora" placeholder="ex.: Isabely"></div>
        </div>
        <div class="acoes"><button class="btn" type="button" id="btnPrevia">Gerar mensagem</button></div>
        <label for="texto">Mensagem (pode editar antes de enviar)</label>
        <textarea id="texto" placeholder="Clique em Gerar mensagem ou escreva aqui."></textarea>
        <div class="acoes"><button class="btn primario" type="button" id="btnEnviar">Enviar para este número</button></div>
        <div class="msg" id="msgTeste" role="status"></div>
      </section>

      <section class="cartao">
        <h2>Últimos testes</h2>
        <table><thead><tr><th>Quando</th><th>Número</th><th>Id da mensagem</th></tr></thead><tbody id="historico"></tbody></table>
      </section>
    </div>
  </div>
</main>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };

  function mostrar(id, tipo, texto) { var el = $(id); el.className = 'msg ' + tipo; el.textContent = texto; }
  function limpar(id) { var el = $(id); el.className = 'msg'; el.textContent = ''; }

  function api(metodo, rota, corpo) {
    return fetch('/painel/api/' + rota, {
      method: metodo,
      headers: corpo ? { 'content-type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && rota !== 'login') { entrarModo(false); }
        if (!r.ok) { var e = new Error((d.erro || 'Erro ' + r.status) + (d.dica ? '\\n' + d.dica : '')); throw e; }
        return d;
      });
    });
  }

  function ocupado(botao, sim) { botao.disabled = sim; }

  function entrarModo(logado) {
    $('login').classList.toggle('oculto', logado);
    $('app').classList.toggle('oculto', !logado);
    $('btnSair').classList.toggle('oculto', !logado);
    if (logado) { carregarConfig(); carregarHistorico(); } else { $('senha').focus(); }
  }

  function carregarConfig() {
    api('GET', 'config').then(function (c) {
      $('baseUrl').value = c.evolution.baseUrl;
      $('instancia').value = c.evolution.instancia;
      $('apiKey').value = '';
      $('apiKey').placeholder = 'atual: ' + c.evolution.chaveFinal + ' (deixe vazio para manter)';
      $('loja').value = c.campanha.loja;
      $('dataFim').value = c.campanha.dataFim;
      $('dailyLimit').value = c.campanha.dailyLimit;
      $('publicBaseUrl').value = c.webhook.publicBaseUrl;
      $('caminhoWebhook').textContent = c.webhook.caminho;
      $('urlCompleta').textContent = c.webhook.url ? 'URL completa: ' + c.webhook.url : 'Na mesma rede: http://IP-deste-computador:3000' + c.webhook.caminho;
      var selo = $('seloModo');
      if (!c.campanha.ativa) { selo.textContent = 'Campanha desligada'; selo.className = 'selo'; }
      else if (c.campanha.dryRun) { selo.textContent = 'Campanha em simulação'; selo.className = 'selo'; }
      else { selo.textContent = 'Campanha ENVIANDO'; selo.className = 'selo ligado'; }
    }).catch(function (e) { mostrar('msgApi', 'erro', e.message); });
  }

  function carregarHistorico() {
    api('GET', 'teste/historico').then(function (linhas) {
      var tb = $('historico'); tb.textContent = '';
      if (!linhas.length) { var tr = tb.insertRow(); var td = tr.insertCell(); td.colSpan = 3; td.textContent = 'Nenhum teste enviado ainda.'; return; }
      linhas.forEach(function (l) {
        var tr = tb.insertRow();
        tr.insertCell().textContent = new Date(l.quando).toLocaleString('pt-BR');
        tr.insertCell().textContent = l.telefone || '';
        tr.insertCell().textContent = l.message_id || '';
      });
    }).catch(function () {});
  }

  document.querySelectorAll('.abas button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.abas button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      document.querySelectorAll('[data-painel]').forEach(function (p) { p.classList.toggle('oculto', p.getAttribute('data-painel') !== b.getAttribute('data-aba')); });
    });
  });

  $('formLogin').addEventListener('submit', function (ev) {
    ev.preventDefault(); limpar('msgLogin');
    api('POST', 'login', { senha: $('senha').value }).then(function () { $('senha').value = ''; entrarModo(true); })
      .catch(function (e) { mostrar('msgLogin', 'erro', e.message); });
  });

  $('btnSair').addEventListener('click', function () { api('POST', 'sair').then(function () { entrarModo(false); }); });

  $('btnTestar').addEventListener('click', function () {
    var b = this; ocupado(b, true); mostrar('msgApi', 'aviso', 'Testando…');
    api('POST', 'config/testar', { baseUrl: $('baseUrl').value, instancia: $('instancia').value, apiKey: $('apiKey').value })
      .then(function (r) {
        var t = 'Servidor respondeu (versão ' + (r.versao || '?') + '). Instância: ' + r.estado + '.';
        mostrar('msgApi', r.conectado ? 'ok' : 'aviso', r.conectado ? t + ' Pronto para enviar.' : t + '\\n' + r.aviso);
      })
      .catch(function (e) { mostrar('msgApi', 'erro', e.message); })
      .then(function () { ocupado(b, false); });
  });

  $('formApi').addEventListener('submit', function (ev) {
    ev.preventDefault();
    api('POST', 'config', { baseUrl: $('baseUrl').value, instancia: $('instancia').value, apiKey: $('apiKey').value })
      .then(function (r) { mostrar('msgApi', 'ok', r.aviso); carregarConfig(); })
      .catch(function (e) { mostrar('msgApi', 'erro', e.message); });
  });

  $('formCampanha').addEventListener('submit', function (ev) {
    ev.preventDefault();
    api('POST', 'config', { baseUrl: $('baseUrl').value, instancia: $('instancia').value, loja: $('loja').value, dataFim: $('dataFim').value, dailyLimit: $('dailyLimit').value })
      .then(function (r) { mostrar('msgCampanha', 'ok', r.aviso); carregarConfig(); })
      .catch(function (e) { mostrar('msgCampanha', 'erro', e.message); });
  });

  $('formWebhook').addEventListener('submit', function (ev) {
    ev.preventDefault();
    api('POST', 'config', { baseUrl: $('baseUrl').value, instancia: $('instancia').value, publicBaseUrl: $('publicBaseUrl').value })
      .then(function (r) { mostrar('msgWebhook', 'ok', r.aviso); carregarConfig(); })
      .catch(function (e) { mostrar('msgWebhook', 'erro', e.message); });
  });

  $('btnRegistrar').addEventListener('click', function () {
    var b = this; ocupado(b, true);
    api('POST', 'webhook/registrar').then(function () { mostrar('msgWebhook', 'ok', 'Webhook registrado na Evolution (MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE).'); })
      .catch(function (e) { mostrar('msgWebhook', 'erro', e.message); })
      .then(function () { ocupado(b, false); });
  });

  $('btnReiniciar').addEventListener('click', function () {
    if (!confirm('Reiniciar o serviço agora?')) return;
    api('POST', 'reiniciar').then(function () {
      mostrar('msgReiniciar', 'ok', 'Reiniciando… Se estiver instalado como serviço, ele volta em cerca de 10 segundos e pede a senha de novo. Se foi aberto pelo iniciar.bat, abra-o de novo.');
    }).catch(function (e) { mostrar('msgReiniciar', 'erro', e.message); });
  });

  $('btnPrevia').addEventListener('click', function () {
    limpar('msgTeste');
    api('POST', 'teste/previa', { nome: $('nome').value, vendedora: $('vendedora').value, versao: $('versao').value })
      .then(function (r) { $('texto').value = r.texto; })
      .catch(function (e) { mostrar('msgTeste', 'erro', e.message); });
  });

  $('btnEnviar').addEventListener('click', function () {
    var numero = $('numero').value.trim(), texto = $('texto').value;
    if (!numero || !texto.trim()) { mostrar('msgTeste', 'erro', 'Preencha o número e a mensagem.'); return; }
    if (!confirm('Enviar esta mensagem de verdade para ' + numero + '?')) return;
    var b = this; ocupado(b, true); mostrar('msgTeste', 'aviso', 'Enviando (o WhatsApp mostra "digitando" por alguns segundos)…');
    api('POST', 'teste/enviar', { numero: numero, texto: texto })
      .then(function (r) {
        mostrar('msgTeste', 'ok', 'Enviado para ' + r.telefone + '. Id: ' + r.messageId + (r.adicionadoNaLista ? '\\nO número foi incluído na lista de teste.' : ''));
        carregarHistorico(); carregarConfig();
      })
      .catch(function (e) { mostrar('msgTeste', 'erro', e.message); })
      .then(function () { ocupado(b, false); });
  });

  api('GET', 'sessao').then(function (s) { entrarModo(!!s.logado); }).catch(function () { entrarModo(false); });
})();
</script>
</body>
</html>
`;
