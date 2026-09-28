// ============================================================
// GERAÇÃO DA PROPOSTA .PPTX
// Edita o template oficial Pieggi (nunca recria layout do zero):
// copia o template → substitui textos nos XMLs → remove slides
// não usados do sldIdLst → reempacota.
//
// Estrutura do template (00. Pieggi - Orçamento - Template.pptx):
//   slide1  = capa
//   slide2  = dados do cliente (placeholders literais)
//   slide3  = orçamento (4 linhas "Opção | XXX | XXX" + restrição + total)
//   slide4  = Coffee Break Basic/Standard
//   slide5  = Coquetel Executive — ilha estática
//   slide6  = Coquetel Executive — serviço volante
//   slide7  = Coquetel Executive — ilha estática (variação)
//   slide8  = Coquetel Master — serviço volante
//   slide9  = Coquetel Master — ilha estática
//   slide10 = Coquetel Master — volante + massa/salada
//   slide11 = Coquetel Master — ilha estática (favo de mel)
//   slide12 = Coffee Break Executive + Bar de drinks
//   slide13 = capa final
// ============================================================

import JSZip from 'jszip'
import { supabase } from './supabase'

export interface LinhaOrcamento {
  descritivo: string
  pax: string
  valor: string
}

export interface DadosProposta {
  cliente: string
  evento: string
  contato: string
  pax: string
  data: string // DD/MM (nunca dia da semana)
  horario: string
  /** Tabela do orçamento — quantas linhas o evento precisar */
  tabela?: LinhaOrcamentoTabela[]
  /** Cabeçalhos do comparativo: ['Descritivo','PAX','Standard','Executive','Master'] */
  cabecalhosTabela?: string[]
  /** Slide de orçamento comparativo (quando o template tiver um) */
  slideOrcamento?: number
  /**
   * Ordem final do deck (números de slide do template). Quando vem, manda:
   * os slides saem nesta ordem e o resto é descartado. É o que põe os
   * institucionais entre a capa e os dados nos eventos externos.
   */
  ordemSlides?: number[]
  linhas: LinhaOrcamento[] // (legado — usado quando `tabela` não vem)
  restricaoPax?: string
  restricaoValor?: string
  total: string
  /** Slides de cardápio a MANTER */
  slidesCardapio: number[]
  /** Slides institucionais a MANTER (cliente novo/externo que não conhece a casa) */
  slidesInstitucionais?: number[]
  /** Universo de slides institucionais do template (os não escolhidos são removidos) */
  todosInstitucionais?: number[]
  /** Universo de slides de cardápio do template */
  todosCardapio?: number[]
  /**
   * Um cardápio por slide — como nas propostas reais (manhã num slide,
   * tarde noutro; ou uma opção de pacote por slide).
   */
  cardapios?: {
    slide: number
    /** colunas de texto do slide, na ordem de leitura (ver SLIDES_CARDAPIO) */
    shapes: ShapeCardapio[]
    /** cabeçalho: "COFFEE BREAK" / "Executive · manhã · 40 pessoas · 31/08" */
    titulo?: string
    subtitulo?: string
    shapeTitulo?: string
    linhas: { titulo: string; detalhe: string }[]
  }[]
}

import { SLIDES_CARDAPIO, type ShapeCardapio } from './documentos'

const TEMPLATE_PATH = 'template-proposta.pptx'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Substitui a N-ésima ocorrência de `<a:t>placeholder</a:t>` pelos valores da fila. */
function substituirSequencial(xml: string, placeholder: string, valores: string[]): string {
  let i = 0
  const alvo = `<a:t>${placeholder}</a:t>`
  let out = ''
  let resto = xml
  for (;;) {
    const pos = resto.indexOf(alvo)
    if (pos === -1) break
    const valor = i < valores.length ? xmlEscape(valores[i]) : ''
    out += resto.slice(0, pos) + `<a:t>${valor}</a:t>`
    resto = resto.slice(pos + alvo.length)
    i++
  }
  return out + resto
}

/**
 * Extrai o PRIMEIRO elemento `tag` completo de um XML.
 *
 * Cuidado: no template os `<a:rPr>`/`<a:pPr>`/`<a:bodyPr>` têm filhos
 * (`<a:solidFill>`, `<a:lnSpc>`, `<a:spAutoFit/>`…). Uma regex que para no
 * primeiro `/>` devolve fragmento aberto — e o PowerPoint recusa o arquivo.
 * Por isso: se a tag for self-closing devolve ela; senão vai até `</tag>`.
 */
function primeiroElemento(xml: string, tag: string): string | null {
  const abertura = new RegExp(`<${tag}(?:\\s[^>]*?)?(/?)>`)
  const m = abertura.exec(xml)
  if (!m) return null
  if (m[1] === '/') return m[0]
  const fecha = `</${tag}>`
  const fim = xml.indexOf(fecha, m.index + m[0].length)
  if (fim === -1) return m[0].replace(/>$/, '/>')
  return xml.slice(m.index, fim + fecha.length)
}

const EMU_POR_PONTO = 12700

/**
 * Calcula um corpo de fonte que caiba na caixa.
 *
 * O template usa `<a:spAutoFit/>` (a caixa cresce com o texto), mas isso só
 * é recalculado quando alguém edita no PowerPoint — gerando o arquivo por
 * fora, o texto passa do limite e sai por cima do que está embaixo. Então
 * estimamos a altura ocupada e reduzimos o corpo até caber.
 */
function corpoQueCabe(
  sp: string,
  szBase: number,
  paragrafos: string[]
): { sz: number; escala: number } {
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(sp)
  if (!ext) return { sz: szBase, escala: 1 }
  const larguraPt = Number(ext[1]) / EMU_POR_PONTO
  const alturaPt = Number(ext[2]) / EMU_POR_PONTO
  if (!larguraPt || !alturaPt) return { sz: szBase, escala: 1 }

  const alturaUsada = (szPt: number) => {
    // largura média de caractere ≈ 0,5 do corpo; entrelinha ≈ 1,2
    const porLinha = Math.max(8, Math.floor(larguraPt / (szPt * 0.5)))
    const linhas = paragrafos.reduce((s, p) => s + Math.max(1, Math.ceil(p.length / porLinha)), 0)
    return linhas * szPt * 1.2
  }

  let szPt = szBase / 100
  const minimo = 5 // abaixo disso não se lê no projetor
  while (szPt > minimo && alturaUsada(szPt) > alturaPt) szPt -= 0.25

  return { sz: Math.round(szPt * 100), escala: szPt / (szBase / 100) }
}

/** Troca o `sz` de um rPr (ou acrescenta, se não houver). */
function comCorpo(rPr: string, sz: number): string {
  return / sz="\d+"/.test(rPr)
    ? rPr.replace(/ sz="\d+"/, ` sz="${sz}"`)
    : rPr.replace(/^<a:rPr/, `<a:rPr sz="${sz}"`)
}

/**
 * Reescreve o corpo de texto de um shape com as linhas do cardápio,
 * clonando a formatação (fonte, tamanho, cor) do primeiro run existente
 * para preservar a identidade visual do template.
 */
function reescreverShape(
  xml: string,
  nomeShape: string,
  linhas: { titulo: string; detalhe: string }[],
  ocorrencia = 0
): string {
  // localiza o <p:sp> cujo name bate (o slide 4 repete o nome nas duas colunas)
  const spRegex = /<p:sp>[\s\S]*?<\/p:sp>/g
  let match: RegExpExecArray | null
  let vistos = -1
  while ((match = spRegex.exec(xml)) !== null) {
    const sp = match[0]
    const nome = /name="([^"]*)"/.exec(sp)?.[1]
    if (nome !== nomeShape) continue
    vistos++
    if (vistos !== ocorrencia) continue

    // Num slide, o corpo de texto de um shape é <p:txBody> (PresentationML).
    // <a:txBody> só aparece em célula de tabela / gráfico — procurar a tag
    // errada faz a função devolver o slide intacto, sem erro nenhum.
    const tag = sp.includes('<p:txBody>') ? 'p:txBody' : 'a:txBody'
    const txStart = sp.indexOf(`<${tag}>`)
    const txEnd = sp.indexOf(`</${tag}>`)
    if (txStart === -1 || txEnd === -1) return xml

    const txBody = sp.slice(txStart + tag.length + 2, txEnd)
    const bodyPr = primeiroElemento(txBody, 'a:bodyPr') ?? '<a:bodyPr/>'
    const lstStyle = primeiroElemento(txBody, 'a:lstStyle') ?? '<a:lstStyle/>'
    const pPr = primeiroElemento(txBody, 'a:pPr') ?? ''
    // estilo do run: primeiro <a:rPr> encontrado
    const rPrBase = primeiroElemento(txBody, 'a:rPr') ?? '<a:rPr lang="pt-BR"/>'
    const rPrBold = rPrBase.includes(' b="')
      ? rPrBase.replace(/ b="[01]"/, ' b="1"')
      : rPrBase.replace('<a:rPr', '<a:rPr b="1"')

    // corpo que cabe na caixa (evita o texto sair por cima do de baixo)
    const szBase = Number(/ sz="(\d+)"/.exec(rPrBase)?.[1] ?? 1200)
    const { sz } = corpoQueCabe(
      sp,
      szBase,
      linhas.flatMap((l) => (l.detalhe ? [l.titulo, l.detalhe] : [l.titulo]))
    )
    const rPrTitulo = comCorpo(rPrBold, sz)
    const rPrDetalhe = comCorpo(rPrBase, sz)

    const paras = linhas
      .map(
        (l) =>
          `<a:p>${pPr}<a:r>${rPrTitulo}<a:t>${xmlEscape(l.titulo)}</a:t></a:r></a:p>` +
          (l.detalhe
            ? `<a:p>${pPr}<a:r>${rPrDetalhe}<a:t>${xmlEscape(l.detalhe)}</a:t></a:r></a:p>`
            : '')
      )
      .join('')

    // spAutoFit cresceria a caixa (só ao editar no PowerPoint); normAutofit
    // encolhe o texto, que é o que queremos num arquivo gerado por fora
    const bodyPrFinal = bodyPr.includes('<a:spAutoFit/>')
      ? bodyPr.replace('<a:spAutoFit/>', '<a:normAutofit/>')
      : bodyPr

    const novoSp =
      sp.slice(0, txStart) +
      `<${tag}>${bodyPrFinal}${lstStyle}${paras}</${tag}>` +
      sp.slice(txEnd + tag.length + 3)
    return xml.slice(0, match.index) + novoSp + xml.slice(match.index + sp.length)
  }
  return xml
}

// ------------------------------------------------------------
// Tabela de orçamento com quantas linhas o evento precisar.
// O template traz 4 linhas de dados; aqui clonamos a linha-modelo
// para caber opções A/B/C, adicionais, logística, taxa, totais
// (sem e com desconto) e as linhas de observação.
// ------------------------------------------------------------

/**
 * Escreve um valor numa célula da tabela preservando a formatação.
 * Cuidado: no template há células SEM run de texto (a do meio na linha
 * de Total). Contar `<a:t>` em vez de células desalinha tudo — por isso
 * o preenchimento é por `<a:tc>`, e quando a célula não tem run a gente
 * cria um herdando o estilo do `endParaRPr` do próprio parágrafo.
 */
function preencherCelula(tc: string, valor: string): string {
  const texto = `<a:t>${xmlEscape(valor)}</a:t>`
  if (/<a:t>[^<]*<\/a:t>/.test(tc)) {
    // primeiro run recebe o valor; os demais são esvaziados
    let primeiro = true
    return tc.replace(/<a:t>[^<]*<\/a:t>/g, () => {
      if (primeiro) {
        primeiro = false
        return texto
      }
      return '<a:t></a:t>'
    })
  }
  if (!valor) return tc

  // célula sem run: injeta um herdando o estilo do parágrafo
  const endPara = /<a:endParaRPr([^>]*?)\/>/.exec(tc)
  const rPr = endPara ? `<a:rPr${endPara[1]}/>` : '<a:rPr lang="pt-BR" dirty="0"/>'
  const run = `<a:r>${rPr}${texto}</a:r>`
  if (endPara) return tc.replace(endPara[0], run + endPara[0])
  return tc.replace('</a:p>', `${run}</a:p>`)
}

/** Troca os textos de uma linha da tabela, célula a célula. */
function preencherLinha(tr: string, valores: string[]): string {
  let i = 0
  return tr.replace(/<a:tc(?:\s[^>]*)?>[\s\S]*?<\/a:tc>/g, (tc) => {
    const v = i < valores.length ? valores[i] : ''
    i++
    return preencherCelula(tc, v)
  })
}

export interface LinhaOrcamentoTabela {
  descricao: string
  pax: string
  valor: string
  /**
   * Formato comparativo: um valor por coluna de pacote.
   * Usado quando o slide de orçamento tem mais de 3 colunas.
   */
  valores?: string[]
  /** linha de observação: sai só com o texto, sem valores */
  observacao?: boolean
  /** linha de total: usa o estilo destacado do template */
  total?: boolean
}

/**
 * Preenche a tabela do orçamento adaptando-se ao template:
 *  • 3 colunas → Descritivo | PAX | Valor (formato padrão)
 *  • 4+ colunas → Descritivo | PAX | Pacote A | Pacote B | … (comparativo)
 * As linhas são clonadas do próprio template, então o estilo é preservado.
 */
function preencherTabelaOrcamento(
  xml: string,
  linhas: LinhaOrcamentoTabela[],
  cabecalhos?: string[]
): string {
  const tblMatch = /<a:tbl>[\s\S]*?<\/a:tbl>/.exec(xml)
  if (!tblMatch) return xml
  const tbl = tblMatch[0]

  const trs = tbl.match(/<a:tr [^>]*>[\s\S]*?<\/a:tr>/g)
  if (!trs || trs.length < 3) return xml

  // quantas colunas o template desta tabela tem
  const colunas = (tbl.match(/<a:gridCol/g) ?? []).length || 3

  const modeloDado = trs[1]
  const modeloTotal = trs[trs.length - 1]

  // cabeçalho: no comparativo, renomeia as colunas com os nomes dos pacotes
  const cabecalho =
    cabecalhos?.length && colunas > 3 ? preencherLinha(trs[0], cabecalhos) : trs[0]

  /** distribui os valores da linha pelas colunas disponíveis */
  function celulas(l: LinhaOrcamentoTabela): string[] {
    if (l.observacao) return Array(colunas).fill('').map((_, i) => (i === 0 ? l.descricao : ''))
    if (colunas <= 3) return [l.descricao, l.pax, l.valor]
    // comparativo: descrição + pax + um valor por pacote
    const vals = l.valores ?? [l.valor]
    const resto = Array.from({ length: colunas - 2 }, (_, i) => vals[i] ?? '')
    return [l.descricao, l.pax, ...resto]
  }

  const corpo = linhas
    .map((l) => preencherLinha(l.total ? modeloTotal : modeloDado, celulas(l)))
    .join('')

  const inicioTrs = tbl.indexOf(trs[0])
  const fimTrs = tbl.lastIndexOf(trs[trs.length - 1]) + trs[trs.length - 1].length
  const novaTbl = tbl.slice(0, inicioTrs) + cabecalho + corpo + tbl.slice(fimTrs)

  return xml.slice(0, tblMatch.index) + novaTbl + xml.slice(tblMatch.index + tbl.length)
}

/**
 * Reparte os grupos do cardápio entre as colunas do slide.
 *
 * Divide por VOLUME DE TEXTO, não por número de grupos: metade dos grupos
 * pode ser o dobro de linhas. E nunca parte um grupo ao meio — título e
 * sabores ficam sempre na mesma coluna.
 */
function dividirEmColunas<T extends { titulo: string; detalhe: string }>(
  linhas: T[],
  nColunas: number
): T[][] {
  const n = Math.max(1, nColunas)
  if (n === 1) return [linhas]

  const peso = (l: T) => 1 + Math.ceil((l.titulo.length + l.detalhe.length) / 60)
  const total = linhas.reduce((s, l) => s + peso(l), 0)
  const alvo = total / n

  const colunas: T[][] = Array.from({ length: n }, () => [])
  let atual = 0
  let acumulado = 0

  linhas.forEach((l, i) => {
    const p = peso(l)
    const restamGrupos = linhas.length - i
    const restamColunas = n - atual
    // vira a coluna quando já passou do alvo, desde que sobrem grupos
    // suficientes para nenhuma coluna ficar vazia
    if (atual < n - 1 && acumulado > 0 && acumulado + p / 2 > alvo && restamGrupos >= restamColunas) {
      atual++
      acumulado = 0
    }
    colunas[atual].push(l)
    acumulado += p
  })

  return colunas
}

/**
 * Reescreve o sldIdLst na ordem pedida e descarta os slides de fora.
 *
 * Precisa ORDENAR, não só remover: os institucionais moram no fim do
 * template mas têm que sair logo depois da capa, antes dos dados.
 */
function montarDeck(pres: string, rels: string, ordem: number[]): { pres: string; rels: string } {
  const ridDoSlide = new Map<number, string>()
  for (const m of rels.matchAll(
    /<Relationship[^>]*Id="(rId\d+)"[^>]*Target="slides\/slide(\d+)\.xml"[^>]*\/>/g
  ))
    ridDoSlide.set(Number(m[2]), m[1])

  const lst = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres)
  if (!lst) return { pres, rels }

  const entradaDoRid = new Map<string, string>()
  for (const m of lst[1].matchAll(/<p:sldId[^>]*r:id="(rId\d+)"[^>]*\/>/g))
    entradaDoRid.set(m[1], m[0])

  const usados = new Set<string>()
  const novas: string[] = []
  for (const n of ordem) {
    const rid = ridDoSlide.get(n)
    if (!rid || usados.has(rid)) continue
    const entrada = entradaDoRid.get(rid)
    if (!entrada) continue
    usados.add(rid)
    novas.push(entrada)
  }
  if (!novas.length) return { pres, rels }

  pres = pres.replace(lst[0], `<p:sldIdLst>${novas.join('')}</p:sldIdLst>`)
  for (const rid of ridDoSlide.values()) {
    if (usados.has(rid)) continue
    rels = rels.replace(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*/>`), '')
  }
  return { pres, rels }
}

/** Substitui apenas a N-ésima (0-based) ocorrência do placeholder. */
function substituirNesima(xml: string, placeholder: string, n: number, valor: string): string {
  const alvo = `<a:t>${placeholder}</a:t>`
  let idx = -1
  let count = -1
  let from = 0
  for (;;) {
    idx = xml.indexOf(alvo, from)
    if (idx === -1) return xml
    count++
    if (count === n) break
    from = idx + alvo.length
  }
  return xml.slice(0, idx) + `<a:t>${xmlEscape(valor)}</a:t>` + xml.slice(idx + alvo.length)
}

/** Baixa o template oficial do bucket público `assets`. */
async function baixarTemplate(): Promise<ArrayBuffer> {
  const { data } = supabase.storage.from('assets').getPublicUrl(TEMPLATE_PATH)
  const resp = await fetch(data.publicUrl)
  if (!resp.ok) {
    throw new Error(
      `Template não encontrado no Storage (assets/${TEMPLATE_PATH}). ` +
        'Faça upload do arquivo "00. Pieggi - Orçamento - Template.pptx" com esse nome no bucket assets.'
    )
  }
  return resp.arrayBuffer()
}

export async function gerarPropostaPptx(dados: DadosProposta): Promise<Blob> {
  const buf = await baixarTemplate()
  const zip = await JSZip.loadAsync(buf)

  // ---------- slide2 — dados do cliente ----------
  const s2Path = 'ppt/slides/slide2.xml'
  let s2 = await zip.file(s2Path)!.async('string')
  s2 = substituirSequencial(s2, 'Nome cliente', [dados.cliente])
  s2 = substituirSequencial(s2, 'Nome do evento', [dados.evento])
  s2 = substituirSequencial(s2, 'Nome do responsável', [dados.contato])
  s2 = substituirSequencial(s2, 'Quantidade de pessoas', [dados.pax])
  // "Data" aparece 2× (rótulo e valor) — só a 2ª recebe o valor
  s2 = substituirNesima(s2, 'Data', 1, dados.data)
  s2 = substituirSequencial(s2, 'Horário do evento', [dados.horario])
  zip.file(s2Path, s2)

  // ---------- slide de orçamento ----------
  const s3Path = `ppt/slides/slide${dados.slideOrcamento ?? 3}.xml`
  let s3 = await zip.file(s3Path)!.async('string')

  if (dados.tabela?.length) {
    // tabela dinâmica: quantas linhas forem necessárias, adaptando às colunas
    s3 = preencherTabelaOrcamento(s3, dados.tabela, dados.cabecalhosTabela)
  } else {
    // legado: 4 linhas fixas do template
    const descricoes = dados.linhas.slice(0, 4).map((l) => l.descritivo)
    const xxx: string[] = []
    for (let i = 0; i < 4; i++) {
      const l = dados.linhas[i]
      xxx.push(l ? l.pax : '', l ? l.valor : '')
    }
    xxx.push(dados.restricaoPax ?? '', dados.restricaoValor ?? '')
    s3 = substituirSequencial(s3, 'Opção', descricoes)
    s3 = substituirSequencial(s3, 'XXX', xxx)
    s3 = substituirSequencial(s3, 'R$ XXX', [dados.total])
  }
  zip.file(s3Path, s3)

  // ---------- escrever os cardápios reais (um por slide) ----------
  for (const c of dados.cardapios ?? []) {
    if (!c.linhas.length) continue
    const path = `ppt/slides/slide${c.slide}.xml`
    const arq = zip.file(path)
    if (!arq) continue
    let sx = await arq.async('string')

    // cabeçalho do slide
    if (c.shapeTitulo && (c.titulo || c.subtitulo)) {
      sx = reescreverShape(sx, c.shapeTitulo, [
        { titulo: c.titulo ?? '', detalhe: c.subtitulo ?? '' },
      ])
    }

    // divide o cardápio entre as colunas equilibrando o volume de texto
    const colunas = dividirEmColunas(c.linhas, c.shapes.length)
    c.shapes.forEach((shape, i) => {
      const parte = colunas[i]
      if (parte?.length) sx = reescreverShape(sx, shape.nome, parte, shape.ocorrencia ?? 0)
    })
    zip.file(path, sx)
  }

  // ---------- montar o deck na ordem certa ----------
  if (dados.ordemSlides?.length) {
    const relsPath = 'ppt/_rels/presentation.xml.rels'
    const presPath = 'ppt/presentation.xml'
    const r = montarDeck(
      await zip.file(presPath)!.async('string'),
      await zip.file(relsPath)!.async('string'),
      dados.ordemSlides
    )
    zip.file(presPath, r.pres)
    zip.file(relsPath, r.rels)
    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      compression: 'DEFLATE',
    })
  }

  // ---------- (legado) remover slides opcionais não usados ----------
  const universoCardapio = dados.todosCardapio ?? SLIDES_CARDAPIO.map((s) => s.n)
  const universoInstitucional = dados.todosInstitucionais ?? []
  const manterInstitucional = dados.slidesInstitucionais ?? []
  const remover = [
    ...universoCardapio.filter((n) => !dados.slidesCardapio.includes(n)),
    ...universoInstitucional.filter((n) => !manterInstitucional.includes(n)),
  ]

  if (remover.length) {
    const relsPath = 'ppt/_rels/presentation.xml.rels'
    let rels = await zip.file(relsPath)!.async('string')
    const presPath = 'ppt/presentation.xml'
    let pres = await zip.file(presPath)!.async('string')

    for (const n of remover) {
      // acha o rId do slide N nos relationships
      const m = rels.match(
        new RegExp(`<Relationship[^>]*Id="(rId\\d+)"[^>]*Target="slides/slide${n}\\.xml"[^>]*/>`)
      )
      if (!m) continue
      const rid = m[1]
      // remove o relationship e a entrada do sldIdLst
      rels = rels.replace(m[0], '')
      pres = pres.replace(new RegExp(`<p:sldId[^>]*r:id="${rid}"[^>]*/>`), '')
    }

    zip.file(relsPath, rels)
    zip.file(presPath, pres)
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  })
}

