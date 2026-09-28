# Supabase — Sistema Pieggi

## Como aplicar as migrations

**Opção A — SQL Editor (mais simples):**
1. Abra o painel do Supabase → **SQL Editor**.
2. Cole e execute os arquivos de `migrations/` **na ordem**:
   1. `0001_schema.sql` — enums, tabelas, triggers, RLS
   2. `0002_storage.sql` — buckets `documentos` (privado) e `assets` (público)
   3. `0003_seed.sql` — parâmetros de regra, clientes fixos, tabelas de preço, glossário
   4. `0004_seed_catalog.sql` — catálogo inicial (conferir com o cardápio MAIO2026)

**Opção B — Supabase CLI:**
```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

## Depois de aplicar

1. **Auth:** em Authentication → Providers, deixe **Email** habilitado.
   Crie o primeiro usuário em Authentication → Users → *Add user* e depois
   rode no SQL Editor para torná-lo admin:
   ```sql
   update public.profiles set role = 'admin' where email = 'bruno@pieggi.com.br';
   ```
2. **Assets:** faça upload no bucket `assets` de:
   - `template-proposta.pptx` (o template oficial `00. Pieggi - Orçamento - Template.pptx`)
   - selos das plaquinhas (`vegetariano.png`, `vegano.png`, `lactose free.png`,
     `gulten free.png`, `sugar free.png` — estão em `modulo-plaquinha/`)
   - logo/selo Pieggi e QR do site
3. **.env do app:** copie `.env.example` para `.env` e preencha
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

## Notificações de eventos travados (Edge Function)

A função `functions/alerta-travados/` detecta eventos 🔴 travados e envia
e-mail (Resend) e/ou WhatsApp (Twilio). Setup:

1. **Aplicar a migration** `0006_notificacoes.sql`.
2. **Implantar a função** (requer [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase functions deploy alerta-travados --no-verify-jwt
   ```
3. **Configurar as secrets** (painel → Edge Functions → Secrets, ou CLI):
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxx          # conta gratuita em resend.com
   supabase secrets set ALERTA_EMAIL_FROM="Sistema Pieggi <alertas@pieggi.com.br>"  # opcional (domínio verificado no Resend)
   # WhatsApp (opcional — conta Twilio com sandbox/número WhatsApp):
   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
   supabase secrets set TWILIO_AUTH_TOKEN=xxxx
   supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```
4. **Agendar** (painel → Edge Functions → alerta-travados → *Schedules*, ou Integrações → Cron):
   sugestão `0 7-19 * * *` (de hora em hora, das 7h às 19h). Alternativa via SQL (pg_cron + pg_net):
   ```sql
   select cron.schedule('alerta-travados-horario', '0 7-19 * * *', $$
     select net.http_post(
       url := 'https://SEU-PROJETO.supabase.co/functions/v1/alerta-travados',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     );
   $$);
   ```
5. **Cadastrar destinatários** no app: Administração → Notificações
   (botão "Testar agora" dispara na hora, ignorando o dedupe diário).

## Briefing com IA (Edge Function `briefing`)

Transforma o texto solto do cliente no evento estruturado, aplicando as regras Pieggi.
Usa **Claude Opus 5** com structured outputs. **A chave da API fica só aqui — nunca no front-end.**

1. **Implantar a função** — sem CLI instalado e sem Docker, use `npx` e passe o projeto
   direto (dispensa `supabase link`, que exige `config.toml` nesta pasta):
   ```powershell
   npx supabase@latest login
   npx supabase@latest functions deploy briefing --project-ref emdaqguxsroligjmlffr
   ```
   O `login` mostra um código de conferência e abre o navegador — confira que é o mesmo
   e autorize. O aviso **"Docker is not running"** no deploy é esperado e não atrapalha:
   Docker só serve para rodar as funções localmente.
2. **Configurar a chave** (console.anthropic.com → API Keys):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
   Sem o CLI instalado, dá para fazer o mesmo pelo painel:
   **Project Settings → Edge Functions → Secrets → Add new secret**,
   com o nome exatamente `ANTHROPIC_API_KEY`.
3. Pronto — a tela **💬 Briefing** do sistema já usa a função.

### Conferir se a função está mesmo no ar

Um texto curto é rejeitado pela validação **depois** das checagens da chave — então essa
resposta prova as duas coisas de uma vez, sem gastar crédito da Anthropic:

```powershell
$anon = (Select-String -Path .env -Pattern '^VITE_SUPABASE_ANON_KEY=(.*)$').Matches.Groups[1].Value.Trim()
Invoke-WebRequest -Uri 'https://emdaqguxsroligjmlffr.supabase.co/functions/v1/briefing' `
  -Method POST -UseBasicParsing -Body '{"briefing":"x"}' `
  -Headers @{ Authorization = "Bearer $anon"; apikey = $anon; 'Content-Type' = 'application/json' }
```

| Resposta | Significado |
| --- | --- |
| `400 {"erro":"Envie o texto do briefing."}` | ✅ função publicada e chave OK |
| `404 {"code":"NOT_FOUND"}` | a função nunca foi publicada — rode o deploy acima |
| `500` com mensagem sobre a chave | função no ar, secret faltando ou errado |

**"Failed to send a request to the Edge Function"** na tela do sistema é a cara do 404:
o navegador não achou a função. Cadastrar o secret não resolve — falta publicar.

### Quando o Briefing reclama da chave

A função distingue os casos — a mensagem que aparece na tela diz qual é:

| Mensagem | O que aconteceu | O que fazer |
| --- | --- | --- |
| "ANTHROPIC_API_KEY não configurada nesta função" | O secret não existe (ou foi cadastrado em outro projeto) | Cadastrar o secret e reimplantar a função |
| "não parece uma chave da Anthropic" | Foi colada outra chave (a anon do Supabase, por exemplo) | Usar a chave de console.anthropic.com — começa com `sk-ant-` |
| "A Anthropic recusou a chave (401)" | O secret existe, mas a chave é inválida ou foi revogada | Gerar outra chave e atualizar o secret |
| "não tem permissão para o modelo (403)" | A chave é de um workspace sem acesso ao Opus 5 | Trocar de chave/workspace |
| "Limite de uso atingido (429)" | Sem crédito ou rate limit | Conferir crédito da conta Anthropic |

O secret é lido a cada execução, mas **depois de cadastrar ou trocar a chave, reimplante a
função** (`supabase functions deploy briefing`) para garantir que a instância em cache suma.
A chave é copiada e colada com frequência: a função já dá `.trim()` nela, então espaço ou
quebra de linha no fim não quebram mais.

**Custo:** ~R$ 0,10–0,30 por briefing analisado (Opus 5: US$5/milhão de tokens de entrada,
US$25/milhão de saída; um briefing típico gasta poucos milhares de tokens).

## Nota fiscal (Edge Function `nota-fiscal`)

Transmite a nota ao **PlugNotas**. Nota mista gera **duas** transmissões — NFS-e para a parte
de serviço e NF-e para a de produto — porque são documentos fiscais diferentes.

```powershell
npx supabase@latest functions deploy nota-fiscal --project-ref emdaqguxsroligjmlffr
```

Secret: **`PLUGNOTAS_TOKEN`**. Comece com o token de **sandbox**.

O ambiente sai de `fiscal_config.plugnotas_ambiente` (Administração → Fiscal), não do secret:
assim dá para trocar sandbox ↔ produção sem republicar a função. Em `homologacao` **nenhuma
nota tem validade fiscal**.

O PlugNotas processa de forma assíncrona: transmitir devolve "aceita", e o número/PDF/XML
chegam depois. Por isso existe a ação **Consultar situação** na tela de Notas — sem ela a nota
ficaria presa em "transmitindo".

Antes de transmitir a função confere CNPJ do emitente, CPF/CNPJ do destinatário e item da
lista de serviço, e recusa listando o que falta. É mais barato falhar aqui do que ser
rejeitado pela prefeitura.

## Contrato no DocuSign (Edge Function `contrato-docusign`)

Um endpoint, duas funções: `POST { contract_id }` cria o envelope e envia; o **webhook** do
DocuSign Connect cai no mesmo endereço e carimba a assinatura.

```powershell
npx supabase@latest functions deploy contrato-docusign --project-ref emdaqguxsroligjmlffr
```

Secrets:

| Secret | Onde achar |
| --- | --- |
| `DOCUSIGN_INTEGRATION_KEY` | Apps and Keys → sua app |
| `DOCUSIGN_USER_ID` | Apps and Keys → **User ID** (não é o e-mail) |
| `DOCUSIGN_ACCOUNT_ID` | Apps and Keys → **API Account ID** |
| `DOCUSIGN_PRIVATE_KEY` | a chave RSA privada gerada na app (PEM inteiro, com as linhas BEGIN/END) |
| `DOCUSIGN_AMBIENTE` | `demo` (padrão) ou `producao` |
| `DOCUSIGN_WEBHOOK_SECRET` | opcional — se preenchido, o webhook é validado |

**Consentimento único:** a autenticação é JWT Grant (integração sem tela de login) e o
DocuSign exige autorizar a app uma vez. Se a primeira tentativa devolver `consent_required`,
a função responde com o **link para autorizar** — abra, autorize e tente de novo.

**Webhook:** no DocuSign, em Connect, aponte para
`https://emdaqguxsroligjmlffr.supabase.co/functions/v1/contrato-docusign` e assine o evento
**Envelope Completed** (vale também incluir Declined e Voided).

Quem move o evento para a operação **não** é esta função: é o trigger
`contrato_assinado_libera_operacao` (migration 0021). Assim a assinatura eletrônica e a
registrada à mão seguem exatamente o mesmo caminho.

A aba de assinatura é posicionada por **âncora de texto**: a minuta precisa conter a frase
`Assinatura do contratante` onde a assinatura deve aparecer.

## Agenda do Google (Edge Function `agenda`)

Quando o cliente aprova a proposta, cada serviço do evento vira um compromisso na
agenda do Google, colorido por tipo de cliente:

| Cliente | Cor | `colorId` |
|---|---|---|
| Externos / sem cadastro | 🟠 Tangerina | 6 |
| StartSe · Inteli · WTC | 🔵 Pavão (azul) | 7 |

As cores são editáveis em **Admin → Parâmetros de regra → `agenda_cores`**
(demais IDs: 5 Banana · 9 Mirtilo · 10 Manjericão · 11 Tomate).

### Setup (uma vez)

1. **Google Cloud** → criar projeto → ativar a **Google Calendar API**.
2. **IAM → Contas de serviço** → criar conta → **Chaves → Adicionar chave → JSON** (baixa o arquivo).
3. **Compartilhar a agenda**: no Google Agenda, abra as configurações do calendário que
   receberá os eventos → *Compartilhar com pessoas específicas* → adicione o
   `client_email` da conta de serviço com permissão **"Fazer alterações nos eventos"**.
4. **Guardar a credencial e implantar:**
   ```bash
   supabase secrets set GOOGLE_SERVICE_ACCOUNT="$(cat caminho/para/conta-servico.json)"
   supabase functions deploy agenda
   ```
5. **Apontar o calendário**: em Admin → Parâmetros de regra → `agenda_config`, troque
   `"calendar_id": "primary"` pelo ID do calendário compartilhado (aparece nas
   configurações do calendário, algo como `xxx@group.calendar.google.com`).

> Uma **conta de serviço** é a forma correta aqui: não expira, não pede login de
> ninguém e só enxerga o calendário que você compartilhou explicitamente.

### Convidados nos compromissos

Todo compromisso convida a equipe (editável em Admin → Parâmetros → `agenda_convidados`):

`pieggieventos@gmail.com` · `administrativo@pieggi.com.br` · `adrianaoliveira120383@gmail.com`
`atendimento@pieggi.com.br` · `bruno@pieggi.com.br` · `luiz@pieggi.com.br`

⚠️ **O Google não deixa uma conta de serviço convidar pessoas sem delegação de domínio.**
Sem o passo abaixo, os compromissos são criados normalmente **mas sem convidados** (o
sistema avisa na tela quando isso acontece).

**Habilitar convidados** (precisa ser admin do Google Workspace da pieggi.com.br):

1. Na conta de serviço (Google Cloud → IAM → Contas de serviço → *Detalhes*), copie o
   **ID único / Client ID** (número longo) e marque *Ativar delegação de todo o domínio*.
2. Admin do Workspace → **Segurança → Controle de acesso e dados → Controles de API →
   Delegação em todo o domínio → Adicionar**:
   - Client ID: o número copiado
   - Escopo: `https://www.googleapis.com/auth/calendar`
3. Diga qual usuário a conta representa (quem "cria" os compromissos):
   ```bash
   supabase secrets set GOOGLE_IMPERSONATE_SUBJECT=atendimento@pieggi.com.br
   supabase functions deploy agenda
   ```

**Convites por e-mail:** enviados na criação do compromisso e silenciados nas
ressincronizações (evita spam). Configurável em `agenda_config`
(`enviar_convite_ao_criar` / `enviar_convite_ao_atualizar`).

## Papéis de usuário

| Papel | Pode |
|---|---|
| `admin` | tudo + editar dados mestres (catálogo, preços, regras, clientes) e usuários |
| `comercial` | eventos, propostas, programações |
| `producao` | comandas, plaquinhas |
| `compras` | listas de compras |

> Nesta primeira versão, todo usuário autenticado lê tudo e escreve nas tabelas
> operacionais; só admin escreve nos dados mestres. Restrições mais finas por
> papel podem ser adicionadas depois nas policies.
