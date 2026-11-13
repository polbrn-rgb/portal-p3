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

## Se der erro

- O erro aparece na própria demanda, no bloco **Agenda e pasta**, e em **Execuções** no Apps Script.
- `Falta a propriedade CHAVE_SERVICO`: refaça o passo 4.
- `Firestore 403`: a chave colada não é do projeto `portal-p3`.
