# Sistema Pieggi — Plano de Ação

**Objetivo:** unificar os 5 "Claudinhos" (Propostas, Programação, Comandas, Plaquinhas, Compras) em um único sistema web — React + Vite + Supabase — em formato de esteira/wizard, onde cada fase herda os dados da anterior.

**Esteira:** `Proposta → Programação → Comandas → Plaquinhas → Compras`

---

## 1. Análise dos módulos (o que cada um faz e as regras-chave)

### 1.1. Propostas (hoje: .pptx comercial)
- **Entrada:** briefing comercial (cliente, pax, datas, horários, endereço, serviços).
- **Gates obrigatórios:** (1) tabela de preço — StartSe/Inteli Atual · Negociação · Externos · WTC (+12% repasse embutido); (2) PAX exato; (3) horário início+fim; (4) endereço completo. Nunca deduzir, nem para cliente recorrente.
- **Regras de preço:** `subtotal = preço_pax × pax` (imposto já incluso). Reposição por tempo extra incide em preço **e** quantidade pelo mesmo % (tabela: Coffee +30/80/100/150%; Coquetel/Almoço 0/30/60/80%; Welcome nunca estende; >+2h escala diretor). Trava de desconto por CMV (teto 30%; StartSe/Externos teto 33,3%; WTC teto 24%). WTC: repasse de 12% só visível internamente.
- **Regras de cardápio:** só itens oficiais MAIO2026; proibidos (atum, wrap de abacate, red velvet); brioche tradicional p/ carne, cenoura p/ veg; contraponto 1 veg + 1 não-veg; manhã leve/salgado, tarde forte/doce; nunca repetir base no mesmo dia; escalonamento de sabores por pax (>50 = 2 sabores, >120 = 3).
- **Quantidades contratadas:** fator geral pax × 1,1; tabelas específicas por serviço/linha (Welcome, Auditório, Coffee Basic/Standard/Executive/Master, Coquetel Basic→Premium, Almoço/Jantar por item com pisos de produção — 1 kg proteínas/veg/massa, 1,2 kg arroz/purê; ilha fria 3 apresentações = 190 g/pax). Inteli: reposição sempre ×1,6.
- **Bebidas por cliente:** StartSe/Inteli = Pepsi + Budweiser + Minalba; demais = Coca + Heineken; refri sempre lata; Guaraná só com aviso; cerveja 1,5 un/pax por 2h.
- **Saída:** proposta no template oficial `.pptx` (6 slides, texto à esquerda/foto à direita, nunca citar CMV/tabela/margem no slide).

### 1.2. Programação (hoje: .docx operacional para copeiras)
- **Entrada:** orçamento aprovado (no sistema: os serviços da Proposta aprovada).
- **Conteúdo:** tabela única por serviço `QUANTIDADE | RECEITA | ITEM`, com quantidades operacionais (mesmas fórmulas da proposta, mais detalhes: dips com piso 600 g, pães HH por 40 pax, gramaturas por item do almoço — **peso servido apenas**, o cru é da Comanda).
- **Regras de layout:** A4, margem 1,27 cm, Arial ≥12pt, cabeçalho cinza #D9D9D9, 1 serviço inteiro por página, datas DD/MM, checklist copeiras na 1ª página, Auditório sempre na 1ª folha, restrições inline (nunca em bloco), alerta vermelho de contaminação cruzada quando houver alérgicos, tarja amarela para OBS de equipe.
- **Ajuste de pax:** recalcular proporcionalmente sem trocar itens.
- **Saída:** `.docx` "Pieggi Programacao - {contratante} - {evento} - {contato} - {DD-MM-AAAA}".

### 1.3. Comandas (hoje: .docx de produção por estação)
- **Entrada:** programação aprovada + valor do orçamento (para verba 8%).
- **6 comandas, 1 por folha:** Cozinha Quente (bordô) · Cozinha Fria/Garde Manger (terracota) · Confeitaria (azul) · Expedição Alimentação (Beatriz) · Expedição Bebidas/Estrutura/Materiais · Página da Adriana (verde — só fornecedores que o motorista busca + freelancer + verba 8%, nunca o valor do orçamento).
- **Roteamento por estação:** regras extensas (quente = cozido/assado; fria = montagem a frio; confeitaria = doces + pão de batata + croissant + petit four; pão de queijo = congelado direto na Expedição; tapioca salgada = cozinha, doce = confeitaria; fornecedores Letícia/Leal/Luigi/Arosa/Mercado/Rotisseria).
- **Conversão cru × pronto (almoço/jantar):** tabela de fatores (filé ×1,33; frango ×1,25; arroz ×0,33; massa seca ×0,45; purês; etc.), molhos por kg de massa (pomodoro 350 g, bechamel 400 g, pesto 200/350 g) — massa e molho sempre em linhas separadas; massa+molho → parmesão à parte. Sempre mostrar peso pronto **e** cru.
- **Estrutura/expedição por item:** sublinhas ticáveis (EXPEDIÇÃO ✓ / COPEIRAS ✓), copos 1,5/pax quentes, vidro 1,1/pax, pratos 1,2/pax, réchaud 1/2 travessas, gelo 3 kg/25 pax, sachês, 5 caixas etiquetadas, kit saladas, placas elétricas (2 pratos/placa) + cerâmicas coloridas, transformador (exceto StartSe), mesa posta 1,2/pax.
- **Regras StartSe (ponto fixo):** não enviar kit limpeza/uniforme/transformador; gelo só em HH.
- **Finalização:** só pão de queijo/batata congelados assam no local; resto "sai pronto"; linhas vermelhas de finalização por item; amarelo = só restrição (vegano/SG/SL), não vegetariano.
- **Saída:** `.docx` único por evento; multi-dia = produção e Expedição-Alimentação por dia (cabeçalho de DIA bem grande), Bebidas/Estrutura e Adriana consolidadas.

### 1.4. Plaquinhas (hoje: PDF trilíngue para impressão)
- **Entrada:** programação aprovada.
- **Regras:** A4, grade 2×3, dobra 50/50 (conteúdo só na metade de baixo), guias de corte; título = SABOR, subtítulo = categoria (exceção: bebidas invertem); EN/ES no formato `CATEGORIA / sabor`; selos (verde vegetariano/vegano, azul sem lactose, amarelo sem glúten, cinza sem açúcar) — SG/SL/sem açúcar só quando explícito; dedup por dia; agrupamentos (pão de queijo trad+integral juntos, petit fours do dia juntos, cup cake 1 por sabor); itens com rótulo próprio não geram card (água garrafinha, refri, cerveja, vinho, Heinz); cards "CONTÉM {X}" para alérgicos; par "VISITE NOSSO SITE" no fim; dicionário de tradução e sabor→selo.
- **Saída:** PDF `Pieggi Plaquinha - {...}.pdf`.

### 1.5. Compras (hoje: lista consolidada)
- **Entrada:** uma ou várias programações (multi-evento), com filtro de datas.
- **Regras de conversão:** mini brioche = 15 g principal + 10 g muçarela + 10 g ricota; frango em 2 compras (fresco × defumado); tramezzino → fatias ×3/4 → pacotes ÷20; café → garrafas 1,8 L → filtros → pó 50 g/garrafa → pacotes 500 g; açúcar/adoçante 1 sachê/dose de 100 ml; Nescau 3 g/pax/período; sucrilhos 5 g/pax; salada de frutas na receita padrão (mamão/melão/manga/abacaxi 17,5% cada, uva 15%, morango 10%, kiwi 5%); guacamole 50/50 abacate/avocado; homus 80/20 grão-de-bico/tahine; mix de folhas por ingrediente; tábua de queijos 15 g/sabor/pax.
- **Estrutura fixa de 18 seções**, incluindo "Itens básicos que não podem faltar", "Extras especiais", "A classificar" (nunca omitir nada) e "Pontos a confirmar" (nunca estimar).
- **Saída:** consolidado por categoria em kg/L/un/pacotes.

### 1.6. Base comum aos 5 (vira o "core" do sistema)
- Cardápio oficial MAIO2026 como fonte única de verdade (itens, sabores, tiers, períodos, selos, traduções).
- Proibições globais, regra do brioche, contraponto, manhã/tarde, marcas de bebida por cliente, endereços fixos (StartSe CENU / WTC / Inteli), regra "cardápio interno", datas DD/MM, StartSe definido uma vez na Proposta e herdado por todos.
- Padrão de aprovação: **preview → OK explícito → gerar documento** (em toda fase).

---

## 2. O que muda ao virar sistema (ganhos estruturais)

1. **Fim do re-parsing:** hoje cada bot relê PDFs/uploads da fase anterior. No sistema, o dado nasce estruturado no evento e **flui** entre as fases — a Programação herda os serviços da Proposta, a Comanda herda a Programação etc.
2. **Gates viram validação de formulário:** os "3 dados críticos" + tabela de preço são campos obrigatórios; impossível calcular sem eles.
3. **Regras viram dados versionados:** fatores (1,1 / 1,6 / gramaturas / % reposição / conversões cru×pronto) ficam em tabelas editáveis no admin — quando o Bruno mudar uma regra (acontece toda semana, pelo histórico), muda no painel, sem reescrever prompt.
4. **Cálculo determinístico e auditável:** um motor de cálculo único (TypeScript puro, testável) usado por todas as fases — elimina divergência entre bots (ex.: verrine 1,1 × 1,65; almoço 800 g/pax antigo × modelo novo por item).
5. **Consistência de versão de regra:** identifiquei conflitos entre documentos (regras de 16/07 vs 23/07 vs 27/07). O sistema implementa **a versão mais recente (27/07/2026)** e mantém histórico.

**O que deixa de ser automático (decisão consciente):** a "inteligência" de sugerir cardápio (escolher sabores com contraponto, manhã/tarde, sem repetir base) pode ser (a) manual com validação automática das regras, ou (b) assistida por IA (Claude API) numa fase posterior. Recomendo começar com (a): o sistema **valida** as regras (bloqueia atum, avisa repetição de base, exige contraponto) e o comercial escolhe os itens.

---

## 3. Arquitetura proposta

### Stack
| Camada | Tecnologia |
|---|---|
| Front-end | React 18 + Vite + TypeScript, React Router, TanStack Query, Zustand |
| UI | Tailwind CSS + shadcn/ui (tabelas, wizard, formulários) |
| Back-end | Supabase: Postgres (RLS), Auth (e-mail/senha), Storage (documentos gerados), Edge Functions |
| Motor de cálculo | Pacote TS puro `src/engine/` (funções puras + testes Vitest) |
| Geração .docx | Biblioteca `docx` (roda no browser) — Programação e Comandas |
| Geração .pptx | JSZip + edição do XML do template oficial (mesma técnica dos Claudinhos), no browser ou Edge Function |
| Geração PDF | `pdf-lib` — Plaquinhas (grade 2×3, dobra 50/50, selos PNG) |
| Export planilha | SheetJS — lista de Compras em .xlsx |

### Modelo de dados (Supabase / Postgres)
```
clients            — nome, tipo_tabela (startse|inteli|externo|wtc), endereço fixo,
                     marcas de bebida, isenções, regras específicas (ex.: Inteli ×1,6)
price_tables       — 4 tabelas × versões; price_items (serviço, linha, preço/pax)
catalog_items      — cardápio MAIO2026: categoria, item, sabor, tier mínimo, período,
                     selo (veg/vegano/…), traduções EN/ES, base de sabor (p/ regra de
                     repetição), flags (proibido, descontinuado), fornecedor padrão,
                     estação de produção, ficha de compra (principal/gramaturas)
rules              — parâmetros versionados: fatores de qtde, % reposição, gramaturas,
                     pisos de produção, conversões cru×pronto, molhos g/kg, estrutura
                     (copos/pratos/gelo/sachês), CMV/travas
events             — o objeto central: cliente, contato, evento, datas, PAX, horários,
                     endereço, restrições/alérgicos, status da esteira, tabela de preço
event_services     — serviço (tipo, linha, dia, período, horário início/fim, reposição)
service_items      — item do catálogo + quantidade calculada + override manual + motivo
proposals          — versão, preço, desconto, validação CMV, arquivo .pptx
schedules          — programação: snapshot aprovado + arquivo .docx
production_orders  — comandas: roteamento por estação, conversões, verba, .docx
signage_sets       — plaquinhas: cards (título/sub/EN/ES/selo), dedup, PDF
purchase_lists     — consolidado multi-evento, filtro de datas, seções, export
approvals          — quem aprovou cada fase e quando (OK explícito vira botão)
documents          — Storage: todos os arquivos gerados, versionados
profiles           — usuários e papéis (comercial, produção, compras, admin)
```

### A esteira (máquina de estados do evento)
```
rascunho → proposta_em_montagem → proposta_aprovada
        → programacao_em_montagem → programacao_aprovada
        → comandas_geradas → plaquinhas_geradas
        → compras_consolidadas → concluido
```
- Cada fase tem **checklist próprio** (derivado dos checklists dos prompts) e botão de aprovação (registra usuário + data).
- Editar uma fase anterior invalida as posteriores (com aviso e recálculo proporcional — regra do "ajuste de pax").
- Compras é a única fase **multi-evento**: consolida vários eventos aprovados por intervalo de datas.

---

## 4. Fases de implementação

### Fase 0 — Fundação + Dados mestres (pré-requisito de tudo)
- Setup: Vite + React + TS + Tailwind + shadcn/ui + Supabase (projeto, auth, RLS).
- Schema do banco + telas de administração: **clientes, tabelas de preço, catálogo (cardápio MAIO2026), parâmetros de regra**.
- ⚠️ **Maior esforço não-técnico:** os cardápios MAIO2026 são PDFs em imagem e os preços estão em PDFs — precisam ser **digitados/importados e validados pelo Bruno**. Sem esse dado mestre, nenhum módulo funciona.
- Seed inicial: endereços fixos, marcas de bebida, proibições, fatores.

### Fase 1 — Evento + Wizard
- CRUD de evento com o gate dos 3 dados críticos + tabela de preço + restrições.
- Shell da esteira: barra de fases, status, checklists, aprovações, histórico.
- Montagem de serviços (tipo, linha, dia, horário → cálculo automático de reposição).

### Fase 2 — Módulo Propostas
- Montador de cardápio com validação viva das regras (tier, contraponto, manhã/tarde, base repetida, proibidos, escalonamento de sabores por pax).
- Motor de preço: tabela × pax + reposição + desconto com trava CMV (alertas ✅/⚠️/❌) + transparência WTC interna.
- Preview das quantidades contratadas + geração do **.pptx no template oficial**.

### Fase 3 — Módulo Programação
- Herda serviços aprovados → gera tabelas operacionais (QUANTIDADE | RECEITA | ITEM) com as fórmulas por serviço/linha.
- Restrições inline, alerta de contaminação, checklist copeiras, tarja amarela.
- Editor de ajustes (com trilha do que foi alterado) → **.docx** no layout padrão.
- Ajuste de pax proporcional em 1 clique.

### Fase 4 — Módulo Comandas
- Roteamento automático por estação (com fila de "itens ambíguos" para decisão humana — regra "perguntar antes").
- Conversões cru×pronto, molhos, mix de folhas (Saco 1/Saco 2), estrutura/expedição por item, gelo/copos/sachês/caixas, regras StartSe.
- Verba 8% (input do orçamento, nunca exibe o total), campo de saída (servir −3h).
- **.docx** com as 6 comandas, multi-dia por página com cabeçalho de DIA.

### Fase 5 — Módulo Plaquinhas
- Deriva os cards da programação: dedup por dia, agrupamentos, dicionário sabor→selo→tradução (tabela editável), cards CONTÉM, par do site.
- Preview em tela (igual à folha) → **PDF** 2×3 com dobra 50/50 e guias de corte.
- Assets (banner, PG, selos, QR) no Storage.

### Fase 6 — Módulo Compras
- Seleção de eventos + intervalo de datas → consolidação com todas as regras de conversão.
- Seções fixas 1–18, "A classificar" e "Pontos a confirmar" como filas de trabalho.
- Export .xlsx/PDF para o setor de compras.

### Fase 7 — Refinos
- Sugestão de cardápio assistida por IA (Claude API) respeitando as regras.
- Dashboard (eventos da semana, pendências por fase), notificações, relatórios.
- Perfis/permissões finos por setor.

**Ordem recomendada de entrega de valor:** Fases 0→1→3→4 primeiro se a dor maior for operação (Programação+Comanda é o par que o Bruno mais gera em sequência); Fases 0→1→2 primeiro se a dor maior for o comercial. O plano acima segue a ordem da esteira.

---

## 5. Decisões em aberto (confirmar com o Bruno)

1. **Quem usa o sistema?** Só Bruno/Luiz/Andressa ou também produção (Beatriz), Adriana e compras? Define perfis e permissões.
2. **Digitação dos dados mestres:** quem digita/valida cardápio MAIO2026, tabelas de preço e fichas de compra? (Posso estruturar planilhas de importação.)
3. **Template .pptx oficial:** preciso do arquivo `00_Pieggi_Orcamento_Template.pptx` e dos assets (selo PIEGGI-SELO-01.png, banner, selos de restrição, QR) na pasta do projeto.
4. **Sugestão de cardápio:** manual com validação (recomendado p/ v1) ou já com IA?
5. **Conflitos de regra:** vou implementar sempre a revisão mais recente (27/07/2026 — ex.: verrine padrão 1,1; almoço por item; frutas laminadas 50 g/pax). Confirmar se é isso.
6. **Pendências herdadas dos prompts:** dose de café p/ sachês (100 ml — confirmar), Nescau 3 g/pax por período, molhos fora da tabela (funghi já definido 400 g/kg; sugo/bolonhesa pendentes).
