// ============================================================
// EDGE FUNCTION: nota-fiscal — emissão via PlugNotas
//
// Recebe { invoice_id } e transmite a nota. Uma nota pode ter parte em
// SERVIÇO (NFS-e) e parte em PRODUTO (NF-e) — são documentos fiscais
// diferentes, então nota "mista" gera DUAS transmissões. Isso não é
// escolha de desenho, é como a legislação funciona.
//
// O ambiente vem de `fiscal_config.plugnotas_ambiente`: em
// 'homologacao' nada tem validade fiscal. É o padrão de propósito.
//
// Deploy:  npx supabase@latest functions deploy nota-fiscal --project-ref <ref>
// Secret:  PLUGNOTAS_TOKEN  (Project Settings → Edge Functions → Secrets)
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BASE = {
  homologacao: 'https://api.sandbox.plugnotas.com.br',
  producao: 'https://api.plugnotas.com.br',
}

interface Linha {
  [k: string]: unknown
}

/** Só dígitos — o PlugNotas recusa CNPJ/CPF com máscara. */
function digitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const token = Deno.env.get('PLUGNOTAS_TOKEN')?.trim()
    if (!token) {
      return Response.json(
        {
          erro:
            'PLUGNOTAS_TOKEN não configurado nesta função. Cadastre o secret em ' +
            'Project Settings → Edge Functions → Secrets (use o token de SANDBOX para testar).',
        },
        { status: 500, headers: CORS }
      )
    }

    const corpoReq = await req.json()
    const invoice_id = corpoReq.invoice_id
    const acao: 'emitir' | 'consultar' = corpoReq.acao === 'consultar' ? 'consultar' : 'emitir'
    if (!invoice_id) {
      return Response.json({ erro: 'invoice_id é obrigatório.' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const [notaRes, configRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', invoice_id).single(),
      supabase.from('fiscal_config').select('*').eq('id', 1).single(),
    ])
    if (notaRes.error) throw notaRes.error
    if (configRes.error) throw configRes.error

    const nota = notaRes.data as Linha
    const cfg = configRes.data as Linha

    const ambienteAtual = (cfg.plugnotas_ambiente as keyof typeof BASE) ?? 'homologacao'
    const baseUrl = BASE[ambienteAtual] ?? BASE.homologacao

    // ------------------------------------------------------------
    // CONSULTAR — o PlugNotas processa de forma assíncrona: número, PDF e
    // XML só existem alguns segundos (ou minutos) depois de transmitir.
    // Sem esta ação a nota ficaria presa em "transmitindo" para sempre.
    // ------------------------------------------------------------
    if (acao === 'consultar') {
      if (!nota.plugnotas_id) {
        return Response.json(
          { erro: 'Esta nota ainda não foi transmitida — não há o que consultar.' },
          { status: 400, headers: CORS }
        )
      }
      const rota = Number(nota.valor_servico) > 0 ? 'nfse' : 'nfe'
      const r = await fetch(`${baseUrl}/${rota}/${nota.plugnotas_id}`, {
        headers: { 'x-api-key': token },
      })
      const dados = (await r.json().catch(() => null)) as Linha | null
      if (!r.ok || !dados) {
        return Response.json(
          { erro: `Não consegui consultar (HTTP ${r.status}).` },
          { status: 502, headers: CORS }
        )
      }

      // A API varia o nome do campo entre NFS-e e NF-e; olhamos os dois.
      const situacao = String(dados.situacao ?? dados.status ?? '').toUpperCase()
      const numero = dados.numero ?? dados.numeroNota ?? null
      const pdf = dados.pdf ?? dados.linkPdf ?? dados.urlPdf ?? null
      const xml = dados.xml ?? dados.linkXml ?? dados.urlXml ?? null
      const concluida = /CONCLUIDO|AUTORIZAD|EMITID/.test(situacao)
      const rejeitada = /REJEIT|ERRO|CANCELAD/.test(situacao)

      await supabase
        .from('invoices')
        .update({
          status: concluida ? 'emitida' : rejeitada ? 'erro' : 'transmitindo',
          numero: numero ? String(numero) : nota.numero,
          serie: dados.serie ? String(dados.serie) : nota.serie,
          pdf_url: pdf ? String(pdf) : nota.pdf_url,
          xml_url: xml ? String(xml) : nota.xml_url,
          emitida_em: concluida ? new Date().toISOString() : nota.emitida_em,
          erro_msg: rejeitada ? JSON.stringify(dados).slice(0, 500) : null,
        })
        .eq('id', invoice_id)

      return Response.json(
        {
          mensagem: concluida
            ? `Nota emitida${numero ? ` — nº ${numero}` : ''}.`
            : rejeitada
              ? 'A nota foi rejeitada. Veja o motivo na lista.'
              : `Ainda processando (${situacao || 'sem situação'}). Consulte de novo em instantes.`,
          situacao,
        },
        { headers: CORS }
      )
    }

    if (nota.status === 'emitida') {
      return Response.json(
        { erro: 'Esta nota já foi emitida. Para refazer, cancele antes.' },
        { status: 409, headers: CORS }
      )
    }

    // ------------------------------------------------------------
    // GRUPO FISCAL dos itens realmente vendidos
    //
    // A alíquota certa mora no grupo fiscal do item (migration 0024), não
    // no emitente. Aqui descobrimos quais grupos aparecem nos eventos
    // desta nota e usamos os dados deles; `fiscal_config` fica como
    // reserva para o que o grupo não preencheu.
    // ------------------------------------------------------------
    const { data: vinculos } = await supabase
      .from('invoice_events')
      .select('event_id')
      .eq('invoice_id', invoice_id)
    const eventIds = ((vinculos ?? []) as { event_id: string }[]).map((v) => v.event_id)

    let grupoServico: Linha | null = null
    let grupoProduto: Linha | null = null
    const gruposDemais: { servico: string[]; produto: string[] } = { servico: [], produto: [] }

    if (eventIds.length) {
      const { data: servicos } = await supabase
        .from('event_services')
        .select('id')
        .in('event_id', eventIds)
      const servicoIds = ((servicos ?? []) as { id: string }[]).map((s) => s.id)

      if (servicoIds.length) {
        const { data: itens } = await supabase
          .from('service_items')
          .select('catalog_item_id')
          .in('event_service_id', servicoIds)
        const catalogIds = Array.from(
          new Set(
            ((itens ?? []) as { catalog_item_id: string | null }[])
              .map((i) => i.catalog_item_id)
              .filter((x): x is string => Boolean(x))
          )
        )

        if (catalogIds.length) {
          const { data: cat } = await supabase
            .from('catalog_items')
            .select('tax_group_id')
            .in('id', catalogIds)
          const grupoIds = Array.from(
            new Set(
              ((cat ?? []) as { tax_group_id: string | null }[])
                .map((c) => c.tax_group_id)
                .filter((x): x is string => Boolean(x))
            )
          )
          if (grupoIds.length) {
            const { data: grupos } = await supabase
              .from('tax_groups')
              .select('*')
              .in('id', grupoIds)
            const lista = (grupos ?? []) as Linha[]
            const deServico = lista.filter((g) => g.classificacao_fiscal === 'servico')
            const deProduto = lista.filter((g) => g.classificacao_fiscal === 'produto')
            grupoServico = deServico[0] ?? null
            grupoProduto = deProduto[0] ?? null
            gruposDemais.servico = deServico.map((g) => String(g.nome))
            gruposDemais.produto = deProduto.map((g) => String(g.nome))
          }
        }
      }
    }

    // ---- conferências que evitam rejeição boba na SEFAZ/prefeitura ----
    const faltando: string[] = []
    if (!digitos(cfg.cnpj as string)) faltando.push('CNPJ da empresa (Administração → Fiscal)')
    if (!digitos(nota.destinatario_doc as string))
      faltando.push('CPF/CNPJ do destinatário na nota')

    const listaServico = (grupoServico?.item_lista_servico ?? cfg.item_lista_servico) as
      | string
      | null
    const ncm = (grupoProduto?.ncm ?? cfg.ncm_padrao) as string | null

    if (Number(nota.valor_servico) > 0 && !listaServico)
      faltando.push(
        'item da lista de serviço — preencha no grupo fiscal de serviço (Administração → Fiscal)'
      )
    if (Number(nota.valor_produto) > 0 && !ncm)
      faltando.push('NCM — preencha no grupo fiscal de produto (Administração → Fiscal)')

    // Mais de um grupo da mesma natureza significa alíquotas diferentes na
    // mesma linha da nota. O sistema não tem preço por item (o preço é por
    // pax da linha contratada), então dividir o valor entre grupos seria
    // inventar número. Emitir uma nota por grupo é o caminho correto.
    if (Number(nota.valor_servico) > 0 && gruposDemais.servico.length > 1)
      faltando.push(
        `os itens usam ${gruposDemais.servico.length} grupos fiscais de serviço diferentes (${gruposDemais.servico.join(', ')}) — emita uma nota por grupo`
      )
    if (Number(nota.valor_produto) > 0 && gruposDemais.produto.length > 1)
      faltando.push(
        `os itens usam ${gruposDemais.produto.length} grupos fiscais de produto diferentes (${gruposDemais.produto.join(', ')}) — emita uma nota por grupo`
      )

    if (faltando.length) {
      await supabase
        .from('invoices')
        .update({ status: 'erro', erro_msg: `Falta: ${faltando.join('; ')}` })
        .eq('id', invoice_id)
      return Response.json(
        { erro: `Não transmiti — falta preencher: ${faltando.join('; ')}` },
        { status: 422, headers: CORS }
      )
    }

    const ambiente = ambienteAtual
    const base = baseUrl

    await supabase.from('invoices').update({ status: 'transmitindo', erro_msg: null }).eq('id', invoice_id)

    async function chamar(rota: string, corpo: unknown) {
      const r = await fetch(`${base}${rota}`, {
        method: 'POST',
        headers: { 'x-api-key': token!, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const texto = await r.text()
      let dados: unknown = texto
      try {
        dados = JSON.parse(texto)
      } catch {
        /* a API devolve texto puro em alguns erros */
      }
      return { ok: r.ok, status: r.status, dados }
    }

    const resultados: Record<string, unknown>[] = []

    // ---------- SERVIÇO (NFS-e) ----------
    if (Number(nota.valor_servico) > 0) {
      const corpo = [
        {
          idIntegracao: `${invoice_id}-servico`,
          prestador: { cpfCnpj: digitos(cfg.cnpj as string) },
          tomador: {
            cpfCnpj: digitos(nota.destinatario_doc as string),
            razaoSocial: nota.destinatario_nome,
            email: nota.destinatario_email ?? undefined,
          },
          servico: [
            {
              // o grupo fiscal manda; o emitente é reserva
              codigo: listaServico,
              codigoTributacao: cfg.codigo_tributario_municipio ?? undefined,
              discriminacao:
                (nota.observacoes as string) ??
                (grupoServico?.descricao as string) ??
                'Serviços de catering, coffee break e eventos',
              cnae: cfg.cnae ?? undefined,
              iss: {
                aliquota: Number(grupoServico?.iss_pct ?? cfg.iss_pct ?? 0),
                tipoTributacao: 6,
                exigibilidade: 1,
                retido: Boolean(cfg.iss_retido),
              },
              valor: { servico: Number(nota.valor_servico) },
            },
          ],
        },
      ]
      resultados.push({ tipo: 'servico', ...(await chamar('/nfse', corpo)) })
    }

    // ---------- PRODUTO (NF-e) ----------
    if (Number(nota.valor_produto) > 0) {
      const corpo = [
        {
          idIntegracao: `${invoice_id}-produto`,
          emitente: { cpfCnpj: digitos(cfg.cnpj as string) },
          destinatario: {
            cpfCnpj: digitos(nota.destinatario_doc as string),
            razaoSocial: nota.destinatario_nome,
            email: nota.destinatario_email ?? undefined,
          },
          natureza: 'Venda de mercadoria',
          itens: [
            {
              codigo: `PIEGGI-${String(grupoProduto?.nome ?? 'PRODUTO')
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, '-')
                .slice(0, 20)}`,
              descricao: (grupoProduto?.nome as string) ?? 'Produtos alimentícios',
              // dados do grupo fiscal; emitente como reserva
              ncm,
              cest: (grupoProduto?.cest as string) ?? undefined,
              cfop: (grupoProduto?.cfop as string) ?? cfg.cfop_padrao ?? '5102',
              origem: (grupoProduto?.origem_mercadoria as string) ?? '0',
              unidade: (grupoProduto?.unidade_fiscal as string) ?? 'UN',
              quantidade: 1,
              valorUnitario: Number(nota.valor_produto),
              impostos: {
                icms: { aliquota: Number(grupoProduto?.icms_pct ?? 0) },
                ipi: { aliquota: Number(grupoProduto?.ipi_pct ?? 0) },
                pis: { aliquota: Number(grupoProduto?.pis_pct ?? 0) },
                cofins: { aliquota: Number(grupoProduto?.cofins_pct ?? 0) },
              },
            },
          ],
        },
      ]
      resultados.push({ tipo: 'produto', ...(await chamar('/nfe', corpo)) })
    }

    const falhou = resultados.filter((r) => !r.ok)
    if (falhou.length) {
      const msg = falhou
        .map((f) => `${f.tipo}: ${JSON.stringify(f.dados).slice(0, 400)}`)
        .join(' | ')
      await supabase.from('invoices').update({ status: 'erro', erro_msg: msg }).eq('id', invoice_id)
      return Response.json({ erro: `PlugNotas recusou — ${msg}` }, { status: 502, headers: CORS })
    }

    // O PlugNotas processa de forma assíncrona: aqui a nota foi ACEITA
    // para processamento. Número, PDF e XML chegam depois — por isso
    // guardamos o id e deixamos o status como transmitindo até a consulta.
    const idPlug =
      (resultados[0]?.dados as Linha | undefined)?.documents?.[0]?.id ??
      (resultados[0]?.dados as Linha | undefined)?.id ??
      null

    await supabase
      .from('invoices')
      .update({
        plugnotas_id: idPlug ? String(idPlug) : null,
        // memória de cálculo: qual grupo fiscal foi usado em cada parte.
        // Sem isso, conferir uma nota meses depois é arqueologia.
        impostos: {
          ambiente,
          grupo_servico: grupoServico?.nome ?? null,
          grupo_produto: grupoProduto?.nome ?? null,
          item_lista_servico: listaServico,
          ncm,
          resultados,
        },
        erro_msg: null,
      })
      .eq('id', invoice_id)

    return Response.json(
      {
        mensagem:
          ambiente === 'homologacao'
            ? 'Nota aceita em HOMOLOGAÇÃO (sem validade fiscal). O número e o PDF saem em instantes.'
            : 'Nota aceita para processamento. O número e o PDF saem em instantes.',
        ambiente,
        resultados,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error(e)
    return Response.json(
      { erro: e instanceof Error ? e.message : 'Erro inesperado ao emitir a nota.' },
      { status: 500, headers: CORS }
    )
  }
})
