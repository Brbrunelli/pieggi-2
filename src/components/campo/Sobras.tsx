// ============================================================
// TERMO DE ENTREGA DE ALIMENTOS REMANESCENTES — no celular
//
// O mesmo termo do papel (lib/copeiras.ts — fonte única): o cliente lê
// o texto de responsabilidade, a copeira lista o que está entregando, e
// quem recebe assina com o dedo. O texto aceito fica guardado junto com
// a assinatura, e o termo assinado sai em PDF para mandar ao cliente.
//
// Um termo por dia de evento; "não sobrou nada" também é registro — o
// que não pode é ficar em branco.
// ============================================================

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { horaCurta, subirArquivoCampo } from '@/lib/campo'
import { baixarBlob } from '@/lib/documentos'
import { TERMO_ACEITE, TERMO_TEXTO, TERMO_TITULO } from '@/lib/copeiras'
import { Badge, Button, Card, Input } from '@/components/ui'
import Assinatura, { type AssinaturaHandle } from './Assinatura'
import { FotoBotao, FotoMiniatura } from './Foto'
import { invalidarCampo } from './EtapasCampo'
import type { EventSobra, SobraItem } from '@/types'

const itemVazio = (): SobraItem => ({ descricao: '', quantidade: 0, unidade: 'un' })

function dataBR(iso: string): string {
  return iso.split('-').reverse().join('/')
}

export default function Sobras({
  eventId,
  dia,
  cliente,
  evento,
}: {
  eventId: string
  dia: string
  cliente: string
  evento: string
}) {
  const qc = useQueryClient()
  const { session, profile } = useAuth()
  const { conferirCampo, ehAdmin } = usePermissoes()
  const assinatura = useRef<AssinaturaHandle>(null)
  const [itens, setItens] = useState<SobraItem[]>([itemVazio()])
  const [recebedor, setRecebedor] = useState({ nome: '', contato: '' })
  const [entreguePor, setEntreguePor] = useState(profile?.nome ?? '')
  const [foto, setFoto] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const { data: termos } = useQuery({
    queryKey: ['campo-sobras', eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from('event_sobras').select('*').eq('event_id', eventId)
      if (error) throw error
      return data as EventSobra[]
    },
  })
  const termo = (termos ?? []).find((t) => t.dia === dia)

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: ['campo-sobras', eventId] })
    await invalidarCampo(qc, eventId)
  }

  const registrar = useMutation({
    mutationFn: async (semSobra: boolean) => {
      let assinaturaPath: string | null = null
      const validos = itens.filter((i) => i.descricao.trim() && i.quantidade > 0)
      if (!semSobra) {
        if (!validos.length) throw new Error('Liste o que está sendo entregue, com quantidade.')
        if (!recebedor.nome.trim()) throw new Error('Nome de quem recebe do lado do cliente.')
        if (!recebedor.contato.trim()) throw new Error('Documento ou telefone de quem recebe.')
        if (!entreguePor.trim()) throw new Error('Quem está entregando pela Pieggi?')
        if (assinatura.current?.vazia()) throw new Error('Peça para quem recebe assinar no quadro.')
        const blob = await assinatura.current!.paraBlob()
        if (blob) assinaturaPath = await subirArquivoCampo(eventId, 'assinatura', blob)
      }
      const { error } = await supabase.from('event_sobras').insert({
        event_id: eventId,
        dia,
        sem_sobra: semSobra,
        itens: semSobra ? [] : validos,
        recebedor_nome: semSobra ? null : recebedor.nome.trim(),
        recebedor_contato: semSobra ? null : recebedor.contato.trim(),
        entregue_por: entreguePor.trim() || null,
        // o texto que o cliente leu e aceitou — se mudar depois, este fica
        aceite_texto: semSobra ? null : TERMO_TEXTO.join('\n\n'),
        assinatura_path: assinaturaPath,
        foto_path: foto,
        registrado_por: session?.user.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setItens([itemVazio()])
      setRecebedor({ nome: '', contato: '' })
      setFoto(null)
      setMsg(null)
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const baixarPdf = useMutation({
    mutationFn: async (t: EventSobra) => {
      let png: ArrayBuffer | null = null
      if (t.assinatura_path) {
        const { data } = await supabase.storage.from('campo').download(t.assinatura_path)
        png = data ? await data.arrayBuffer() : null
      }
      const { gerarTermoPdf } = await import('@/lib/pdf-termo')
      const d = new Date(t.registrado_em)
      const blob = await gerarTermoPdf({
        cliente,
        evento,
        diaEvento: dataBR(t.dia),
        entregueEm: `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        itens: t.itens,
        recebedorNome: t.recebedor_nome ?? '',
        recebedorContato: t.recebedor_contato,
        entreguePor: t.entregue_por ?? null,
        texto: t.aceite_texto ? t.aceite_texto.split('\n\n') : undefined,
        assinaturaPng: png,
      })
      baixarBlob(blob, `Pieggi Termo de Entrega - ${cliente} - ${evento} - ${dataBR(t.dia).replace(/\//g, '-')}.pdf`)
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const refazer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('event_sobras').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
  })

  if (termo)
    return (
      <Card title="Termo de entrega de alimentos" actions={<Badge tone="green">Registrado</Badge>}>
        {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}
        {termo.sem_sobra ? (
          <p className="text-sm">Não sobrou nada neste dia — nada foi entregue ao cliente.</p>
        ) : (
          <>
            <ul className="mb-3 text-sm">
              {termo.itens.map((i, n) => (
                <li key={n}>
                  • {i.quantidade} {i.unidade} — {i.descricao}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Recebido por <b>{termo.recebedor_nome}</b>
              {termo.recebedor_contato && ` (${termo.recebedor_contato})`}
              {termo.entregue_por && (
                <>
                  {' '}
                  · entregue por <b>{termo.entregue_por}</b>
                </>
              )}
            </p>
          </>
        )}
        <div className="mt-3 flex items-center gap-3">
          {termo.assinatura_path && <FotoMiniatura path={termo.assinatura_path} tamanho={96} />}
          {termo.foto_path && <FotoMiniatura path={termo.foto_path} tamanho={96} />}
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">{horaCurta(termo.registrado_em)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!termo.sem_sobra && (
            <Button variant="secondary" disabled={baixarPdf.isPending} onClick={() => baixarPdf.mutate(termo)}>
              {baixarPdf.isPending ? 'Gerando…' : 'Baixar termo assinado (PDF)'}
            </Button>
          )}
          {ehAdmin && (
            <Button variant="ghost" onClick={() => refazer.mutate(termo.id)}>
              Apagar e refazer
            </Button>
          )}
        </div>
      </Card>
    )

  if (!conferirCampo)
    return (
      <Card title="Termo de entrega de alimentos">
        <p className="text-sm text-neutral-500">Ainda não registrado.</p>
      </Card>
    )

  return (
    <Card title="Termo de entrega de alimentos" actions={<Badge tone="neutral">Pendente</Badge>}>
      <p className="mb-3 text-xs text-neutral-500">
        Cliente quer levar o que sobrou? Antes de entregar: listar, mostrar o termo e colher a
        assinatura. Não sobrou nada? Toque em "Não sobrou nada".
      </p>
      {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      <span className="pg-key mb-1.5 block">O que está sendo entregue</span>
      <div className="flex flex-col gap-2">
        {itens.map((it, n) => (
          <div key={n} className="grid grid-cols-[1fr_72px_64px] gap-2">
            <Input
              placeholder="Item (ex.: mini brioche peito de peru)"
              value={it.descricao}
              onChange={(e) => setItens(itens.map((x, i) => (i === n ? { ...x, descricao: e.target.value } : x)))}
            />
            <Input
              inputMode="decimal"
              placeholder="qtd"
              value={it.quantidade || ''}
              onChange={(e) =>
                setItens(itens.map((x, i) => (i === n ? { ...x, quantidade: Number(e.target.value.replace(',', '.')) || 0 } : x)))
              }
            />
            <Input
              placeholder="un"
              value={it.unidade}
              onChange={(e) => setItens(itens.map((x, i) => (i === n ? { ...x, unidade: e.target.value } : x)))}
            />
          </div>
        ))}
        <Button variant="ghost" className="self-start !px-0" onClick={() => setItens([...itens, itemVazio()])}>
          + item
        </Button>
      </div>

      {/* o texto de responsabilidade — o cliente lê antes de assinar */}
      <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-[var(--pg-border)] bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-700">
        <div className="mb-1 font-semibold">{TERMO_TITULO}</div>
        {TERMO_TEXTO.map((t) => (
          <p key={t} className="mb-1.5">
            {t}
          </p>
        ))}
        <p className="font-semibold">{TERMO_ACEITE}</p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          label="Nome de quem recebe"
          value={recebedor.nome}
          onChange={(e) => setRecebedor({ ...recebedor, nome: e.target.value })}
        />
        <Input
          label="Documento ou telefone"
          value={recebedor.contato}
          onChange={(e) => setRecebedor({ ...recebedor, contato: e.target.value })}
        />
      </div>

      <div className="mt-3">
        <span className="pg-key mb-1.5 block">Assinatura de quem recebe</span>
        <Assinatura ref={assinatura} />
        <Button variant="ghost" className="!px-0" onClick={() => assinatura.current?.limpar()}>
          Limpar assinatura
        </Button>
      </div>

      <div className="mt-2">
        <Input label="Entregue por (Pieggi)" value={entreguePor} onChange={(e) => setEntreguePor(e.target.value)} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <FotoBotao eventId={eventId} pasta="sobras" rotulo="Foto do que foi entregue" onFoto={setFoto} />
        {foto && <FotoMiniatura path={foto} />}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={registrar.isPending} onClick={() => registrar.mutate(false)}>
          {registrar.isPending ? 'Salvando…' : 'Registrar termo assinado'}
        </Button>
        <Button variant="secondary" disabled={registrar.isPending} onClick={() => registrar.mutate(true)}>
          Não sobrou nada
        </Button>
      </div>
    </Card>
  )
}
