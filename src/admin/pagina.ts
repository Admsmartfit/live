// Frontdesk do painel: página única, sem dependências externas (funciona sem internet).
// O JavaScript abaixo não usa template literals para não conflitar com a string TS.

export const PAGINA_PAINEL = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Campanha WhatsApp</title>
<style>
:root {
  --fundo: #f3f5f8; --superficie: #ffffff; --superficie-2: #f8fafc; --texto: #111827; --suave: #64748b;
  --borda: #e2e8f0; --marca: #0f9d76; --marca-2: #0b7d5e; --marca-claro: #e3f5ee; --marca-texto: #ffffff;
  --azul: #2563eb; --azul-claro: #e8efff; --ambar: #b45309; --ambar-claro: #fff4e0;
  --vermelho: #c0262d; --vermelho-claro: #fdecec; --cinza-claro: #eef1f5;
  --lateral: #0f1b2d; --lateral-texto: #c7d2e1; --lateral-ativo: #ffffff; --lateral-realce: #1c2b44;
  --sombra: 0 1px 2px rgba(16,24,40,.06), 0 4px 16px rgba(16,24,40,.06);
  --raio: 14px;
  --whats-fundo: #efeae2; --whats-balao: #d9fdd3; --whats-topo: #075e54;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #0b1220; --superficie: #121a2b; --superficie-2: #0f1626; --texto: #e5e9f0; --suave: #93a1b5;
    --borda: #22304a; --marca: #25c193; --marca-2: #1fa57d; --marca-claro: #0f2e27; --marca-texto: #05140f;
    --azul: #6d9bff; --azul-claro: #16233f; --ambar: #f5b75c; --ambar-claro: #33270f;
    --vermelho: #ff7b7f; --vermelho-claro: #3a1719; --cinza-claro: #1a2438;
    --lateral: #070d18; --lateral-texto: #9fb0c8; --lateral-realce: #15213a;
    --sombra: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.25);
    --whats-fundo: #0b141a; --whats-balao: #005c4b; --whats-topo: #1f2c34;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--fundo); color: var(--texto); font: 15px/1.5 "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
svg.ic { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
button { font: inherit; }
.oculto { display: none !important; }

/* ---------- login ---------- */
#telaLogin { min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: radial-gradient(1200px 600px at 10% -10%, var(--marca-claro), transparent 60%), var(--fundo); }
.login-cartao { width: 100%; max-width: 380px; background: var(--superficie); border: 1px solid var(--borda); border-radius: 20px; padding: 32px 28px; box-shadow: var(--sombra); }
.marca { display: flex; align-items: center; gap: 12px; }
.marca .logo { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, var(--marca), #12b886); display: grid; place-items: center; color: #fff; }
.marca .logo svg { width: 24px; height: 24px; }
.marca b { display: block; font-size: 16px; }
.marca small { color: var(--suave); }

/* ---------- estrutura ---------- */
.app { display: grid; grid-template-columns: 248px 1fr; min-height: 100vh; }
aside.lateral { background: var(--lateral); color: var(--lateral-texto); padding: 20px 14px; display: flex; flex-direction: column; gap: 18px; position: sticky; top: 0; height: 100vh; }
aside.lateral .marca b { color: #fff; }
aside.lateral .marca small { color: var(--lateral-texto); }
nav.menu { display: flex; flex-direction: column; gap: 4px; }
nav.menu button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; background: none; color: var(--lateral-texto); cursor: pointer; text-align: left; }
nav.menu button:hover { background: var(--lateral-realce); color: #fff; }
nav.menu button[aria-current="page"] { background: var(--lateral-realce); color: var(--lateral-ativo); font-weight: 600; box-shadow: inset 3px 0 0 var(--marca); }
.lateral-rodape { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.lateral-rodape button { background: none; border: 1px solid var(--lateral-realce); color: var(--lateral-texto); border-radius: 10px; padding: 8px 12px; cursor: pointer; display: flex; gap: 8px; align-items: center; }
.lateral-rodape button:hover { color: #fff; }

main.conteudo { padding: 28px 32px 48px; max-width: 1180px; width: 100%; }
.cabecalho { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.cabecalho h1 { font-size: 24px; margin: 0; letter-spacing: -.01em; }
.cabecalho p { margin: 2px 0 0; color: var(--suave); }

/* ---------- componentes ---------- */
.grade { display: grid; gap: 16px; }
.g4 { grid-template-columns: repeat(4, 1fr); }
.g2 { grid-template-columns: repeat(2, 1fr); }
.g3 { grid-template-columns: repeat(3, 1fr); }
.cartao { background: var(--superficie); border: 1px solid var(--borda); border-radius: var(--raio); box-shadow: var(--sombra); padding: 20px; min-width: 0; }
.cartao h2 { font-size: 16px; margin: 0; display: flex; align-items: center; gap: 8px; }
.cartao .sub { color: var(--suave); font-size: 13px; margin: 4px 0 14px; }
.kpi-rotulo { color: var(--suave); font-size: 13px; display: flex; align-items: center; gap: 8px; }
.kpi-valor { font-size: 22px; font-weight: 700; margin: 6px 0 2px; letter-spacing: -.01em; }
.kpi-detalhe { color: var(--suave); font-size: 13px; }
.icone-redondo { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--marca-claro); color: var(--marca); }
.icone-redondo.azul { background: var(--azul-claro); color: var(--azul); }
.icone-redondo.ambar { background: var(--ambar-claro); color: var(--ambar); }
.kpi-topo { display: flex; align-items: center; justify-content: space-between; }

.pilula { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 99px; font-size: 12.5px; font-weight: 600; background: var(--cinza-claro); color: var(--suave); white-space: nowrap; }
.pilula::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pilula.ok { background: var(--marca-claro); color: var(--marca); }
.pilula.aviso { background: var(--ambar-claro); color: var(--ambar); }
.pilula.erro { background: var(--vermelho-claro); color: var(--vermelho); }
.pilula.info { background: var(--azul-claro); color: var(--azul); }
.pilula.sem-ponto::before { display: none; }

label.rotulo { display: block; font-weight: 600; font-size: 13px; margin: 14px 0 6px; }
.dica { color: var(--suave); font-size: 12.5px; margin-top: 4px; }
input[type=text], input[type=url], input[type=password], input[type=date], input[type=time], input[type=number], input[type=tel], select, textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--borda); border-radius: 10px; background: var(--superficie-2); color: var(--texto); font: inherit; transition: border-color .15s, box-shadow .15s; }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--marca); box-shadow: 0 0 0 3px var(--marca-claro); }
textarea { min-height: 170px; resize: vertical; }
.campo-acao { display: flex; gap: 8px; }
.campo-acao input { flex: 1; }
.linha2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--borda); background: var(--superficie); color: var(--texto); padding: 10px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; transition: transform .05s, background .15s; }
.btn:hover { background: var(--superficie-2); }
.btn:active { transform: translateY(1px); }
.btn.primario { background: var(--marca); border-color: var(--marca); color: var(--marca-texto); }
.btn.primario:hover { background: var(--marca-2); }
.btn.perigo { color: var(--vermelho); }
.btn.pequeno { padding: 6px 10px; font-size: 13px; }
.btn:disabled { opacity: .6; cursor: progress; }
.btn:focus-visible, nav.menu button:focus-visible, .seg button:focus-visible { outline: 2px solid var(--marca); outline-offset: 2px; }
.acoes { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }

.resultado { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: 12px; margin-top: 16px; background: var(--superficie-2); border: 1px solid var(--borda); }
.resultado.ok { background: var(--marca-claro); border-color: transparent; }
.resultado.erro { background: var(--vermelho-claro); border-color: transparent; }
.resultado.aviso { background: var(--ambar-claro); border-color: transparent; }
.resultado b { display: block; }
.resultado span { color: var(--suave); font-size: 13.5px; white-space: pre-wrap; }

.faixa { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 12px 16px; border-radius: 12px; background: var(--ambar-claro); color: var(--ambar); margin-bottom: 18px; font-weight: 600; }

/* interruptor */
.interruptor { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--borda); }
.interruptor:last-child { border-bottom: 0; }
.interruptor b { display: block; }
.interruptor span { color: var(--suave); font-size: 13px; }
.chave { position: relative; width: 46px; height: 26px; flex: none; }
.chave input { position: absolute; inset: 0; opacity: 0; cursor: pointer; margin: 0; }
.chave i { position: absolute; inset: 0; border-radius: 99px; background: var(--borda); transition: background .2s; pointer-events: none; }
.chave i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .2s; }
.chave input:checked + i { background: var(--marca); }
.chave input:checked + i::after { transform: translateX(20px); }
.chave input:focus-visible + i { outline: 2px solid var(--marca); outline-offset: 2px; }

/* segmentado */
.seg { display: inline-flex; background: var(--cinza-claro); padding: 4px; border-radius: 12px; gap: 4px; flex-wrap: wrap; }
.seg button { border: 0; background: none; padding: 7px 12px; border-radius: 9px; cursor: pointer; color: var(--suave); font-weight: 600; font-size: 13.5px; }
.seg button[aria-pressed="true"] { background: var(--superficie); color: var(--texto); box-shadow: var(--sombra); }

/* etiquetas */
.etiquetas { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.etiqueta { display: inline-flex; align-items: center; gap: 6px; padding: 5px 6px 5px 12px; border-radius: 99px; background: var(--azul-claro); color: var(--azul); font-weight: 600; font-size: 13px; }
.etiqueta button { border: 0; background: none; color: inherit; cursor: pointer; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; }
.etiqueta button:hover { background: rgba(0,0,0,.08); }

/* deslizante */
.deslizante { display: flex; align-items: center; gap: 14px; }
.deslizante input[type=range] { flex: 1; accent-color: var(--marca); }
.deslizante input[type=number] { width: 90px; text-align: center; font-weight: 700; }

/* anel */
.anel { position: relative; width: 74px; height: 74px; flex: none; }
.anel svg { width: 74px; height: 74px; transform: rotate(-90deg); }
.anel .fundo-anel { stroke: var(--cinza-claro); }
.anel .valor-anel { stroke: var(--marca); transition: stroke-dashoffset .6s ease; }
.anel b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 15px; }
.hoje { display: flex; gap: 14px; align-items: center; }

/* barra segmentada */
.barra { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: var(--cinza-claro); margin: 12px 0 10px; }
.barra i { display: block; height: 100%; }
.legenda { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 13px; color: var(--suave); }
.legenda span { display: flex; align-items: center; gap: 6px; }
.legenda span b { color: var(--texto); margin-left: auto; }
.ponto { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }

/* checklist */
.passos { list-style: none; margin: 0; padding: 0; }
.passos li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--borda); }
.passos li:last-child { border-bottom: 0; }
.passos .marcador { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--borda); color: transparent; flex: none; }
.passos li.feito .marcador { background: var(--marca); border-color: var(--marca); color: #fff; }
.passos li.feito .marcador svg { width: 14px; height: 14px; stroke-width: 3; }
.passos .txt { flex: 1; }
.passos .txt b { display: block; font-size: 14px; }
.passos .txt span { color: var(--suave); font-size: 13px; }

/* tabela */
.tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
.tabela th { text-align: left; color: var(--suave); font-weight: 600; font-size: 12.5px; text-transform: uppercase; letter-spacing: .03em; padding: 10px 8px; border-bottom: 1px solid var(--borda); }
.tabela td { padding: 10px 8px; border-bottom: 1px solid var(--borda); }
.tabela tr:last-child td { border-bottom: 0; }
.rolagem { overflow-x: auto; }
.vazio { text-align: center; color: var(--suave); padding: 28px 8px; }

/* celular */
.teste-grade { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
.celular { width: 100%; max-width: 340px; border-radius: 36px; padding: 10px; background: #1b1f26; box-shadow: 0 20px 50px rgba(15,23,42,.25); position: sticky; top: 20px; }
.tela { border-radius: 28px; overflow: hidden; background: var(--whats-fundo); height: 560px; display: flex; flex-direction: column; }
.whats-topo { background: var(--whats-topo); color: #fff; padding: 14px 14px 12px; display: flex; align-items: center; gap: 10px; }
.whats-topo .avatar { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.2); display: grid; place-items: center; font-weight: 700; }
.whats-topo b { display: block; font-size: 14px; }
.whats-topo small { opacity: .8; font-size: 12px; }
.whats-conversa { flex: 1; padding: 14px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
  background-image: radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px); background-size: 14px 14px; }
.whats-dia { align-self: center; font-size: 11.5px; padding: 3px 10px; border-radius: 8px; background: rgba(255,255,255,.8); color: #54656f; }
.balao { align-self: flex-end; max-width: 88%; background: var(--whats-balao); color: var(--texto); padding: 7px 9px 5px; border-radius: 10px 0 10px 10px; font-size: 14px; line-height: 1.38; box-shadow: 0 1px .5px rgba(0,0,0,.13); word-wrap: break-word; }
.balao .hora { display: block; text-align: right; font-size: 11px; color: var(--suave); margin-top: 2px; }
.balao .hora svg { width: 15px; height: 15px; vertical-align: -3px; stroke: #53bdeb; }
.balao.cliente { align-self: flex-start; background: var(--superficie); border-radius: 0 10px 10px 10px; }
.balao img { display: block; max-width: 100%; border-radius: 8px; margin-bottom: 5px; }
.zona-imagem { display: grid; place-items: center; min-height: 220px; border: 2px dashed var(--borda); border-radius: 14px; background: var(--superficie-2); text-align: center; padding: 16px; color: var(--suave); cursor: pointer; }
.zona-imagem:hover, .zona-imagem.arrastando { border-color: var(--marca); color: var(--marca); }
.zona-imagem img { max-width: 100%; max-height: 360px; border-radius: 10px; box-shadow: var(--sombra); }
.fluxo { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 10px; }
.fluxo li { display: flex; gap: 12px; align-items: flex-start; font-size: 13.5px; }
.fluxo li b { display: block; font-size: 14px; }
.fluxo li span { color: var(--suave); }
.balao.vazio-balao { align-self: center; background: rgba(255,255,255,.75); color: #54656f; border-radius: 10px; font-size: 13px; text-align: center; }

/* avisos flutuantes */
#avisos { position: fixed; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 10px; z-index: 50; max-width: min(380px, calc(100vw - 36px)); }
.toast { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: var(--superficie); border: 1px solid var(--borda); box-shadow: var(--sombra); animation: entra .2s ease; white-space: pre-wrap; }
.toast.ok svg { color: var(--marca); }
.toast.erro svg { color: var(--vermelho); }
@keyframes entra { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

.codigo { font-family: Consolas, "Cascadia Mono", monospace; font-size: 13px; background: var(--superficie-2); border: 1px solid var(--borda); border-radius: 10px; padding: 10px 12px; word-break: break-all; }

/* ---------- responsivo ---------- */
@media (max-width: 1100px) { .g4 { grid-template-columns: repeat(2, 1fr); } .teste-grade { grid-template-columns: 1fr; } .celular { position: static; margin: 0 auto; } }
@media (max-width: 860px) {
  .app { grid-template-columns: 1fr; }
  aside.lateral { position: sticky; top: 0; height: auto; z-index: 10; padding: 12px 16px; gap: 10px; flex-direction: column; }
  nav.menu { flex-direction: row; overflow-x: auto; }
  nav.menu button { width: auto; white-space: nowrap; padding: 8px 12px; }
  nav.menu button[aria-current="page"] { box-shadow: inset 0 -3px 0 var(--marca); }
  .lateral-rodape { display: none; }
  main.conteudo { padding: 20px 16px 40px; }
  .g2, .g3, .linha2 { grid-template-columns: 1fr; }
}
@media (max-width: 520px) { .g4 { grid-template-columns: 1fr; } .tela { height: 500px; } }
</style>
</head>
<body>

<!-- ======================= LOGIN ======================= -->
<section id="telaLogin" class="oculto">
  <form class="login-cartao" id="formLogin">
    <div class="marca">
      <div class="logo"><svg class="ic" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-5.1A8.4 8.4 0 1 1 21 11.5z"/></svg></div>
      <div><b>Campanha WhatsApp</b><small>Painel de controle</small></div>
    </div>
    <label class="rotulo" for="senha" style="margin-top:28px">Senha de acesso</label>
    <input id="senha" type="password" autocomplete="current-password" required placeholder="Digite a senha do painel">
    <p class="dica">É a senha definida na instalação (ADMIN_PASSWORD).</p>
    <div class="acoes"><button class="btn primario" type="submit" style="width:100%">Entrar</button></div>
  </form>
</section>

<!-- ======================= APLICAÇÃO ======================= -->
<div class="app oculto" id="telaApp">
  <aside class="lateral">
    <div class="marca">
      <div class="logo"><svg class="ic" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-5.1A8.4 8.4 0 1 1 21 11.5z"/></svg></div>
      <div><b>Campanha</b><small id="lojaLateral">WhatsApp</small></div>
    </div>
    <nav class="menu" aria-label="Seções">
      <button data-ir="inicio" aria-current="page"><svg class="ic" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>Início</button>
      <button data-ir="conexao"><svg class="ic" viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>Conexão</button>
      <button data-ir="campanha"><svg class="ic" viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>Campanha</button>
      <button data-ir="teste"><svg class="ic" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Testar mensagem</button>
      <button data-ir="respostas"><svg class="ic" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></svg>Respostas</button>
      <button data-ir="voucher"><svg class="ic" viewBox="0 0 24 24"><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>Voucher</button>
      <button data-ir="bloqueados"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>Bloqueados</button>
      <button data-ir="fila"><svg class="ic" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>Fila de envio</button>
    </nav>
    <div class="lateral-rodape">
      <span id="seloModoLateral" class="pilula sem-ponto"></span>
      <button type="button" id="btnSair"><svg class="ic" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>Sair</button>
    </div>
  </aside>

  <main class="conteudo">
    <div class="faixa oculto" id="faixaReinicio" role="status">
      <span>Há mudanças salvas que o envio da campanha ainda não está usando.</span>
      <button class="btn pequeno" type="button" data-acao="reiniciar">Reiniciar serviço agora</button>
    </div>

    <!-- ===== INÍCIO ===== -->
    <section data-pagina="inicio">
      <div class="cabecalho">
        <div><h1>Visão geral</h1><p id="saudacao">Situação da campanha em tempo real.</p></div>
        <button class="btn" type="button" id="btnAtualizar"><svg class="ic" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>Atualizar</button>
      </div>

      <div class="grade g4">
        <div class="cartao">
          <div class="kpi-topo"><span class="kpi-rotulo">WhatsApp</span><div class="icone-redondo"><svg class="ic" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-5.1A8.4 8.4 0 1 1 21 11.5z"/></svg></div></div>
          <div class="kpi-valor" id="kWhats"><span class="pilula">Verificando…</span></div>
          <div class="kpi-detalhe" id="kWhatsDet">&nbsp;</div>
        </div>
        <div class="cartao">
          <div class="kpi-topo"><span class="kpi-rotulo">Campanha</span><div class="icone-redondo azul"><svg class="ic" viewBox="0 0 24 24"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg></div></div>
          <div class="kpi-valor" id="kModo">—</div>
          <div class="kpi-detalhe" id="kModoDet">&nbsp;</div>
        </div>
        <div class="cartao">
          <div class="kpi-topo"><span class="kpi-rotulo">Envios de hoje</span></div>
          <div class="hoje" style="margin-top:8px">
            <div class="anel"><svg viewBox="0 0 80 80"><circle class="fundo-anel" cx="40" cy="40" r="32" stroke-width="9" fill="none"/><circle class="valor-anel" id="anelValor" cx="40" cy="40" r="32" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="201.06" stroke-dashoffset="201.06"/></svg><b id="anelTexto">0</b></div>
            <div><div class="kpi-valor" id="kHoje" style="font-size:18px">0 de 0</div><div class="kpi-detalhe" id="kJanela">&nbsp;</div></div>
          </div>
        </div>
        <div class="cartao">
          <div class="kpi-topo"><span class="kpi-rotulo">Base de clientes</span><div class="icone-redondo ambar"><svg class="ic" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg></div></div>
          <div class="kpi-valor" id="kBase">0</div>
          <div class="kpi-detalhe" id="kBaseDet">clientes importados</div>
        </div>
      </div>

      <div class="grade g2" style="margin-top:16px">
        <div class="cartao">
          <h2>Antes de começar</h2>
          <p class="sub">Siga os passos. Os itens são marcados automaticamente.</p>
          <ul class="passos" id="passos"></ul>
        </div>
        <div class="grade">
          <div class="cartao">
            <h2>Situação da base</h2>
            <div class="barra" id="barraBase"></div>
            <div class="legenda" id="legendaBase"></div>
          </div>
          <div class="cartao">
            <h2>Por região</h2>
            <p class="sub">A Grande Vitória recebe primeiro.</p>
            <div id="regioes"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== CONEXÃO ===== -->
    <section data-pagina="conexao" class="oculto">
      <div class="cabecalho"><div><h1>Conexão com o WhatsApp</h1><p>Dados da Evolution API e recebimento de respostas.</p></div></div>
      <div class="grade g2">
        <form class="cartao" id="formApi">
          <h2><span class="icone-redondo"><svg class="ic" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></span>Evolution API</h2>
          <p class="sub">Copie do manager da Evolution, no dashboard da instância.</p>
          <label class="rotulo" for="baseUrl">Endereço do servidor</label>
          <input id="baseUrl" type="url" required placeholder="https://evolution.seudominio.com">
          <label class="rotulo" for="instancia">Nome da instância</label>
          <input id="instancia" type="text" required placeholder="Exatamente como aparece no manager">
          <label class="rotulo" for="apiKey">Token da instância (API Key)</label>
          <div class="campo-acao">
            <input id="apiKey" type="password" autocomplete="off">
            <button class="btn" type="button" id="btnVerToken" aria-label="Mostrar token"><svg class="ic" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          </div>
          <p class="dica" id="dicaToken">Deixe em branco para manter o token atual.</p>
          <div class="acoes">
            <button class="btn" type="button" id="btnTestar"><svg class="ic" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Testar conexão</button>
            <button class="btn primario" type="submit">Salvar</button>
          </div>
          <div id="resultadoConexao"></div>
        </form>

        <form class="cartao" id="formWebhook">
          <h2><span class="icone-redondo azul"><svg class="ic" viewBox="0 0 24 24"><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></svg></span>Receber respostas (webhook)</h2>
          <p class="sub">A Evolution avisa este programa quando um cliente responde.</p>
          <label class="rotulo">Caminho do webhook</label>
          <div class="campo-acao"><div class="codigo" id="caminhoWebhook" style="flex:1"></div><button class="btn" type="button" data-copiar="caminhoWebhook" aria-label="Copiar caminho">Copiar</button></div>
          <label class="rotulo">URL para colar na Evolution (mesma rede)</label>
          <div id="urlsLocais"></div>
          <p class="dica">Use a do IP da mesma rede da Evolution (ex.: 192.168.0.x).</p>
          <label class="rotulo" for="publicBaseUrl">Endereço público deste computador (opcional)</label>
          <input id="publicBaseUrl" type="url" placeholder="https://campanha.seudominio.com">
          <p class="dica">Com endereço público (https), o painel registra o webhook direto na Evolution.</p>
          <div id="urlCompletaBox" class="oculto"><label class="rotulo">URL completa</label><div class="campo-acao"><div class="codigo" id="urlCompleta" style="flex:1"></div><button class="btn" type="button" data-copiar="urlCompleta">Copiar</button></div></div>
          <div class="acoes">
            <button class="btn" type="submit">Salvar endereço</button>
            <button class="btn primario" type="button" id="btnRegistrar">Registrar na Evolution</button>
          </div>
          <div class="resultado" style="margin-top:18px">
            <svg class="ic" viewBox="0 0 24 24" style="color:var(--azul)"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <div><b>Configuração manual no manager</b><span>Instância → Events → Webhook: ligar, colar a URL, "Webhook by Events" e "Base64" desligados, eventos MESSAGES_UPSERT, MESSAGES_UPDATE e CONNECTION_UPDATE.</span></div>
          </div>
        </form>
      </div>
    </section>

    <!-- ===== CAMPANHA ===== -->
    <section data-pagina="campanha" class="oculto">
      <div class="cabecalho">
        <div><h1>Configuração da campanha</h1><p>Ritmo de envio, horários e modo de operação.</p></div>
        <button class="btn primario" type="button" id="btnSalvarCampanha"><svg class="ic" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Salvar alterações</button>
      </div>

      <div class="grade g2">
        <div class="cartao">
          <h2>Dados da campanha</h2>
          <p class="sub">Aparecem nos textos das mensagens.</p>
          <label class="rotulo" for="loja">Nome da loja</label>
          <input id="loja" type="text" required>
          <label class="rotulo" for="dataFim">Último dia da campanha</label>
          <input id="dataFim" type="date">
          <p class="dica" id="dicaDataFim"></p>
        </div>

        <div class="cartao">
          <h2>Ritmo de envio</h2>
          <p class="sub">A trava diária limita quantos convites saem por dia, espaçados ao longo do horário.</p>
          <label class="rotulo" for="dailyLimitRange">Máximo de mensagens por dia</label>
          <div class="deslizante">
            <input id="dailyLimitRange" type="range" min="1" max="300" step="1">
            <input id="dailyLimit" type="number" min="1" step="1" aria-label="Máximo por dia">
          </div>
          <p class="dica" id="dicaRitmo"></p>
          <div class="linha2">
            <div><label class="rotulo" for="dailyRamp">Rampa de aquecimento</label><input id="dailyRamp" type="text" placeholder="40,60,80,100"><p class="dica">Limite nos dias 1, 2, 3… (vale o menor).</p></div>
            <div><label class="rotulo" for="hourlyCap">Máximo por hora</label><input id="hourlyCap" type="number" min="1" step="1"></div>
          </div>
        </div>

        <div class="cartao">
          <h2>Horários de envio</h2>
          <p class="sub">Fuso de Brasília. Feriados nacionais ficam de fora.</p>
          <label class="rotulo">Segunda a sexta</label>
          <div class="linha2"><input id="semIni" type="time" aria-label="Início segunda a sexta"><input id="semFim" type="time" aria-label="Fim segunda a sexta"></div>
          <label class="rotulo">Sábado</label>
          <div class="linha2"><input id="sabIni" type="time" aria-label="Início sábado"><input id="sabFim" type="time" aria-label="Fim sábado"></div>
          <div class="interruptor" style="margin-top:8px">
            <div><b>Enviar aos domingos</b><span>Usa o mesmo horário de segunda a sexta.</span></div>
            <label class="chave"><input type="checkbox" id="domingo"><i></i></label>
          </div>
        </div>

        <div class="cartao">
          <h2>Modo de operação</h2>
          <p class="sub">As mudanças valem para o envio depois de reiniciar o serviço.</p>
          <div class="interruptor">
            <div><b>Campanha ativa</b><span>Liga o envio automático dos convites, dentro dos horários e da trava diária.</span></div>
            <label class="chave"><input type="checkbox" id="ativa"><i></i></label>
          </div>
          <div class="interruptor">
            <div><b>Modo simulação</b><span>Calcula horários e textos, mas não envia nada. Desligue só quando tudo estiver testado.</span></div>
            <label class="chave"><input type="checkbox" id="dryRun"><i></i></label>
          </div>
          <div class="resultado" id="explicaModo"></div>
        </div>

        <div class="cartao" style="grid-column: 1 / -1">
          <h2>Lista de teste</h2>
          <p class="sub">Enquanto houver números aqui, a campanha só envia para eles. Esvazie a lista para o disparo real.</p>
          <div class="campo-acao" style="max-width:460px">
            <input id="novoNumero" type="tel" placeholder="DDD + número, ex.: 27 99988-7766">
            <button class="btn" type="button" id="btnAddNumero">Adicionar</button>
          </div>
          <div class="etiquetas" id="etiquetas"></div>
        </div>
      </div>
    </section>

    <!-- ===== TESTE ===== -->
    <section data-pagina="teste" class="oculto">
      <div class="cabecalho"><div><h1>Testar mensagem</h1><p>Veja como o cliente recebe e envie para um número específico.</p></div></div>
      <div class="teste-grade">
        <div class="grade">
          <div class="cartao">
            <h2>Mensagem</h2>
            <p class="sub">O número entra automaticamente na lista de teste.</p>
            <div class="linha2">
              <div><label class="rotulo" for="numero">Número de destino</label><input id="numero" type="tel" placeholder="27 99988-7766"></div>
              <div><label class="rotulo" for="nome">Nome do cliente</label><input id="nome" type="text" value="Teste"></div>
            </div>
            <label class="rotulo">Modelo do texto</label>
            <div class="seg" id="segModelo" role="group" aria-label="Modelo do texto">
              <button type="button" data-v="C1" aria-pressed="true">C1 · loja</button>
              <button type="button" data-v="C2" aria-pressed="false">C2 · curto</button>
              <button type="button" data-v="B1" aria-pressed="false">B1 · vendedora</button>
              <button type="button" data-v="B2" aria-pressed="false">B2 · direto</button>
            </div>
            <div id="campoVendedora" class="oculto"><label class="rotulo" for="vendedora">Vendedora</label><input id="vendedora" type="text" placeholder="ex.: Isabely"></div>
            <div class="acoes"><button class="btn" type="button" id="btnPrevia"><svg class="ic" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>Gerar variação</button></div>
            <label class="rotulo" for="texto">Texto (pode editar)</label>
            <textarea id="texto" placeholder="Clique em Gerar variação ou escreva aqui."></textarea>
            <div class="acoes"><button class="btn primario" type="button" id="btnEnviar"><svg class="ic" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Enviar mensagem de teste</button></div>
          </div>
          <div class="cartao">
            <h2>Últimos testes</h2>
            <div class="rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Número</th><th>Id</th></tr></thead><tbody id="historico"></tbody></table></div>
          </div>
        </div>

        <div class="celular" aria-label="Prévia no WhatsApp">
          <div class="tela">
            <div class="whats-topo"><div class="avatar" id="avatarCel">T</div><div><b id="nomeCel">Teste</b><small>online</small></div></div>
            <div class="whats-conversa" id="conversa">
              <span class="whats-dia">HOJE</span>
              <div class="balao vazio-balao">A prévia da mensagem aparece aqui.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== RESPOSTAS ===== -->
    <section data-pagina="respostas" class="oculto">
      <div class="cabecalho">
        <div><h1>Respostas recebidas</h1><p>Confira se o webhook está chegando e como cada resposta foi entendida.</p></div>
        <span class="pilula info">Ao vivo · atualiza a cada 5 s</span>
      </div>
      <div class="grade g3">
        <div class="cartao">
          <div class="kpi-topo"><span class="kpi-rotulo">Webhook neste programa</span><div class="icone-redondo"><svg class="ic" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div></div>
          <div class="kpi-valor" id="rStatus"><span class="pilula">Aguardando…</span></div>
          <div class="kpi-detalhe" id="rUltimo">Nenhum evento recebido desde que o serviço iniciou.</div>
        </div>
        <div class="cartao">
          <div class="kpi-topo"><span class="kpi-rotulo">Configuração na Evolution</span><div class="icone-redondo azul"><svg class="ic" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div></div>
          <div class="kpi-valor" id="rEvolution"><span class="pilula">Não verificado</span></div>
          <div class="kpi-detalhe" id="rEvolutionDet" style="white-space:pre-wrap">Confere URL, eventos e opções do webhook.</div>
          <div class="acoes" style="margin-top:12px"><button class="btn pequeno" type="button" id="btnVerificarWebhook">Verificar agora</button></div>
        </div>
        <div class="cartao">
          <h2>Como testar</h2>
          <ol style="margin:10px 0 0;padding-left:20px;color:var(--suave);font-size:13.5px">
            <li>Envie uma mensagem na aba <b>Testar mensagem</b>.</li>
            <li>No celular que recebeu, responda <b>SIM</b> (ou NÃO, SAIR…).</li>
            <li>Em poucos segundos a resposta aparece abaixo, com o que o sistema entendeu.</li>
          </ol>
        </div>
      </div>
      <div class="resultado aviso" style="margin-top:16px">
        <span style="color:var(--ambar)"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></span>
        <div><b>Respostas automáticas</b><span>SIM recebe o voucher (texto + imagem); NÃO ou SAIR vão para a lista de bloqueados. Com o modo simulação ligado, só os números da lista de teste recebem respostas de verdade; para os demais, o sistema apenas registra o que faria.</span></div>
      </div>
      <div class="grade g2" style="margin-top:16px">
        <div class="cartao">
          <h2>Mensagens recebidas <span class="pilula sem-ponto" id="rTotal">0</span></h2>
          <div class="rolagem" style="margin-top:10px"><table class="tabela"><thead><tr><th>Quando</th><th>Número</th><th>Mensagem</th><th>Entendido como</th></tr></thead><tbody id="tabelaRespostas"></tbody></table></div>
        </div>
        <div class="cartao">
          <h2>Eventos recebidos</h2>
          <p class="sub">Tudo o que a Evolution enviou para este programa (entregas, leituras, conexão).</p>
          <ul class="passos" id="listaEventos"></ul>
        </div>
      </div>
    </section>

    <!-- ===== VOUCHER ===== -->
    <section data-pagina="voucher" class="oculto">
      <div class="cabecalho"><div><h1>Voucher</h1><p>A imagem e o texto que o cliente recebe quando responde SIM.</p></div></div>
      <div class="teste-grade">
        <div class="grade">
          <div class="cartao">
            <h2>Imagem do voucher <span class="pilula" id="seloImagem">Sem imagem</span></h2>
            <p class="sub">JPG ou PNG, até 5 MB. A mesma imagem vai para todos que responderem SIM.</p>
            <label class="zona-imagem" id="zonaImagem" for="arquivoImagem">
              <span id="zonaConteudo"><svg class="ic" viewBox="0 0 24 24" style="width:36px;height:36px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg><br><b>Clique para escolher</b> ou arraste a imagem aqui</span>
            </label>
            <input type="file" id="arquivoImagem" accept="image/jpeg,image/png" class="oculto">
            <p class="dica" id="infoImagem"></p>
          </div>
          <div class="cartao">
            <h2>Dados da resposta</h2>
            <label class="rotulo" for="endereco">Endereço da loja (aparece com o voucher)</label>
            <input id="endereco" type="text" maxlength="200" placeholder="ex.: Shopping Vila Velha, loja 120">
            <label class="rotulo" for="prazoDias">Bloquear quem não responder ao convite em</label>
            <div class="campo-acao" style="max-width:260px;align-items:center"><input id="prazoDias" type="number" min="1" max="60" step="1"><span style="white-space:nowrap">dias</span></div>
            <div class="acoes"><button class="btn primario" type="button" id="btnSalvarVoucher">Salvar</button></div>
          </div>
          <div class="cartao">
            <h2>Como o sistema responde</h2>
            <ul class="fluxo">
              <li><span class="pilula ok sem-ponto">SIM</span><div><b>Envia o voucher</b><span>Texto com a oferta e, 3 a 5 segundos depois, a imagem.</span></div></li>
              <li><span class="pilula erro sem-ponto">NÃO / SAIR</span><div><b>Bloqueia o número</b><span>Manda uma confirmação curta e nunca mais envia nada.</span></div></li>
              <li><span class="pilula sem-ponto">Sem resposta</span><div><b>Bloqueia após o prazo</b><span id="textoPrazo">Quem não responder em 7 dias vai para a lista de bloqueados.</span></div></li>
              <li><span class="pilula aviso sem-ponto">Outra coisa</span><div><b>Pede para responder SIM</b><span>Na segunda vez (ou áudio/foto), fica para a equipe responder.</span></div></li>
            </ul>
          </div>
        </div>

        <div class="celular" aria-label="Prévia da resposta no WhatsApp">
          <div class="tela">
            <div class="whats-topo"><div class="avatar">M</div><div><b>Mariana</b><small>online</small></div></div>
            <div class="whats-conversa" id="conversaVoucher">
              <span class="whats-dia">HOJE</span>
              <div class="balao vazio-balao">A prévia aparece aqui.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== BLOQUEADOS ===== -->
    <section data-pagina="bloqueados" class="oculto">
      <div class="cabecalho"><div><h1>Lista de bloqueados</h1><p>Estes números nunca recebem convites nem respostas automáticas.</p></div></div>
      <div class="grade g4" id="kpisBloqueio"></div>
      <div class="cartao" style="margin-top:16px">
        <h2>Bloquear um número</h2>
        <p class="sub">Use quando o cliente pedir por outro canal (telefone, loja) para não receber mensagens.</p>
        <div class="campo-acao" style="max-width:460px">
          <input id="numeroBloqueio" type="tel" placeholder="DDD + número, ex.: 27 99988-7766">
          <button class="btn" type="button" id="btnBloquear">Bloquear</button>
        </div>
      </div>
      <div class="cartao" style="margin-top:16px">
        <div class="rolagem"><table class="tabela"><thead><tr><th>Número</th><th>Cliente</th><th>Motivo</th><th>Desde</th><th></th></tr></thead><tbody id="tabelaBloqueados"></tbody></table></div>
      </div>
    </section>

    <!-- ===== FILA ===== -->
    <section data-pagina="fila" class="oculto">
      <div class="cabecalho">
        <div><h1>Fila de envio</h1><p id="filaSub">Próximos clientes, na ordem de prioridade.</p></div>
        <div class="seg" id="segFila" role="group" aria-label="Quantidade">
          <button type="button" data-n="30" aria-pressed="true">30</button>
          <button type="button" data-n="100" aria-pressed="false">100</button>
          <button type="button" data-n="200" aria-pressed="false">200</button>
        </div>
      </div>
      <div class="cartao">
        <div class="rolagem"><table class="tabela"><thead><tr><th>#</th><th>Cliente</th><th>Telefone</th><th>Região</th><th>Última compra</th><th>Assina</th><th>Situação</th></tr></thead><tbody id="tabelaFila"></tbody></table></div>
      </div>
    </section>
  </main>
</div>

<div id="avisos" aria-live="polite"></div>

<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var estado = { config: null, resumo: null, versao: 'C1', allowlist: [], fila: 30, conexao: null };

  var ICON_OK = '<svg class="ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_ERRO = '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
  var ICON_AVISO = '<svg class="ic" viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
  var ICON_CHECK_DUPLO = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M2 12l5 5L18 6M8 17l1 1L22 6"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function toast(tipo, texto) {
    var el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.innerHTML = (tipo === 'ok' ? ICON_OK : ICON_ERRO) + '<div>' + esc(texto) + '</div>';
    $('avisos').appendChild(el);
    setTimeout(function () { el.remove(); }, tipo === 'ok' ? 4000 : 8000);
  }

  function api(metodo, rota, corpo) {
    return fetch('/painel/api/' + rota, {
      method: metodo, credentials: 'same-origin',
      headers: corpo ? { 'content-type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && rota !== 'login') { mostrarLogin(true); }
        if (!r.ok) { throw new Error((d.erro || ('Erro ' + r.status)) + (d.dica ? '\\n' + d.dica : '')); }
        return d;
      });
    });
  }

  function ocupado(b, sim) { if (b) { b.disabled = sim; } }

  // ---------------- navegação ----------------
  function irPara(pagina) {
    document.querySelectorAll('[data-pagina]').forEach(function (s) { s.classList.toggle('oculto', s.getAttribute('data-pagina') !== pagina); });
    document.querySelectorAll('nav.menu button').forEach(function (b) {
      if (b.getAttribute('data-ir') === pagina) { b.setAttribute('aria-current', 'page'); } else { b.removeAttribute('aria-current'); }
    });
    if (pagina === 'inicio') { carregarResumo(); }
    if (pagina === 'fila') { carregarFila(); }
    if (pagina === 'teste') { carregarHistorico(); }
    if (pagina === 'respostas') { carregarRespostas(); }
    if (pagina === 'voucher') { carregarVoucher(); }
    if (pagina === 'bloqueados') { carregarBloqueados(); }
    try { history.replaceState(null, '', '#' + pagina); } catch (e) {}
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('nav.menu button').forEach(function (b) { b.addEventListener('click', function () { irPara(b.getAttribute('data-ir')); }); });

  function mostrarLogin(sim) {
    $('telaLogin').classList.toggle('oculto', !sim);
    $('telaApp').classList.toggle('oculto', sim);
    if (sim) { $('senha').focus(); }
  }

  // ---------------- login ----------------
  $('formLogin').addEventListener('submit', function (ev) {
    ev.preventDefault();
    api('POST', 'login', { senha: $('senha').value }).then(function () { $('senha').value = ''; iniciar(); })
      .catch(function (e) { toast('erro', e.message); });
  });
  $('btnSair').addEventListener('click', function () { api('POST', 'sair').then(function () { mostrarLogin(true); }); });

  // ---------------- dados ----------------
  function carregarConfig() {
    return api('GET', 'config').then(function (c) {
      estado.config = c;
      $('lojaLateral').textContent = c.campanha.loja;
      $('baseUrl').value = c.evolution.baseUrl;
      $('instancia').value = c.evolution.instancia;
      $('apiKey').value = '';
      $('apiKey').placeholder = 'Atual: ' + c.evolution.chaveFinal;
      $('publicBaseUrl').value = c.webhook.publicBaseUrl;
      $('caminhoWebhook').textContent = c.webhook.caminho;
      $('urlsLocais').innerHTML = c.webhook.urlsLocais.map(function (u, i) {
        return '<div class="campo-acao" style="margin-bottom:8px"><div class="codigo" id="urlLocal' + i + '" style="flex:1">' + esc(u) + '</div><button class="btn" type="button" data-copiar-local="urlLocal' + i + '">Copiar</button></div>';
      }).join('') || '<p class="dica">Nenhuma rede encontrada.</p>';
      $('urlsLocais').querySelectorAll('[data-copiar-local]').forEach(function (b) {
        b.addEventListener('click', function () { copiarTexto($(b.getAttribute('data-copiar-local')).textContent); });
      });
      $('urlCompletaBox').classList.toggle('oculto', !c.webhook.url);
      $('urlCompleta').textContent = c.webhook.url || '';
      $('loja').value = c.campanha.loja;
      $('dataFim').value = c.campanha.dataFim;
      $('dailyLimit').value = c.campanha.dailyLimit;
      $('dailyLimitRange').value = Math.min(300, c.campanha.dailyLimit);
      $('dailyRamp').value = c.campanha.dailyRamp;
      $('hourlyCap').value = c.campanha.hourlyCap;
      $('semIni').value = c.campanha.semana[0]; $('semFim').value = c.campanha.semana[1];
      $('sabIni').value = c.campanha.sabado[0]; $('sabFim').value = c.campanha.sabado[1];
      $('domingo').checked = c.campanha.domingo;
      $('ativa').checked = c.campanha.ativa;
      $('dryRun').checked = c.campanha.dryRun;
      estado.allowlist = c.campanha.allowlist.slice();
      desenharEtiquetas(); explicarModo(); explicarRitmo(); explicarDataFim();
      $('faixaReinicio').classList.toggle('oculto', !c.reinicioPendente);
      desenharModo(c.campanha.ativa, c.campanha.dryRun);
    }).catch(function (e) { toast('erro', e.message); });
  }

  function desenharModo(ativa, simulacao) {
    var el = $('seloModoLateral');
    if (!ativa) { el.className = 'pilula sem-ponto'; el.textContent = 'Campanha desligada'; }
    else if (simulacao) { el.className = 'pilula info'; el.textContent = 'Em simulação'; }
    else { el.className = 'pilula erro'; el.textContent = 'Enviando'; }
  }

  function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

  function carregarResumo() {
    return api('GET', 'resumo').then(function (r) {
      estado.resumo = r;
      var h = r.hoje, pct = h.limite ? Math.min(1, h.enviados / h.limite) : 0;
      $('anelValor').setAttribute('stroke-dashoffset', String(201.06 * (1 - pct)));
      $('anelTexto').textContent = Math.round(pct * 100) + '%';
      $('kHoje').textContent = fmt(h.enviados) + ' de ' + fmt(h.limite);
      $('kJanela').textContent = r.janela.aberta ? 'Horário aberto até ' + r.janela.fecha : (r.janela.abre ? 'Abre ' + r.janela.abre : 'Sem horário configurado');

      var c = r.campanha;
      if (!c.ativa) { $('kModo').innerHTML = '<span class="pilula">Desligada</span>'; }
      else if (c.simulacao) { $('kModo').innerHTML = '<span class="pilula info">Simulação</span>'; }
      else { $('kModo').innerHTML = '<span class="pilula erro">Enviando</span>'; }
      $('kModoDet').textContent = c.dataFim ? (c.diasRestantes >= 0 ? 'Faltam ' + c.diasRestantes + ' dia(s) · até ' + c.dataFim.split('-').reverse().join('/') : 'Campanha encerrada') : 'Defina o último dia da campanha';
      if (c.allowlist > 0 && c.ativa) { $('kModoDet').textContent += ' · só ' + c.allowlist + ' número(s) de teste'; }

      $('kBase').textContent = fmt(r.base.total);
      var s = r.base.status;
      var prontos = s.PRONTO || 0, validar = s.IMPORTADO || 0;
      var enviados = (s.ENVIADO || 0) + (s.VOUCHER_ENVIADO || 0) + (s.VOUCHER_ENVIANDO || 0) + (s.DESCONHECIDO_1X || 0) + (s.AGUARDANDO_HUMANO || 0);
      var sem = (s.SEM_WHATSAPP || 0) + (s.ESGOTADO || 0) + (s.ERRO || 0) + (s.VERIFICAR || 0);
      var sairam = (s.OPT_OUT || 0) + (s.SUPRIMIDO || 0) + (s.NAO_CONTATADO || 0);
      $('kBaseDet').textContent = r.base.total ? fmt(prontos) + ' prontos para envio' : 'Importe a listagem de clientes';
      var partes = [
        ['Prontos', prontos, 'var(--marca)'], ['A validar', validar, 'var(--azul)'], ['Já contatados', enviados, '#8b5cf6'],
        ['Sem WhatsApp / erro', sem, 'var(--ambar)'], ['Saíram / fora', sairam, 'var(--vermelho)']
      ];
      var total = r.base.total || 1;
      $('barraBase').innerHTML = partes.map(function (p) { return p[1] ? '<i style="width:' + (100 * p[1] / total) + '%;background:' + p[2] + '"></i>' : ''; }).join('');
      $('legendaBase').innerHTML = partes.map(function (p) { return '<span><i class="ponto" style="background:' + p[2] + '"></i>' + p[0] + '<b>' + fmt(p[1]) + '</b></span>'; }).join('');

      var nomes = { GV: 'Grande Vitória', ES: 'Interior do ES', FORA: 'Fora do ES' };
      var reg = r.base.regiao, maxReg = Math.max(1, reg.GV || 0, reg.ES || 0, reg.FORA || 0);
      $('regioes').innerHTML = ['GV', 'ES', 'FORA'].map(function (k) {
        var n = reg[k] || 0;
        return '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13.5px"><span>' + nomes[k] + '</span><b>' + fmt(n) + '</b></div>' +
          '<div class="barra" style="margin:6px 0 0"><i style="width:' + (100 * n / maxReg) + '%;background:var(--marca)"></i></div></div>';
      }).join('');

      $('faixaReinicio').classList.toggle('oculto', !r.reinicioPendente);
      desenharModo(c.ativa, c.simulacao);
      desenharPassos();
    }).catch(function (e) { toast('erro', e.message); });
  }

  function verificarWhats(silencioso) {
    $('kWhats').innerHTML = '<span class="pilula">Verificando…</span>';
    return api('POST', 'config/testar', {}).then(function (r) {
      estado.conexao = r;
      $('kWhats').innerHTML = r.conectado ? '<span class="pilula ok">Conectado</span>' : '<span class="pilula aviso">Desconectado</span>';
      $('kWhatsDet').textContent = (estado.config ? estado.config.evolution.instancia : '') + ' · Evolution ' + (r.versao || '?');
      desenharPassos();
      return r;
    }).catch(function (e) {
      estado.conexao = { conectado: false, erro: e.message };
      $('kWhats').innerHTML = '<span class="pilula erro">Sem conexão</span>';
      $('kWhatsDet').textContent = e.message.split('\\n')[0];
      desenharPassos();
      if (!silencioso) { toast('erro', e.message); }
    });
  }

  function desenharPassos() {
    var r = estado.resumo, c = estado.config, cx = estado.conexao;
    if (!r || !c) { return; }
    var passos = [
      ['Conectar a API do WhatsApp', 'Endereço, instância e token na aba Conexão.', !!(cx && cx.conectado), 'conexao'],
      ['Definir o último dia da campanha', 'Usado no texto das mensagens.', !!r.campanha.dataFim, 'campanha'],
      ['Importar a listagem de clientes', 'Atalho "Importar listagem" no Menu Iniciar.', r.base.total > 0, null],
      ['Validar os números no WhatsApp', 'Atalho "Validar números" (não envia nada).', (r.base.status.PRONTO || 0) > 0, null],
      ['Cadastrar a imagem do voucher', 'Enviada a quem responder SIM.', r.voucherCadastrado, 'voucher'],
      ['Enviar uma mensagem de teste', 'Confira como o cliente recebe.', r.testesEnviados > 0, 'teste'],
      ['Configurar o recebimento de respostas', 'Webhook na aba Conexão.', r.webhookInformado, 'conexao']
    ];
    $('passos').innerHTML = passos.map(function (p) {
      return '<li class="' + (p[2] ? 'feito' : '') + '"><span class="marcador">' + ICON_OK + '</span><div class="txt"><b>' + p[0] + '</b><span>' + p[1] + '</span></div>' +
        (p[3] && !p[2] ? '<button class="btn pequeno" type="button" data-ir2="' + p[3] + '">Abrir</button>' : '') + '</li>';
    }).join('');
    $('passos').querySelectorAll('[data-ir2]').forEach(function (b) { b.addEventListener('click', function () { irPara(b.getAttribute('data-ir2')); }); });
  }

  $('btnAtualizar').addEventListener('click', function () { carregarResumo(); verificarWhats(false); });

  // ---------------- conexão ----------------
  $('btnVerToken').addEventListener('click', function () { var i = $('apiKey'); i.type = i.type === 'password' ? 'text' : 'password'; });

  function resultado(tipo, titulo, texto) {
    var ic = tipo === 'ok' ? ICON_OK : tipo === 'aviso' ? ICON_AVISO : ICON_ERRO;
    var cor = tipo === 'ok' ? 'var(--marca)' : tipo === 'aviso' ? 'var(--ambar)' : 'var(--vermelho)';
    $('resultadoConexao').innerHTML = '<div class="resultado ' + tipo + '"><span style="color:' + cor + '">' + ic + '</span><div><b>' + esc(titulo) + '</b><span>' + esc(texto) + '</span></div></div>';
  }

  $('btnTestar').addEventListener('click', function () {
    var b = this; ocupado(b, true);
    resultado('aviso', 'Testando…', 'Consultando o servidor e a instância.');
    api('POST', 'config/testar', { baseUrl: $('baseUrl').value, instancia: $('instancia').value, apiKey: $('apiKey').value }).then(function (r) {
      if (r.conectado) { resultado('ok', 'Conectado', 'Servidor Evolution ' + (r.versao || '?') + ' · instância conectada e pronta para enviar.'); }
      else { resultado('aviso', 'Instância desconectada', 'Servidor Evolution ' + (r.versao || '?') + ' · estado: ' + r.estado + '. ' + (r.aviso || '')); }
    }).catch(function (e) { resultado('erro', 'Falha na conexão', e.message); })
      .then(function () { ocupado(b, false); });
  });

  function salvar(valores, botao) {
    ocupado(botao, true);
    return api('POST', 'config', { valores: valores }).then(function (r) {
      toast('ok', r.aviso);
      return carregarConfig().then(carregarResumo);
    }).catch(function (e) { toast('erro', e.message); throw e; })
      .then(function () { ocupado(botao, false); }, function () { ocupado(botao, false); });
  }

  $('formApi').addEventListener('submit', function (ev) {
    ev.preventDefault();
    salvar({ EVOLUTION_BASE_URL: $('baseUrl').value, EVOLUTION_INSTANCE: $('instancia').value, EVOLUTION_API_KEY: $('apiKey').value }, ev.submitter)
      .then(function () { verificarWhats(true); });
  });
  $('formWebhook').addEventListener('submit', function (ev) { ev.preventDefault(); salvar({ PUBLIC_BASE_URL: $('publicBaseUrl').value }, ev.submitter); });
  $('btnRegistrar').addEventListener('click', function () {
    var b = this; ocupado(b, true);
    api('POST', 'webhook/registrar').then(function () { toast('ok', 'Webhook registrado na Evolution.'); carregarResumo(); })
      .catch(function (e) { toast('erro', e.message); }).then(function () { ocupado(b, false); });
  });
  function copiarTexto(t) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('ok', 'Copiado.'); }, function () { toast('erro', 'Selecione e copie manualmente.'); });
  }
  document.querySelectorAll('[data-copiar]').forEach(function (b) {
    b.addEventListener('click', function () { copiarTexto($(b.getAttribute('data-copiar')).textContent); });
  });

  // ---------------- campanha ----------------
  $('dailyLimitRange').addEventListener('input', function () { $('dailyLimit').value = this.value; explicarRitmo(); });
  $('dailyLimit').addEventListener('input', function () { $('dailyLimitRange').value = Math.min(300, Number(this.value) || 1); explicarRitmo(); });
  ['semIni', 'semFim'].forEach(function (id) { $(id).addEventListener('input', explicarRitmo); });
  $('dataFim').addEventListener('input', explicarDataFim);

  function minutos(hhmm) { var p = (hhmm || '0:0').split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function explicarRitmo() {
    var n = Number($('dailyLimit').value) || 0, janela = minutos($('semFim').value) - minutos($('semIni').value);
    if (n > 0 && janela > 0) { $('dicaRitmo').textContent = 'Cerca de 1 mensagem a cada ' + Math.max(2, Math.round(janela / n)) + ' minutos, de ' + $('semIni').value + ' às ' + $('semFim').value + '.'; }
    var resumo = estado.resumo;
    if (resumo && resumo.base.total && n) { $('dicaRitmo').textContent += ' A base inteira levaria ~' + Math.ceil(resumo.base.total / n) + ' dias de envio.'; }
  }
  function explicarDataFim() {
    var v = $('dataFim').value;
    if (!v) { $('dicaDataFim').textContent = 'Obrigatório para gerar as mensagens.'; return; }
    var d = new Date(v + 'T12:00:00');
    $('dicaDataFim').textContent = 'Aparece no texto como "' + v.split('-').reverse().slice(0, 2).join('/') + ' (' + d.toLocaleDateString('pt-BR', { weekday: 'long' }) + ')".';
  }
  function explicarModo() {
    var ativa = $('ativa').checked, sim = $('dryRun').checked, el = $('explicaModo');
    var tipo, titulo, texto;
    if (!ativa) { tipo = ''; titulo = 'Nada é enviado automaticamente'; texto = 'Use para configurar e testar. Os testes manuais continuam funcionando.'; }
    else if (sim) { tipo = 'aviso'; titulo = 'Simulação'; texto = 'O serviço percorre a fila nos horários reais e registra no log o que enviaria, sem enviar.'; }
    else { tipo = 'erro'; titulo = 'Envio real'; texto = 'Os convites saem de verdade para a fila' + (estado.allowlist.length ? ' (apenas para os ' + estado.allowlist.length + ' número(s) da lista de teste).' : ', para todos os clientes.'); }
    el.className = 'resultado ' + tipo;
    el.innerHTML = '<span>' + (tipo === 'erro' ? ICON_AVISO : ICON_OK) + '</span><div><b>' + titulo + '</b><span>' + texto + '</span></div>';
  }
  $('ativa').addEventListener('change', explicarModo);
  $('dryRun').addEventListener('change', explicarModo);

  function desenharEtiquetas() {
    var box = $('etiquetas');
    if (!estado.allowlist.length) { box.innerHTML = '<span class="dica">Lista vazia: com a campanha ativa, todos os clientes da fila recebem.</span>'; explicarModo(); return; }
    box.innerHTML = estado.allowlist.map(function (n, i) {
      return '<span class="etiqueta">+' + esc(n.slice(0, 2)) + ' ' + esc(n.slice(2, 4)) + ' ' + esc(n.slice(4)) + '<button type="button" aria-label="Remover ' + esc(n) + '" data-rm="' + i + '">&times;</button></span>';
    }).join('');
    box.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { estado.allowlist.splice(Number(b.getAttribute('data-rm')), 1); desenharEtiquetas(); }); });
    explicarModo();
  }
  function normalizar(n) {
    var d = n.replace(/\\D/g, '');
    if (d.length === 10 || d.length === 11) { d = '55' + d; }
    return /^55\\d{10,11}$/.test(d) ? d : null;
  }
  $('btnAddNumero').addEventListener('click', function () {
    var n = normalizar($('novoNumero').value);
    if (!n) { toast('erro', 'Número inválido. Use DDD + número.'); return; }
    if (estado.allowlist.indexOf(n) < 0) { estado.allowlist.push(n); }
    $('novoNumero').value = ''; desenharEtiquetas();
  });
  $('novoNumero').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('btnAddNumero').click(); } });

  $('btnSalvarCampanha').addEventListener('click', function () {
    var ativa = $('ativa').checked, sim = $('dryRun').checked;
    if (ativa && !sim && estado.resumo && !estado.resumo.voucherCadastrado) {
      if (!confirm('A imagem do voucher ainda não foi cadastrada (aba Voucher).\\nQuem responder SIM ficará sem o voucher até você cadastrar.\\n\\nSalvar mesmo assim?')) { return; }
    }
    if (ativa && !sim && !estado.allowlist.length) {
      if (!confirm('ATENÇÃO: campanha ativa, fora da simulação e sem lista de teste.\\nDepois de reiniciar o serviço, os convites serão enviados de verdade para TODOS os clientes da fila.\\n\\nConfirmar?')) { return; }
    }
    salvar({
      LOJA_NOME: $('loja').value, CAMPANHA_DATA_FIM: $('dataFim').value,
      DAILY_LIMIT: $('dailyLimit').value, DAILY_RAMP: $('dailyRamp').value, HOURLY_CAP: $('hourlyCap').value,
      WINDOW_WEEKDAY_START: $('semIni').value, WINDOW_WEEKDAY_END: $('semFim').value,
      WINDOW_SATURDAY_START: $('sabIni').value, WINDOW_SATURDAY_END: $('sabFim').value,
      WINDOW_SUNDAY: String($('domingo').checked), CAMPANHA_ATIVA: String(ativa), DRY_RUN: String(sim),
      TEST_ALLOWLIST: estado.allowlist.join(',')
    }, this);
  });

  document.querySelectorAll('[data-acao="reiniciar"]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!confirm('Reiniciar o serviço agora? O painel volta em alguns segundos.')) { return; }
      api('POST', 'reiniciar').then(function () {
        toast('ok', 'Reiniciando… aguarde.');
        var tentativas = 0;
        var t = setInterval(function () {
          tentativas++;
          fetch('/health').then(function (r) { if (r.ok && tentativas > 2) { clearInterval(t); location.reload(); } }).catch(function () {});
          if (tentativas > 40) { clearInterval(t); toast('erro', 'O serviço não voltou. Se foi aberto pelo iniciar.bat, abra-o de novo.'); }
        }, 1500);
      }).catch(function (e) { toast('erro', e.message); });
    });
  });

  // ---------------- teste ----------------
  function whatsFormatar(t) {
    return esc(t).replace(/\\*([^*\\n]+)\\*/g, '<b>$1</b>').replace(/_([^_\\n]+)_/g, '<i>$1</i>').replace(/\\n/g, '<br>');
  }
  function desenharPrevia() {
    var t = $('texto').value, nome = $('nome').value || 'Teste';
    $('nomeCel').textContent = nome; $('avatarCel').textContent = nome.charAt(0).toUpperCase();
    var hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('conversa').innerHTML = '<span class="whats-dia">HOJE</span>' + (t.trim()
      ? '<div class="balao">' + whatsFormatar(t) + '<span class="hora">' + hora + ' ' + ICON_CHECK_DUPLO + '</span></div>'
      : '<div class="balao vazio-balao">A prévia da mensagem aparece aqui.</div>');
  }
  $('texto').addEventListener('input', desenharPrevia);
  $('nome').addEventListener('input', desenharPrevia);

  document.querySelectorAll('#segModelo button').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.versao = b.getAttribute('data-v');
      document.querySelectorAll('#segModelo button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('campoVendedora').classList.toggle('oculto', estado.versao.charAt(0) !== 'B');
      gerarPrevia();
    });
  });

  function gerarPrevia() {
    return api('POST', 'teste/previa', { nome: $('nome').value, vendedora: $('vendedora').value, versao: estado.versao })
      .then(function (r) { $('texto').value = r.texto; desenharPrevia(); })
      .catch(function (e) { toast('erro', e.message); });
  }
  $('btnPrevia').addEventListener('click', gerarPrevia);

  $('btnEnviar').addEventListener('click', function () {
    var numero = $('numero').value.trim(), texto = $('texto').value;
    if (!numero || !texto.trim()) { toast('erro', 'Preencha o número e a mensagem.'); return; }
    if (!confirm('Enviar esta mensagem de verdade para ' + numero + '?')) { return; }
    var b = this; ocupado(b, true);
    api('POST', 'teste/enviar', { numero: numero, texto: texto }).then(function (r) {
      toast('ok', 'Mensagem enviada para ' + r.telefone + '.' + (r.adicionadoNaLista ? '\\nO número entrou na lista de teste.' : '') + '\\nResponda pelo celular e confira na aba Respostas.');
      carregarHistorico(); carregarConfig();
    }).catch(function (e) { toast('erro', e.message); }).then(function () { ocupado(b, false); });
  });

  function carregarHistorico() {
    api('GET', 'teste/historico').then(function (linhas) {
      $('historico').innerHTML = linhas.length ? linhas.map(function (l) {
        return '<tr><td>' + esc(new Date(l.quando).toLocaleString('pt-BR')) + '</td><td>' + esc(l.telefone) + '</td><td style="font-family:Consolas,monospace;font-size:12.5px">' + esc(l.message_id) + '</td></tr>';
      }).join('') : '<tr><td colspan="3" class="vazio">Nenhum teste enviado ainda.</td></tr>';
    }).catch(function () {});
  }

  // ---------------- respostas ----------------
  var INTENCAO = {
    SIM: ['SIM · quer o voucher', 'ok'], NAO: ['NÃO', 'aviso'],
    OPT_OUT: ['SAIR · não enviar mais', 'erro'], DESCONHECIDO: ['Não entendido', '']
  };
  var ORIGEM = { CLIENTE: 'Cliente', TESTE: 'Número de teste', FORA_DA_BASE: 'Fora da base' };
  function haQuanto(iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) { return 'há ' + s + ' s'; }
    if (s < 3600) { return 'há ' + Math.round(s / 60) + ' min'; }
    return new Date(iso).toLocaleString('pt-BR');
  }
  function carregarRespostas() {
    api('GET', 'respostas').then(function (r) {
      $('rTotal').textContent = fmt(r.total);
      $('tabelaRespostas').innerHTML = r.itens.length ? r.itens.map(function (l) {
        var it = INTENCAO[l.intencao] || [l.intencao, ''];
        return '<tr><td style="white-space:nowrap">' + esc(haQuanto(l.quando)) + '</td><td><span style="font-family:Consolas,monospace">' + esc(l.telefone) + '</span><br><span class="dica">' +
          esc(l.nome || ORIGEM[l.origem] || '') + '</span></td><td>' + esc(l.texto) + '</td><td><span class="pilula ' + it[1] + '">' + esc(it[0]) + '</span></td></tr>';
      }).join('') : '<tr><td colspan="4" class="vazio">Nenhuma resposta ainda. Responda a mensagem de teste pelo celular.</td></tr>';
    }).catch(function () {});
    api('GET', 'webhook/monitor').then(function (m) {
      var ult = m.eventos[0];
      $('rStatus').innerHTML = ult ? '<span class="pilula ok">Recebendo</span>' : '<span class="pilula aviso">Nenhum evento ainda</span>';
      $('rUltimo').textContent = ult ? 'Último evento ' + haQuanto(ult.quando) + ' · ' + fmt(m.total) + ' desde que o serviço iniciou.' :
        'Nada chegou desde que o serviço iniciou. Confira a configuração na Evolution.';
      $('listaEventos').innerHTML = m.eventos.length ? m.eventos.slice(0, 20).map(function (e) {
        var bom = ['RESPOSTA_CLIENTE', 'RESPOSTA_FORA_DA_BASE', 'STATUS', 'CONEXAO', 'VOUCHER', 'BLOQUEADO', 'NAO_ENTENDIDO'].indexOf(e.resultado) >= 0;
        return '<li class="' + (bom ? 'feito' : '') + '"><span class="marcador">' + ICON_OK + '</span><div class="txt"><b>' + esc(e.descricao) + '</b><span>' + esc(haQuanto(e.quando)) + ' · ' + esc(e.resultado) + '</span></div></li>';
      }).join('') : '<li><div class="txt"><span>Nenhum evento recebido ainda.</span></div></li>';
    }).catch(function () {});
  }
  $('btnVerificarWebhook').addEventListener('click', function () {
    var b = this; ocupado(b, true);
    $('rEvolution').innerHTML = '<span class="pilula">Verificando…</span>';
    api('POST', 'webhook/verificar').then(function (r) {
      $('rEvolution').innerHTML = r.ok ? '<span class="pilula ok">Tudo certo</span>' : '<span class="pilula erro">Precisa ajustar</span>';
      $('rEvolutionDet').textContent = r.ok ? ('URL: ' + r.url) : r.problemas.join('\\n') + (r.url ? '\\nURL atual: ' + r.url : '');
    }).catch(function (e) {
      $('rEvolution').innerHTML = '<span class="pilula erro">Sem conexão</span>';
      $('rEvolutionDet').textContent = e.message;
    }).then(function () { ocupado(b, false); });
  });
  setInterval(function () {
    var sec = document.querySelector('[data-pagina="respostas"]');
    if (!document.hidden && sec && !sec.classList.contains('oculto') && !$('telaApp').classList.contains('oculto')) { carregarRespostas(); }
  }, 5000);

  // ---------------- voucher ----------------
  function horaAgora() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function carregarVoucher() {
    api('GET', 'voucher').then(function (v) {
      $('endereco').value = v.endereco;
      $('prazoDias').value = v.prazoDias;
      $('textoPrazo').textContent = 'Quem não responder em ' + v.prazoDias + ' dia(s) vai para a lista de bloqueados.';
      var temImg = !!v.imagem;
      $('seloImagem').className = 'pilula ' + (temImg ? 'ok' : 'aviso');
      $('seloImagem').textContent = temImg ? 'Cadastrada' : 'Sem imagem';
      $('zonaConteudo').innerHTML = temImg
        ? '<img alt="Imagem do voucher" src="/painel/api/voucher/imagem?t=' + Date.now() + '"><br><span class="dica">Clique ou arraste outra imagem para trocar</span>'
        : '<svg class="ic" viewBox="0 0 24 24" style="width:36px;height:36px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg><br><b>Clique para escolher</b> ou arraste a imagem aqui';
      $('infoImagem').textContent = temImg ? (v.imagem.mimetype === 'image/png' ? 'PNG' : 'JPG') + ' · ' + Math.round(v.imagem.bytes / 1024) + ' KB · atualizada em ' + new Date(v.imagem.atualizadaEm).toLocaleString('pt-BR') : '';
      desenharPreviaVoucher(temImg);
    }).catch(function (e) { toast('erro', e.message); });
  }
  function desenharPreviaVoucher(temImg) {
    api('POST', 'voucher/previa', { nome: 'Mariana' }).then(function (p) {
      var h = horaAgora();
      var img = temImg ? '<img alt="" src="/painel/api/voucher/imagem?t=' + Date.now() + '">' : '<div class="dica" style="padding:30px 8px;text-align:center">(imagem do voucher)</div>';
      $('conversaVoucher').innerHTML = '<span class="whats-dia">HOJE</span>' +
        '<div class="balao cliente">Sim, quero!<span class="hora">' + h + '</span></div>' +
        '<div class="balao">' + whatsFormatar(p.r1) + '<span class="hora">' + h + ' ' + ICON_CHECK_DUPLO + '</span></div>' +
        '<div class="balao">' + img + whatsFormatar(p.legenda) + '<span class="hora">' + h + ' ' + ICON_CHECK_DUPLO + '</span></div>';
    }).catch(function (e) {
      $('conversaVoucher').innerHTML = '<span class="whats-dia">HOJE</span><div class="balao vazio-balao">' + esc(e.message) + '</div>';
    });
  }
  function enviarImagem(arquivo) {
    if (!arquivo) { return; }
    if (!/^image\\/(jpeg|png)$/.test(arquivo.type)) { toast('erro', 'Use uma imagem JPG ou PNG.'); return; }
    if (arquivo.size > 5 * 1024 * 1024) { toast('erro', 'A imagem passa de 5 MB. Reduza o tamanho e envie de novo.'); return; }
    var leitor = new FileReader();
    leitor.onload = function () {
      api('POST', 'voucher/imagem', { arquivo: String(leitor.result) }).then(function () {
        toast('ok', 'Imagem do voucher salva.'); carregarVoucher();
      }).catch(function (e) { toast('erro', e.message); });
    };
    leitor.readAsDataURL(arquivo);
  }
  $('arquivoImagem').addEventListener('change', function () { enviarImagem(this.files && this.files[0]); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { $('zonaImagem').addEventListener(t, function (ev) { ev.preventDefault(); $('zonaImagem').classList.add('arrastando'); }); });
  ['dragleave', 'drop'].forEach(function (t) { $('zonaImagem').addEventListener(t, function () { $('zonaImagem').classList.remove('arrastando'); }); });
  $('zonaImagem').addEventListener('drop', function (ev) { ev.preventDefault(); enviarImagem(ev.dataTransfer && ev.dataTransfer.files[0]); });
  $('btnSalvarVoucher').addEventListener('click', function () {
    salvar({ LOJA_ENDERECO: $('endereco').value, PRAZO_RESPOSTA_DIAS: $('prazoDias').value }, this).then(carregarVoucher, function () {});
  });

  // ---------------- bloqueados ----------------
  function carregarBloqueados() {
    api('GET', 'bloqueados').then(function (b) {
      var m = b.porMotivo;
      var kpis = [
        ['Total bloqueados', b.total, ''], ['Responderam NÃO', m.RESPONDEU_NAO || 0, 'erro'],
        ['Pediram para sair', m.PEDIU_SAIR || 0, 'erro'], ['Sem resposta no prazo', m.SEM_RESPOSTA || 0, 'aviso']
      ];
      $('kpisBloqueio').innerHTML = kpis.map(function (k) {
        return '<div class="cartao"><span class="kpi-rotulo">' + k[0] + '</span><div class="kpi-valor">' + fmt(k[1]) + '</div></div>';
      }).join('');
      $('tabelaBloqueados').innerHTML = b.itens.length ? b.itens.map(function (l) {
        var cor = l.motivo === 'SEM_RESPOSTA' ? 'aviso' : l.motivo === 'MANUAL' ? 'info' : 'erro';
        return '<tr><td style="font-family:Consolas,monospace">' + esc(l.telefone) + '</td><td>' + esc(l.nome || '—') + '</td><td><span class="pilula ' + cor + '">' + esc(l.motivoTexto) +
          '</span></td><td>' + esc(new Date(l.quando).toLocaleDateString('pt-BR')) + '</td><td style="text-align:right"><button class="btn pequeno perigo" type="button" data-desbloquear="' + l.id + '">Remover</button></td></tr>';
      }).join('') : '<tr><td colspan="5" class="vazio">Nenhum número bloqueado.</td></tr>';
      $('tabelaBloqueados').querySelectorAll('[data-desbloquear]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Remover este número da lista de bloqueados?\\nSó faça isso se a pessoa pediu para voltar a receber mensagens (ou se for um número de teste).')) { return; }
          api('POST', 'bloqueados/remover', { id: Number(btn.getAttribute('data-desbloquear')) }).then(function () { toast('ok', 'Número removido da lista.'); carregarBloqueados(); })
            .catch(function (e) { toast('erro', e.message); });
        });
      });
    }).catch(function (e) { toast('erro', e.message); });
  }
  $('btnBloquear').addEventListener('click', function () {
    var n = $('numeroBloqueio').value.trim();
    if (!n) { return; }
    api('POST', 'bloqueados', { numero: n }).then(function (r) {
      toast('ok', r.novo ? 'Número bloqueado.' : 'Este número já estava bloqueado.'); $('numeroBloqueio').value = ''; carregarBloqueados();
    }).catch(function (e) { toast('erro', e.message); });
  });

  // ---------------- fila ----------------
  document.querySelectorAll('#segFila button').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.fila = Number(b.getAttribute('data-n'));
      document.querySelectorAll('#segFila button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      carregarFila();
    });
  });
  var NOME_SEG = { RECENTE: ['Até 6 meses', 'ok'], ANTIGO: ['6 a 24 meses', 'info'], INATIVO: ['Mais de 24 meses', ''] };
  var NOME_REG = { GV: 'Grande Vitória', ES: 'Interior ES', FORA: 'Fora do ES' };
  function carregarFila() {
    api('GET', 'fila?n=' + estado.fila).then(function (f) {
      $('filaSub').textContent = f.somenteTeste ? 'A lista de teste está preenchida: só esses números aparecem e recebem.' : 'Próximos clientes, na ordem de prioridade.';
      $('tabelaFila').innerHTML = f.itens.length ? f.itens.map(function (c) {
        var seg = NOME_SEG[c.segmento] || [c.segmento || '-', ''];
        var st = c.status === 'PRONTO' ? '<span class="pilula ok">Pronto</span>' : c.status === 'IMPORTADO' ? '<span class="pilula info">A validar</span>' : '<span class="pilula aviso">' + esc(c.status) + '</span>';
        return '<tr><td>' + c.ordem + '</td><td><b>' + esc(c.nome) + '</b></td><td style="font-family:Consolas,monospace">' + esc(c.telefone) + '</td><td>' + esc(NOME_REG[c.regiao] || c.regiao || '-') +
          '</td><td><span class="pilula sem-ponto ' + seg[1] + '">' + esc(seg[0]) + '</span></td><td>' + esc(c.vendedora || 'Loja') + '</td><td>' + st + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="vazio">Fila vazia. Importe a listagem de clientes e valide os números.</td></tr>';
    }).catch(function (e) { toast('erro', e.message); });
  }

  // ---------------- início ----------------
  var timer = null;
  function iniciar() {
    mostrarLogin(false);
    var h = new Date().getHours();
    $('saudacao').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + '! Situação da campanha em tempo real.';
    carregarConfig().then(function () {
      var pagina = (location.hash || '#inicio').slice(1);
      irPara(['inicio', 'conexao', 'campanha', 'teste', 'respostas', 'voucher', 'bloqueados', 'fila'].indexOf(pagina) >= 0 ? pagina : 'inicio');
      verificarWhats(true);
    });
    if (timer) { clearInterval(timer); }
    timer = setInterval(function () { if (!document.hidden && !$('telaApp').classList.contains('oculto')) { carregarResumo(); } }, 30000);
  }

  api('GET', 'sessao').then(function (s) { if (s.logado) { iniciar(); } else { mostrarLogin(true); } }).catch(function () { mostrarLogin(true); });
})();
</script>
</body>
</html>
`;
