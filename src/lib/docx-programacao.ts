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

const CONTENT = 10466
const GREY = 'D9D9D9'
const RED_BG = 'FDE8E8'
const YELLOW_BG = 'FFF2CC'

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
  destaque?: 'amarelo' | 'vermelho' | null // amarelo = restrição (vegano/SG/SL); vermelho = alerta
}

export interface ServicoProgramacao {
  titulo: string // "COFFEE BREAK EXECUTIVE — MANHÃ — 09h00–10h00 — 22/07 — 50 PAX"
  linhas: LinhaProgramacao[]
  obsEquipe?: string // tarja amarela
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

function checklistCopeiras(): Table {
  const titulo = (t: string) => p(t, { bold: true })
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
              titulo('CHECKLIST COPEIRAS'),
              p(
                'Fotografar cada mesa montada e enviar ao Luiz (WhatsApp): +55 11 97603-8194. Faltando algo, avisar o Luiz.',
                { bold: true, size: 22 }
              ),
              titulo('MONTAGEM / ENTREGA'),
              linha(
                '☐ Auditório montado — café + águas c/ e s/ gás   ☐ Coffee break manhã montado   ☐ Almoço montado   ☐ Coffee break tarde montado   ☐ Refresqueiras de suco e chá abastecidas   ☐ Acompanhamentos na mesa (açúcar, adoçante, achocolatado, sachê de chá)   ☐ Plaquinhas de alérgicos na mesa   ☐ Itens sem lactose/sem corante separados e identificados'
              ),
              titulo('HIGIENIZAÇÃO / APRESENTAÇÃO'),
              linha(
                '☐ Talheres/pratos/copos/louças sem mancha de detergente   ☐ Álcool 70% em tudo antes de expor   ☐ Limpar bicos (ketchup, maionese, mostarda, azeite, vinagre, pimenta, saleiros)   ☐ Verrines/doces/cupcakes limpos, sem marca de transporte   ☐ Pote de Nescau limpo, seco, sem empedrar   ☐ Escaldar garrafas antes do uso   ☐ Utensílios das restrições separados — evitar contaminação cruzada'
              ),
              titulo('LAVAGEM P/ IR EMBORA'),
              linha(
                '☐ Retirar restos com papel toalha e descartar no lixo antes de lavar travessas/panelas/potes/louças   ☐ Não jogar alimento na pia do cliente'
              ),
            ],
            { w: CONTENT }
          ),
        ],
      }),
    ],
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
      l.destaque === 'amarelo' ? YELLOW_BG : l.destaque === 'vermelho' ? RED_BG : undefined
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

  children.push(checklistCopeiras(), spacer())

  for (const s of d.servicos) {
    children.push(tabelaServico(s, d.restricoes.length > 0), spacer())
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
