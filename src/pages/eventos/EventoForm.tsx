import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { garantirClienteNoCRM } from '@/lib/crm'
import { useAuth } from '@/lib/auth'
import { Button, Card, Input, PageTitle, Select, Textarea } from '@/components/ui'
import { type Client, type PriceTable, type PieggiEvent, type PipelineStage, type Restricao } from '@/types'

/**
 * GATE dos dados críticos (regra Pieggi):
 * tabela de preço · PAX exato · horário início+fim (por serviço) · endereço completo.
 * Nunca deduzir, nunca arredondar — mesmo cliente recorrente.
 */
export default function EventoForm() {
  const { id } = useParams()
  const editando = Boolean(id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const { session } = useAuth()

  const { data: clientes } = useQuery({
    queryKey: ['clientes-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data as Client[]
    },
  })

  const { data: tabelas } = useQuery({
    queryKey: ['price-tables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_tables')
        .select('*')
        .eq('vigente', true)
        .order('nome')
      if (error) throw error
      return data as PriceTable[]
    },
  })

  const [form, setForm] = useState({
    nome: '',
    contato: '',
    client_id: '',
    cliente_nome: '',
    price_table_id: '',
    pax: '',
    endereco: '',
    endereco_confirmado: false,
    local_detalhe: '',
    acesso_carga: '',
    preco_a_definir: false,
    obs: '',
  })
  const [restricoes, setRestricoes] = useState<Restricao[]>([])
  // evento novo entra frio: o comercial esquenta arrastando no funil
  const [etapa, setEtapa] = useState<PipelineStage>('frio')
  const [pipedriveUrl, setPipedriveUrl] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return
        const e = data as PieggiEvent
        setForm({
          nome: e.nome,
          contato: e.contato ?? '',
          client_id: e.client_id ?? '',
          cliente_nome: e.cliente_nome ?? '',
          price_table_id: e.price_table_id ?? '',
          pax: e.pax?.toString() ?? '',
          endereco: e.endereco ?? '',
          endereco_confirmado: e.endereco_confirmado,
          local_detalhe: e.local_detalhe ?? '',
          acesso_carga: e.acesso_carga ?? '',
          preco_a_definir: e.preco_a_definir ?? false,
          obs: e.obs ?? '',
        })
        setRestricoes(e.restricoes ?? [])
        if (e.pipeline) setEtapa(e.pipeline)
        setPipedriveUrl(e.pipedrive_url ?? '')
      })
  }, [id])

  // Endereço fixo do cliente (StartSe / Inteli / WTC) — aplicar direto, nunca deduzir os demais
  function aoTrocarCliente(clientId: string) {
    const c = clientes?.find((x) => x.id === clientId)
    setForm((f) => ({
      ...f,
      client_id: clientId,
      endereco: c?.endereco_fixo && c.endereco ? c.endereco : f.endereco,
      // endereço fixo pré-preenche o acesso — mas a confirmação (andar e
      // com quem) é por evento: a sala da StartSe muda de evento para evento
      acesso_carga: c?.endereco_fixo && c.acesso_carga ? c.acesso_carga : f.acesso_carga,
    }))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    // GATE — validações que travam o cálculo
    if (!form.price_table_id) return setErro('Selecione a TABELA DE PREÇO (sempre a 1ª pergunta).')
    if (!form.pax || Number(form.pax) <= 0) return setErro('Informe o PAX exato (nunca deduzir).')
    if (!form.endereco.trim()) return setErro('Informe o ENDEREÇO completo.')
    // a CONFIRMAÇÃO (andar, acesso e com quem) não trava a venda: pode
    // ser feita no pós-venda, na tela do evento. Quem trava é a operação.

    if (!form.client_id && !form.cliente_nome.trim())
      return setErro('Informe o CLIENTE — selecione um cadastro ou digite o nome do cliente novo.')

    setSalvando(true)
    // cliente novo entra no CRM sozinho (0037). Se falhar, o evento salva
    // com o nome digitado e aparece no aviso do CRM para cadastrar depois.
    let clientId = form.client_id || null
    if (!clientId)
      clientId = await garantirClienteNoCRM({
        nome: form.cliente_nome,
        contato: form.contato.trim() || null,
        origem: 'evento',
      }).catch(() => null)
    const payload = {
      nome: form.nome.trim(),
      contato: form.contato.trim() || null,
      client_id: clientId,
      cliente_nome: clientId ? null : form.cliente_nome.trim(),
      price_table_id: form.price_table_id,
      pax: Number(form.pax),
      endereco: form.endereco.trim(),
      // endereco_confirmado NÃO vai daqui: quem confirma é a tela de
      // confirmação (com quem), e mexer no endereço derruba no banco (0033)
      local_detalhe: form.local_detalhe.trim() || null,
      acesso_carga: form.acesso_carga.trim() || null,
      preco_a_definir: form.preco_a_definir,
      pipeline: etapa,
      pipedrive_url: pipedriveUrl.trim() || null,
      restricoes,
      obs: form.obs.trim() || null,
    }

    let eventoId = id
    if (editando) {
      const { error } = await supabase.from('events').update(payload).eq('id', id!)
      if (error) {
        setSalvando(false)
        return setErro(error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...payload, created_by: session?.user.id })
        .select('id')
        .single()
      if (error) {
        setSalvando(false)
        return setErro(error.message)
      }
      eventoId = data.id
    }

    await qc.invalidateQueries({ queryKey: ['eventos'] })
    nav(`/eventos/${eventoId}`)
  }

  return (
    <div className="max-w-3xl">
      <PageTitle>{editando ? 'Editar evento' : 'Novo evento'}</PageTitle>

      <form onSubmit={salvar} className="space-y-6">
        <Card title="Dados do evento">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Nome do evento"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
            <Input
              label="Contato / responsável"
              value={form.contato}
              onChange={(e) => setForm({ ...form, contato: e.target.value })}
            />
            <Select
              label="Cliente cadastrado"
              value={form.client_id}
              onChange={(e) => aoTrocarCliente(e.target.value)}
            >
              <option value="">— Cliente novo / sem cadastro —</option>
              {clientes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            {!form.client_id && (
              <Input
                label="Nome do cliente (cliente novo)"
                placeholder="Ex.: Fundação Otorrinolaringologia"
                value={form.cliente_nome}
                onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })}
                required
              />
            )}
            <label className="flex items-end gap-2 pb-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.preco_a_definir}
                onChange={(e) => setForm({ ...form, preco_a_definir: e.target.checked })}
                className="h-4 w-4"
              />
              <span>
                <b>Preço a definir</b> — cliente novo que ainda não conhece a casa; o slide sai com
                &quot;R$ a definir&quot; no lugar dos valores
              </span>
            </label>
          </div>
          <div className="mt-4">
            <Input
              label="LINK DO NEGÓCIO NO PIPEDRIVE (opcional)"
              placeholder="https://…pipedrive.com/deal/1234"
              value={pipedriveUrl}
              onChange={(e) => setPipedriveUrl(e.target.value)}
            />
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            O <b>valor do orçamento</b> não é digitado aqui: ele vem do total calculado na Proposta e
            alimenta a verba de 8% da página da Adriana automaticamente. O acompanhamento comercial
            fica no <b>Pipedrive</b>; aqui o evento nasce em <b>negociação</b> e passa a{' '}
            <b>aprovado</b> quando o cliente aceita a proposta.
          </p>
        </Card>

        <Card title="🔒 Gate — dados críticos (nunca deduzir, nunca arredondar)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="1️⃣ Qual tabela de preço? (sempre a 1ª pergunta)"
              value={form.price_table_id}
              onChange={(e) => setForm({ ...form, price_table_id: e.target.value })}
              required
            >
              <option value="">— Selecionar —</option>
              {tabelas?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
            <Input
              label="2️⃣ PAX exato"
              type="number"
              min="1"
              value={form.pax}
              onChange={(e) => setForm({ ...form, pax: e.target.value })}
              required
            />
            <div className="md:col-span-2">
              <Input
                label="3️⃣ Endereço completo"
                value={form.endereco}
                onChange={(e) =>
                  setForm({ ...form, endereco: e.target.value, endereco_confirmado: false })
                }
                required
              />
            </div>
            <Input
              label="Andar / sala / auditório / torre / bloco"
              value={form.local_detalhe}
              onChange={(e) => setForm({ ...form, local_detalhe: e.target.value })}
            />
            <Textarea
              label="Como a carga entra (doca / portaria / elevador / horário)"
              rows={2}
              value={form.acesso_carga}
              onChange={(e) => setForm({ ...form, acesso_carga: e.target.value })}
            />
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            📍 Sempre perguntar andar e como a carga entra. A <b>confirmação com o cliente</b> (com
            quem) fica na tela do evento — pode ser agora ou no pós-venda; sem ela a comanda não sai.
            {editando && form.endereco_confirmado && ' Mudar endereço, andar ou acesso derruba a confirmação.'}
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            4️⃣ Os horários (início <b>e</b> fim) são informados por serviço, na tela do evento —
            eles definem a reposição e o split manhã/tarde.
          </p>
        </Card>

        <Card title="Restrições alimentares / alérgicos">
          {restricoes.map((r, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <Input
                placeholder="Tipo (ex.: camarão, lactose, corante)"
                value={r.tipo}
                onChange={(e) => {
                  const novo = [...restricoes]
                  novo[i] = { ...r, tipo: e.target.value }
                  setRestricoes(novo)
                }}
              />
              <Input
                type="number"
                min="1"
                className="!w-24"
                placeholder="Pax"
                value={r.pax || ''}
                onChange={(e) => {
                  const novo = [...restricoes]
                  novo[i] = { ...r, pax: Number(e.target.value) }
                  setRestricoes(novo)
                }}
              />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                <input
                  type="checkbox"
                  checked={r.critico ?? false}
                  onChange={(e) => {
                    const novo = [...restricoes]
                    novo[i] = { ...r, critico: e.target.checked }
                    setRestricoes(novo)
                  }}
                />
                Crítico
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRestricoes(restricoes.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRestricoes([...restricoes, { tipo: '', pax: 1 }])}
          >
            + Adicionar restrição
          </Button>
          {restricoes.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              ⚠️ Eventos com restrições geram alerta de contaminação cruzada na Programação e
              linha em branco &quot;Opção sem lactose&quot; em todos os serviços.
            </p>
          )}
        </Card>

        <Card title="Observações">
          <Textarea
            rows={3}
            value={form.obs}
            onChange={(e) => setForm({ ...form, obs: e.target.value })}
          />
        </Card>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            🛑 {erro}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar evento'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => nav(-1)}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
