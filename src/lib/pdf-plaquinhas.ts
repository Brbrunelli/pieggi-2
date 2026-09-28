// ============================================================
// GERAÇÃO DO PDF DE PLAQUINHAS (trilíngue PT/EN/ES)
// Padrão Pieggi:
//   A4 · grade 2×3 (6/página) · margens 5 mm · guias de corte pontilhadas
//   DOBRA 50/50: metade de CIMA 100% em branco; TODO o conteúdo na metade
//   de baixo, ancorado à base (~2,5 mm) — o meio da célula é a linha de dobra
//   Título = SABOR (Helvetica-BoldOblique 18pt, piso 13) · Sub = CATEGORIA
//   (10pt, piso 9) · EN/ES 8pt cinza #555 no formato "CATEGORIA / sabor"
//   Selos: verde (veg/vegano) · azul (sem lactose) · amarelo (sem glúten) ·
//   cinza (sem açúcar) — PNGs oficiais do bucket assets, com fallback desenhado
//   Multi-dia: PageBreak entre dias · par "VISITE NOSSO SITE" no fim (2-up)
// ============================================================

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { supabase } from './supabase'
import type { DietSeal } from '@/types'

export interface CardPlaquinha {
  dia: string // yyyy-mm-dd ('' = sem dia)
  titulo: string
  sub: string
  en: string
  es: string
  selo: DietSeal | null
  tipo?: 'normal' | 'contem' // contem = card de aviso "CONTÉM {X}"
}

// pontos (1 mm = 2.8346 pt)
const MM = 2.8346
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 5 * MM
const COLS = 2
const ROWS = 3
const CELL_W = (PAGE_W - 2 * MARGIN) / COLS
const CELL_H = (PAGE_H - 2 * MARGIN) / ROWS
const PAD = 2.5 * MM

const GREY = rgb(0.33, 0.33, 0.33)
const LIGHT = rgb(0.7, 0.7, 0.7)
const BLACK = rgb(0, 0, 0)
const PG_GREY = rgb(0.373, 0.373, 0.373) // #5F5F5F

const SELO_COR: Record<DietSeal, ReturnType<typeof rgb>> = {
  vegetariano: rgb(0.18, 0.55, 0.24),
  vegano: rgb(0.13, 0.45, 0.18),
  sem_lactose: rgb(0.15, 0.35, 0.7),
  sem_gluten: rgb(0.85, 0.65, 0.1),
  sem_acucar: rgb(0.45, 0.45, 0.45),
}

const SELO_TXT: Record<DietSeal, string> = {
  vegetariano: 'VEG',
  vegano: 'VGN',
  sem_lactose: 'S/LAC',
  sem_gluten: 'S/GLU',
  sem_acucar: 'S/AÇU',
}

const SELO_ASSET: Record<DietSeal, string> = {
  vegetariano: 'selo-vegetariano.png',
  vegano: 'selo-vegano.png',
  sem_lactose: 'selo-sem-lactose.png',
  sem_gluten: 'selo-sem-gluten.png',
  sem_acucar: 'selo-sem-acucar.png',
}

async function fetchAsset(nome: string): Promise<ArrayBuffer | null> {
  try {
    const { data } = supabase.storage.from('assets').getPublicUrl(nome)
    const r = await fetch(data.publicUrl)
    if (!r.ok) return null
    const buf = await r.arrayBuffer()
    // storage devolve XML de erro com 200 em alguns casos — valida assinatura PNG
    const b = new Uint8Array(buf.slice(0, 4))
    if (b[0] !== 0x89 || b[1] !== 0x50) return null
    return buf
  } catch {
    return null
  }
}

function quebrarLinhas(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const w of palavras) {
    const tentativa = atual ? `${atual} ${w}` : w
    if (font.widthOfTextAtSize(tentativa, size) <= maxW) {
      atual = tentativa
    } else {
      if (atual) linhas.push(atual)
      atual = w
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

interface Assets {
  selos: Partial<Record<DietSeal, PDFImage>>
  qr: PDFImage | null
}

function desenharCorte(page: PDFPage) {
  // guias pontilhadas cinza da grade
  for (let c = 0; c <= COLS; c++) {
    const x = MARGIN + c * CELL_W
    page.drawLine({
      start: { x, y: MARGIN },
      end: { x, y: PAGE_H - MARGIN },
      thickness: 0.45,
      color: LIGHT,
      dashArray: [2, 3],
    })
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = MARGIN + r * CELL_H
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.45,
      color: LIGHT,
      dashArray: [2, 3],
    })
  }
}

interface Fonts {
  boldOblique: PDFFont
  oblique: PDFFont
  bold: PDFFont
}

function desenharBlocoEsquerdo(
  page: PDFPage,
  x0: number,
  y0: number,
  fonts: Fonts
): { larguraBloco: number; topoLogo: number } {
  // banner PIEGGI: retângulo preto com wordmark branco (~3:1)
  const bw = 26 * MM
  const bh = 8.5 * MM
  const bx = x0 + PAD
  const by = y0 + PAD + 13 * MM // banner acima do PG
  page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: BLACK })
  const t = 'PIEGGI'
  const ts = 13
  const tw = fonts.bold.widthOfTextAtSize(t, ts)
  page.drawText(t, {
    x: bx + (bw - tw) / 2,
    y: by + (bh - ts) / 2 + 1,
    size: ts,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })
  // monograma PG cinza (nunca preto nem marrom)
  const pg = 'PG'
  const pgs = 24
  const pgw = fonts.bold.widthOfTextAtSize(pg, pgs)
  page.drawText(pg, {
    x: bx + (bw - pgw) / 2,
    y: y0 + PAD + 1.5 * MM,
    size: pgs,
    font: fonts.bold,
    color: PG_GREY,
  })
  return { larguraBloco: bw + 2 * PAD, topoLogo: by + bh }
}

function desenharSelo(
  page: PDFPage,
  selo: DietSeal,
  x: number,
  yTop: number,
  assets: Assets,
  fonts: Fonts
) {
  const s = 10.5 * MM
  const img = assets.selos[selo]
  if (img) {
    page.drawImage(img, { x, y: yTop - s, width: s, height: s })
    return
  }
  // fallback: círculo colorido com sigla
  const cx = x + s / 2
  const cy = yTop - s / 2
  page.drawCircle({ x: cx, y: cy, size: s / 2, color: SELO_COR[selo] })
  const txt = SELO_TXT[selo]
  const fs = 6
  const tw = fonts.bold.widthOfTextAtSize(txt, fs)
  page.drawText(txt, { x: cx - tw / 2, y: cy - fs / 2 + 1, size: fs, font: fonts.bold, color: rgb(1, 1, 1) })
}

function desenharCard(
  page: PDFPage,
  card: CardPlaquinha,
  col: number,
  row: number,
  fonts: Fonts,
  assets: Assets
) {
  // célula (row 0 = topo da página)
  const x0 = MARGIN + col * CELL_W
  const y0 = PAGE_H - MARGIN - (row + 1) * CELL_H

  // DOBRA 50/50: conteúdo APENAS na metade de baixo (y0 .. y0 + CELL_H/2)
  const { larguraBloco, topoLogo } = desenharBlocoEsquerdo(page, x0, y0, fonts)

  if (card.selo) {
    // selo à direita do banner, alinhado pelo topo do logo
    desenharSelo(page, card.selo, x0 + larguraBloco, topoLogo, assets, fonts)
  }

  // área de texto: à direita do bloco (e do selo)
  const seloW = card.selo ? 11.5 * MM : 0
  const tx = x0 + larguraBloco + seloW + 1 * MM
  const maxW = x0 + CELL_W - PAD - tx

  // o texto NUNCA cruza a linha do topo do logo — ancora no topo e desce
  let cursorY = topoLogo - 2

  // título: quebra em até 3 linhas ANTES de reduzir; piso 13pt
  let size = card.tipo === 'contem' ? 20 : 18
  let linhas = quebrarLinhas(card.titulo.toUpperCase(), fonts.boldOblique, size, maxW)
  while ((linhas.length > 3 || linhas.some((l) => fonts.boldOblique.widthOfTextAtSize(l, size) > maxW)) && size > 13) {
    size -= 1
    linhas = quebrarLinhas(card.titulo.toUpperCase(), fonts.boldOblique, size, maxW)
  }
  linhas = linhas.slice(0, 3)
  for (const l of linhas) {
    const w = fonts.boldOblique.widthOfTextAtSize(l, size)
    cursorY -= size + 1
    page.drawText(l, { x: tx + (maxW - w) / 2, y: cursorY, size, font: fonts.boldOblique, color: BLACK })
  }

  // subtítulo (categoria) — nunca "salgado/doce", nunca categoria genérica de buffet
  if (card.sub) {
    const ss = 10
    const st = card.sub.toUpperCase()
    const w = fonts.boldOblique.widthOfTextAtSize(st, ss)
    cursorY -= ss + 3
    page.drawText(st, { x: tx + (maxW - w) / 2, y: cursorY, size: ss, font: fonts.boldOblique, color: BLACK })
  }

  // EN / ES — 8pt cinza
  for (const ln of [card.en, card.es]) {
    if (!ln) continue
    const es = 8
    let txt = ln
    while (fonts.oblique.widthOfTextAtSize(txt, es) > maxW && txt.length > 4) {
      txt = txt.slice(0, -2)
    }
    const w = fonts.oblique.widthOfTextAtSize(txt, es)
    cursorY -= es + 2.5
    page.drawText(txt, { x: tx + (maxW - w) / 2, y: cursorY, size: es, font: fonts.oblique, color: GREY })
  }
}

function desenharCardSite(page: PDFPage, col: number, row: number, fonts: Fonts, assets: Assets) {
  const x0 = MARGIN + col * CELL_W
  const y0 = PAGE_H - MARGIN - (row + 1) * CELL_H
  const { larguraBloco, topoLogo } = desenharBlocoEsquerdo(page, x0, y0, fonts)
  const tx = x0 + larguraBloco + 1 * MM
  const maxW = x0 + CELL_W - PAD - tx

  let cursorY = topoLogo - 2
  const t = 'VISITE NOSSO SITE'
  const ts = 13
  const tw = fonts.boldOblique.widthOfTextAtSize(t, ts)
  cursorY -= ts + 1
  page.drawText(t, { x: tx + (maxW - tw) / 2, y: cursorY, size: ts, font: fonts.boldOblique, color: BLACK })

  // QR (asset qr-site.png) ou moldura reservada
  const qs = 14 * MM
  const qx = tx + (maxW - qs) / 2
  cursorY -= qs + 2
  if (assets.qr) {
    page.drawImage(assets.qr, { x: qx, y: cursorY, width: qs, height: qs })
  } else {
    page.drawRectangle({ x: qx, y: cursorY, width: qs, height: qs, borderColor: GREY, borderWidth: 0.8 })
    const ph = 'QR'
    const pw = fonts.bold.widthOfTextAtSize(ph, 9)
    page.drawText(ph, { x: qx + (qs - pw) / 2, y: cursorY + qs / 2 - 4, size: 9, font: fonts.bold, color: GREY })
  }

  const site = 'pieggi.com.br'
  const ss = 10
  const sw = fonts.boldOblique.widthOfTextAtSize(site, ss)
  cursorY -= ss + 3
  page.drawText(site, { x: tx + (maxW - sw) / 2, y: cursorY, size: ss, font: fonts.boldOblique, color: BLACK })
}

export async function gerarPlaquinhasPdf(cards: CardPlaquinha[]): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    boldOblique: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    oblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  // assets oficiais (opcionais — fallback desenhado)
  const assets: Assets = { selos: {}, qr: null }
  for (const selo of Object.keys(SELO_ASSET) as DietSeal[]) {
    const buf = await fetchAsset(SELO_ASSET[selo])
    if (buf) assets.selos[selo] = await pdf.embedPng(buf)
  }
  const qrBuf = await fetchAsset('qr-site.png')
  if (qrBuf) assets.qr = await pdf.embedPng(qrBuf)

  // agrupa por dia (PageBreak entre dias); cards "contem" ao fim de cada dia
  const dias = Array.from(new Set(cards.map((c) => c.dia))).sort()

  let page: PDFPage | null = null
  let slot = 0

  function novaPagina() {
    page = pdf.addPage([PAGE_W, PAGE_H])
    desenharCorte(page)
    slot = 0
  }

  function proximoSlot(): { col: number; row: number } {
    if (!page || slot >= COLS * ROWS) novaPagina()
    const col = slot % COLS
    const row = Math.floor(slot / COLS)
    slot++
    return { col, row }
  }

  for (const dia of dias) {
    // novo dia = nova página
    novaPagina()
    const doDia = [
      ...cards.filter((c) => c.dia === dia && c.tipo !== 'contem'),
      ...cards.filter((c) => c.dia === dia && c.tipo === 'contem'),
    ]
    for (const card of doDia) {
      const { col, row } = proximoSlot()
      desenharCard(page!, card, col, row, fonts, assets)
    }
  }

  // par "VISITE NOSSO SITE" — 2 iguais lado a lado, uma vez por evento
  if (!page || slot > COLS * ROWS - 2 || slot % COLS !== 0) {
    // garante os 2 na mesma linha
    if (!page) novaPagina()
    else if (slot > COLS * ROWS - 2) novaPagina()
    else if (slot % COLS !== 0) slot++
  }
  const s1 = proximoSlot()
  desenharCardSite(page!, s1.col, s1.row, fonts, assets)
  const s2 = proximoSlot()
  desenharCardSite(page!, s2.col, s2.row, fonts, assets)

  const bytes = await pdf.save()
  const copia = new Uint8Array(bytes)
  return new Blob([copia.buffer], { type: 'application/pdf' })
}
