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
3. Em `Motor.gs`, troque `COLE_AQUI_O_ID_DA_PLANILHA_DO_NUMERADOR` pelo ID da planilha que tem a aba
   **Operações** (o trecho do link entre `/d/` e `/edit`).
4. **Configurações do projeto → Propriedades do script → Adicionar propriedade**:
   - Propriedade: `CHAVE_SERVICO`
   - Valor: o conteúdo inteiro do arquivo `chave-servico.json` (abra no Bloco de Notas, copie tudo e cole).
5. No editor, escolha a função **instalarAutomacao** e clique em **Executar**. Autorize o acesso
   (Agenda, Drive, Planilhas). No **Registro de execução** deve aparecer `Conexão OK`.

Pronto: a partir daí ele roda sozinho a cada 5 minutos. No portal, dentro da demanda, o bloco
**Agenda e pasta** mostra ⏳ enquanto espera e ✅ quando o evento foi criado, com o botão **Abrir pasta CFP**.

## Se der erro

- O erro aparece na própria demanda, no bloco **Agenda e pasta**, e em **Execuções** no Apps Script.
- `Falta a propriedade CHAVE_SERVICO`: refaça o passo 4.
- `Firestore 403`: a chave colada não é do projeto `portal-p3`.
