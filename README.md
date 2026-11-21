# Portal P3

Portal de demandas da P/3 (8º BPM/M): React + Vite + TypeScript, Firebase (Auth + Firestore) e Vercel.

## Pré-requisitos (uma vez só)

- Node.js 22 ou mais novo
- Java 21 (JDK), para os emuladores do Firebase. No Windows: `winget install EclipseAdoptium.Temurin.21.JDK`

## Primeira vez

```bash
npm install
npx playwright install chromium
```

O `npm install` cria o `package-lock.json`. Ele deve ir para o GitHub junto com o resto, porque o CI usa ele.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o portal em http://localhost:5173 ligado ao Firebase real |
| `npm run emuladores` + `npm run dev:emulador` | Portal ligado aos emuladores (dados de teste, nada vai para o banco real) |
| `npm test` | Testes de regra de negócio |
| `npm run test:regras` | Testes das regras de segurança, no emulador |
| `npm run test:e2e` | Testes de ponta a ponta em tela de celular e de computador |
| `npm run test:tudo` | Tudo acima, em sequência |

## Contas e perfis (Fase 1)

São 10 contas: P/3 (`8bpmmp3@gmail.com`), uma por Cia (`8bpmmp3+1cia@gmail.com` … `8bpmmp3+ft@gmail.com`), Sala de Operações (`8bpmmp3+sala@gmail.com`) e CFP (`8bpmmp3+cfp@gmail.com`).
Na tela de login a pessoa só escolhe a unidade e digita a senha. O link de "Esqueci a senha" sempre chega na caixa da P/3.

1. Firebase → Configurações do projeto → **Contas de serviço** → **Gerar nova chave privada**.
2. Salve o arquivo baixado na pasta do projeto com o nome `chave-servico.json` (ele não vai para o GitHub).
3. `npm run usuarios`: cria as contas que faltam, grava o perfil de cada uma e salva as senhas novas em `senhas-iniciais.txt`.
4. Entregue as senhas e **apague** o `senhas-iniciais.txt`.

Trocar a senha de uma Cia: `npm run usuarios -- --nova-senha 1cia`. A Cia é desconectada dos aparelhos.

Publicar as regras de segurança no banco real (depois de `npx firebase login` com a conta 8bpmmp3@gmail.com):
`npm run deploy:regras`.

## Dia de entrar no ar: numeração

Pela aba **🔒 Administrador** (senha própria): em **Numeração**, escolha "Geral" e informe o último número usado no
numerador antigo (2150 → a próxima será a 2151). Pelo terminal também funciona: `npm run contador -- 2150`.

**A partir de 01/01/2027** cada tipo de saída tem a sua sequência, que volta para 001 todo ano sozinha:
`OFÍCIO 8BPMM-001/03/27` (03 = nº da seção, fixo; 27 = ano da data de entrada da demanda). O nº interno continua
único (é o id da demanda) e aparece pequeno na tela de "Demanda registrada". O nº do documento é dado no cadastro e
não muda se a demanda for editada. Vai para as listas, para as Cias e para a coluna "Nº Documento" do backup.

## Numerador das Cias e da Força Tática

Cada Cia/FT tem a aba **Numerador** no menu. É independente: **não distribui** para ninguém, só numera o que a
própria página faz e, se tiver prazo, coloca o evento na **Agenda** da Cia (laranja; fica verde com ✔ ao concluir).

Número no mesmo formato da P/3, com a seção da Cia: `OFÍCIO 8BPMM-001/103/27` (1ª Cia = 103, 2ª = 203 … 6ª = 603,
Força Tática = 703). A sequência é por Cia e por tipo de saída e volta para 001 todo ano (ano da data de entrada).
Contadores em `contadoresCia/{cia}_{ano}_{TIPO}`; demandas em `demandasCia`. Uma Cia não vê o numerador da outra.

## CGP e Sala de Operações das Cias/FT

Cada Cia/FT tem as abas **CGP** e **Sala de Operações** (esta ainda em construção). A Cia administra o CGP, e uma
Cia não vê o CGP da outra.

**Acesso do CGP**: na aba Administrador → Acessos, cadastre o RE com o acesso **CGP de Cia / FT** e escolha a Cia.
Quem entra com esse RE vê **só a página do CGP daquela Cia**: missões e recados (só leitura) e a importação de fotos.
Não envia nem exclui missões (isso é da Cia). Depois de atualizar, cole de novo o **Motor.gs e o Logica.gs** no Apps
Script (o perfil do CGP é gravado na conta pelo motor).

- **Enviar para o CGP**: botão na demanda que a P/3 mandou para a Cia e na demanda do Numerador da Cia. Pede o
  período (de/até, no calendário) e mostra quantos dias são. A mesma demanda só vai uma vez: depois de enviada,
  aparece "✅ Já enviada para o CGP" no lugar do botão (e "✅ CGP" na lista). Para mudar, exclua na aba CGP.
- **CGP → Missões**: o que foi enviado, por dia e as próximas, com **Excluir do CGP**.
- **CGP → Importação de fotos**: sem limite de quantidade; descrição (Operação, Intensificação…), local e
  observação (equipe, local, viatura) obrigatórios; grava quem importou (login) e a data. Baixar e apagar.
- **CGP → Recados**: a Cia escreve para o CGP; os recados aparecem no alto da página do CGP.

Banco: `cgpMissoes`, `recadosCgp`, `fotosCgp` + `fotosCgpDados`.

## Produção diária dos pelotões (Sala de Operações das Cias)

Na aba **Sala de Operações** de cada Cia/FT, cada pelotão lança no fim do turno o que produziu, e o resultado da BCS
entra no do pelotão.

- **Pelotões** (os mesmos do RAC), em turnos de 12x36:
  - Pel A e Pel C trabalham de dia; Pel B e Pel D, de noite.
  - Na Força Tática, Pel A e Pel B trabalham de dia, em dias alternados (lá não tem turno da noite): os turnos sem
    lançamento cobram um lançamento por dia.
  - A Ronda Escolar e a RPM entram no resultado do pelotão (não têm lançamento à parte).
  - O turno da noite usa a data em que começou.
- **Itens** (26): abordagens, prisões, apreensões (drogas por tipo em kg: maconha, cocaína, crack e outras, com o
  total calculado; veículos recuperados (L01); carros e motos apreendidos pela delegacia), trânsito (AIT, AI e carros,
  motos e ciclomotores removidos ao pátio), atendimentos e registros. Os códigos são os mesmos do RAC. O que fica em
  branco conta como zero.
- **Flagrantes de delito**: preencher só em caso de flagrante, com o nº do talão, o nº do BOPC (pode ser completado
  depois) e o dia da ocorrência, para a P/3 colher os dados oficiais do QMO.
- **Conferências** aparecem na hora, mas não impedem salvar. Exemplos: houve presos e nenhuma ocorrência com prisão;
  mais ocorrências com prisão do que presos.
- **Um lançamento por pelotão por dia**. Ao abrir de novo, ele é corrigido. Ficam gravados quem lançou primeiro e quem
  corrigiu por último.
- **Resumo do mês** (na Cia): turnos sem lançamento, totais por pelotão, lançamentos e flagrantes, e a planilha da Cia.
  Os turnos sem lançamento contam a partir do primeiro lançamento de cada Cia.
- **P/3 → Operações → Produtividade**: totais do mês por Cia e do 8º BPM/M, turnos sem lançamento e a planilha do
  Batalhão, com as abas Lançamentos, Por dia, Totais do mês e Flagrantes.

Banco: coleção `producao`, um documento por pelotão por dia (`{cia}_{AAAA-MM-DD}_{pelotão}`). É a base para montar
as outras planilhas e as rotinas de atualização.

## Aba Administrador

Conta própria `8bpmmp3+admin@gmail.com` (criada pelo `npm run usuarios`; trocar a senha: `npm run usuarios -- --nova-senha admin`).
A senha é pedida dentro da aba, a P/3 continua logada, e o Administrador sai ao trocar de aba. As regras do banco só
deixam essa conta **mudar contador** (a P/3 só avança de 1 em 1 ao cadastrar) e **zerar**.

- **Numeração**: mostra os contadores e define o último número usado de qualquer um (geral ou de um tipo no ano).
  Voltar para um número menor pede confirmação.
- Sub-abas: **Numeração**, **Listas do numerador** e **Zerar portal** (trocar de sub-aba não pede a senha de novo).
- **Listas do numerador**: as opções do cadastro de demanda (tipo de saída, categoria, responsável, origem e meio de
  saída), em `config/listas`. Incluir, **retirar** (sai só das demandas novas; as antigas continuam com o item e dá para
  **reativar**) e mudar a ordem (↑ ↓). Itens com 🔒 são usados pelo sistema e não saem (ex.: Operações Policiais,
  ORDEM DE SERVIÇO, SEI). Sem nada gravado, valem as listas de `src/domain/listas.ts`.
- **Zerar portal** (digite ZERAR): etapa 1 apaga os lançamentos e marca as demandas como excluídas, para o motor apagar
  os eventos nas agendas e mandar as pastas do CFP para a lixeira; quando o contador "faltam X" chega a zero, a etapa 2
  apaga as demandas e define o número inicial. Ficam efetivo, contas, configurações e agenda do CFP. O que já foi
  gravado em planilhas do Drive e os relatórios em Word não são desfeitos.

## Agenda e pasta CFP (Apps Script)

Os eventos de Prazo CPA/Cia e a pasta + agenda do CFP + aba Operações são criados por um Apps Script
na conta da P/3, a cada 5 minutos. Instalação em `apps-script/LEIAME.md`.

A página do **CFP** mostra o que está na agenda do CFP (o mesmo script copia a agenda para o portal), não o
histórico das demandas.

## Abas da P/3

- **Demandas Pendentes**: o que chegou e ainda não tem número. Os e-mails encaminhados pela caixa funcional
  (`8bpmmp3@policiamilitar.sp.gov.br`) para o Gmail da P/3 entram sozinhos (Apps Script). SEI (texto colado) e
  Ordem Verbal são lançados pelos botões **+ SEI** e **+ Ordem Verbal**. **Dar destino** abre a demanda nova já
  preenchida; ao salvar, ela ganha número e sai das pendentes.
- **Numerador**: as demandas com número (abertas e concluídas).
- **Excluir demanda**: lixeira 🗑️ ao lado de cada demanda do Numerador, com confirmação. Some do Numerador, das
  Cias e do Checklist Operações; o motor apaga os eventos dela nas agendas (inclusive a do CFP) e manda a pasta do CFP
  para a lixeira do Drive (recuperável por 30 dias). O número não é
  reaproveitado e aparece como "Excluída" no backup.
- **Menu da P/3**: no computador fica fixo na lateral esquerda; no celular é o botão ☰ no canto superior esquerdo,
  que abre a gaveta com as seções (fecha ao escolher, ao tocar fora ou no Esc).
- **Painel**: prazos no topo e, descendo, o **Painel estatístico** (o Dashboard do numerador antigo): total, entraram no
  mês, em aberto, vencem hoje, atrasadas e gráficos por status, mês, responsável, categoria, dia da semana e tipo de saída
  (filtro por ano; lê as demandas do ano uma vez e guarda 10 minutos no aparelho).
- **Campos obrigatórios (todas as páginas)**: têm \* vermelho. Se faltar algum ao salvar/enviar, a página rola até o
  primeiro que falta, põe o cursor nele e o deixa em vermelho com o aviso (`src/ui/Campo.tsx` e `src/lib/levarAoErro.ts`).
- **Checklist Operações / Solicitação de efetivo**: depois de enviada, **✏️ Editar solicitação** (prazo, dados, Cias e
  quantidades) e **⬇️ Baixar efetivo (Excel)** com o que as Cias mandaram (abas Efetivo e Resumo).
- **Tela das Cias se limpa sozinha**: a demanda respondida/finalizada sai da tela da Cia um dia depois do prazo (sem
  prazo: no dia seguinte ao aceite). O que a Cia ainda não respondeu fica, mesmo atrasado. Nada some do Numerador.
- **Aperfeiçoamento → EAP**: a P/3 abre o EAP (mês do EAD e do presencial, período EAD, 3 turmas de Cb/Sd e 2 de
  Subten/Sgt, prazo e vagas por Cia). O motor faz uma cópia zerada da planilha modelo na pasta do EAP, escreve o
  cabeçalho (linhas 4 a 6, títulos e apresentações) e deixa cada turma com as linhas das vagas da Cia. Cada Cia indica o
  efetivo pelo portal (RE puxa graduação, nome completo, e-mail e celular do banco) ou marca "Sem efetivo pendente de
  EAP"; o motor grava na aba da Cia com "Validado por" em H3. A P/3 acompanha, gera o compilado e encerra.
- **Operações → RAC**: a P/3 abre o RAC do **mês de referência** (o de setembro é feito em outubro) com o prazo das
  Cias, muda o prazo, encerra/reabre e acompanha quem enviou. Na página da Cia/FT, aba **RAC**: as mesmas tabelas da
  apresentação, na mesma ordem (comparativo anual, com inconsistências, trimestral, produtividade mensal por pelotão e
  os comparativos de produtividade mensal e anual); cada número é digitado uma vez só. **Real, TOTAL e Var %
  são calculados** (Var % com base zero mostra "—"); mês anterior/trimestral/ano anterior vêm dos RAC já enviados.
  Erro (vazio, inválido, inconsistência maior que o total) impede o envio; aviso (coluna copiada, número diferente do
  RAC já enviado) pede justificativa. Regras em `src/domain/rac.ts`.
  **Prints (7 por Cia)**: 4 painéis "Indicadores Criminais" + 2 mapas de veículo + Painel de Roubos, enviados na
  própria tela (reduzidos no aparelho, ficam em `racPrints`/`racPrintsDados`) e obrigatórios para enviar. Entram **só como
  imagem** nos slides: os números são sempre digitados (a leitura automática dos prints foi retirada por não ser confiável).
- **RAC — apresentação**: a Cia (na tela do RAC) e a P/3 (Operações → RAC, em cada unidade) têm **👁️ Pré-visualizar**
  (os slides na tela) e **⬇️ Baixar apresentação (.pptx)**, gerada no aparelho a partir do modelo da P/3
  (`public/rac/modelo-rac.pptx`, o "Modelo RAC - MES26"): título, tabelas com as cores de Var %, prints encaixados sem
  deformar ("Print não enviado" quando falta). A FT sai com capa e os 4 slides de produtividade. **Excluir**: a P/3
  exclui o RAC de uma unidade (🗑️ na linha) ou do mês inteiro, com confirmação; números e prints saem do banco.
- **RAC — Batalhão e RAC GERAL** (Operações → RAC, em cada mês): o Batalhão é a **soma** dos RAC enviados (crimes das 6
  Cias; produtividade das Cias + FT) — no formato do RAC BTL oficial (sem inconsistências, 4 painéis, Produtividade RPM).
  A P/3 envia os 4 painéis do Batalhão (só imagem) e digita a **Produtividade RPM** (mês
  anterior vem do RAC do Batalhão anterior; TOTAL GERAL em branco = TOTAL anterior + mês). **⬇️ Compilar RAC GERAL**
  gera um .pptx só: 1ª a 6ª Cia, FT (as que enviaram) e o Batalhão; avisa quem ainda não enviou.
- **RAC — fechar o mês** (Operações → RAC → Batalhão e RAC GERAL): **📦 Fechar mês e arquivar no Drive** encerra o mês,
  gera o RAC GERAL e manda em partes para `racArquivo/{mês}`; o motor cria o .pptx na pasta de arquivo
  (`PASTA_RAC_ARQUIVO`), grava o link no mês (✅ com o link, ⏳ enquanto espera, ❌ com o motivo) e apaga do banco o
  arquivo e os prints do mês. Os números ficam como histórico (mês anterior, trimestral e ano anterior dos próximos RAC).
- **Agenda** (abaixo de Aperfeiçoamento): agenda da P/3 dentro do portal, com visões **Dia**, **Semana** e **Mês**
  (‹ › andam um dia/semana/mês; **Hoje** volta; a visão escolhida fica lembrada no aparelho). **+ Novo evento**: título,
  dia inteiro (pode ter vários dias) ou com horário, repetição (todo dia/semana/mês/ano, com "até" opcional), local,
  descrição, cor e o **nº da demanda do Numerador** (opcional; liga o evento à demanda). No Mês, clicar num dia o
  seleciona (no celular os eventos do dia aparecem embaixo da grade) e o duplo clique cria evento de dia inteiro; no
  Dia/Semana, clicar num horário cria o evento naquela hora. Excluir pede confirmação (evento que se repete: "só este
  dia" ou "toda a série"). Fica gravado quem lançou/alterou (login individual). Eventos em `agenda` (só a P/3).
  **Integração com o Numerador** (só leitura, muda-se pela demanda): **Prazo CPA**, **Prazo Cia** e **Início/Término
  Btl** das demandas aparecem sozinhos, com link para abrir a demanda (concluída aparece riscada; excluída some). Na
  tela da demanda, o quadro **📅 Agenda** mostra os eventos ligados a ela e **+ Agendar evento** abre a agenda com o
  evento já ligado. A camada **Agenda do CFP** (desligada no início) mostra a cópia da agenda do CFP. Os botões
  **Mostrar** ligam/desligam cada camada. A agenda do Google (prazos e CFP, pelo motor) continua funcionando igual.
- **CFP**: as mesmas missões que o CFP vê na página dele (da agenda do CFP) e o botão **Recado para o CFP**: o texto
  aparece no alto da página do CFP como **Recado do Cmt do P3** (ficam os 10 mais novos; a P/3 pode apagar).
- **CFP → TDS** (fotos de instrução durante o serviço): na página do CFP, aba **TDS**, cada CFP digita o RE (o banco de
  efetivo completa posto e nome de guerra; se o RE não estiver lá, ele preenche posto/graduação, nome de guerra, nome
  completo e telefone, que ficam salvos no banco e o motor leva para a aba BD Efetivo), a data e o assunto da instrução e
  escolhe até **5 fotos por mês** no álbum do celular. As fotos são reduzidas no próprio celular (JPEG, maior lado 1600 px)
  e ficam no banco (`fotosTds` + `fotosTdsDados`); o limite de 5 é garantido pelas regras de segurança. Na aba **CFP → TDS**
  da P/3: escolhe o mês, vê as miniaturas por CFP, **⬇️ Baixar fotos (.zip)** (uma pasta por CFP) e, depois de baixar,
  **🗑️ Apagar do sistema** (com confirmação).
- **Sala Op.**: o botão **Recado para a Sala**, que funciona igual: aparece no alto da página da Sala de Operações.

## Backup

Na lista de demandas, **Baixar planilha** gera um `.csv` com todas as demandas (colunas do numerador
+ respostas das Cias). Abre no Excel e no Google Planilhas.

## Regra do projeto

Nenhuma parte é dada como pronta sem `npm run test:tudo` passando.

## Banco de dados (Operações → Banco de dados)

Tudo o que o portal guarda, **separado por Cia e por mês**, com um código fixo para cada número (o "indicador"):

| Origem | O que entra | Detalhe guardado |
|---|---|---|
| Produção dos pelotões (Sala de Operações) | todos os itens, somados no mês | por dia, turno e pelotão (coleção `producao`) |
| Flagrantes da produção | total e por natureza da ocorrência, sem BOPC | talão, BOPC, dia e natureza |
| Documentos Mensais | todos os campos (números, textos e listas) | por documento, mês e Cia (`docsMensais`) |
| RAC | crimes do mês e inconsistências (RAC enviado) | por mês e Cia (`racs`) |

- O banco é montado na hora a partir dessas coleções (nada é gravado em dobro). O catálogo fica em
  `src/domain/banco.ts` (`INDICADORES`): planilha nova pedida por escalão superior se adequa a partir dos códigos dele.
- **Histórico que não se apaga**: cada lançamento, correção e exclusão da produção (`producaoHistorico`) e cada envio
  de Documento Mensal (`docsMensaisHistorico`) vira um registro que ninguém altera nem apaga (só a P/3 lê).
- **Baixar banco completo (Excel)**: o banco em linhas (Mês × Cia × indicador), a cobertura de cada mês, o catálogo e
  todos os lançamentos da produção. Serve também de cópia de segurança: baixe todo mês e guarde no Drive.
- A série diária por Cia (`serieDiaria`) é a base do futuro painel estatístico do Batalhão.

Ao publicar mudanças na produção ou nos documentos: **primeiro as regras** (`npm run deploy:regras`), depois o site.
As regras do lançamento da produção estão perto do limite de 1000 expressões do Firestore: cabem menos de 20 itens novos.
