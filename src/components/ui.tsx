// ============================================================
// BIBLIOTECA UI — PIEGGI Design System 1.0
//
// Mesma interface de antes (mesmos nomes, mesmas props), roupa nova.
// As telas não precisam ser tocadas: elas continuam usando <Card>,
// <Button variant="secondary">, <Badge tone="green"> e assim por diante.
//
// Linguagem: superfície bone/ink, borda quase invisível, canto de 8px
// (a marca é caixa, é embalagem), pill só em botão e chip, movimento em
// expo.out. Cor forte só onde é decisão — nunca decoração.
// ============================================================

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

/** superfície + borda que respondem ao tema claro/escuro */
const SUPERFICIE = 'bg-[var(--pg-surface)] border-[var(--pg-border)]'
const CAMPO =
  'w-full rounded-lg border border-[var(--pg-border)] bg-transparent px-3.5 py-2.5 text-sm ' +
  'text-[var(--pg-text)] outline-none transition-all duration-300 ' +
  'placeholder:text-neutral-400 focus:border-[var(--pg-text)] focus:ring-4 focus:ring-black/5 ' +
  'disabled:opacity-50'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}) {
  const styles = {
    // preto sólido → vira esmeralda no hover (o único uso do acento)
    primary:
      'bg-[var(--pg-text)] text-[var(--pg-bg)] border border-[var(--pg-text)] ' +
      'hover:bg-green-700 hover:border-green-700 hover:text-white',
    secondary:
      'border border-[var(--pg-border)] text-[var(--pg-text)] ' +
      'hover:bg-[var(--pg-text)] hover:text-[var(--pg-bg)]',
    danger: 'bg-red-700 text-white border border-red-700 hover:brightness-125',
    ghost: 'border-0 text-neutral-600 hover:text-green-700',
  }
  return (
    <button
      className={
        'rounded-full px-5 py-2.5 text-xs font-semibold transition-all duration-300 ' +
        '[transition-timing-function:cubic-bezier(.16,1,.3,1)] ' +
        'hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 ' +
        'disabled:hover:translate-y-0 disabled:hover:bg-transparent ' +
        `${styles[variant]} ${className}`
      }
      {...props}
    />
  )
}

/** rótulo de campo — mono, micro, tracking largo */
function Rotulo({ texto, obrigatorio }: { texto: string; obrigatorio?: boolean }) {
  return (
    <span className="pg-key mb-1.5 block">
      {texto}
      {obrigatorio && <span className="text-red-700"> *</span>}
    </span>
  )
}

export function Input({
  label,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const input = <input className={`${CAMPO} ${className}`} {...props} />
  if (!label) return input
  return (
    <label className="block">
      <Rotulo texto={label} obrigatorio={props.required} />
      {input}
    </label>
  )
}

export function Select({
  label,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const select = (
    <select className={`${CAMPO} ${className}`} {...props}>
      {children}
    </select>
  )
  if (!label) return select
  return (
    <label className="block">
      <Rotulo texto={label} obrigatorio={props.required} />
      {select}
    </label>
  )
}

export function Textarea({
  label,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const el = <textarea className={`${CAMPO} ${className}`} {...props} />
  if (!label) return el
  return (
    <label className="block">
      <Rotulo texto={label} />
      {el}
    </label>
  )
}

export function Card({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={
        `rounded-lg border ${SUPERFICIE} transition-all duration-500 ` +
        '[transition-timing-function:cubic-bezier(.16,1,.3,1)] ' +
        `hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,.08)] ${className}`
      }
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--pg-border)] px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
            {title}
          </h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'
}) {
  const tones = {
    neutral: 'border border-[var(--pg-border)] text-neutral-600',
    green: 'bg-green-700 text-white',
    amber: 'bg-amber-700 text-white',
    red: 'bg-red-700 text-white',
    blue: 'bg-neutral-700 text-white',
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/**
 * Par tipográfico da marca. Aceita as duas formas:
 *   <PageTitle>Comandas</PageTitle>              → só a palavra
 *   <PageTitle lead="OPERAÇÃO">Comandas</PageTitle> → rótulo + palavra
 */
export function PageTitle({
  children,
  actions,
  lead,
}: {
  children: ReactNode
  actions?: ReactNode
  lead?: string
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--pg-border)] pb-5">
      <div className="pg-headline">
        {lead && <b>{lead}</b>}
        <i>{children}</i>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--pg-border)] p-12 text-center text-sm text-neutral-500">
      {children}
    </div>
  )
}

export function Th({ children }: { children?: ReactNode }) {
  return (
    <th className="pg-key border-b border-[var(--pg-border)] px-4 py-3 text-left">{children}</th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`border-b border-[var(--pg-border)] px-4 py-3 text-[13px] ${className}`}>
      {children}
    </td>
  )
}
