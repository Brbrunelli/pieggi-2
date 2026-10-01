// ============================================================
// SELETOR DE FREELA — só deixa escolher quem pode ir naquele dia
//
// Usado na aba Equipe do evento e na Escala da semana. Aparecem TODOS
// os freelas ativos, para a Adriana entender por que alguém não está
// disponível: os inaptos (sem contrato, ASO vencido) e os que já estão
// em outro evento no mesmo dia ficam desabilitados com o motivo.
// O banco trava de novo no insert (0037) — a tela só explica antes.
//
// Período de transição (trava de documentos desligada em Regras —
// exigir_docs_freela = false): quem está sem documento continua
// escolhível, num grupo à parte e com a pendência escrita, para a escala
// não parar enquanto a Adriana lança contrato + ASO de todo mundo.
// Conflito de dia (mesma pessoa em dois eventos) trava sempre.
// ============================================================

import { Select } from '@/components/ui'
import { conflitoEscala, rotuloSituacao, type EscaladoDia } from '@/engine/freelas'
import type { Freelancer } from '@/types'
import type { SituacaoFreela } from '@/tipos/pessoas'

export interface OpcaoFreela {
  freela: Freelancer
  situacao: SituacaoFreela
  /** onde ele já está nesse dia */
  ocupado: EscaladoDia | null
  pode: boolean
  /** por que NÃO pode (bloqueia) */
  motivo: string | null
  /** pode, mas falta documento — só na transição (trava desligada) */
  pendencia: string | null
}

export function opcoesFreela(
  freelas: Freelancer[],
  situacao: (id: string, dia: string) => SituacaoFreela,
  ocupados: EscaladoDia[],
  dia: string,
  exigirDocs = true
): OpcaoFreela[] {
  return freelas
    .map((f) => {
      const s = situacao(f.id, dia)
      const ocupado = conflitoEscala(ocupados, f.id, dia)
      const semDocs = s.apto ? null : s.motivos.join(' · ')
      const motivo =
        exigirDocs && semDocs
          ? semDocs
          : ocupado
            ? `já escalado em ${ocupado.evento_nome ?? 'outro evento'} neste dia`
            : null
      return { freela: f, situacao: s, ocupado, pode: !motivo, motivo, pendencia: motivo ? null : semDocs }
    })
    .sort(
      (a, b) =>
        Number(b.pode) - Number(a.pode) ||
        Number(!b.pendencia) - Number(!a.pendencia) ||
        a.freela.nome.localeCompare(b.freela.nome)
    )
}

export default function SeletorFreela({
  opcoes,
  value,
  onChange,
  label = 'Freelancer',
  vazio = '— escolha —',
}: {
  opcoes: OpcaoFreela[]
  value: string
  onChange: (f: Freelancer | null) => void
  label?: string
  vazio?: string
}) {
  const escolhida = opcoes.find((o) => o.freela.id === value)
  const aviso = escolhida && escolhida.pode && escolhida.situacao.vencendo.length ? rotuloSituacao(escolhida.situacao).texto : null
  const livres = opcoes.filter((o) => o.pode && !o.pendencia)
  const pendentes = opcoes.filter((o) => o.pode && o.pendencia)
  const bloqueados = opcoes.filter((o) => !o.pode)
  return (
    <div>
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(opcoes.find((o) => o.freela.id === e.target.value)?.freela ?? null)}
      >
        <option value="">{vazio}</option>
        {livres.length > 0 && (
          <optgroup label="Aptos e livres">
            {livres.map((o) => (
              <option key={o.freela.id} value={o.freela.id}>
                {o.freela.nome}
                {o.freela.funcao_padrao ? ` (${o.freela.funcao_padrao})` : ''}
                {o.situacao.vencendo.length ? ` — ${rotuloSituacao(o.situacao).texto}` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {pendentes.length > 0 && (
          <optgroup label="Sem documentos (transição — liberado)">
            {pendentes.map((o) => (
              <option key={o.freela.id} value={o.freela.id}>
                {o.freela.nome} — {o.pendencia}
              </option>
            ))}
          </optgroup>
        )}
        {bloqueados.length > 0 && (
          <optgroup label="Não podem neste dia">
            {bloqueados.map((o) => (
              <option key={o.freela.id} value={o.freela.id} disabled>
                {o.freela.nome} — {o.motivo}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {aviso && !escolhida?.pendencia && <p className="mt-1 text-[11px] text-amber-700">⚠️ {aviso} — avisar para renovar.</p>}
      {escolhida?.pendencia && (
        <p className="mt-1 text-[11px] font-semibold text-amber-700">
          ⚠️ {escolhida.pendencia} — liberado só porque a trava de documentos ainda está desligada. Lance os documentos.
        </p>
      )}
    </div>
  )
}
