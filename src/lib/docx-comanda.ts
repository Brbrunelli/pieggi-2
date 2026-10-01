// ============================================================
// GERAÇÃO DAS COMANDAS DE PRODUÇÃO (.docx) — 6 comandas, 1 por folha
//   1. PRODUÇÃO — COZINHA QUENTE            bordô   #800020
//   2. PRODUÇÃO — COZINHA FRIA/GARDE MANGER terracota #B45309
//   3. PRODUÇÃO — CONFEITARIA               azul    #1F4E79
//   4. EXPEDIÇÃO — ALIMENTAÇÃO (Beatriz)    slate   #595959 + banner MOTORISTAS
//   5. EXPEDIÇÃO — BEBIDAS/ESTRUTURA        slate   #595959 + banner MOTORISTAS
//   6. LOCAÇÕES EXTRAS / ADRIANA            verde   #2E7D32 (sem banner)
// Multi-dia: produção + Alimentação POR DIA (cabeçalho de DIA bem grande);
// Bebidas/Estrutura e Adriana consolidadas no fim.
// Estação sem item → página omitida. Campo amarelo de saída em todas
// menos a verde. Datas DD/MM/AAAA. Arial ≥12pt. Cabeçalho fundo branco.
// ============================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageBreak,
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
const AMBER = 'FFF2CC'
const YELLOW = 'FFEB00'
const RED_BG = 'FDE8E8'
const BLUE_BG = 'DEEAF6' // linha azul = cuidado de serviço (rev. 24/09)

const CORES = {
  quente: '800020',
  fria: 'B45309',
  confeitaria: '1F4E79',
  expedicao: '595959',
  adriana: '2E7D32',
}

export interface ComandaLinha {
  qtd: string
  receita: string
  item: string
  destaque?: 'amarelo' | 'vermelho' | 'azul' | null
}

export interface AlimentacaoDia {
  congelado: ComandaLinha[]
  producao: ComandaLinha[]
  insumos: ComandaLinha[]
  adicionais: ComandaLinha[] // âmbar — comprados prontos
}

export interface ComandaDia {
  diaISO: string // yyyy-mm-dd
  saida: string // "05h00 (conferir Adriana)"
  quente: ComandaLinha[]
  fria: ComandaLinha[]
  confeitaria: ComandaLinha[]
  alimentacao: AlimentacaoDia
}

export interface DadosComanda {
  contratante: string
  evento: string
  contato: string
  pax: string
  endereco: string
  restricoes: Restricao[]
  startseFixo: boolean // não enviar kit limpeza/uniforme/transformador; gelo só HH
  dias: ComandaDia[]
  bebidasEstrutura: ComandaLinha[] // consolidada
  adriana: {
    locacao: ComandaLinha[]
    fornecedores: ComandaLinha[]
    freelancers: string // "____"
    verba: string // "R$ 2.334,40" — NUNCA o orçamento
  }
}

function fmtDia(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function run(text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) {
  return new TextRun({
    text,
    bold: o.bold ?? false,
    italics: o.italics ?? false,
    color: o.color ?? '000000',
    size: o.size ?? 24,
    font: 'Arial',
  })
}

function p(text: string, o: { bold?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: o.align ?? AlignmentType.LEFT,
    spacing: { before: 0, after: 0 },
    children: [run(text, o)],
  })
}

function border(color = '000000') {
  const b = { style: BorderStyle.SINGLE, size: 4, color }
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b }
}

function cell(
  children: Paragraph[],
  o: { w: number; shade?: string; span?: number } = { w: CONTENT }
) {
  return new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    columnSpan: o.span,
    shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children,
  })
}

function spacer() {
  return new Paragraph({ spacing: { after: 120 }, children: [] })
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] })
}

// ------------------------------------------------------------
// Blocos comuns
// ------------------------------------------------------------

function cabecalho(d: DadosComanda, titulo: string, cor: string, resp?: string): (Paragraph | Table)[] {
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [
        run('PIEGGI ', { bold: true, size: 32 }),
        run('CATERING · COFFEE & EVENTOS   ', { size: 16, color: '666666' }),
      ],
    }),
    p(titulo, { bold: true, size: 30, color: cor }),
    ...(resp ? [p(resp, { bold: true, size: 22, color: cor })] : []),
    spacer(),
    new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: [1800, 3800, 1400, 3466],
      borders: border(cor),
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell([p('CLIENTE', { bold: true })], { w: 1800, shade: GREY }),
            cell([p(d.contratante)], { w: 3800 }),
            cell([p('EVENTO', { bold: true })], { w: 1400, shade: GREY }),
            cell([p(d.evento)], { w: 3466 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell([p('PAX', { bold: true })], { w: 1800, shade: GREY }),
            cell([p(d.pax)], { w: 3800 }),
            cell([p('CONTATO', { bold: true })], { w: 1400, shade: GREY }),
            cell([p(d.contato)], { w: 3466 }),
          ],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            cell([p('ENDEREÇO', { bold: true })], { w: 1800, shade: GREY }),
            cell([p(d.endereco)], { w: 3800 + 1400 + 3466, span: 3 }),
          ],
        }),
      ],
    }),
    spacer(),
  ]
}

function campoSaida(saida: string): Table {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: border('B59A00'),
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [p(`DIA E HORÁRIO DA SAÍDA: ${saida}`, { bold: true })],
            { w: CONTENT, shade: YELLOW }
          ),
        ],
      }),
    ],
  })
}

function bannerMotoristas(): Table {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: border('B59A00'),
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              p('MOTORISTAS: ANTES DE LEVAR, CHAMAR AS RESPONSÁVEIS PARA VALIDAR', {
                bold: true,
                align: AlignmentType.CENTER,
              }),
            ],
            { w: CONTENT, shade: YELLOW }
          ),
        ],
      }),
    ],
  })
}

function recadoCopeiras(): Paragraph {
  return p(
    'COPEIRAS: antes do início do evento — TICAR TUDO, FOTOGRAFAR e cobrar o Luiz no zap dele se faltou algo.',
    { bold: true, color: 'C00000', size: 22 }
  )
}

function bannerRestricoes(restricoes: Restricao[]): Table | null {
  if (!restricoes.length) return null
  const lista = restricoes
    .map((r) => `${r.tipo} (${r.pax} pax${r.critico ? ' — CRÍTICO' : ''})`)
    .join(' · ')
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [CONTENT],
    borders: border('C00000'),
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              p(`⚠ RESTRIÇÕES / CONTAMINAÇÃO CRUZADA: ${lista}`, {
                bold: true,
                color: 'C00000',
                size: 22,
              }),
            ],
            { w: CONTENT, shade: RED_BG }
          ),
        ],
      }),
    ],
  })
}

function cabecalhoDia(n: number, diaISO: string): Paragraph {
  // cabeçalho de DIA bem grande — funcionário pendura a folha e entrega por dia
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 120 },
    children: [run(`DIA ${n} — ${fmtDia(diaISO)}`, { bold: true, size: 44 })],
  })
}

// tabela de produção: ✓ | QTD | RECEITA | ITEM
function tabelaProducao(linhas: ComandaLinha[], cor: string): Table {
  const cw = [700, 1700, 5666, 2400]
  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: [
        cell([p('✓', { bold: true, align: AlignmentType.CENTER })], { w: cw[0], shade: GREY }),
        cell([p('QTD', { bold: true })], { w: cw[1], shade: GREY }),
        cell([p('RECEITA / DESCRIÇÃO', { bold: true })], { w: cw[2], shade: GREY }),
        cell([p('ITEM', { bold: true })], { w: cw[3], shade: GREY }),
      ],
    }),
  ]
  for (const l of linhas) {
    const shade =
      l.destaque === 'amarelo' ? AMBER : l.destaque === 'vermelho' ? RED_BG : l.destaque === 'azul' ? BLUE_BG : undefined
    const color = l.destaque === 'vermelho' ? 'C00000' : '000000'
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([p('☐', { align: AlignmentType.CENTER })], { w: cw[0], shade }),
          cell([p(l.qtd, { align: AlignmentType.CENTER, color })], { w: cw[1], shade }),
          cell([p(l.receita, { color })], { w: cw[2], shade }),
          cell([p(l.item, { bold: true, color })], { w: cw[3], shade }),
        ],
      })
    )
  }
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: cw,
    borders: border(cor),
    rows,
  })
}

// tabela de expedição: EXP ✓ | COP ✓ | QTD | ITEM/DESCRIÇÃO
function tabelaExpedicao(linhas: ComandaLinha[], cor: string, tituloSecao?: string): Table {
  const cw = [800, 800, 1800, 7066]
  const rows: TableRow[] = []
  if (tituloSecao) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([p(tituloSecao, { bold: true })], { w: CONTENT, span: 4, shade: GREY }),
        ],
      })
    )
  }
  rows.push(
    new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: [
        cell([p('EXP ✓', { bold: true, align: AlignmentType.CENTER, size: 20 })], { w: cw[0], shade: GREY }),
        cell([p('COP ✓', { bold: true, align: AlignmentType.CENTER, size: 20 })], { w: cw[1], shade: GREY }),
        cell([p('QTD', { bold: true })], { w: cw[2], shade: GREY }),
        cell([p('ITEM / DESCRIÇÃO', { bold: true })], { w: cw[3], shade: GREY }),
      ],
    })
  )
  for (const l of linhas) {
    const shade =
      l.destaque === 'amarelo' ? AMBER : l.destaque === 'vermelho' ? RED_BG : l.destaque === 'azul' ? BLUE_BG : undefined
    const color = l.destaque === 'vermelho' ? 'C00000' : '000000'
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell([p('☐', { align: AlignmentType.CENTER })], { w: cw[0], shade }),
          cell([p('☐', { align: AlignmentType.CENTER })], { w: cw[1], shade }),
          cell([p(l.qtd, { align: AlignmentType.CENTER, color })], { w: cw[2], shade }),
          cell(
            [p(l.receita ? `${l.item} — ${l.receita}` : l.item, { color })],
            { w: cw[3], shade }
          ),
        ],
      })
    )
  }
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: cw,
    borders: border(cor),
    rows,
  })
}

// ------------------------------------------------------------
// Documento
// ------------------------------------------------------------

export async function gerarComandaDocx(d: DadosComanda): Promise<Blob> {
  const children: (Paragraph | Table)[] = []
  const restr = bannerRestricoes(d.restricoes)
  let primeiraPagina = true

  function novaPagina() {
    if (!primeiraPagina) children.push(pageBreak())
    primeiraPagina = false
  }

  const producoes: { key: keyof Pick<ComandaDia, 'quente' | 'fria' | 'confeitaria'>; titulo: string; cor: string }[] = [
    { key: 'quente', titulo: 'PRODUÇÃO — COZINHA QUENTE', cor: CORES.quente },
    { key: 'fria', titulo: 'PRODUÇÃO — COZINHA FRIA / GARDE MANGER', cor: CORES.fria },
    { key: 'confeitaria', titulo: 'PRODUÇÃO — CONFEITARIA', cor: CORES.confeitaria },
  ]

  d.dias.forEach((dia, di) => {
    // ---- produção por dia (estação sem item → omite) ----
    for (const prod of producoes) {
      const linhas = dia[prod.key]
      if (!linhas.length) continue
      novaPagina()
      if (d.dias.length > 1) children.push(cabecalhoDia(di + 1, dia.diaISO))
      children.push(...cabecalho(d, prod.titulo, prod.cor))
      if (restr) children.push(restr, spacer())
      children.push(campoSaida(dia.saida), spacer())
      children.push(tabelaProducao(linhas, prod.cor), spacer())
    }

    // ---- expedição alimentação por dia ----
    const a = dia.alimentacao
    const temAlimentacao =
      a.congelado.length + a.producao.length + a.insumos.length + a.adicionais.length > 0
    if (temAlimentacao) {
      novaPagina()
      if (d.dias.length > 1) children.push(cabecalhoDia(di + 1, dia.diaISO))
      children.push(
        ...cabecalho(
          d,
          'EXPEDIÇÃO — ALIMENTAÇÃO',
          CORES.expedicao,
          'RESPONSÁVEL: BEATRIZ — produção Pieggi (cozinha fria + quente + confeitaria) · COORDENAÇÃO: ADRIANA'
        )
      )
      children.push(bannerMotoristas(), spacer(), recadoCopeiras())
      if (restr) children.push(spacer(), restr)
      children.push(spacer(), campoSaida(dia.saida), spacer())
      if (a.congelado.length)
        children.push(
          tabelaExpedicao(a.congelado, CORES.expedicao, '❄ CONGELADO — copeiras assam/fritam no local, servir quente'),
          spacer()
        )
      if (a.producao.length)
        children.push(
          tabelaExpedicao(a.producao, CORES.expedicao, 'ALIMENTOS DE PRODUÇÃO (sai pronto)'),
          spacer()
        )
      if (a.insumos.length)
        children.push(tabelaExpedicao(a.insumos, CORES.expedicao, 'INSUMOS'), spacer())
      if (a.adicionais.length)
        children.push(
          tabelaExpedicao(a.adicionais, CORES.expedicao, 'ADICIONAIS — COMPRADOS PRONTOS (âmbar)'),
          spacer()
        )
    }
  })

  // ---- expedição bebidas/estrutura (consolidada) ----
  if (d.bebidasEstrutura.length) {
    novaPagina()
    children.push(
      ...cabecalho(
        d,
        'EXPEDIÇÃO — BEBIDAS, ESTRUTURA E MATERIAIS',
        CORES.expedicao,
        'RESPONSÁVEL: ASSISTENTE DE EXPEDIÇÃO · COORDENAÇÃO: ADRIANA'
      )
    )
    children.push(bannerMotoristas(), spacer(), recadoCopeiras(), spacer())
    if (d.dias.length && d.dias[0].saida)
      children.push(campoSaida(d.dias[0].saida), spacer())
    if (d.startseFixo)
      children.push(
        p(
          'STARTSE = PONTO FIXO: NÃO ENVIAR kit de limpeza, luvas/toucas/uniforme, transformador. Gelo SÓ quando tiver HH. (Blocos abaixo continuam ticáveis, marcados "NÃO ENVIAR NA STARTSE".)',
          { bold: true, color: '1F4E79', size: 22 }
        ),
        spacer()
      )
    children.push(tabelaExpedicao(d.bebidasEstrutura, CORES.expedicao), spacer())
  }

  // ---- página da Adriana (verde, sem banner, sem campo de saída) ----
  const temAdriana =
    d.adriana.locacao.length + d.adriana.fornecedores.length > 0 || d.adriana.verba
  if (temAdriana) {
    novaPagina()
    children.push(
      ...cabecalho(
        d,
        'LOCAÇÕES EXTRAS — FORNECEDORES LEAL/LETÍCIA E FREELANCER',
        CORES.adriana,
        'RESPONSÁVEL: ADRIANA — somente o que o motorista dela busca em fornecedor'
      )
    )
    // 1. Locação extra
    children.push(
      p('1. LOCAÇÃO EXTRA (só o que a Pieggi não tem e precisa alugar)', { bold: true, color: CORES.adriana })
    )
    if (d.adriana.locacao.length) {
      children.push(tabelaExpedicao(d.adriana.locacao, CORES.adriana))
    } else {
      children.push(p('Não solicitado', { italics: true, size: 22 }))
    }
    children.push(spacer())
    // 2. Fornecedores (âmbar)
    children.push(p('2. FORNECEDORES (Adriana buscar)', { bold: true, color: CORES.adriana }))
    if (d.adriana.fornecedores.length) {
      const linhasAmbar = d.adriana.fornecedores.map((l) => ({ ...l, destaque: 'amarelo' as const }))
      children.push(tabelaExpedicao(linhasAmbar, CORES.adriana))
    } else {
      children.push(p('Não solicitado', { italics: true, size: 22 }))
    }
    children.push(spacer())
    // 3. Freelancer + verba (NUNCA exibir o orçamento)
    children.push(
      p('3. PESSOAL FREELANCER', { bold: true, color: CORES.adriana }),
      p(`Nº de freelancers contratados: ${d.adriana.freelancers || '________'}`),
      p(`Verba do evento (8%): ${d.adriana.verba || 'R$ ________'}`, { bold: true })
    )
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 24 } } } },
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
