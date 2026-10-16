# Gera um pacote portatil para Windows 10/11 x64 em release\campanha-whatsapp\
# e um .zip pronto para copiar ao servidor:
#   - node\                 runtime oficial do Node (hash SHA-256 conferido)
#   - dist\, node_modules\  aplicacao compilada e dependencias de producao
#   - campanha-whatsapp.exe  WinSW: instala/roda como servico do Windows (RNF04)
#   - *.bat                  atalhos: iniciar, discover, capturar webhook, servico
#
# As dependencias sao instaladas com o npm do proprio Node empacotado, para que
# modulos nativos (better-sqlite3, sharp) batam com a ABI do node.exe incluido.
#
# Uso: npm run package:win   (ou: powershell -File scripts\empacotar-windows.ps1 -NodeMajor 20)

param(
  [int]$NodeMajor = 20,
  [string]$WinSwVersion = 'v2.12.0'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Raiz = Split-Path -Parent $PSScriptRoot
$Release = Join-Path $Raiz 'release'
$Cache = Join-Path $Release '.cache'
$Pacote = Join-Path $Release 'campanha-whatsapp'
$Versao = (Get-Content (Join-Path $Raiz 'package.json') -Raw | ConvertFrom-Json).version

function Passo([string]$texto) { Write-Host "==> $texto" -ForegroundColor Cyan }

function Baixar([string]$url, [string]$destino) {
  if (-not (Test-Path $destino)) {
    Write-Host "    baixando $url"
    Invoke-WebRequest -Uri $url -OutFile "$destino.part" -UseBasicParsing
    Move-Item "$destino.part" $destino
  }
}

function Escrever([string]$caminho, [string]$conteudo) {
  # .bat e .xml em ASCII/UTF-8 sem BOM; o cmd.exe nao entende BOM.
  [IO.File]::WriteAllText($caminho, $conteudo.Replace("`n", "`r`n"), (New-Object Text.UTF8Encoding($false)))
}

New-Item -ItemType Directory -Force $Cache | Out-Null

Passo 'Compilando TypeScript'
Push-Location $Raiz
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha no build' }
} finally { Pop-Location }

Passo "Localizando a ultima versao do Node $NodeMajor.x"
$indice = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
$node = $indice | Where-Object { $_.version -like "v$NodeMajor.*" -and $_.files -contains 'win-x64-zip' } | Select-Object -First 1
if (-not $node) { throw "Nenhuma versao do Node $NodeMajor.x para win-x64 encontrada" }
$nv = $node.version
Write-Host "    Node $nv (LTS: $($node.lts))"

$zipNome = "node-$nv-win-x64.zip"
$zipNode = Join-Path $Cache $zipNome
Baixar "https://nodejs.org/dist/$nv/$zipNome" $zipNode

Passo 'Conferindo SHA-256 do Node'
$somas = Invoke-WebRequest -Uri "https://nodejs.org/dist/$nv/SHASUMS256.txt" -UseBasicParsing
$linha = ($somas.Content -split "`n") | Where-Object { $_ -match "\s$([regex]::Escape($zipNome))$" } | Select-Object -First 1
if (-not $linha) { throw "Hash de $zipNome nao encontrado em SHASUMS256.txt" }
$esperado = ($linha -split '\s+')[0]
$obtido = (Get-FileHash $zipNode -Algorithm SHA256).Hash.ToLower()
if ($obtido -ne $esperado) {
  Remove-Item $zipNode
  throw "Hash invalido para $zipNome (esperado $esperado, obtido $obtido). Arquivo removido; rode de novo."
}

Passo "Montando $Pacote"
if (Test-Path $Pacote) { Remove-Item -Recurse -Force $Pacote }
New-Item -ItemType Directory -Force $Pacote, (Join-Path $Pacote 'data\logs') | Out-Null

$tmpNode = Join-Path $Cache "node-$nv"
if (-not (Test-Path $tmpNode)) { Expand-Archive $zipNode -DestinationPath $tmpNode }
Copy-Item -Recurse (Join-Path $tmpNode "node-$nv-win-x64") (Join-Path $Pacote 'node')

foreach ($item in 'dist', 'templates', 'package.json', 'package-lock.json', '.env.example') {
  Copy-Item -Recurse (Join-Path $Raiz $item) (Join-Path $Pacote $item)
}

Passo 'Instalando dependencias de producao com o Node empacotado'
$nodeExe = Join-Path $Pacote 'node\node.exe'
$npmCli = Join-Path $Pacote 'node\node_modules\npm\bin\npm-cli.js'
$pathOriginal = $env:Path
# Scripts de instalação (prebuild-install do better-sqlite3) usam o "node" do PATH:
# ele precisa ser o Node empacotado, senão o binário nativo sai para outra versão.
$env:Path = "$(Join-Path $Pacote 'node');$pathOriginal"
Push-Location $Pacote
try {
  & $nodeExe $npmCli ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Falha no npm ci' }
  & $nodeExe -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"
  if ($LASTEXITCODE -ne 0) { throw 'better-sqlite3 nao carrega no Node empacotado' }
} finally {
  Pop-Location
  $env:Path = $pathOriginal
}

Passo "Baixando WinSW $WinSwVersion (servico do Windows)"
$winsw = Join-Path $Cache "WinSW-x64-$WinSwVersion.exe"
Baixar "https://github.com/winsw/winsw/releases/download/$WinSwVersion/WinSW-x64.exe" $winsw
Copy-Item $winsw (Join-Path $Pacote 'campanha-whatsapp.exe')

Escrever (Join-Path $Pacote 'campanha-whatsapp.xml') @'
<service>
  <id>campanha-whatsapp</id>
  <name>Campanha WhatsApp</name>
  <description>Motor de campanha WhatsApp (Evolution API)</description>
  <executable>%BASE%\node\node.exe</executable>
  <arguments>dist\src\main.js</arguments>
  <workingdirectory>%BASE%</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>15 sec</stoptimeout>
  <logpath>%BASE%\data\logs\servico</logpath>
  <log mode="roll-by-time">
    <pattern>yyyyMMdd</pattern>
  </log>
</service>
'@

$cabecalho = "@echo off`ncd /d `"%~dp0`"`nif not exist .env (echo Arquivo .env nao encontrado. Copie .env.example para .env e preencha. & pause & exit /b 1)`n"

Escrever (Join-Path $Pacote 'iniciar.bat') ($cabecalho + "node\node.exe dist\src\main.js`npause`n")
Escrever (Join-Path $Pacote 'discover.bat') ($cabecalho + "node\node.exe dist\scripts\discover.js`npause`n")
Escrever (Join-Path $Pacote 'capturar-webhook.bat') ($cabecalho + "node\node.exe dist\scripts\capture-webhook.js`npause`n")

$cli = "node\node.exe dist\src\cli\index.js"
# Aceita o PDF arrastado sobre o .bat; sem argumento, abre a janela de escolha de arquivo.
$escolherPdf = @'
set "ARQ=%~1"
if "%ARQ%"=="" for /f "usebackq delims=" %%F in (`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Listagem de clientes (PDF)'; $d.Filter = 'PDF (*.pdf)|*.pdf'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }"`) do set "ARQ=%%F"
if "%ARQ%"=="" (echo Nenhum arquivo escolhido. & pause & exit /b 1)
'@
Escrever (Join-Path $Pacote 'importar.bat') ($cabecalho + $escolherPdf.Replace("`r`n", "`n") + "`n$cli importar `"%ARQ%`"`npause`n")
Escrever (Join-Path $Pacote 'validar-numeros.bat') ($cabecalho + "$cli validar-numeros`npause`n")
Escrever (Join-Path $Pacote 'relatorio.bat') ($cabecalho + "$cli relatorio`npause`n")
Escrever (Join-Path $Pacote 'status.bat') ($cabecalho + "$cli status`npause`n")
Escrever (Join-Path $Pacote 'painel.bat') ("@echo off`nstart http://localhost:3000/painel`n")
Escrever (Join-Path $Pacote 'simular.bat') ($cabecalho + "$cli simular --dias 3`npause`n")
Escrever (Join-Path $Pacote 'teste-envio.bat') ($cabecalho + "set /p NUM=Numero de teste (precisa estar na TEST_ALLOWLIST): `n$cli teste-envio %NUM%`nset /p OK=Enviar de verdade? (S/N): `nif /i `"%OK%`"==`"S`" $cli teste-envio %NUM% --confirmar`npause`n")

$admin = "net session >nul 2>&1 || (echo Execute como Administrador: botao direito ^> Executar como administrador. & pause & exit /b 1)`n"
Escrever (Join-Path $Pacote 'instalar-servico.bat') ($cabecalho + $admin + "campanha-whatsapp.exe install`ncampanha-whatsapp.exe start`ncampanha-whatsapp.exe status`npause`n")
Escrever (Join-Path $Pacote 'remover-servico.bat') ("@echo off`ncd /d `"%~dp0`"`n" + $admin + "campanha-whatsapp.exe stop`ncampanha-whatsapp.exe uninstall`npause`n")

$leiame = @"
CAMPANHA WHATSAPP - pacote para Windows 10/11 (x64)
Versao $Versao - Node $nv embutido (nao precisa instalar Node).

1. Copie esta pasta para o servidor (ex.: C:\campanha-whatsapp).
2. Copie .env.example para .env e preencha (EVOLUTION_API_KEY, WEBHOOK_TOKEN,
   ADMIN_PASSWORD, ADMIN_PHONE...). Sem isso o programa nao inicia.
3. Teste a conexao:   discover.bat   (somente leitura, nao envia nada)
4. Rodar no console:  iniciar.bat    (fecha quando a janela fechar)
5. Rodar como servico (inicia com o Windows e reinicia sozinho em falha):
   botao direito em instalar-servico.bat > Executar como administrador.
   Para remover: remover-servico.bat (tambem como administrador).
   Comandos: campanha-whatsapp.exe start | stop | restart | status

PAINEL (configurar a API e testar mensagens)
   http://localhost:3000/painel  (ou painel.bat). Senha: ADMIN_PASSWORD do .env.
   O servico precisa estar rodando (instalado como servico ou iniciar.bat).

PASSO A PASSO DA CAMPANHA
a. importar.bat        arraste o PDF "Listagem dos Clientes" sobre ele. Gera
                       data\fila-prioridade.csv (ordem de envio) e
                       data\import-rejeitados.csv (quem ficou de fora e por que).
b. validar-numeros.bat confere quais numeros tem WhatsApp (nao envia nada).
c. simular.bat         mostra os proximos dias: horarios, clientes e textos (nao envia).
d. teste-envio.bat     manda 1 mensagem para um numero da TEST_ALLOWLIST.
e. status.bat          janela, trava diaria e modo de operacao.
f. Para comecar: no .env, DRY_RUN=false e CAMPANHA_ATIVA=true; reinicie o servico.
   Trava diaria = DAILY_LIMIT. Janela = WINDOW_* (padrao 09:00-20:00, sem domingo).

Saude:  http://localhost:3000/health  (porta = PORT do .env)
Dados:  pasta data\ (banco e logs). Faca backup dela.
Logs do servico: data\logs\servico\

Captura de webhook (Etapa 0): capturar-webhook.bat grava eventos em tests\fixtures\.
O webhook precisa de HTTPS publico (tunel ou proxy reverso) apontando para a porta.
"@
Escrever (Join-Path $Pacote 'LEIA-ME.txt') $leiame

Passo 'Compactando'
$zipFinal = Join-Path $Release "campanha-whatsapp-$Versao-win-x64.zip"
if (Test-Path $zipFinal) { Remove-Item $zipFinal }
# O antivírus pode bloquear por instantes o node.exe recém-copiado: tenta de novo.
for ($t = 1; $t -le 3; $t++) {
  try {
    Compress-Archive -Path $Pacote -DestinationPath $zipFinal -CompressionLevel Optimal -ErrorAction Stop
    break
  } catch {
    if ($t -eq 3) { throw }
    Write-Host "    arquivo bloqueado, tentando de novo em 10 s ($t/3)"
    if (Test-Path $zipFinal) { Remove-Item $zipFinal }
    Start-Sleep -Seconds 10
  }
}

$mb = [math]::Round((Get-Item $zipFinal).Length / 1MB, 1)
Passo "Pronto: $zipFinal ($mb MB)"

# Instalador (setup.exe) com Inno Setup 6, se estiver instalado.
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iscc) {
  Passo 'Gerando instalador (Inno Setup)'
  & $iscc /Q "/DAppVersion=$Versao" (Join-Path $Raiz 'installer\campanha-whatsapp.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o instalador' }
  $setup = Join-Path $Release "CampanhaWhatsApp-Setup-$Versao.exe"
  $mb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
  Passo "Instalador: $setup ($mb MB)"
} else {
  Write-Host 'Inno Setup 6 nao encontrado: instalador nao gerado. Instale com: winget install JRSoftware.InnoSetup' -ForegroundColor Yellow
}
