// ============================================================
// FOTOS E ASSINATURAS DA RUA — bucket privado 'campo' (0030)
//
// Foto de celular sai com 4–8 MB. No 4G de um salão de evento isso
// trava o upload e a pessoa desiste do checklist. Antes de subir, a
// foto é reduzida para 1600 px no lado maior em JPEG — fica legível
// como evidência e cai para ~300 KB.
//
// Caminho: <event_id>/<pasta>/<carimbo>.jpg — a pasta diz o que é
// (checklist, sobras, ocorrencia, assinatura).
// ============================================================

import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

const BUCKET = 'campo'
const LADO_MAX = 1600

export async function comprimirImagem(arquivo: File | Blob, qualidade = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo)
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade))
    return blob ?? arquivo
  } catch {
    // navegador que não decodifica o formato (HEIC no desktop): sobe o
    // original — evidência pesada é melhor que evidência nenhuma
    return arquivo
  }
}

export async function subirArquivoCampo(
  eventId: string,
  pasta: 'checklist' | 'sobras' | 'ocorrencia' | 'assinatura',
  blob: Blob
): Promise<string> {
  const ext = blob.type === 'image/png' ? 'png' : 'jpg'
  const carimbo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const path = `${eventId}/${pasta}/${carimbo}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

/** Comprime e sobe a foto tirada no celular. Devolve o caminho no bucket. */
export async function subirFoto(
  eventId: string,
  pasta: 'checklist' | 'sobras' | 'ocorrencia',
  arquivo: File
): Promise<string> {
  return subirArquivoCampo(eventId, pasta, await comprimirImagem(arquivo))
}

/** URL assinada (bucket privado) — vale 1 h, renovada pelo cache do React Query. */
export function useUrlCampo(path: string | null | undefined) {
  return useQuery({
    queryKey: ['campo-url', path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export function horaCurta(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(
    d.getHours()
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
