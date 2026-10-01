// Botão de câmera + miniatura. No celular, `capture="environment"` abre
// direto a câmera traseira — evidência é foto tirada na hora, não
// imagem escolhida da galeria.

import { useRef, useState } from 'react'
import { subirFoto, useUrlCampo } from '@/lib/campo'
import { Button } from '@/components/ui'

export function FotoBotao({
  eventId,
  pasta,
  onFoto,
  rotulo = 'Tirar foto',
  disabled,
}: {
  eventId: string
  pasta: 'checklist' | 'sobras' | 'ocorrencia'
  onFoto: (path: string) => void | Promise<void>
  rotulo?: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function escolheu(arquivo: File | undefined) {
    if (!arquivo) return
    setSubindo(true)
    setErro(null)
    try {
      await onFoto(await subirFoto(eventId, pasta, arquivo))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSubindo(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <span className="inline-flex flex-col">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => escolheu(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="secondary"
        className="!px-3 !py-1.5"
        disabled={disabled || subindo}
        onClick={() => input.current?.click()}
      >
        {subindo ? 'Enviando…' : `📷 ${rotulo}`}
      </Button>
      {erro && <span className="mt-1 text-[11px] text-red-700">🛑 {erro}</span>}
    </span>
  )
}

export function FotoMiniatura({ path, tamanho = 56 }: { path: string; tamanho?: number }) {
  const { data: url } = useUrlCampo(path)
  if (!url)
    return (
      <span
        className="inline-block animate-pulse rounded-lg bg-[var(--pg-border)]"
        style={{ width: tamanho, height: tamanho }}
      />
    )
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Abrir a foto">
      <img
        src={url}
        alt="evidência"
        className="rounded-lg border border-[var(--pg-border)] object-cover"
        style={{ width: tamanho, height: tamanho }}
      />
    </a>
  )
}
