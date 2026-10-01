// ============================================================
// UM SETOR DA EXPEDIÇÃO — comidas, bebidas ou estrutura
//
// Cada linha da comanda é ticada por quem confere, com nome e hora —
// conferir é assinar. Desmarcar apaga a conferência (a linha existir em
// expedicao_checks É o "conferido").
//
// Em COMIDAS a linha mostra também o status que a praça deu na TV
// (/producao/:estacao). Não trava a conferência: se a praça esqueceu de
// dar baixa e a comida está ali, a expedição confere — mas a linha fica
// amarela para alguém perguntar.
// ============================================================

import type { ReactNode } from 'react'
import { Badge, Card } from '@/components/ui'
import { ORIGEM_LABEL, progresso, type LinhaConferencia } from '@/engine/expedicao'
import {
  ESTACAO_INFO,
  PRODUCAO_STATUS_LABEL,
  SETOR_CONFERENCIA_LABEL,
  type ExpedicaoCheck,
  type ProducaoStatus,
  type SetorConferencia,
} from '@/tipos/operacao'
import { BarraProgresso, horaMarcada } from './comum'

export default function SetorExpedicao({
  setor,
  linhas,
  checks,
  statusPraca,
  pode,
  ocupado,
  onAlternar,
  aviso,
  rodape,
}: {
  setor: SetorConferencia
  linhas: LinhaConferencia[]
  checks: Map<string, ExpedicaoCheck>
  /** status da praça por chave de produção (só comidas) */
  statusPraca: (l: LinhaConferencia) => ProducaoStatus | null
  pode: boolean
  /** a linha está salvando agora (só ela fica travada) */
  ocupado: (l: LinhaConferencia) => boolean
  onAlternar: (l: LinhaConferencia, atual: ExpedicaoCheck | undefined) => void
  aviso?: ReactNode
  rodape?: ReactNode
}) {
  const feitos = linhas.filter((l) => checks.has(l.chave)).length
  const p = progresso(feitos, linhas.length)
  const completo = feitos === linhas.length

  return (
    <Card
      title={SETOR_CONFERENCIA_LABEL[setor]}
      actions={
        <Badge tone={completo ? 'green' : feitos ? 'amber' : 'neutral'}>
          {feitos}/{linhas.length}
        </Badge>
      }
    >
      <div className="mb-3">
        <BarraProgresso pct={linhas.length ? p.pct : 100} />
      </div>
      {aviso}
      {!linhas.length ? (
        <p className="text-sm text-neutral-500">Nada deste setor para o dia.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {linhas.map((l) => {
            const c = checks.get(l.chave)
            const praca = statusPraca(l)
            const naoPronto = praca != null && praca !== 'pronto'
            return (
              <label
                key={l.chave}
                className={
                  'flex items-start gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors duration-200 ' +
                  (c ? 'bg-green-700/10 ' : naoPronto ? 'bg-amber-500/10 ' : '') +
                  (pode ? 'cursor-pointer hover:bg-[var(--pg-border)]/30' : 'cursor-default')
                }
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-green-700 disabled:opacity-40"
                  checked={Boolean(c)}
                  disabled={!pode || ocupado(l)}
                  onChange={() => onAlternar(l, c)}
                />
                <span className="min-w-0 flex-1">
                  <span className={c ? 'text-neutral-500 line-through' : ''}>
                    <b className="tabular-nums">{l.qtd}</b>{' '}
                    <span
                      className={
                        l.destaque === 'vermelho'
                          ? 'rounded bg-red-100 px-1 text-red-900'
                          : l.destaque === 'amarelo'
                            ? 'rounded bg-yellow-300/60 px-1 text-black'
                            : l.destaque === 'azul'
                              ? 'rounded bg-blue-100 px-1 text-blue-900'
                              : ''
                      }
                    >
                      {l.item && !l.texto.toLowerCase().startsWith(l.item.toLowerCase()) && setor === 'estrutura'
                        ? `${l.item} — ${l.texto}`
                        : l.texto}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
                    {setor === 'comidas' && (
                      <span
                        className="font-semibold"
                        style={l.estacao ? { color: ESTACAO_INFO[l.estacao].cor } : undefined}
                      >
                        {ORIGEM_LABEL[l.origem]}
                      </span>
                    )}
                    {praca && (
                      <span className={praca === 'pronto' ? 'text-green-700' : 'font-semibold text-amber-700'}>
                        praça: {PRODUCAO_STATUS_LABEL[praca].toLowerCase()}
                      </span>
                    )}
                    {l.servico && <span className="uppercase">{l.servico}</span>}
                    {c && (
                      <span>
                        ✓ {c.profiles?.nome ?? 'equipe'} · {horaMarcada(c.conferido_em)}
                      </span>
                    )}
                  </span>
                  {l.avisos.map((a) => (
                    <span key={a} className="mt-1 block text-xs font-semibold text-red-700">
                      ⚠ {a}
                    </span>
                  ))}
                  {c?.obs && <span className="mt-1 block text-xs italic">“{c.obs}”</span>}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {rodape}
    </Card>
  )
}
