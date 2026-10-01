// ============================================================
// TERMO DE SOBRAS ASSINADO — PDF
//
// O termo assinado no celular vira um PDF com o mesmo texto do papel,
// os itens, quem recebeu, quem entregou e a assinatura — para mandar
// ao cliente ou guardar se a sobra virar reclamação depois.
// Carregado sob demanda (import dinâmico), como os outros geradores.
// ============================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { TERMO_ACEITE, TERMO_TEXTO, TERMO_TITULO } from './copeiras'
import type { SobraItem } from '@/types'

export interface DadosTermo {
  cliente: string
  evento: string
  diaEvento: string // DD/MM/AAAA
  entregueEm: string // DD/MM/AAAA HH:MM
  itens: SobraItem[]
  recebedorNome: string
  recebedorContato: string | null
  entreguePor: string | null
  /** texto que o cliente aceitou — o guardado, não o atual */
  texto?: string[]
  assinaturaPng?: ArrayBuffer | null
}

/** quebra o texto na largura da página */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
      linhas.push(atual)
      atual = palavra
    } else atual = tentativa
  }
  if (atual) linhas.push(atual)
  return linhas
}

export async function gerarTermoPdf(d: DadosTermo): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const pagina = pdf.addPage([595.28, 841.89]) // A4
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold)
  const margem = 56
  const largura = 595.28 - margem * 2
  let y = 841.89 - margem

  function escrever(t: string, opts: { fonte?: PDFFont; tamanho?: number; centro?: boolean; depois?: number } = {}) {
    const fonte = opts.fonte ?? normal
    const tamanho = opts.tamanho ?? 10.5
    for (const linha of quebrar(t, fonte, tamanho, largura)) {
      const x = opts.centro ? (595.28 - fonte.widthOfTextAtSize(linha, tamanho)) / 2 : margem
      pagina.drawText(linha, { x, y, size: tamanho, font: fonte, color: rgb(0, 0, 0) })
      y -= tamanho * 1.45
    }
    y -= opts.depois ?? 4
  }

  escrever(TERMO_TITULO, { fonte: negrito, tamanho: 13, centro: true, depois: 0 })
  escrever('Pieggi Catering', { fonte: negrito, centro: true, depois: 14 })

  escrever(`Cliente: ${d.cliente}`)
  escrever(`Evento: ${d.evento}`)
  escrever(`Data do evento: ${d.diaEvento}`)
  escrever(`Data e horário da entrega: ${d.entregueEm}`, { depois: 10 })

  escrever('O que está sendo entregue:', { fonte: negrito })
  for (const i of d.itens) escrever(`•  ${i.quantidade} ${i.unidade} — ${i.descricao}`, { depois: 0 })
  y -= 10

  for (const par of d.texto?.length ? d.texto : TERMO_TEXTO) escrever(par, { depois: 8 })

  escrever(TERMO_ACEITE, { fonte: negrito, depois: 8 })
  escrever(`Nome: ${d.recebedorNome}`)
  escrever(`Documento ou telefone: ${d.recebedorContato ?? '—'}`)

  if (d.assinaturaPng) {
    const img = await pdf.embedPng(d.assinaturaPng)
    const h = 70
    const w = (img.width / img.height) * h
    escrever('Assinatura:', { depois: 0 })
    pagina.drawImage(img, { x: margem, y: y - h, width: Math.min(w, largura), height: h })
    y -= h + 10
  }
  escrever(`Entregue por (Pieggi): ${d.entreguePor ?? '—'}`)

  const bytes = await pdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
