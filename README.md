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
