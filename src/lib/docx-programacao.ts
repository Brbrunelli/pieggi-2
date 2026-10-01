// ============================================================
// GERAÇÃO DA PROGRAMAÇÃO OPERACIONAL (.docx)
// Layout padrão Pieggi:
//   A4 (11906×16838 DXA) · margem estreita 720 DXA · Arial ≥12pt
//   Cabeçalhos cinza #D9D9D9 (nunca preto/branco — economia de tinta)
//   Tabela única por serviço: QUANTIDADE | RECEITA | ITEM [1700, 6366, 2400]
//   Bloco de dados [2900, 7566] · datas DD/MM · serviço inteiro por página
//   1ª página: dados + CHECKLIST COPEIRAS + Auditório sempre primeiro
//   Restrições → banner vermelho + linha "Opção sem lactose" em todo serviço
// ============================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import type { Restricao } from '@/types'
import {
  CHECKLIST_COPEIRAS,
  LEGENDA_LINHAS,
  LUIZ_WHATSAPP,
  TERMO_ACEITE,
  TERMO_TEXTO,
  TERMO_TITULO,
} from './copeiras'

const CONTENT = 10466
const GREY = 'D9D9D9'
const RED_BG = 'FDE8E8'
const YELLOW_BG = 'FFF2CC'
const BLUE_BG = 'DEEAF6' // linha azul = cuidado de serviço (rev. 24/09)

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
}

export interface LinhaProgramacao {
  qtd: string
  receita: string
  item: string
  // rev. 24/09 (Claudinho): amarelo = finalizar no local · azul = cuidado de serviço ·
  // vermelho = restrição (vegano/SG/SL) e alerta
  destaque?: 'amarelo' | 'vermelho' | 'azul' | null
}

export interface ServicoProgramacao {
  titulo: string // "COFFEE BREAK EXECUTIVE — MANHÃ — 09h00–10h00 — 22/07 — 50 PAX"
  linhas: LinhaProgramacao[]
  obsEquipe?: string // tarja amarela
  /** ISO — separa o documento por dia. Sem dia = vale para o evento todo (vai no fim) */
  dia?: string
}

export interface DadosProgramacao {
  contratante: string
  evento: string
  contato: string
  data: string // DD/MM ou intervalo
  pax: string
  horario: string
  endereco: string
  local?: string
  obs?: string
  restricoes: Restricao[]
  servicos: ServicoProgramacao[] // Auditório deve vir primeiro (ordenado pelo chamador)
}

// fonte Arial 12pt = size 24 (half-points)
function run(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    italics: opts.italics ?? false,
    color: opts.color ?? '000000',
    size: opts.size ?? 24,
    font: 'Arial',
  })
}

function p(
  text: string,
  opts: { bold?: boolean; italics?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: 0, after: 0 },
    children: [run(text, opts)],
  })
}

function cell(
  children: Paragraph[],
  opts: { w: number; shade?: string; span?: number } = { w: CONTENT }
) {
  return new TableCell({
    width: { size: opts.w, type: WidthType.DXA },
    columnSpan: opts.span,
    shading: opts.shade
      ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shade }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children,
  })
}

function spacer() {
  return new Paragraph({ spacing: { after: 140 }, children: [] })
}

// ------------------------------------------------------------
// Blocos
// ------------------------------------------------------------

function blocoDados(d: DadosProgramacao): Table {
  const linhas: [string, string][] = [
    ['CONTRATANTE', d.contratante],
    ['EVENTO', d.evento],
    ['CONTATO', d.contato],
    ['DATA', d.data],
    ['PAX', d.pax],
    ['HORÁRIO', d.horario],
    ['ENDEREÇO', d.endereco + (d.local ? ` — ${d.local}` : '')],
  ]
  if (d.obs) linhas.push(['OBS', d.obs])

  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [2900, 7566],
    borders: BORDERS,
    rows: linhas.map(
      ([k, v]) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell([p(k, { bold: true })], { w: 2900, shade: GREY }),
            cell([p(v)], { w: 7566 }),
          ],
        })
    ),
  })
}

function bannerRestricoes(restricoes: Restricao[]): Table {
  const lista = restricoes
    .map((r) => `${r.tipo} (${r.pax} pax${r.critico ? ' — CRÍTICO' : ''})`)
    .join(' · ')
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              p('⚠ ALERTA — RESTRIÇÕES / CONTAMINAÇÃO CRUZADA', {
                bold: true,
                color: 'C00000',
              }),
              p(`Restrições identificadas: ${lista}`, { color: 'C00000' }),
              p(
                'Plaquinhas de alérgicos na mesa · itens de cortesia separados e identificados · utensílios das restrições separados — evitar contaminação cruzada.',
                { color: 'C00000', size: 22 }
              ),
            ],
            { w: CONTENT, shade: RED_BG }
          ),
        ],
      }),
    ],
  })
}

// Checklist e termo vêm de lib/copeiras.ts — o MESMO texto da tela da rua.
function checklistCopeiras(): Table {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell([p('CHECKLIST — COPEIRAS', { bold: true })], { w: CONTENT, shade: GREY }),
        ],
      }),
      ...CHECKLIST_COPEIRAS.map(
        (i) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell([p(`☐ ${i.texto}`, { size: 22, bold: i.destaque })], {
                w: CONTENT,
                shade: i.destaque ? 'FFEB00' : undefined,
              }),
            ],
          })
      ),
    ],
  })
}

/** A legenda das cores, logo abaixo do checklist — como no padrão do Claudinho. */
function legendaLinhas(): Table {
  const fundo = { amarelo: YELLOW_BG, azul: BLUE_BG, vermelho: RED_BG }
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: BORDERS,
    rows: LEGENDA_LINHAS.map(
      (l) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(
              [
                new Paragraph({
                  spacing: { before: 0, after: 0 },
                  children: [run(`${l.titulo} `, { bold: true, size: 22 }), run(l.texto, { size: 22 })],
                }),
              ],
              { w: CONTENT, shade: fundo[l.cor] }
            ),
          ],
        })
    ),
  })
}

/** Termo em branco, um por dia — a copeira preenche, colhe a assinatura e fotografa. */
function termoEntrega(d: DadosProgramacao, diaTxt: string): Table {
  const linha = (t: string) => p(t, { size: 22 })
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              p(TERMO_TITULO, { bold: true, align: AlignmentType.CENTER }),
              p('Pieggi Catering', { bold: true, align: AlignmentType.CENTER, size: 22 }),
              linha(`Cliente: ${d.contratante}`),
              linha(`Evento: ${d.evento}`),
              linha(`Data do evento: ${diaTxt}        Horário: __________`),
              linha('Data da entrega: ____/____/______        Horário: __________'),
              linha('O que está sendo entregue: ______________________________________________'),
              linha('______________________________________________________________________'),
              ...TERMO_TEXTO.map((t) => linha(t)),
              p(TERMO_ACEITE, { bold: true, size: 22 }),
              linha('Nome: ______________________________________________'),
              linha('Documento ou telefone: __________________'),
              linha('Assinatura: ______________________________________________'),
              linha('Entregue por (Pieggi): ______________________________________________'),
              p(`Copeira: fotografar este termo preenchido e enviar ao Luiz — WhatsApp ${LUIZ_WHATSAPP}.`, {
                italics: true,
                size: 20,
              }),
            ],
            { w: CONTENT }
          ),
        ],
      }),
    ],
  })
}

/** "DIA 1 — 29/09" em página nova, para o evento de vários dias sair separado. */
function cabecalhoDia(n: number, diaISO: string): Paragraph {
  const [, m, dd] = diaISO.split('-')
  return new Paragraph({
    pageBreakBefore: n > 1,
    spacing: { after: 140 },
    children: [run(`DIA ${n} — ${dd}/${m}`, { bold: true, size: 32 })],
  })
}

function tabelaServico(s: ServicoProgramacao, temRestricoes: boolean): Table {
  const cw = [1700, 6366, 2400]

  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: [
        cell([p(s.titulo, { bold: true, align: AlignmentType.CENTER })], {
          w: CONTENT,
          span: 3,
          shade: GREY,
        }),
      ],
    }),
    new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: [
        cell([p('QUANTIDADE', { bold: true })], { w: cw[0], shade: GREY }),
        cell([p('RECEITA', { bold: true })], { w: cw[1], shade: GREY }),
        cell([p('ITEM', { bold: true })], { w: cw[2], shade: GREY }),
      ],
    }),
  ]

  if (s.obsEquipe) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([p(`OBS EQUIPE: ${s.obsEquipe}`, { bold: true })], {
            w: CONTENT,
            span: 3,
            shade: 'FFEB00',
          }),
        ],
      })
    )
  }

  for (const l of s.linhas) {
    const shade =
      l.destaque === 'amarelo' ? YELLOW_BG : l.destaque === 'vermelho' ? RED_BG : l.destaque === 'azul' ? BLUE_BG : undefined
    const cor = l.destaque === 'vermelho' ? 'C00000' : '000000'
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([p(l.qtd, { align: AlignmentType.CENTER, color: cor })], { w: cw[0], shade }),
          cell([p(l.receita, { color: cor })], { w: cw[1], shade }),
          cell([p(l.item, { bold: true, color: cor })], { w: cw[2], shade }),
        ],
      })
    )
  }

  // Linha em branco p/ restrição — preencher à mão (obrigatória quando há restrições)
  if (temRestricoes) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([p('______')], { w: cw[0], shade: YELLOW_BG }),
          cell([p('Opção sem lactose (preencher à mão): ______________________')], {
            w: cw[1],
            shade: YELLOW_BG,
          }),
          cell([p('Restrição', { bold: true })], { w: cw[2], shade: YELLOW_BG }),
        ],
      })
    )
  }

  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: cw,
    borders: BORDERS,
    rows,
  })
}

// ------------------------------------------------------------
// Documento
// ------------------------------------------------------------

export async function gerarProgramacaoDocx(d: DadosProgramacao): Promise<Blob> {
  const children: (Paragraph | Table)[] = []

  // Cabeçalho — wordmark em texto (o logo oficial pode ser adicionado depois via asset)
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      children: [run('PIEGGI', { bold: true, size: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [run('CATERING · COFFEE & EVENTOS', { size: 16, color: '666666' })],
    }),
    p('PROGRAMAÇÃO OPERACIONAL', { bold: true, size: 28 }),
    spacer(),
    blocoDados(d),
    spacer()
  )

  if (d.restricoes.length > 0) {
    children.push(bannerRestricoes(d.restricoes), spacer())
  }

  // Um bloco por dia: cada dia vai para um local/uma equipe e precisa
  // do próprio checklist e do próprio termo de sobras (rev. 24/09).
  const dias = Array.from(new Set(d.servicos.map((s) => s.dia).filter((x): x is string => Boolean(x)))).sort()
  const temRestricoes = d.restricoes.length > 0

  if (dias.length <= 1) {
    const diaTxt = dias[0] ? dias[0].split('-').reverse().join('/') : d.data
    children.push(checklistCopeiras(), spacer(), legendaLinhas(), spacer(), termoEntrega(d, diaTxt), spacer())
    for (const s of d.servicos) children.push(tabelaServico(s, temRestricoes), spacer())
  } else {
    dias.forEach((dia, i) => {
      children.push(
        cabecalhoDia(i + 1, dia),
        checklistCopeiras(),
        spacer(),
        legendaLinhas(),
        spacer(),
        termoEntrega(d, dia.split('-').reverse().join('/')),
        spacer()
      )
      for (const s of d.servicos.filter((x) => x.dia === dia))
        children.push(tabelaServico(s, temRestricoes), spacer())
    })
    // o que vale para o evento inteiro (estrutura, marcas de bebida)
    for (const s of d.servicos.filter((x) => !x.dia)) children.push(tabelaServico(s, temRestricoes), spacer())
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 24 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBlob(doc)
}
