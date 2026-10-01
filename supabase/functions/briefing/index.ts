// ============================================================
// EDGE FUNCTION: briefing — AGENTE DE PROPOSTA (conversacional)
//
// É o "Claudinho PROPOSTA" dentro do sistema: conversa com o comercial
// de ponta a ponta, com o cardápio, as tabelas de preço e as regras
// REAIS do banco na frente dele — e no fim devolve a proposta montada
// (serviços, cardápio escolhido, quantidades e valores) para o sistema
// gravar. A chave da Anthropic fica aqui (secret), nunca no front.
//
// Duas ações no mesmo endpoint:
//   acao: 'conversar' (padrão) → responde em texto, faz as perguntas do GATE
//   acao: 'finalizar'          → devolve a proposta estruturada (JSON)
//
// Deploy:  npx supabase@latest functions deploy briefing --project-ref <ref>
// Secret:  ANTHROPIC_API_KEY (Project Settings → Edge Functions → Secrets)
// ============================================================

import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ------------------------------------------------------------
// DIRETRIZES — config do Claudinho PROPOSTA (rev. 28/07/2026).
// Em conflito entre regras, vale SEMPRE a revisão mais recente.
// Fonte: modulo-propostas/"2 - CONFIG Claudinho PROPOSTA (completa 28-07).md".
// ------------------------------------------------------------
const DIRETRIZES = `# PIEGGI — AGENTE DE PROPOSTA / ORÇAMENTO

## 0. IDENTIDADE
Você é o assistente de proposta da **Pieggi Catering, Coffee & Eventos** (São Paulo), falando com o
COMERCIAL da casa dentro do sistema interno. Alto padrão (classe AA), PT-BR.

Você **não inventa** preço, cardápio, sabor ou regra: tudo vem dos dados oficiais que estão neste
prompt (cardápio, tabelas de preço, clientes, parâmetros de regra). Faltou informação → PERGUNTE.
Nunca deduza um dado crítico.

**Escopo:** proposta comercial. Você calcula quantidade só para informar o que está contratado.
NÃO gera programação, comanda, expedição, plaquinha, verba nem logística — outras telas fazem isso.
Você também NÃO gera o arquivo .pptx: o sistema monta o slide a partir do que você devolver.

## 1. BASE COMUM
- Nunca inventar item/sabor. Só o cardápio oficial listado abaixo (MAIO2026). Nome REAL do sabor.
- **Proibições:** nunca **atum**. **Wrap de abacate LIBERADO** (Abacate & Tomate, vegano).
  **Red Velvet LIBERADO**.
- **Brioche:** com carne = brioche tradicional; sem carne = **brioche de cenoura** (mesmo que o
  cardápio traga aveia/alecrim — trocar para cenoura, salvo pão específico pedido). Nunca pão francês.
- **Sabor:** manhã leve/salgado, tarde forte/doce. NUNCA repetir a base principal no mesmo dia.
  Conferir cruzado lanches × bebezinhos × verrines × shots × tarteletes.
- **Contraponto:** sempre 1 vegetariano + 1 não-vegetariano.
- **GATE dos 3 dados críticos** (nunca deduzir): PAX exato • HORÁRIO início E fim • ENDEREÇO completo.
- **ENDEREÇO NÃO É SÓ A RUA.** Sempre perguntar também: **andar / sala / auditório**, **como a carga
  entra** (tem doca? qual rua da doca? portaria de serviço? elevador de carga? horário permitido?
  precisa cadastrar placa/motorista antes?) e **com quem a equipe fala ao chegar** (nome e telefone).
  Endereço e horário errados são o erro nº 1 da rua. Se o cliente não souber agora, NÃO trave a
  proposta: registre em "pendencias" como "confirmar no pós-venda: andar / doca / contato no local".
  Cliente com endereço fixo: o acesso de carga fixo vem do cadastro, mas o ANDAR/SALA muda a cada
  evento — pergunte sempre.
- **É na proposta que se pergunta "É na StartSe?"** — as outras fases herdam. Nunca misturar
  StartSe com não-StartSe.
- **"cardápio interno"**: quando o cliente escreve "(interna/interno)", vale o cardápio Pieggi real,
  não o nome comercial dele.
- **Marcas de bebida:** StartSe/Inteli → SEMPRE Pepsi (normal/zero) + Budweiser + água **Minalba**.
  Demais → **Coca-Cola** + **Heineken** + água **Lindóia**. Outra marca só a pedido do cliente
  (avisar). NUNCA refrigerante de 1 L — sempre LATA. Guaraná Antarctica só quando avisado.
  Cerveja 1,5 por pax a cada 2h. Especificar LATA ou LONG NECK.
  Vinho/champagne/bebida diferente → sinalizar como **"bebida extra"**.
- **Arranjo de flores em TODO evento** — incluir como item/observação da proposta.
- **Datas em DD/MM** no texto da conversa.

## 2. GATE DE CONFIRMAÇÃO (a ordem da conversa)
1. **QUAL TABELA DE PREÇO?** ① StartSe/Inteli Atual ② StartSe/Inteli Negociação ③ Externos
   ④ WTC (12% de repasse embutido). Nunca calcular sem tabela, nunca misturar, nunca assumir
   pelo nome do cliente.
2. **PAX** exato. 3. **HORÁRIO** de cada serviço, início E fim (define reposição e o split
   manhã/tarde). 4. **ENDEREÇO** completo + **andar/sala** + **como a carga entra** (doca/portaria)
   + **contato no local**.
Perguntas que travam: Auditório = quantos períodos? • Horário de cada coffee/HH?
Fluxo: tabela → cardápio no chat → restrições → 3 dados → preços → resumo para OK → proposta.

## 3. CÁLCULOS
3.1. Preço = **preço_por_pax × pax**. O imposto JÁ está no preço — nunca somar por cima.
3.2. Combos: Manhã inteira (Welcome+Coffee+Almoço) • Dia inteiro • Treinamento (Coffee+Auditório)
     • Happy Hour (Coquetel+Bar) • Lançamento (Coquetel Premium+Bar).
3.3. **TRAVA DE DESCONTO (CMV)** — nunca citar no slide, só na conversa.
     CMV_result = CMV_base / (1 − X/100). Teto 30%.
     StartSe-Inteli/Externos (base 20%): 0–15% ✅ · 16–30% ⚠️ · 33,3% = teto · 34%+ ❌
     WTC (~22,7%): 0–5% ✅ · 6–20% ⚠️ · 24% = teto · 25%+ ❌
3.4. Equipe fica FORA do escopo: escreva "Equipe — favor consultar Pieggi (a definir)".
3.5. WTC: transparência só interna ("Tabela WTC — 12% repassado, Pieggi líquido R$ X").
     Nunca no slide.
3.6. **REPOSIÇÃO — incide em PREÇO E QUANTIDADE.** Durações base: Welcome 30min • Coffee 1h •
     Coquetel/HH 2h • Brunch/Almoço/Jantar 2h.
     Coffee: +30min → +30% · +1h → +80% · +1h30 → +100% · +2h → +150%.
     Coquetel/HH/Brunch/Almoço/Jantar: +1h → +30% · +1h30 → +60% · +2h → +80%.
     **Welcome NUNCA estende.** Acima de +2h → escalar diretor (não aceitar).
3.7. **Quantidade contratada** (fator geral pax × 1,1):
  - Welcome Executive: pão de queijo 2/pax (0,7 tradicional + 0,3 integral) • petit four salgado
    1/pax • doce 2 sabores (0,5+0,5) • café 50 ml • leite 15 ml • água quente 15 ml.
  - Auditório por período: café 150 ml × pax × períodos • água 1,5 garrafas (60/40).
    Coffee manhã + tarde = 2 períodos.
  - Coffee base: bolo/bebezinho 1,1/pax • suco de laranja 130 ml • chá mate 80 ml • café 100 ml •
    leite 30 ml • água quente 30 ml • salada de frutas 100 g/pax • achocolatado 3 g/pax/período •
    sucrilhos 5 g/pax/período • açúcar + adoçante 1 sachê por dose de 100 ml.
    BASIC: mini lanche pax × 1,5 no total. STANDARD: 1,1/pax + **1 item a mais**.
    EXECUTIVE: 1,1/pax + **2 itens a mais**. MASTER: 1,1/pax + **3 itens a mais + frutas laminadas
    e favo de mel (50 g/pax)**.
    Mini lanche 80% carne + 20% vegetariano. Bolo/bebezinho: 1 sabor a cada 30 pax, máximo 3,
    2 sabores = 50/50, nunca 2 chocolates no mesmo período.
    Itens a mais: manhã salgado / tarde doce; ~50 pax → 50%+50%. Shots são categoria à parte
    (sempre vegano, leite vegetal).
  - Coquetel/HH: BASIC 4 salgados 1,1/pax + kibe. STANDARD 2 mini hambúrgueres + frios/queijos.
    EXECUTIVE 2 hambúrgueres + 3 canapés 1,1/pax + kibe + frios (40% parma, 30% espanhol,
    30% pastrami) + queijos + pasta board 20 g/pax + sueco. MASTER 4 canapés 2,5/pax + burrata
    1/15 pax + frios (30/30/40) + queijos (parmesão, gruyère, gorgonzola, brie, búfala no favo de
    mel) + camafeu 1/pax + favo de mel + frutas laminadas 50 g/pax. PREMIUM 5 canapés 2/pax +
    burrata + massa 150 g/pax + salada 70 g/pax + brie folhado 1/30 pax.
    Dips: guacamole e homus piso 600 g cada até 30 pax; acima disso +12 g/pax homus e
    +15 g/pax guacamole; coalhada 7 g/pax.
    Doce verrine pax × 1,1 (1,65 só com reposição).
    **Recipiente: coffee = copo bolha; HH/brunch/almoço = cup de vidro** — escrever ao lado do sabor.
    Mini hambúrguer acompanha batata frita 20 g/pax • maionese verde 5 g/pax • alface 3 g/pax •
    Heinz 1 de cada a cada 30 pax.
  - Almoço/Jantar (peso pronto): proteína 1 e 2 → 140 g/pax cada (mín. 1 kg) • vegetariano
    100 g/pax (mín. 1 kg) • massa 130 g/pax (mín. 1 kg) + molho 40 g/pax em linha separada •
    arroz 200 g/pax (mín. 1,2 kg) • feijão 300 g/pax • purê 200 g/pax (mín. 1,2 kg).
    Ilha fria em 3 apresentações (190 g/pax): salada 1 folhas 80 g/pax + molho 20 ml; salada 2
    composta 60 g/pax + molho 20 ml; salada 3 tomate-cereja 30 g/pax + cenoura ralada 20 g/pax.
    Sobremesas 120 g/pax (ou 60+60). Frutas laminadas 50 g/pax SEM favo.
    Café final quando pedido: café 50 ml + leite 15 ml + petit four 1/pax + carolina/doce 1/pax.
  - Sucos oficiais (Almoço/HH/Jantar): abacaxi com hortelã • maracujá • laranja com frutas
    vermelhas • melão com limão — 150 ml/pax.
  - Água de coco cotada = chá gelado 80 ml/pax.
3.8. **Inteli:** nunca perguntar se é StartSe; endereço fixo Av. Prof. Almeida Prado, 520; isento de
     logística; restrição vira cortesia de 10 pax; reposição SEMPRE (item sólido pax × 1,1 × 1,6;
     salada de frutas × 1,6); Pepsi + Budweiser + Minalba.

## 4. CARDÁPIO — CUIDADOS
- Não misturar item de um serviço no cardápio de outro (mix de castanhas é coffee; tartelete de
  salmão é coquetel).
- Canapés com a BASE correta: shimeji → tartelete • gorgonzola/pera → tartelete • brie com geleia
  → vol-au-vent • carpaccio/rosbife/salmão → mini torrada.
- VARIAR a sugestão (croissants, tapiocas, tarteletes, verrines, cups, shots, mini lanches, pães de
  queijo, quiches, bolos).
- Divisão de sabores por tamanho: mais de 50 convidados = 2 sabores; mais de 120 = 3 sabores.
- Perfil por período: manhã leve, tarde marcante.

## 5. O QUE VOCÊ NÃO FAZ
Não calcula sem tabela • não mistura tabelas • não inventa preço/sabor/regra • não viola o CMV •
não estende Welcome • não aceita mais de +2h de reposição • não calcula equipe • não usa refri de
1 L • não cita tabela, CMV, margem, WTC, fórmula ou gramatura no material do cliente •
não gera programação, comanda nem plaquinha.

## 6. COMO CONVERSAR
Você está no chat interno com o comercial: seja direto e objetivo, mostre os cálculos e os
checklists, use emojis com moderação (📋 ✅ ⚠️ ❌ 💰 ⏱️ 👨‍🍳).
- Pergunte o que falta em UMA lista única, não em interrogatório de uma pergunta por vez.
- Quando tiver o suficiente, apresente o RESUMO para o comercial dar OK: tabela usada, serviços,
  horários, pax, cardápio sugerido sabor a sabor, preço por serviço e total, alertas de regra.
- Não repita o resumo inteiro a cada mensagem — vá incrementando o que mudou.
- Se o comercial pedir alteração ("troca o sabor", "tira o welcome", "e se fosse Master?"),
  recalcule e mostre a diferença.
- Quando o comercial aprovar, avise que ele pode clicar em **"Gerar proposta"** para o sistema
  criar o evento com tudo o que foi combinado.`

// ------------------------------------------------------------
// Schema da proposta final (structured outputs)
// ------------------------------------------------------------
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'cliente_cadastrado',
    'cliente_nome',
    'evento',
    'contato',
    'pax',
    'endereco',
    'local_detalhe',
    'acesso_carga',
    'preco_a_definir',
    'tabela_sugerida',
    'incluir_institucional',
    'servicos',
    'opcoes',
    'formato_orcamento',
    'orcamento_total',
    'observacoes',
    'restricoes',
    'pedidos_especiais',
    'pendencias',
    'avisos_de_regra',
    'resumo',
  ],
  properties: {
    cliente_cadastrado: {
      type: 'string',
      description:
        'Nome EXATO do cliente cadastrado (lista de clientes acima) quando for um deles. "" se for cliente novo.',
    },
    cliente_nome: {
      type: 'string',
      description: 'Nome do cliente quando NÃO houver cadastro. "" se usar cadastro.',
    },
    evento: { type: 'string', description: 'Nome do evento.' },
    contato: { type: 'string', description: 'Pessoa de contato.' },
    pax: { type: 'integer', description: 'PAX geral do evento. 0 se não informado.' },
    endereco: { type: 'string', description: 'Endereço completo. "" se não informado.' },
    local_detalhe: {
      type: 'string',
      description: 'Andar/sala/auditório/torre/bloco. "" se não informado (e registrar em pendencias).',
    },
    acesso_carga: {
      type: 'string',
      description:
        'Como a carga entra: doca (rua da doca), portaria de serviço, elevador de carga, horário permitido, cadastro de placa. Inclua aqui o contato no local se informado. "" se não informado (e registrar em pendencias).',
    },
    preco_a_definir: {
      type: 'boolean',
      description: 'true quando o cliente ainda não tem preço fechado.',
    },
    tabela_sugerida: {
      type: 'string',
      enum: ['startse_atual', 'startse_negociacao', 'externos', 'wtc', ''],
      description: 'Tabela de preço CONFIRMADA na conversa. "" só se realmente não foi definida.',
    },
    incluir_institucional: {
      type: 'boolean',
      description: 'true quando for cliente novo que ainda não conhece a Pieggi.',
    },
    servicos: {
      type: 'array',
      description: 'Um item por serviço contratado (por dia e período).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'service_type',
          'service_line',
          'dia',
          'periodo',
          'hora_inicio',
          'hora_fim',
          'pax',
          'reposicao_pct',
          'preco_pax',
          'total',
          'itens',
          'obs',
        ],
        properties: {
          service_type: {
            type: 'string',
            enum: [
              'welcome_coffee',
              'coffee_break',
              'auditorio',
              'brunch',
              'coquetel',
              'bar',
              'almoco',
              'jantar',
              'coquetel_pizza',
              'kit',
            ],
          },
          service_line: {
            type: 'string',
            enum: ['basic', 'standard', 'executive', 'master', 'premium', 'pizza', 'cortesia', ''],
          },
          dia: { type: 'string', description: 'Data no formato YYYY-MM-DD. "" se não informada.' },
          periodo: { type: 'string', enum: ['manha', 'tarde', 'noite', ''] },
          hora_inicio: { type: 'string', description: 'HH:MM. "" se não informado.' },
          hora_fim: { type: 'string', description: 'HH:MM. "" se não informado.' },
          pax: { type: 'integer', description: 'PAX deste serviço; 0 = usa o pax do evento.' },
          reposicao_pct: {
            type: 'integer',
            description: 'Percentual de reposição pela §3.6 (0 quando dentro da duração base).',
          },
          preco_pax: {
            type: 'number',
            description: 'Preço por pax da tabela confirmada, JÁ com reposição. 0 se a definir.',
          },
          total: { type: 'number', description: 'preco_pax × pax deste serviço. 0 se a definir.' },
          itens: {
            type: 'array',
            description:
              'Cardápio escolhido para este serviço, sabor a sabor. Use SEMPRE o catalog_item_id do cardápio oficial; descricao_livre só para o que não existe no catálogo (bebidas, estrutura, arranjo de flores).',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['catalog_item_id', 'descricao_livre', 'quantidade', 'unidade'],
              properties: {
                catalog_item_id: {
                  type: 'string',
                  description: 'id do item do cardápio oficial. "" quando for descrição livre.',
                },
                descricao_livre: {
                  type: 'string',
                  description: 'Texto do item quando não houver id. "" quando usar o catálogo.',
                },
                quantidade: { type: 'number', description: 'Quantidade contratada pela §3.7.' },
                unidade: { type: 'string', description: 'un, g, kg, ml, L, garrafa, lata…' },
              },
            },
          },
          obs: { type: 'string', description: 'Observação do serviço (cardápio interno, avisos).' },
        },
      },
    },
    opcoes: {
      type: 'array',
      description:
        'Pacotes comparativos quando o cliente pediu opções. Vazio quando é uma composição só.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'linha'],
        properties: {
          nome: { type: 'string', description: 'Ex.: "Opção 1 · Coffee Break Standard".' },
          linha: {
            type: 'string',
            enum: ['basic', 'standard', 'executive', 'master', 'premium'],
          },
        },
      },
    },
    formato_orcamento: {
      type: 'string',
      enum: ['simples', 'opcoes', 'comparativo'],
      description:
        'simples = uma composição · opcoes = pacotes em linhas separadas · comparativo = colunas lado a lado.',
    },
    orcamento_total: {
      type: 'number',
      description: 'Soma dos totais dos serviços. 0 quando o preço fica a definir.',
    },
    observacoes: {
      type: 'array',
      description:
        'Condições que saem escritas no orçamento (reposição inclusa, equipe a consultar, arranjo de flores, bebida extra…).',
      items: { type: 'string' },
    },
    restricoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'pax', 'critico'],
        properties: {
          tipo: { type: 'string', description: 'Ex.: camarão, lactose, glúten, corante.' },
          pax: { type: 'integer' },
          critico: { type: 'boolean', description: 'true para alergia grave.' },
        },
      },
    },
    pedidos_especiais: {
      type: 'array',
      description: 'Tudo que foge do padrão: +1 copeira, trocar marca de bebida, item específico.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['descricao', 'destino', 'impacto_valor'],
        properties: {
          descricao: { type: 'string' },
          destino: {
            type: 'string',
            enum: ['comercial', 'cozinha', 'expedicao', 'adriana', 'copeiras'],
          },
          impacto_valor: { type: 'number', description: 'Impacto em R$; 0 se não houver.' },
        },
      },
    },
    pendencias: {
      type: 'array',
      description: 'O que ainda falta e trava — perguntar ao cliente. Nunca deduzir.',
      items: { type: 'string' },
    },
    avisos_de_regra: {
      type: 'array',
      description: 'Regras Pieggi violadas ou em risco (item proibido, bebida errada, CMV, +2h…).',
      items: { type: 'string' },
    },
    resumo: { type: 'string', description: 'Resumo de 1–3 frases do que foi fechado.' },
  },
} as const

// ------------------------------------------------------------
// Dados vivos do banco → texto para o prompt
// ------------------------------------------------------------
interface Linha {
  [k: string]: unknown
}

function blocoClientes(clientes: Linha[]): string {
  if (!clientes.length) return '(nenhum cliente cadastrado)'
  return clientes
    .map(
      (c) =>
        `- ${c.nome} (${c.tipo}) — ${c.endereco ?? 'sem endereço fixo'}${c.acesso_carga ? ` · acesso de carga: ${c.acesso_carga}` : ''} · bebidas: ${c.marca_refri} + ${c.marca_cerveja} + água ${c.marca_agua}`
    )
    .join('\n')
}

function blocoPrecos(tabelas: Linha[], itens: Linha[]): string {
  if (!tabelas.length) return '(nenhuma tabela de preço cadastrada — PERGUNTE e não calcule)'
  return tabelas
    .map((t) => {
      const doTabela = itens.filter((i) => i.price_table_id === t.id)
      const linhas = doTabela.length
        ? doTabela
            .map(
              (i) =>
                `    ${i.service_type}${i.service_line ? '/' + i.service_line : ''}${
                  i.variante ? ' (' + i.variante + ')' : ''
                }: R$ ${Number(i.preco_pax).toFixed(2)}/pax`
            )
            .join('\n')
        : '    (sem preços cadastrados nesta tabela)'
      return `  [${t.kind}] ${t.nome}${t.obs ? ' — ' + t.obs : ''}\n${linhas}`
    })
    .join('\n')
}

function blocoCatalogo(itens: Linha[]): string {
  if (!itens.length) return '(catálogo vazio — PERGUNTE, não invente sabor)'
  const porCategoria = new Map<string, Linha[]>()
  for (const i of itens) {
    const c = String(i.categoria)
    if (!porCategoria.has(c)) porCategoria.set(c, [])
    porCategoria.get(c)!.push(i)
  }
  return [...porCategoria]
    .map(([cat, lista]) => {
      const linhas = lista
        .map((i) => {
          const partes = [
            `    ${i.id} · ${i.nome}`,
            i.selo ? `[${i.selo}]` : '',
            i.tier_minimo ? `tier≥${i.tier_minimo}` : '',
            Array.isArray(i.servicos) && i.servicos.length ? `serviços: ${(i.servicos as string[]).join('/')}` : '',
            Array.isArray(i.periodos) && i.periodos.length ? `períodos: ${(i.periodos as string[]).join('/')}` : '',
            i.obs ? `obs: ${i.obs}` : '',
          ].filter(Boolean)
          return partes.join(' · ')
        })
        .join('\n')
      return `  ${cat.toUpperCase()}\n${linhas}`
    })
    .join('\n')
}

function blocoRegras(regras: Linha[]): string {
  if (!regras.length) return '(sem parâmetros cadastrados)'
  return regras
    .map((r) => {
      const valor = JSON.stringify(r.valor)
      const curto = valor.length > 600 ? valor.slice(0, 600) + '…' : valor
      return `- ${r.chave}${r.descricao ? ` — ${r.descricao}` : ''}: ${curto}`
    })
    .join('\n')
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // .trim(): copiar/colar do painel do Supabase costuma trazer espaço ou
    // quebra de linha no fim — a Anthropic devolve 401 e o erro parece "chave
    // inválida" quando na verdade é só o \n grudado no fim.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
    if (!apiKey) {
      return Response.json(
        {
          erro:
            'ANTHROPIC_API_KEY não configurada nesta função. Cadastre o secret no painel ' +
            '(Project Settings → Edge Functions → Secrets) ou rode: ' +
            'supabase secrets set ANTHROPIC_API_KEY=sk-ant-...',
        },
        { status: 500, headers: CORS }
      )
    }
    if (!apiKey.startsWith('sk-ant-')) {
      return Response.json(
        {
          erro:
            'ANTHROPIC_API_KEY existe mas não parece uma chave da Anthropic (toda chave começa ' +
            'com "sk-ant-"). Confira se não colou a chave do Supabase por engano, e cadastre a ' +
            'chave criada em platform.claude.com → API Keys.',
        },
        { status: 500, headers: CORS }
      )
    }

    const body = await req.json()
    const acao: 'conversar' | 'finalizar' = body.acao === 'finalizar' ? 'finalizar' : 'conversar'
    const hoje: string = body.hoje ?? new Date().toISOString().slice(0, 10)

    // Aceita o histórico da conversa; `briefing` (texto solto) continua
    // funcionando como primeira mensagem, para não quebrar chamadas antigas.
    const mensagens: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.mensagens)
      ? body.mensagens
          .filter(
            (m: Linha) =>
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0
          )
          .map((m: Linha) => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }))
      : typeof body.briefing === 'string' && body.briefing.trim()
        ? [{ role: 'user' as const, content: String(body.briefing) }]
        : []

    if (!mensagens.length) {
      return Response.json({ erro: 'Envie o texto do briefing.' }, { status: 400, headers: CORS })
    }
    if (mensagens[0].role !== 'user') {
      return Response.json(
        { erro: 'A conversa precisa começar com uma mensagem do comercial.' },
        { status: 400, headers: CORS }
      )
    }

    // ---- contexto vivo do banco ----
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const [clientesRes, tabelasRes, precosRes, catalogoRes, regrasRes] = await Promise.all([
      supabase
        .from('clients')
        // '*' e não a lista: o acesso_carga (0033) entra sem quebrar se a
        // migration ainda não foi aplicada
        .select('*')
        .eq('ativo', true),
      supabase.from('price_tables').select('id, kind, nome, obs').eq('vigente', true),
      supabase
        .from('price_items')
        .select('price_table_id, service_type, service_line, variante, preco_pax'),
      supabase
        .from('catalog_items')
        .select('id, categoria, nome, selo, tier_minimo, servicos, periodos, obs, proibido')
        .eq('ativo', true)
        .eq('descontinuado', false),
      supabase.from('rule_params').select('chave, descricao, valor'),
    ])

    const catalogo = (catalogoRes.data ?? []).filter((c: Linha) => !c.proibido)

    // ---- system: bloco estável (cacheado) + data de hoje ----
    // A ordem importa: o que não muda vem primeiro, para o cache de prompt
    // valer a conversa inteira. `hoje` vai no fim, fora do trecho cacheado.
    const contexto = `
# DADOS OFICIAIS DA CASA (fonte de verdade — não invente nada fora daqui)

## Clientes cadastrados (endereços fixos — aplicar direto)
${blocoClientes(clientesRes.data ?? [])}

## Tabelas de preço vigentes
${blocoPrecos(tabelasRes.data ?? [], precosRes.data ?? [])}

## Cardápio oficial (use o id ao montar a proposta)
${blocoCatalogo(catalogo)}

## Parâmetros de regra (versionados no banco — valem sobre a memória)
${blocoRegras(regrasRes.data ?? [])}`

    const client = new Anthropic({ apiKey })

    const comum = {
      model: 'claude-opus-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' as const },
      system: [
        {
          type: 'text' as const,
          text: `${DIRETRIZES}\n\n${contexto}`,
          // o prefixo é sempre o mesmo na conversa inteira — cacheia
          cache_control: { type: 'ephemeral' as const },
        },
        { type: 'text' as const, text: `Data de hoje: ${hoje}.` },
      ],
      messages: mensagens,
    }

    // ---------- CONVERSAR ----------
    if (acao === 'conversar') {
      const response = await client.beta.messages.create({
        ...comum,
        max_tokens: 8000,
        output_config: { effort: 'medium' },
      })

      if (response.stop_reason === 'refusal') {
        return Response.json(
          { erro: 'O modelo recusou responder a esta mensagem.' },
          { status: 422, headers: CORS }
        )
      }

      const texto = response.content
        .filter((b: Linha) => b.type === 'text')
        .map((b: Linha) => String(b.text))
        .join('\n')
        .trim()

      if (!texto) {
        return Response.json({ erro: 'Resposta vazia do modelo.' }, { status: 502, headers: CORS })
      }

      return Response.json(
        {
          resposta: texto,
          uso: {
            modelo: response.model,
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
            cache_lido: response.usage.cache_read_input_tokens ?? 0,
          },
        },
        { headers: CORS }
      )
    }

    // ---------- FINALIZAR ----------
    // effort alto: aqui ele fecha números que viram evento, serviços e orçamento.
    const response = await client.beta.messages.create({
      ...comum,
      max_tokens: 16000,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [
        ...mensagens,
        {
          role: 'user' as const,
          content:
            'Feche a proposta com tudo o que combinamos nesta conversa: serviços, horários, ' +
            'cardápio escolhido sabor a sabor (usando os ids do catálogo), quantidades pela §3.7, ' +
            'reposição, preço por pax da tabela confirmada e total. O que ainda faltar entra em ' +
            '"pendencias" — não invente nem deduza.',
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json(
        { erro: 'O modelo recusou fechar esta proposta.' },
        { status: 422, headers: CORS }
      )
    }

    const bloco = response.content.find((b: Linha) => b.type === 'text')
    if (!bloco) {
      return Response.json({ erro: 'Resposta vazia do modelo.' }, { status: 502, headers: CORS })
    }

    return Response.json(
      {
        dados: JSON.parse(String((bloco as Linha).text)),
        uso: {
          modelo: response.model,
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cache_lido: response.usage.cache_read_input_tokens ?? 0,
        },
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error(e)

    // 401/403 da Anthropic é chave errada/revogada/sem crédito — dizer isso,
    // em vez de repassar "invalid x-api-key" cru para o comercial.
    const status = (e as { status?: number })?.status
    if (status === 401) {
      return Response.json(
        {
          erro:
            'A Anthropic recusou a chave (401). A ANTHROPIC_API_KEY está cadastrada, mas é ' +
            'inválida ou foi revogada — gere outra em platform.claude.com → API Keys e ' +
            'atualize o secret da função.',
        },
        { status: 502, headers: CORS }
      )
    }
    if (status === 403 || status === 429) {
      return Response.json(
        {
          erro:
            status === 403
              ? 'A chave da Anthropic não tem permissão para o modelo usado (403) — confira o workspace da chave.'
              : 'Limite de uso da Anthropic atingido (429) — tente de novo em alguns instantes ou confira o crédito da conta.',
        },
        { status: 502, headers: CORS }
      )
    }

    return Response.json(
      { erro: e instanceof Error ? e.message : 'Erro inesperado ao processar o briefing.' },
      { status: 500, headers: CORS }
    )
  }
})
