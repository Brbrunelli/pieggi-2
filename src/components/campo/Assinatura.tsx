// Assinatura com o dedo, na tela do celular — o termo de sobras é
// assinado por quem recebe a comida do lado do cliente, ali no salão.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react'

export interface AssinaturaHandle {
  vazia: () => boolean
  limpar: () => void
  paraBlob: () => Promise<Blob | null>
}

const Assinatura = forwardRef<AssinaturaHandle>(function Assinatura(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const [vazia, setVazia] = useState(true)

  // o canvas tem a largura da tela; o desenho precisa da resolução real
  // (senão o traço sai borrado no celular, que tem 2–3× de densidade)
  useEffect(() => {
    const c = canvas.current!
    const dpr = window.devicePixelRatio || 1
    c.width = c.clientWidth * dpr
    c.height = c.clientHeight * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
  }, [])

  function ponto(e: PointerEvent<HTMLCanvasElement>) {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  useImperativeHandle(ref, () => ({
    vazia: () => vazia,
    limpar: () => {
      const c = canvas.current!
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
      setVazia(true)
    },
    paraBlob: () => new Promise((ok) => canvas.current!.toBlob(ok, 'image/png')),
  }))

  return (
    <canvas
      ref={canvas}
      className="h-40 w-full touch-none rounded-lg border border-dashed border-[var(--pg-border)] bg-white"
      onPointerDown={(e) => {
        desenhando.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        const ctx = e.currentTarget.getContext('2d')!
        const p = ponto(e)
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
      }}
      onPointerMove={(e) => {
        if (!desenhando.current) return
        const ctx = e.currentTarget.getContext('2d')!
        const p = ponto(e)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        if (vazia) setVazia(false)
      }}
      onPointerUp={() => (desenhando.current = false)}
      onPointerLeave={() => (desenhando.current = false)}
    />
  )
})

export default Assinatura
