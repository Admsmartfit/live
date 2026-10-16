; Instalador do Campanha WhatsApp para Windows 10/11 x64 (Inno Setup 6).
; Gerado por scripts/empacotar-windows.ps1, que passa /DAppVersion=<versao>.
; Usa a pasta release\campanha-whatsapp montada pelo mesmo script.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1C2B7E-4A2D-4E7B-9B1E-CA3A1F0D5E11}
AppName=Campanha WhatsApp
AppVersion={#AppVersion}
AppPublisher=LIVE! Vila Velha
DefaultDirName={sd}\CampanhaWhatsApp
DefaultGroupName=Campanha WhatsApp
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
OutputDir=..\release
OutputBaseFilename=CampanhaWhatsApp-Setup-{#AppVersion}
UninstallDisplayIcon={app}\campanha-whatsapp.exe
UninstallDisplayName=Campanha WhatsApp
CloseApplications=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "servico"; Description: "Instalar como serviço do Windows (inicia com o Windows e reinicia sozinho se cair)"
Name: "firewall"; Description: "Liberar a porta 3000 no Firewall (necessário para receber respostas pelo webhook)"; Flags: unchecked
Name: "desktop"; Description: "Criar atalhos na Área de Trabalho"; Flags: unchecked

[Dirs]
; A pasta do programa é editável pelos usuários (.env, data\).
Name: "{app}"; Permissions: users-modify
Name: "{app}\data"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\data\logs"; Flags: uninsneveruninstall

[Files]
Source: "..\release\campanha-whatsapp\*"; DestDir: "{app}"; Excludes: ".env,\data\*,\tests\*"; Flags: recursesubdirs createallsubdirs ignoreversion

[INI]
Filename: "{group}\Painel (configurar e testar).url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:3000/painel"

[UninstallDelete]
Type: files; Name: "{group}\Painel (configurar e testar).url"

[Icons]
Name: "{group}\1. Importar listagem de clientes (PDF)"; Filename: "{app}\importar.bat"; WorkingDir: "{app}"
Name: "{group}\2. Validar números no WhatsApp"; Filename: "{app}\validar-numeros.bat"; WorkingDir: "{app}"
Name: "{group}\3. Simular próximos dias"; Filename: "{app}\simular.bat"; WorkingDir: "{app}"
Name: "{group}\4. Enviar mensagem de teste"; Filename: "{app}\teste-envio.bat"; WorkingDir: "{app}"
Name: "{group}\Status de hoje"; Filename: "{app}\status.bat"; WorkingDir: "{app}"
Name: "{group}\Relatório da campanha"; Filename: "{app}\relatorio.bat"; WorkingDir: "{app}"
Name: "{group}\Testar conexão com a Evolution"; Filename: "{app}\discover.bat"; WorkingDir: "{app}"
Name: "{group}\Capturar eventos do webhook"; Filename: "{app}\capturar-webhook.bat"; WorkingDir: "{app}"
Name: "{group}\Editar configuração (.env)"; Filename: "{win}\notepad.exe"; Parameters: """{app}\.env"""
Name: "{group}\Pasta de dados"; Filename: "{app}\data"
Name: "{group}\Leia-me"; Filename: "{app}\LEIA-ME.txt"
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Campanha - Importar PDF"; Filename: "{app}\importar.bat"; WorkingDir: "{app}"; Tasks: desktop
Name: "{autodesktop}\Campanha - Status"; Filename: "{app}\status.bat"; WorkingDir: "{app}"; Tasks: desktop

[Run]
Filename: "{app}\campanha-whatsapp.exe"; Parameters: "install"; Tasks: servico; Flags: runhidden waituntilterminated; StatusMsg: "Instalando o serviço…"
Filename: "{app}\campanha-whatsapp.exe"; Parameters: "start"; Tasks: servico; Flags: runhidden waituntilterminated; StatusMsg: "Iniciando o serviço…"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Campanha WhatsApp"""; Tasks: firewall; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""Campanha WhatsApp"" dir=in action=allow protocol=TCP localport=3000"; Tasks: firewall; Flags: runhidden waituntilterminated; StatusMsg: "Liberando a porta no Firewall…"
Filename: "http://localhost:3000/painel"; Description: "Abrir o painel (configurar a API e testar mensagens)"; Tasks: servico; Flags: postinstall shellexec skipifsilent nowait
Filename: "{app}\discover.bat"; Description: "Testar agora a conexão com a Evolution API (não envia nada)"; WorkingDir: "{app}"; Flags: postinstall shellexec skipifsilent nowait unchecked
Filename: "{app}\LEIA-ME.txt"; Description: "Abrir o Leia-me"; Flags: postinstall shellexec skipifsilent nowait unchecked

[UninstallRun]
Filename: "{app}\campanha-whatsapp.exe"; Parameters: "stopwait"; Flags: runhidden waituntilterminated; RunOnceId: "PararServico"
Filename: "{app}\campanha-whatsapp.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoverServico"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Campanha WhatsApp"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoverFirewall"

[Code]
var
  PaginaApi: TInputQueryWizardPage;
  PaginaCampanha: TInputQueryWizardPage;

function ArquivoEnv(): String;
begin
  Result := ExpandConstant('{app}\.env');
end;

{ Hash de dados variáveis: suficiente para gerar tokens locais. }
function Aleatorio(Sal: String): String;
begin
  Result := GetSHA256OfString(Sal + GetDateTimeString('yyyymmddhhnnsszzz', #0, #0) +
    ExpandConstant('{tmp}') + IntToStr(Random(2147483647)) + IntToStr(Random(2147483647)) +
    ExpandConstant('{computername}'));
end;

function SoDigitos(S: String): String;
var
  I: Integer;
begin
  Result := '';
  for I := 1 to Length(S) do
    if (S[I] >= '0') and (S[I] <= '9') then
      Result := Result + S[I];
end;

procedure InitializeWizard();
begin
  PaginaApi := CreateInputQueryPage(wpSelectTasks,
    'Conexão com a Evolution API',
    'Dados da instância do WhatsApp',
    'Copie do manager da Evolution (dashboard da instância). O token fica só neste computador, no arquivo .env.');
  PaginaApi.Add('Endereço do servidor:', False);
  PaginaApi.Add('Nome da instância (exatamente como aparece no manager):', False);
  PaginaApi.Add('Token da instância (API Key):', True);
  PaginaApi.Values[0] := 'https://evolution.ricardo.home.nom.br';
  PaginaApi.Values[1] := 'ao vivo vv';

  PaginaCampanha := CreateInputQueryPage(PaginaApi.ID,
    'Campanha',
    'Dados da campanha e do responsável',
    'O envio começa DESLIGADO e em modo simulação. Você liga depois, no .env, quando terminar os testes.');
  PaginaCampanha.Add('Celular do responsável, com DDD (recebe os alertas):', False);
  PaginaCampanha.Add('Último dia da campanha (AAAA-MM-DD):', False);
  PaginaCampanha.Add('Máximo de mensagens por dia:', False);
  PaginaCampanha.Add('Números de teste, separados por vírgula (opcional):', False);
  PaginaCampanha.Add('Senha do painel (mínimo 12 caracteres):', True);
  PaginaCampanha.Values[2] := '40';
end;

{ Em atualização (.env já existe), não pergunta nada de novo. }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ((PageID = PaginaApi.ID) or (PageID = PaginaCampanha.ID)) and FileExists(ArquivoEnv());
end;

function TelefoneE164(S: String): String;
begin
  Result := SoDigitos(S);
  if (Length(Result) = 11) then
    Result := '55' + Result;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Tel, Data: String;
begin
  Result := True;
  if CurPageID = PaginaApi.ID then
  begin
    if (Pos('http', PaginaApi.Values[0]) <> 1) or (Trim(PaginaApi.Values[1]) = '') or (Trim(PaginaApi.Values[2]) = '') then
    begin
      MsgBox('Preencha o endereço (começando com https://), o nome da instância e o token.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaCampanha.ID then
  begin
    Tel := TelefoneE164(PaginaCampanha.Values[0]);
    Data := Trim(PaginaCampanha.Values[1]);
    if (Length(Tel) < 12) or (Length(Tel) > 13) or (Copy(Tel, 1, 2) <> '55') then
    begin
      MsgBox('Celular inválido. Use DDD + número, por exemplo 27999887766.', mbError, MB_OK);
      Result := False;
    end
    else if (Data <> '') and ((Length(Data) <> 10) or (Data[5] <> '-') or (Data[8] <> '-')) then
    begin
      MsgBox('Data no formato AAAA-MM-DD, por exemplo 2026-10-31 (ou deixe em branco).', mbError, MB_OK);
      Result := False;
    end
    else if StrToIntDef(Trim(PaginaCampanha.Values[2]), 0) < 1 then
    begin
      MsgBox('Informe quantas mensagens por dia (número maior que zero).', mbError, MB_OK);
      Result := False;
    end
    else if Length(Trim(PaginaCampanha.Values[4])) < 12 then
    begin
      MsgBox('A senha do painel precisa ter pelo menos 12 caracteres.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CriarEnv();
var
  L: TArrayOfString;
  Teste, Item: String;
  P: Integer;
begin
  { Números de teste: normaliza cada um para 55 + DDD + número. }
  Teste := '';
  Item := PaginaCampanha.Values[3] + ',';
  while Item <> '' do
  begin
    P := Pos(',', Item);
    if TelefoneE164(Copy(Item, 1, P - 1)) <> '' then
    begin
      if Teste <> '' then Teste := Teste + ',';
      Teste := Teste + TelefoneE164(Copy(Item, 1, P - 1));
    end;
    Delete(Item, 1, P);
  end;

  SetArrayLength(L, 22);
  L[0]  := '# Configuracao gerada pelo instalador. Demais opcoes e padroes: veja .env.example';
  L[1]  := '';
  L[2]  := 'EVOLUTION_BASE_URL=' + Trim(PaginaApi.Values[0]);
  L[3]  := 'EVOLUTION_INSTANCE=' + Trim(PaginaApi.Values[1]);
  L[4]  := 'EVOLUTION_API_KEY=' + Trim(PaginaApi.Values[2]);
  L[5]  := '';
  L[6]  := 'HOST=0.0.0.0';
  L[7]  := 'PORT=3000';
  L[8]  := 'WEBHOOK_TOKEN=' + Aleatorio('webhook');
  L[9]  := 'ADMIN_PASSWORD=' + Trim(PaginaCampanha.Values[4]);
  L[10] := 'ADMIN_PHONE=' + TelefoneE164(PaginaCampanha.Values[0]);
  L[11] := '';
  L[12] := 'LOJA_NOME=LIVE! Vila Velha';
  L[13] := 'CAMPANHA_DATA_FIM=' + Trim(PaginaCampanha.Values[1]);
  L[14] := 'DAILY_LIMIT=' + Trim(PaginaCampanha.Values[2]);
  L[15] := 'TEST_ALLOWLIST=' + Teste;
  L[16] := '';
  L[17] := '# Seguranca: o envio comeca desligado e em simulacao.';
  L[18] := '# Para enviar de verdade: DRY_RUN=false e CAMPANHA_ATIVA=true, depois reinicie o servico.';
  L[19] := 'DRY_RUN=true';
  L[20] := 'CAMPANHA_ATIVA=false';
  L[21] := '';
  SaveStringsToUTF8File(ArquivoEnv(), L, False);
end;

{ Atualização: para o serviço antes de copiar os arquivos (node.exe em uso). }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\campanha-whatsapp.exe')) then
    Exec(ExpandConstant('{app}\campanha-whatsapp.exe'), 'stopwait', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { O .env precisa existir antes de o serviço iniciar ([Run] roda depois deste passo). }
  if (CurStep = ssPostInstall) and not FileExists(ArquivoEnv()) then
    CriarEnv();
end;
