// ============================================================
// UM ITEM NA TV DA PRAÇA — toque para avançar
//
// Na cozinha ninguém para de trabalhar para abrir menu: o cartão
// inteiro é o botão. Cada toque avança um passo
//   a fazer → produzindo → pronto
// e o "voltar" pequeno desfaz o toque errado. A instrução vermelha
// ("FINALIZAR NO LOCAL…") vem grudada no item que ela explica, como na
// comanda impressa — nunca solta, senão ninguém liga uma coisa à outra.
// ============================================================

import type { ItemPraca as Item } from '@/engine/expedicao'
import { PRODUCAO_STATUS_LABEL, type ProducaoItem, type ProducaoStatus } from '@/tipos/operacao'
import { horaMarcada } from './comum'

const ESTILO: Record<ProducaoStatus, string> = {
  a_fazer: 'border-[var(--pg-border)]',
  produzindo: 'border-amber-500 bg-amber-500/10',
  pronto: 'border-green-700 bg-green-700/10',
}

const PILULA: Record<ProducaoStatus, string> = {
  a_fazer: 'border border-[var(--pg-border)] text-neutral-500',
  produzindo: 'bg-amber-500 text-black',
  pronto: 'bg-green-700 text-white',
}

export default function ItemPraca({
  item,
  baixa,
  pode,
  ocupado,
  tv,
  onAvancar,
  onVoltar,
}: {
  item: Item
  baixa: ProducaoItem | undefined
  pode: boolean
  ocupado: boolean
  tv: boolean
  onAvancar: () => void
  onVoltar: () => void
}) {
  const status: ProducaoStatus = baixa?.status ?? 'a_fazer'
  const pronto = status === 'pronto'
  return (
    <div className={`flex flex-col rounded-lg border-2 transition-colors duration-300 ${ESTILO[status]}`}>
      <button
        type="button"
        disabled={!pode || ocupado || pronto}
        onClick={onAvancar}
        className={
          'flex flex-1 flex-col gap-1 p-3 text-left disabled:cursor-default ' +
          (pode && !pronto ? 'cursor-pointer active:scale-[0.99]' : '')
        }
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`font-bold tabular-nums ${tv ? 'text-3xl' : 'text-xl'} ${pronto ? 'text-neutral-500' : ''}`}>
            {item.qtd}
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] ${PILULA[status]}`}>
            {PRODUCAO_STATUS_LABEL[status].toUpperCase()}
          </span>
        </div>
        <span
          className={
            `${tv ? 'text-lg' : 'text-sm'} font-medium leading-snug ` +
            (pronto ? 'text-neutral-500 line-through ' : '') +
            // rev. 24/09: vermelho = restrição · amarelo = finalizar no local · azul = cuidado de serviço
            (item.destaque === 'vermelho'
              ? 'rounded bg-red-100 px-1 text-red-900 '
              : item.destaque === 'amarelo'
                ? 'rounded bg-yellow-300/60 px-1 text-black '
                : item.destaque === 'azul'
                  ? 'rounded bg-blue-100 px-1 text-blue-900 '
                  : '')
          }
        >
          {item.texto}
        </span>
        {item.servico && <span className={`${tv ? 'text-xs' : 'text-[11px]'} uppercase tracking-wide text-neutral-500`}>{item.servico}</span>}
        {item.avisos.map((a) => (
          <span
            key={a}
            className={`mt-1 rounded-md border border-red-700 bg-red-700/10 px-2 py-1 font-semibold text-red-700 ${tv ? 'text-sm' : 'text-xs'}`}
          >
            ⚠ {a}
          </span>
        ))}
      </button>
      {(baixa || (pode && status !== 'a_fazer')) && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--pg-border)] px-3 py-1.5 text-[11px] text-neutral-500">
          <span>{baixa ? `${baixa.profiles?.nome ?? 'equipe'} · ${horaMarcada(baixa.atualizado_em)}` : ''}</span>
          {pode && status !== 'a_fazer' && (
            <button type="button" onClick={onVoltar} disabled={ocupado} className="font-semibold underline hover:text-[var(--pg-text)]">
              ↶ voltar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
