// Utilidades de documentos (sem dependências pesadas — os geradores
// JSZip/docx são carregados sob demanda via import() dinâmico).

import { supabase } from './supabase'

/** Um shape de texto do template: nome + qual ocorrência (o slide 4 repete o nome). */
export interface ShapeCardapio {
  nome: string
  /** 0 = primeira ocorrência do nome no slide */
  ocorrencia?: number
}

/**
 * Slides de cardápio do template e as COLUNAS de texto de cada um.
 *
 * Mapeado a partir do template real: os nomes mudam de slide para slide e o
 * mesmo nome tem papéis diferentes (`CaixaDeTexto 9` é "SERVIÇO VOLANTE" nos
 * slides 6/8/10 e é a coluna de Verrine no 11). Escrever num nome que não
 * existe no slide faz o cardápio sumir da proposta sem erro — por isso o mapa
 * é explícito, por slide.
 */
export const SLIDES_CARDAPIO: {
  n: number
  label: string
  shapes: ShapeCardapio[]
  shapeTitulo: string
}[] = [
  {
    n: 4,
    label: 'Coffee Break Basic / Standard',
    // duas colunas com o MESMO nome: Basic (#0) e Standard (#1)
    shapes: [
      { nome: 'Google Shape;61;p14', ocorrencia: 0 },
      { nome: 'Google Shape;61;p14', ocorrencia: 1 },
    ],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 5,
    label: 'Coquetel Executive — Ilha estática',
    shapes: [{ nome: 'Google Shape;89;p18' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 6,
    label: 'Coquetel Executive — Serviço volante',
    shapes: [{ nome: 'Google Shape;89;p18' }, { nome: 'CaixaDeTexto 5' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 7,
    label: 'Coquetel Executive — Ilha estática (variação)',
    shapes: [{ nome: 'Google Shape;89;p18' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 8,
    label: 'Coquetel Master — Serviço volante',
    shapes: [{ nome: 'Google Shape;89;p18' }, { nome: 'CaixaDeTexto 5' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 9,
    label: 'Coquetel Master — Ilha estática',
    shapes: [{ nome: 'Google Shape;89;p18' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 10,
    label: 'Coquetel Master — Volante + massa/salada',
    shapes: [{ nome: 'Google Shape;89;p18' }, { nome: 'CaixaDeTexto 6' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 11,
    label: 'Coquetel Master — Ilha estática (favo de mel)',
    shapes: [{ nome: 'Google Shape;89;p18' }, { nome: 'CaixaDeTexto 9' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
  {
    n: 12,
    label: 'Coffee Break Executive + Bar de drinks',
    // CaixaDeTexto 19/20 são o bar de drinks — não recebem o cardápio de comida
    shapes: [{ nome: 'Google Shape;89;p18' }, { nome: 'Google Shape;112;p19' }],
    shapeTitulo: 'CaixaDeTexto 1',
  },
]

/** Colunas de texto do slide de cardápio (fallback: uma coluna genérica). */
export function shapesDoSlide(n: number): { shapes: ShapeCardapio[]; shapeTitulo: string } {
  const s = SLIDES_CARDAPIO.find((x) => x.n === n)
  return {
    shapes: s?.shapes ?? [{ nome: 'Google Shape;89;p18' }],
    shapeTitulo: s?.shapeTitulo ?? 'CaixaDeTexto 1',
  }
}

/** Dispara o download no navegador. */
export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Sobe o arquivo gerado para o Storage e registra em `documents`. */
export async function salvarDocumento(
  eventoId: string,
  blob: Blob,
  nomeArquivo: string,
  tipo: 'proposta_pptx' | 'programacao_docx' | 'comanda_docx' | 'plaquinha_pdf' | 'compras_xlsx'
): Promise<string | null> {
  const path = `${eventoId}/${Date.now()}-${nomeArquivo}`
  const { error } = await supabase.storage.from('documentos').upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  })
  if (error) return null
  await supabase.from('documents').insert({
    event_id: eventoId,
    tipo,
    nome_arquivo: nomeArquivo,
    storage_path: path,
  })
  return path
}
