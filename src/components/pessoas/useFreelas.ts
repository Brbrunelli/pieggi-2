// ============================================================
// FREELAS + DOCUMENTOS — o que a escala precisa saber de cada um
//
// Uma consulta só para o cadastro e outra para os documentos (contrato
// e ASO); a situação de cada freela é CALCULADA para o dia pedido
// (situacaoFreela) — nunca guardada, porque ASO vence sozinho.
// ============================================================

import { useCallback, useMemo } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { situacaoFreela } from '@/engine/freelas'
import type { Freelancer } from '@/types'
import type { FreelancerDocumento, SituacaoFreela } from '@/tipos/pessoas'

export const CHAVE_DOCS = ['freelancer-documentos']

export function useDocumentosFreelas(enabled = true) {
  return useQuery({
    queryKey: CHAVE_DOCS,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('freelancer_documentos').select('*').order('created_at')
      // antes da 0037 a tabela não existe: ninguém tem documento → ninguém apto
      if (error) return [] as FreelancerDocumento[]
      return data as FreelancerDocumento[]
    },
  })
}

/** Freelas ativos + função que diz a situação de cada um num dia. */
export function useFreelasComSituacao(enabled = true) {
  const { data: freelas } = useQuery({
    queryKey: ['freelancers'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('freelancers').select('*').eq('ativo', true).order('nome')
      if (error) throw error
      return data as Freelancer[]
    },
  })
  const { data: docs } = useDocumentosFreelas(enabled)

  const porFreela = useMemo(() => {
    const m = new Map<string, FreelancerDocumento[]>()
    for (const d of docs ?? []) m.set(d.freelancer_id, [...(m.get(d.freelancer_id) ?? []), d])
    return m
  }, [docs])

  const situacao = useCallback(
    (freelancerId: string, dia: string): SituacaoFreela => situacaoFreela(porFreela.get(freelancerId) ?? [], dia),
    [porFreela]
  )

  return { freelas: freelas ?? [], docs: docs ?? [], porFreela, situacao, carregado: Boolean(freelas && docs) }
}

export async function invalidarFreelas(qc: QueryClient) {
  await qc.invalidateQueries({ queryKey: CHAVE_DOCS })
  await qc.invalidateQueries({ queryKey: ['freelancers'] })
  await qc.invalidateQueries({ queryKey: ['freelancers-todos'] })
}

/**
 * A trava de documentos está ligada? (rule_params.exigir_docs_freela)
 *
 * Entrada no ar da 0037: a tabela de documentos nasce vazia, então a
 * trava nasce DESLIGADA — a Adriana lança contrato + ASO de todo mundo
 * e só então o Bruno muda para true em Regras. Desligada, quem está sem
 * documento continua escalável, mas aparece como pendência (âmbar).
 * Sem a linha (antes da 0037) = desligada.
 */
export function useExigirDocs(enabled = true): boolean {
  const { data } = useQuery({
    queryKey: ['rule-exigir-docs-freela'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('rule_params').select('valor').eq('chave', 'exigir_docs_freela').maybeSingle()
      if (error || !data) return false
      return (data as { valor: unknown }).valor === true || (data as { valor: unknown }).valor === 'true'
    },
  })
  return data ?? true // enquanto carrega, o mais seguro
}
