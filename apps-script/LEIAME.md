# Motor da agenda e da pasta CFP (Apps Script)

Roda na conta **8bpmmp3@gmail.com**, separado da planilha do numerador (não mexe nos scripts que já existem).
A cada 5 minutos ele cria/move os eventos de Prazo CPA e Prazo Cia, e para o CFP cria a pasta, o evento
na agenda do CFP e a linha na aba Operações.

## Instalação (uma vez)

1. Entre em <https://script.google.com> com a conta **8bpmmp3@gmail.com** → **Novo projeto**.
   Dê o nome **Portal P3 - Automação**.
2. Crie três arquivos com o conteúdo desta pasta:
   - `Logica.gs` (botão **+** → Script → nome `Logica`)
   - `Motor.gs` (renomeie o `Código.gs` para `Motor` e cole)
   - `appsscript.json`: em **Configurações do projeto** marque *Mostrar arquivo de manifesto "appsscript.json"*
     no editor; depois abra o arquivo e cole.
3. Os IDs da agenda do CFP, da pasta "OPERAÇÕES 2026" e da planilha Numerador 2026 já estão no `CONFIG_P3`
   do `Motor.gs` (se algum mudar, troque lá).
4. **Configurações do projeto → Propriedades do script → Adicionar propriedade**:
   - Propriedade: `CHAVE_SERVICO`
   - Valor: o conteúdo inteiro do arquivo `chave-servico.json` (abra no Bloco de Notas, copie tudo e cole).
5. No editor, escolha a função **instalarAutomacao** e clique em **Executar**. Autorize o acesso
   (Agenda, Drive, Planilhas). No **Registro de execução** deve aparecer `Conexão OK`.

6. **Para agendar na hora (sem esperar 5 minutos):** **Implantar → Nova implantação →** engrenagem →
   **App da Web**. Descrição: `Portal P3`; **Executar como: Eu**; **Quem pode acessar: Qualquer pessoa** →
   **Implantar**. Copie a **URL do app da Web** (termina em `/exec`) e mande para colocar no portal.
   O endereço só faz o motor rodar: não recebe nem devolve nenhum dado.

> Sempre que trocar o código do `Motor.gs` ou `Logica.gs`: **Implantar → Gerenciar implantações →** lápis →
> Versão: **Nova versão** → **Implantar** (a URL continua a mesma).

Pronto: o portal chama o motor ao salvar, e de reserva ele roda sozinho a cada 5 minutos. No portal, dentro da demanda, o bloco
**Agenda e pasta** mostra ⏳ enquanto espera e ✅ quando o evento foi criado, com o botão **Abrir pasta CFP**.

## E-mails do funcional → aba Demandas Pendentes

A cada rodada o motor procura no Gmail da P/3 os e-mails **encaminhados pela caixa funcional**
(`EMAIL_FUNCIONAL` no `CONFIG_P3`, hoje `8bpmmp3@policiamilitar.sp.gov.br`). Cada um vira um item
na aba **Demandas Pendentes** do portal, com assunto, quem mandou o original, texto e anexos.
E-mails de qualquer outro endereço são ignorados.

- Os anexos são salvos na pasta **Portal P3 - Anexos** do Drive (criada sozinha na primeira vez).
- O e-mail recebe a etiqueta **Portal P3** no Gmail. Mesmo sem ela, o mesmo e-mail nunca entra duas vezes.
- Na primeira vez ele busca os e-mails das últimas 24 horas.

Depois de colar esta versão, rode **instalarAutomacao** de novo: ele pede a permissão do Gmail e apaga o
gatilho antigo do resumo diário por e-mail (que foi retirado). Para testar na hora, rode **testarEmails**.

## Checklist Operações (planilha de resultados, efetivo e missões do CFP)

- **Planilha de resultado:** quando a P/3 marca o item no checklist, o motor copia a planilha modelo
  (`PLANILHA_RESULTADO_MODELO`) para a pasta do CFP da operação e preenche a linha 1 (datas, a partir da
  coluna C) e a linha 2 (protocolo do Mapa Força de cada dia). Os resultados que a Sala de Operações lança no
  portal são gravados na coluna do dia (linha 3 = protocolo do resultado, demais linhas = indicadores).
- **Banco de efetivo:** todo dia às 5h (e ao rodar **instalarAutomacao**) o motor copia RE, posto/graduação,
  nome de guerra e telefone da planilha `PLANILHA_EFETIVO` para o portal. A aba `BD Efetivo` é lida primeiro; as
  outras abas com as colunas RE e NOME DE GUERRA completam. Para atualizar na hora, rode **sincronizarEfetivo**.

- **Efetivo cadastrado à mão no portal** (ex.: CFP na aba TDS com RE fora do banco): a cada rodada o motor acrescenta
  a linha na aba `BD Efetivo` (RE, posto/graduação, nome de guerra, nome completo e telefone, nas colunas do cabeçalho),
  se o RE ainda não estiver lá.

Depois de colar esta versão, rode **instalarAutomacao** de novo (ele cria o gatilho diário do efetivo).

## Página do CFP = agenda do CFP

A página **Missões do CFP** do portal mostra o que está na **agenda do CFP** (`AGENDA_CFP`), e não o histórico
das demandas. A cada rodada (a cada 5 minutos, ou na hora pelo botão **Atualizar agora**) o motor lê os eventos
de 60 dias atrás até 1 ano à frente (`AGENDA_CFP_DIAS_ANTES` / `AGENDA_CFP_DIAS_DEPOIS`) e grava no portal.

- Evento criado, mudado de data ou apagado **direto na agenda** aparece igual no portal.
- O botão **📂 Abrir pasta CFP** usa o primeiro link de pasta do Drive que estiver na descrição do evento.
- O **Nº** da demanda aparece quando a descrição tem `Nº 1234` (o motor já escreve isso nos eventos novos).
- Só grava no banco quando a agenda mudou (ou a cada meia hora), para não gastar o plano gratuito.

Depois de colar esta versão: rode **sincronizarAgendaCfp** uma vez (leva a agenda na hora) e faça a
**Nova versão** da implantação (passo acima). No projeto, rode `npm run deploy:regras` para liberar a leitura.

## Demandas excluídas antes da limpeza da pasta do CFP

Rode **limparExcluidas** uma vez pelo editor: apaga o que sobrou nas agendas (inclusive a do CFP) e manda a pasta do
CFP para a lixeira do Drive, só das demandas excluídas no portal. O registro mostra o que foi feito em cada uma.

## Aperfeiçoamento → EAP

O motor cuida sozinho do EAP (a cada rodada): cria a cópia zerada de `PLANILHA_EAP_MODELO` na pasta `PASTA_EAP`,
atualiza o cabeçalho quando a P/3 edita, grava o que cada Cia enviou e gera o COMPILADO TURMAS quando pedido.
A conta da P/3 (8bpmmp3@gmail.com) precisa **ver** a planilha modelo e **editar** a pasta do EAP no Drive.
O banco de efetivo agora também guarda **nome completo** e **e-mail** (colunas "NOME COMPLETO"/"NOME" e "E-MAIL"):
rode **sincronizarEfetivo** uma vez depois de colar esta versão.

## Operações → Controle de Operações e Relatório de Indicadores

- **Controle de Operações:** a cada rodada o motor confere a aba **Operações** da planilha do numerador
  (`PLANILHA_OPERACOES`). Quando ela muda, as linhas novas (Operação, OPM, Ordem, Origem, Início, Término,
  coluna H e **Objetivo**) entram no portal. Ele nunca apaga nem muda o que a P/3 editou no portal: só cria o que
  falta e preenche o Objetivo quando ele ainda está vazio no portal. Para trazer tudo na hora, rode
  **sincronizarControleOperacoes**.
- **Relatório:** o botão **Gerar relatório** do portal faz um pedido; o motor gera o Word a partir do modelo
  (`RELATORIO_MODELO`), com as operações do mês (e o Objetivo de cada uma) e as tabelas da planilha de indicadores
  (`PLANILHA_INDICADORES`, aba `ABA_INDICADORES`, faixas `FAIXA_CRIMES` e `FAIXA_PRODUTIVIDADE`), salva na pasta
  `RELATORIO_PASTA` e o link aparece no portal. O texto e o modelo são os mesmos do script "Relatório P/3" do numerador.
- A conta **8bpmmp3@gmail.com** precisa **ver** o modelo do Word e a planilha de indicadores e **editar** a pasta dos
  relatórios. Rode **diagnostico** para conferir (linhas *Modelo do relatório*, *Pasta dos relatórios* e
  *Planilha de indicadores*).

Depois de colar esta versão: rode **sincronizarControleOperacoes** uma vez, **diagnostico**, faça a **Nova versão** da
implantação e, no projeto, `npm run deploy:regras` (libera as coleções novas).

## Operações → Documentos Mensais

- As Cias preenchem pelo portal (menu **Documentos Mensais** de cada Cia) até o Nº dia útil de cada documento.
  O motor grava cada número na célula da Cia, escreve na legenda "Preenchimento do Mês de … - quem preencheu" e
  atualiza o mês do cabeçalho.
- **Segurança:** antes de gravar, o motor confere alguns textos da planilha (cabeçalhos das Cias e dos itens). Se a
  planilha mudou de formato, ele **não grava** e o erro aparece para a P/3 e para a Cia.
- **Arquivo do mês:** "Arquivar e zerar" (ou o primeiro envio do mês seguinte, se ninguém arquivou) guarda uma cópia
  na pasta `PASTA_DOCS_MENSAIS_ARQUIVO`, numa subpasta do mês (ex.: `2026-10 OUT`), e só então zera as células das
  Cias e a legenda.
- **R.R. - Relação de Remessa** (direto na planilha): a Cia abre pelo portal a aba dela na planilha, preenche a lista
  de BOs e toca em **Confirmar preenchimento** (o motor só marca como pronto). Em "Arquivar e zerar" o motor guarda
  a cópia, confere o cabeçalho de cada aba (A13 "Nº de", Q13 "NATUREZA") e só então apaga `B16:Q` nas abas das
  Cias, da FT, da Sede e do M11 (a numeração da coluna A e a formatação ficam) e põe o próximo mês em A6 da aba da 1ª Cia.
  Ela **não** é zerada sozinha no envio do mês seguinte: só quando a P/3 arquiva.
- As células de cada Cia ficam no portal (`src/domain/documentosMensais.ts`); a P/3, ao abrir a aba, publica essa
  configuração para o motor.
- A conta **8bpmmp3@gmail.com** precisa **editar** as planilhas da pasta DOCUMENTOS MENSAIS e a pasta de arquivo.

Depois de colar esta versão: no portal, abra **Operações → Documentos Mensais** uma vez (publica a configuração);
rode **diagnostico** (linha *Documentos Mensais* deve mostrar ✅ em cada planilha); faça a **Nova versão** da
implantação e `npm run deploy:regras`.

## Aperfeiçoamento → ICC

- A P/3 publica cada ICC no portal (número, prazo e o PDF da ordem). O motor cria a planilha **"ICC nº"** como cópia
  do modelo (`PLANILHA_ICC_MODELO`, a ICC 427), na mesma pasta, e zera as colunas das Cias e do EM (D5:K8).
- As Cias baixam a ordem e informam Oficiais, Subten/Sgt e Cb/Sd; o motor grava na coluna da Cia (linhas 5 a 7) e o
  total na linha 8. O EM continua sendo preenchido direto na planilha.
- O PDF fica guardado no próprio banco do portal (em partes), sem precisar do Drive nem de plano pago.
- Rode **diagnostico**: a linha *Modelo da planilha da ICC* deve ficar ✅.

## Publicação automática pelo GitHub (sem copiar e colar)

Depois de configurado, todo merge na `main` que mexer em `apps-script/` envia o **Motor.gs**, o **Logica.gs** e o
**appsscript.json** para o projeto e já faz a **Nova versão** da implantação (a URL continua a mesma).
Acompanhe em GitHub → **Actions → publicar Apps Script** (✅ = publicado).

> Atenção: a publicação deixa o projeto **igual ao GitHub**. Arquivos que só existem no editor (ex.: um
> `Logica.html` criado por engano) são apagados. A propriedade `CHAVE_SERVICO` e os gatilhos não mudam.

Configuração (uma vez só, no computador, com a conta **8bpmmp3@gmail.com**):

1. Abra https://script.google.com/home/usersettings e **ative** a "API do Google Apps Script".
2. No terminal do VS Code (na pasta `portal-p3`): `npx @google/clasp@2.4.2 login` → o navegador abre → entre com
   **8bpmmp3@gmail.com** → **Permitir**. Isso cria o arquivo `.clasprc.json` na sua pasta de usuário
   (Windows: `C:\Users\Admin\.clasprc.json`).
3. No GitHub: repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLASPRC_JSON`: cole o conteúdo inteiro do `.clasprc.json`.
   - `SCRIPT_ID`: no editor do Apps Script, **⚙️ Configurações do projeto → ID do script**.
4. GitHub → **Actions → publicar Apps Script → Run workflow** para a primeira publicação. Depois rode
   **diagnostico** no editor: a linha *Arquivos do script* deve mostrar a versão nova.

O `.clasprc.json` dá acesso à conta: nunca coloque no repositório, só no segredo do GitHub.

## Atalho de e-mail (Aperfeiçoamento → EAP e próximos)

- No portal, **Administrador → Assinaturas de e-mail**: para cada Responsável do numerador, RE (busca no banco de
  efetivo), nome completo e posto/graduação. O portal desenha a assinatura no modelo padrão (cargo pela graduação:
  Cap = Chefe Seção Operacional, Sgt = Encarregado, Cb/Sd = Auxiliar de operações). A do Capitão vai em todos os
  e-mails; a de quem envia, em "Transmitido por".
- Na tela do EAP, **✉️ Montar e-mail** → confere a prévia → **Enviar e-mail**. O portal lança a MSG ELETRÔNICA no
  Numerador (dá o nº), e o motor envia pelo Gmail da P/3 em até 5 minutos, com as assinaturas no corpo e os anexos
  (planilha do EAP em Excel e/ou PDF). Enviado: a demanda fica finalizada e o PDF sai do banco.
- Erro no envio aparece na tela com **Tentar de novo** (mesmo nº, não lança outra demanda).
- Depois de colar o `Motor.gs` novo, faça **Nova versão** da implantação (veja acima).

## Se der erro

- O erro aparece na própria demanda, no bloco **Agenda e pasta**, e em **Execuções** no Apps Script.
- `Falta a propriedade CHAVE_SERVICO`: refaça o passo 4.
- `Firestore 403`: a chave colada não é do projeto `portal-p3`.
- Página do CFP diz que a agenda ainda não foi lida: rode **sincronizarAgendaCfp** e veja o registro. Erros da
  leitura aparecem em **Execuções** começando com `Agenda do CFP:`.
- Relatório com ❌ no portal: a mensagem diz o que faltou (modelo, pasta ou planilha de indicadores sem acesso).
  Erros aparecem em **Execuções** começando com `Relatório:` ou `Controle de Operações:`.
- E-mail encaminhado não apareceu: rode **diagnostico** e veja a linha *E-mails do funcional*. Erros do Gmail
  aparecem em **Execuções** começando com `E-mails:`.

## Atualização: fila do motor (novembro/2026)

Cole de novo o `Motor.gs` e o `Logica.gs` e faça **Implantar → Gerenciar implantações → lápis → Nova versão → Implantar**.
O motor agora põe por último as demandas que já deram erro, para um erro repetido (ex.: limite do Google de apagar
muitos eventos seguidos) não travar as outras. O erro de cada uma aparece em **Administrador → Zerar portal**.

