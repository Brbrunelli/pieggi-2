// ============================================================
// EDGE FUNCTION: contrato-docusign
//
// Duas responsabilidades:
//   POST { contract_id }  → envia a minuta para assinatura (cria envelope)
//   POST (webhook DocuSign) → recebe "envelope-completed" e carimba
//                             `contracts.status = 'assinado'`
//
// Quem move o evento para a operação NÃO é esta função: é o trigger
// `contrato_assinado_libera_operacao` (migration 0021). Assim o caminho
// é idêntico ao da assinatura registrada à mão — uma consequência, dois
// caminhos.
//
// Autenticação: JWT Grant (service integration, sem tela de login).
// Secrets necessários:
//   DOCUSIGN_INTEGRATION_KEY   (Integration Key da app)
//   DOCUSIGN_USER_ID           (API Username / User ID do usuário que assina em nome da conta)
//   DOCUSIGN_ACCOUNT_ID        (API Account ID)
//   DOCUSIGN_PRIVATE_KEY       (chave RSA privada, PEM completo)
//   DOCUSIGN_AMBIENTE          'demo' (padrão) ou 'producao'
//   DOCUSIGN_WEBHOOK_SECRET    (opcional — valida o webhook)
//
// ATENÇÃO: a primeira chamada com JWT exige CONSENTIMENTO único do
// usuário. Se der `consent_required`, a função devolve o link para
// autorizar — é só abrir uma vez.
//
// Deploy: npx supabase@latest functions deploy contrato-docusign --project-ref <ref>
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const AMB = {
  demo: { auth: 'account-d.docusign.com', api: 'https://demo.docusign.net' },
  producao: { auth: 'account.docusign.com', api: 'https://www.docusign.net' },
}

interface Linha {
  [k: string]: unknown
}

function supa() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

/** PEM → CryptoKey para assinar o JWT (RS256). */
async function chaveRsa(pem: string): Promise<CryptoKey> {
  const limpo = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey(
    'pkcs8',
    bin,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

/** Token de acesso via JWT Grant. */
async function tokenDocusign(): Promise<{ token: string; api: string; conta: string }> {
  const ik = Deno.env.get('DOCUSIGN_INTEGRATION_KEY')?.trim()
  const userId = Deno.env.get('DOCUSIGN_USER_ID')?.trim()
  const conta = Deno.env.get('DOCUSIGN_ACCOUNT_ID')?.trim()
  const pem = Deno.env.get('DOCUSIGN_PRIVATE_KEY')
  const ambiente = (Deno.env.get('DOCUSIGN_AMBIENTE')?.trim() ?? 'demo') as keyof typeof AMB
  const cfg = AMB[ambiente] ?? AMB.demo

  const faltando = [
    !ik && 'DOCUSIGN_INTEGRATION_KEY',
    !userId && 'DOCUSIGN_USER_ID',
    !conta && 'DOCUSIGN_ACCOUNT_ID',
    !pem && 'DOCUSIGN_PRIVATE_KEY',
  ].filter(Boolean)
  if (faltando.length) {
    throw new Error(
      `Secrets do DocuSign não configurados: ${faltando.join(', ')}. ` +
        'Cadastre em Project Settings → Edge Functions → Secrets.'
    )
  }

  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: ik,
      sub: userId,
      aud: cfg.auth,
      iat: getNumericDate(0),
      exp: getNumericDate(60 * 60),
      scope: 'signature impersonation',
    },
    await chaveRsa(pem!)
  )

  const r = await fetch(`https://${cfg.auth}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const dados = (await r.json().catch(() => ({}))) as Linha

  if (!r.ok) {
    // O erro mais comum na primeira vez: falta o consentimento único.
    if (String(dados.error) === 'consent_required') {
      const link =
        `https://${cfg.auth}/oauth/auth?response_type=code&scope=signature%20impersonation` +
        `&client_id=${ik}&redirect_uri=https://www.docusign.com`
      throw new Error(
        'O DocuSign exige o consentimento único desta integração. Abra este link, autorize, ' +
          `e tente de novo: ${link}`
      )
    }
    throw new Error(`DocuSign recusou o login: ${JSON.stringify(dados).slice(0, 300)}`)
  }

  return { token: String(dados.access_token), api: cfg.api, conta: conta! }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const corpo = (await req.json().catch(() => ({}))) as Linha

    // ------------------------------------------------------------
    // WEBHOOK — o DocuSign avisa que o envelope foi concluído.
    // Reconhecemos pelo formato do payload (Connect manda `event` +
    // `data.envelopeId`), não por rota separada: um endpoint só é menos
    // coisa para configurar errado no painel do DocuSign.
    // ------------------------------------------------------------
    const envelopeId =
      (corpo.data as Linha | undefined)?.envelopeId ?? corpo.envelopeId ?? null

    if (envelopeId && !corpo.contract_id) {
      const segredo = Deno.env.get('DOCUSIGN_WEBHOOK_SECRET')?.trim()
      if (segredo) {
        const recebido =
          req.headers.get('x-docusign-signature-1') ?? req.headers.get('x-webhook-secret') ?? ''
        if (recebido !== segredo) {
          return Response.json({ erro: 'Assinatura do webhook inválida.' }, { status: 401 })
        }
      }

      const evento = String(corpo.event ?? '')
      const status = String(
        (corpo.data as Linha | undefined)?.envelopeSummary
          ? ((corpo.data as Linha).envelopeSummary as Linha).status
          : (corpo.status ?? '')
      ).toLowerCase()

      const concluido = /completed/.test(evento) || status === 'completed'
      const recusado = /declined|voided/.test(evento) || /declined|voided/.test(status)

      const db = supa()
      const patch: Linha = { docusign_status: evento || status, docusign_evento: corpo }
      if (concluido) {
        patch.status = 'assinado'
        patch.assinado_em = new Date().toISOString()
      } else if (recusado) {
        patch.status = /voided/.test(evento + status) ? 'cancelado' : 'recusado'
      }

      const { error } = await db
        .from('contracts')
        .update(patch)
        .eq('docusign_envelope_id', String(envelopeId))
      if (error) throw error

      // 200 sempre que o payload foi entendido: o DocuSign reenvia em
      // caso de erro, e reenvio infinito por causa de contrato que não
      // existe mais aqui só gera ruído.
      return Response.json({ ok: true, aplicado: concluido || recusado })
    }

    // ------------------------------------------------------------
    // ENVIAR PARA ASSINATURA
    // ------------------------------------------------------------
    const contractId = corpo.contract_id
    if (!contractId) {
      return Response.json(
        { erro: 'contract_id é obrigatório.' },
        { status: 400, headers: CORS }
      )
    }

    const db = supa()
    const { data: contrato, error: eC } = await db
      .from('contracts')
      .select('*, events(nome)')
      .eq('id', contractId)
      .single()
    if (eC) throw eC
    const c = contrato as Linha

    if (!c.signatario_email) {
      return Response.json(
        { erro: 'Informe o e-mail de quem assina antes de enviar.' },
        { status: 422, headers: CORS }
      )
    }
    if (!c.minuta_path) {
      return Response.json(
        { erro: 'Anexe a minuta antes: é o arquivo que vai para assinatura.' },
        { status: 422, headers: CORS }
      )
    }

    // baixa a minuta do Storage e converte para base64
    const arq = await db.storage.from('documentos').download(String(c.minuta_path))
    if (arq.error) throw arq.error
    const bytes = new Uint8Array(await arq.data.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    const base64 = btoa(bin)
    const nomeArquivo = String(c.minuta_path).split('/').pop() ?? 'contrato.pdf'
    const extensao = nomeArquivo.split('.').pop()?.toLowerCase() ?? 'pdf'

    const { token, api, conta } = await tokenDocusign()
    const nomeEvento = ((c.events as Linha | null)?.nome as string) ?? 'Evento'

    const r = await fetch(`${api}/restapi/v2.1/accounts/${conta}/envelopes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailSubject: `Contrato Pieggi — ${nomeEvento}`,
        status: 'sent',
        documents: [
          {
            documentId: '1',
            name: `Contrato — ${nomeEvento}`,
            fileExtension: extensao,
            documentBase64: base64,
          },
        ],
        recipients: {
          signers: [
            {
              email: c.signatario_email,
              name: c.signatario_nome ?? String(c.signatario_email),
              recipientId: '1',
              routingOrder: '1',
              // aba de assinatura no fim do documento, por âncora: o
              // contrato precisa ter o texto "Assinatura do contratante".
              tabs: {
                signHereTabs: [
                  {
                    anchorString: 'Assinatura do contratante',
                    anchorUnits: 'pixels',
                    anchorYOffset: '10',
                    anchorXOffset: '0',
                  },
                ],
              },
            },
          ],
        },
      }),
    })
    const dados = (await r.json().catch(() => ({}))) as Linha
    if (!r.ok) {
      throw new Error(`DocuSign recusou o envelope: ${JSON.stringify(dados).slice(0, 400)}`)
    }

    await db
      .from('contracts')
      .update({
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        docusign_envelope_id: String(dados.envelopeId),
        docusign_status: String(dados.status ?? 'sent'),
      })
      .eq('id', contractId)

    // o funil acompanha: card vai para "Contrato para assinar"
    await db
      .from('events')
      .update({ pipeline: 'contrato_enviado' })
      .eq('id', String(c.event_id))

    return Response.json(
      {
        mensagem: `Contrato enviado para ${c.signatario_email}. A assinatura volta pelo webhook e libera a operação.`,
        envelope_id: dados.envelopeId,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error(e)
    return Response.json(
      { erro: e instanceof Error ? e.message : 'Erro inesperado no DocuSign.' },
      { status: 500, headers: CORS }
    )
  }
})
