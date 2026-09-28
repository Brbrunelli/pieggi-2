# Sistema Pieggi

Sistema interno da Pieggi Catering que unifica os 5 módulos (Propostas, Programação,
Comandas, Plaquinhas, Compras) em uma esteira única por evento.

**Stack:** React 18 + Vite + TypeScript + Tailwind CSS 4 + Supabase (Auth, Postgres, Storage).

## Rodando localmente

```bash
npm install
copy .env.example .env   # preencher com URL e anon key do Supabase
npm run dev
```

## Módulos

| Módulo | Telas | Para quem |
|---|---|---|
| 📊 **Painel** | Funil comercial + filas + travados | Direção |
| 💼 **Comercial** | 💬 Briefing · 🗂 Pipeline (Kanban) | Comercial |
| 🛠 **Operação** | 📋 Programação · 🔥 Comandas · 🏷 Plaquinhas · 🛒 Compras | Produção / expedição / compras |
| ⚙️ **Administração** | Clientes · Catálogo · Preços · Parâmetros · Notificações | Admin |

Cada tela da Operação é uma **fila de trabalho**: lista os eventos com contrato
assinado, a situação daquela fase (não iniciada / em montagem / aprovada), ordena
por urgência e destaca em vermelho quem entrou no prazo limite
(Programação 4 dias · Comandas 2 · Plaquinhas 1).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `supabase/migrations/` | Schema, storage, seeds — aplicar na ordem (ver `supabase/README.md`) |
| `src/engine/` | Motor de cálculo: reposição, preço, CMV, quantidades, conversões cru×pronto |
| `src/pages/eventos/` | Eventos + wizard da esteira (Proposta → … → Compras) |
| `src/pages/admin/` | Dados mestres: clientes, catálogo, tabelas de preço, parâmetros de regra |
| `modulo-*/` | Documentos-fonte das regras de negócio (referência — não fazem parte do app) |
| `PLANO-DE-ACAO.md` | Plano completo de fases e análise das regras |

## Status das fases

- ✅ **Fase 0** — Fundação: scaffold, migrations, seeds, auth, admin de dados mestres
- ✅ **Fase 1** — Eventos + wizard (gate dos dados críticos, serviços com reposição automática)
- ✅ **Fase 2** — Propostas: montador de cardápio com validações (contraponto, base repetida,
  escalonamento), preço com trava CMV e repasse WTC interno, preview de quantidades e
  geração do **.pptx editando o template oficial** (requer `assets/template-proposta.pptx` no Storage)
- ✅ **Fase 3** — Programação: linhas geradas do cardápio + regras (mini lanches 80/20,
  bebezinhos 50/50, engine de quantidades), editáveis na tela, tarja amarela de OBS,
  banner de restrições/contaminação + linha "sem lactose", geração do **.docx** no layout
  padrão (A4, Arial 12+, QUANTIDADE|RECEITA|ITEM, checklist copeiras, Auditório na 1ª folha)
- ✅ **Fase 4** — Comandas: roteamento automático por estação (catálogo + heurística, fila
  "a rotear" para ambíguos), estrutura de expedição calculada (copos/pratos/sachês/gelo/
  placas elétricas/kit saladas/5 caixas/StartSe ponto fixo), verba 8%, saída servir −3h,
  **.docx de 6 comandas** com cores por estação, banner MOTORISTAS, multi-dia com
  cabeçalho de DIA grande e Bebidas/Adriana consolidadas
- ✅ **Fase 5** — Plaquinhas: cards derivados da programação (dedup, agrupamentos, bebidas
  padrão, cards CONTÉM p/ alérgicos), lista editável com aprovação, **PDF** A4 2×3 com
  dobra 50/50, guias de corte, selos e par "VISITE NOSSO SITE"
- ✅ **Fase 6** — Compras: consolidação multi-evento com filtro de datas (brioche 15/10/10,
  café→garrafas→pó→pacotes, salada de frutas receita padrão, tramezzino, Letícia,
  "A classificar" nunca omite), export **.xlsx** e registro em `purchase_lists`

### Pipeline comercial (Kanban — aba Eventos)

`❄️ Frio → 🌤 Morno → 🔥 Quente → ✍️ Contrato p/ Assinatura → ✅ Contrato Assinado`

Arraste o card para mudar a etapa. Cada coluna soma o valor em negociação.
Há ainda a zona **🗑 Perdidos** e uma visão em **Lista** alternativa.

**Soltar em "Contrato Assinado"** dá o evento como fechado:
aprova a proposta · registra o OK em `approvals` · **libera Programação, Comandas e
Plaquinhas** (travadas até então, inclusive por acesso direto à URL) · publica os
serviços na agenda do Google. Tirar de lá volta a travar e remove da agenda.

### Proposta — cardápio e orçamento

- **Cardápio montado pelo sistema** (`src/engine/cardapio.ts`): contraponto, manhã/tarde,
  base de sabor não repetida no dia, escalonamento por pax, tier, proibidos fora.
  Botão "🎲 outra combinação" re-sorteia; cada item pode ser trocado ou removido.
- **No slide**, no formato das propostas reais: grupo + total + sabores com quantidade —
  `Mini lanches artesanais · 34 unidades` / `Peito de peru (27) — mini brioche, pasta…`
- **Um slide de cardápio por serviço** (manhã num, tarde noutro) ou **por opção**
- **Orçamento com quantas linhas precisar** (a tabela do template é clonada): serviços,
  adicionais, logística, taxa, cortesia de restrição, observações e totais
- **Totais sem desconto / com desconto** quando há desconto aplicado
- **Opções A/B/C** — pacotes comparativos (Basic/Standard/Master), cada um com preço,
  cardápio e slide próprios; com opções o Total Geral sai "R$ a definir"

### Fluxo comercial

`Em montagem → 📤 Enviada (pendente do cliente) → ✅ Aprovada | ❌ Recusada`

- A proposta continua **editável** enquanto não for aprovada (montagem e pendente)
- Ao aprovar, a esteira avança **e** os serviços sobem na agenda do Google
  (🟠 tangerina = Externos · 🔵 azul = StartSe/Inteli/WTC)
- **Reabrir** destrava a edição e remove os compromissos da agenda até a nova aprovação
- Pendentes com evento próximo aparecem em 🔴 Travados no painel gerencial

### Camada de gestão e qualidade

- **Dashboard CEO** — funil da esteira com todos os eventos, seção "🔴 Travados — resolver hoje",
  alertas por prazo (Proposta ≤7d, Programação ≤4d, Comandas ≤2d, Plaquinhas ≤1d) e pendências
- **Pedidos especiais (trava tática)** — todo pedido fora do padrão do cliente é registrado no
  evento e **bloqueia a aprovação de cada fase** até ser verificado nela (migration 0005)
- **🎨 Estúdio** — modo criativo de propostas restrito a admin: itens livres fora de catálogo,
  custo + CMV ao vivo, precificação por CMV-alvo; o módulo Propostas oficial permanece rígido
- **Conferência final da Proposta** — checklist automático (tabela, pax, endereço, horários,
  preços, CMV, pedidos, cardápio) que bloqueia aprovação nos itens críticos
- **Preview de designer nas Plaquinhas** — QA visual dos cards (dobra 50/50, selos, legibilidade)
  antes de gerar o PDF

## Assets a subir no bucket `assets` do Supabase

| Arquivo | Uso |
|---|---|
| `template-proposta.pptx` | template oficial da proposta (obrigatório p/ gerar .pptx) |
| `selo-vegetariano.png`, `selo-vegano.png`, `selo-sem-lactose.png`, `selo-sem-gluten.png`, `selo-sem-acucar.png` | selos oficiais das plaquinhas (senão o PDF desenha selos genéricos) |
| `qr-site.png` | QR do pieggi.com.br no par "VISITE NOSSO SITE" |
