// ============================================================
// SELETOR DE FUNÇÃO — lista fixa, nunca texto livre
//
// A vaga (Escala) e o escalado (Equipe, cadastro do freela) se casam
// pela função. Com texto livre, "garçons" não casava com "garçom" e a
// vaga ficava vermelha para sempre. Aqui só se escolhe da lista
// (FUNCOES, src/engine/freelas.ts) e o que se grava é a chave canônica.
// Um valor antigo fora da lista aparece como opção para não sumir.
// ============================================================

import { Select } from '@/components/ui'
import { FUNCOES, funcaoCanonica } from '@/engine/freelas'

export default function SeletorFuncao({
  value,
  onChange,
  label = 'Função',
  vazio = '— escolha —',
  required,
}: {
  value: string
  onChange: (funcao: string) => void
  label?: string
  vazio?: string
  required?: boolean
}) {
  const canonica = funcaoCanonica(value)
  const atual = canonica ?? value
  const antigo = value && !canonica ? value : null
  return (
    <Select label={label} value={atual} required={required} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vazio}</option>
      {FUNCOES.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
      {antigo && <option value={antigo}>{antigo} (fora da lista)</option>}
    </Select>
  )
}
