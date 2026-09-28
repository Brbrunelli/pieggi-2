# Colocar o sistema no ar para o time testar

Estado auditado em **28/09/2026**. Faça na ordem: o passo 1 é bloqueante.

---

## 1. Aplicar as migrations — BLOQUEANTE

**Nada funciona direito antes disto.** As migrations `0021` a `0026` nunca foram
aplicadas. O front já escreve `pipeline = 'frio'` e a trava do banco ainda só aceita
`negociacao/aprovado/perdido` — ou seja, **criar evento novo falha agora**. E as telas de
Contrato, Financeiro, Fiscal e CS apontam para tabelas que não existem.

Abra o editor de SQL:
https://supabase.com/dashboard/project/emdaqguxsroligjmlffr/sql/new

Cole e rode **uma por vez, nesta ordem**, esperando cada uma dizer *Success*:

| # | Arquivo | O que entra |
| --- | --- | --- |
| 1 | `supabase/migrations/0021_funil_contrato.sql` | contrato, papel `financeiro`, trigger da assinatura |
| 2 | `supabase/migrations/0022_financeiro_nf.sql` | NF, contas a receber, cadastro fiscal |
| 3 | `supabase/migrations/0023_cs_cadencia.sql` | cadência de CS + contato do cliente |
| 4 | `supabase/migrations/0024_grupos_fiscais.sql` | grupos fiscais (NCM/alíquotas) |
| 5 | `supabase/migrations/0025_funil_temperatura.sql` | funil Frio/Morno/Quente |
| 6 | `supabase/migrations/0026_cs_nps.sql` | NPS, resposta do cliente, contato avulso |
| 7 | `supabase/migrations/0027_travas_producao.sql` | **fecha a escrita antes de dar login ao time** |

> A `0027` é de segurança e não existia até hoje: a RLS original permitia que **qualquer
> usuário autenticado apagasse qualquer evento** chamando a API. O botão está escondido para
> a cozinha, mas esconder botão não protege dado. Não abra login para o time sem ela.

A ordem importa: cada uma usa função criada pela anterior. Se aparecer
`function ... does not exist`, você pulou uma — volte.

**Confira no fim:** as tabelas `contracts`, `invoices`, `cs_templates` e `tax_groups`
precisam existir. Me avise que eu confiro daqui.

---

## 2. Papéis do time — OBRIGATÓRIO

Todo usuário nasce como **`comercial`**, e comercial **vê todos os valores** (preço, CMV,
margem). Se você criar a cozinha e não trocar o papel, ela vê o seu preço de venda.

1. Crie cada pessoa em **Authentication → Users → Add user** (com senha; sem convite por
   e-mail o acesso já funciona).
2. Rode `supabase/DEFINIR-PAPEL.sql` para cada uma, trocando e-mail e papel:

| Papel | Quem | Vê valores? |
| --- | --- | --- |
| `admin` | você | tudo |
| `comercial` | vendas | sim (preço de venda) |
| `financeiro` | NF e contas a receber | sim + caixa |
| `producao` | cozinha | **não** |
| `compras` | compras | **não** |

3. Confirme com a consulta do fim do arquivo que **o seu usuário está `admin`**. Se
   estiver `producao`, você perde Briefing, preços e financeiro.

---

## 3. Edge Functions

Publicadas hoje: só `briefing`. Publique o resto conforme for usar:

```powershell
npx supabase@latest login   # só na primeira vez
npx supabase@latest functions deploy nota-fiscal        --project-ref emdaqguxsroligjmlffr
npx supabase@latest functions deploy contrato-docusign  --project-ref emdaqguxsroligjmlffr
npx supabase@latest functions deploy agenda             --project-ref emdaqguxsroligjmlffr
```

O aviso *"Docker is not running"* é esperado e não atrapalha.

Secrets (Project Settings → Edge Functions → Secrets):

| Secret | Para quê | Já existe? |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | agente de proposta | ✅ |
| `PLUGNOTAS_TOKEN` | emitir NF (use o de **sandbox**) | ❌ |
| `DOCUSIGN_INTEGRATION_KEY` … (5 secrets) | assinatura — ver `supabase/README.md` | ❌ |

**Sem esses secrets o resto do sistema funciona.** A NF e o DocuSign avisam com mensagem
clara, e o contrato tem "registrar assinatura manual", que libera a operação do mesmo jeito.

---

## 4. Publicar o site

Hoje o sistema só existe em `localhost:5173`, e **cai quando você fecha o terminal** — seu
time não consegue acessar. Vamos pôr num endereço fixo.

Não há git instalado nesta máquina, então usamos o upload direto do Vercel (funciona sem
repositório):

```powershell
npx vercel login
npx vercel --prod
```

Responda às perguntas: **Set up and deploy** → sim · escopo: sua conta · **Link to existing
project?** → não · nome: `pieggi` · diretório: `./` · **Override settings?** → não (o
`vercel.json` já define build e rewrites).

Depois cadastre as variáveis (Project → Settings → Environment Variables) e publique de novo:

| Nome | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://emdaqguxsroligjmlffr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | o mesmo do seu `.env` |

```powershell
npx vercel --prod
```

Duas coisas que o `vercel.json` já resolve: o **rewrite de SPA** (sem ele, recarregar a
página em `/eventos/<id>/programacao` dá 404) e o cache dos assets.

**A chave `anon` no front é normal e segura** — ela é pública por design, e o que protege os
dados é a RLS. O que nunca pode ir para o front é a `service_role`.

---

## 5. Avisar o Supabase do novo endereço

Com o site publicado, em **Authentication → URL Configuration**:

- **Site URL**: a URL do Vercel (ex. `https://pieggi.vercel.app`)
- **Redirect URLs**: adicione a mesma URL

Sem isso, recuperação de senha e confirmação de e-mail mandam a pessoa para `localhost`.

---

## 6. Teste de fumaça (15 min, você antes do time)

Na URL de produção, logado como admin:

- [ ] Login entra e o menu mostra Comercial, Operação, Financeiro e Administração
- [ ] **Briefing**: conversar com o agente e "Gerar proposta"
- [ ] **Funil**: arrastar um card entre Frio → Morno → Quente (é aqui que a falta da
      migration 0025 apareceria)
- [ ] **Contrato**: criar, anexar um PDF, "registrar assinatura manual" → o card deve ir
      para a operação sozinho
- [ ] **Operação**: o evento aparece; alternar QUADRO ↔ LISTA; abrir Programação pelo card
- [ ] **Programação** → aprovar → **Produção** → gerar (.docx + PDF baixam juntos)
- [ ] **Compras**: consolidar e exportar → o evento passa a mostrar "já comprado"
- [ ] **Financeiro**: criar uma nota agrupando 2 eventos, conferir o split produto/serviço
- [ ] **CS**: o cliente aparece com último evento entregue; registrar uma resposta com nota
- [ ] Recarregar a página (F5) numa tela interna — **não pode dar 404 nem tela branca**
- [ ] Abrir no celular

Depois, com um usuário `producao`: **não pode** ver valor em lugar nenhum, nem Briefing,
nem Financeiro.

---

## 7. Volume

Para ver como fica com o mês cheio: `supabase/TESTE-70-EVENTOS.sql` cria 70 eventos com
pendências espalhadas. Todos nascem com `[TESTE]` no nome e a limpeza está comentada no fim
do arquivo. **Rode em um projeto de teste, não na produção** — e se rodar na produção,
apague logo depois.

---

## O que ainda não está pronto

| Item | Situação |
| --- | --- |
| NF de verdade | falta `PLUGNOTAS_TOKEN` e o certificado A1; o ambiente nasce em **homologação** (sem validade fiscal) |
| DocuSign | falta os 5 secrets + o consentimento único; use assinatura manual até lá |
| Minuta do contrato | é anexada à mão; não há gerador de .docx a partir do template |
| Envio automático de CS | a fila abre WhatsApp/e-mail preenchido e registra; não dispara sozinho |
| Git | **não instalado** — sem histórico, qualquer erro de edição é irreversível. É o maior risco operacional do projeto hoje |
| `Comandas.tsx` / `Plaquinhas.tsx` / `Fila.tsx` | sem rota, substituídos por Produção e Operação; ainda no disco porque sem git eu não apago nada |
