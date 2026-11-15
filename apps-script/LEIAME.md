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
