// ============================================================
// CLIENTE SUPABASE DE DEMONSTRAÇÃO
//
// Imita a parte do supabase-js que o sistema usa — from/select/eq/…,
// insert/update/delete/upsert, embeds ("clients(nome)",
// "profiles:feito_por (nome)", "events!inner(...)"), rpc, auth, storage
// e functions — respondendo dos cenários em memória. As telas não sabem
// que estão em demonstração: o código delas é o mesmo da produção.
// ============================================================

import { getBanco, novoId, salvar, tabela, type Linha } from './banco'
import { VIEWS } from './views'
import { RPCS } from './rpc'
import { CHAVE_SESSAO } from './sessao'
import { PADROES } from './padroes'

interface Resultado {
  data: unknown
  error: { message: string; code?: string } | null
  count?: number | null
}

type Filtro = (r: Linha) => boolean

// ---------- select: "a, b, clients(nome), profiles:feito_por (nome)" ----------
interface Embed {
  chave: string // nome no resultado
  tabela: string
  fk: string | null // coluna da linha que aponta para o alvo (muitos-para-um explícito)
  inner: boolean
  filhos: Embed[]
}

function dividirTopo(s: string): string[] {
  const out: string[] = []
  let nivel = 0
  let atual = ''
  for (const ch of s) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) {
      out.push(atual.trim())
      atual = ''
    } else atual += ch
  }
  if (atual.trim()) out.push(atual.trim())
  return out
}

function lerEmbeds(select: string): Embed[] {
  const out: Embed[] = []
  for (const tok of dividirTopo(select)) {
    const i = tok.indexOf('(')
    if (i < 0) continue
    const cab = tok.slice(0, i).trim()
    const dentro = tok.slice(i + 1, tok.lastIndexOf(')'))
    let nome = cab
    let alias: string | null = null
    if (cab.includes(':')) [alias, nome] = cab.split(':').map((x) => x.trim())
    const inner = nome.includes('!inner')
    nome = nome.split('!')[0].trim()
    out.push({
      chave: alias ?? nome,
      tabela: alias ? alias : nome,
      fk: alias ? nome : null,
      inner,
      filhos: lerEmbeds(dentro),
    })
  }
  return out
}

const singular = (t: string) => t.replace(/ies$/, 'y').replace(/s$/, '')

function linhasDe(nome: string): Linha[] {
  const v = VIEWS[nome]
  return v ? v(getBanco()) : tabela(nome)
}

function resolverEmbed(linha: Linha, tabelaPai: string, e: Embed): unknown {
  const alvo = linhasDe(e.tabela)
  const fk = e.fk ?? `${singular(e.tabela)}_id`
  let valor: unknown
  if (e.fk || fk in linha) {
    const achado = alvo.find((x) => x.id === linha[fk]) ?? null
    valor = achado ? { ...achado } : null
  } else {
    const fkFilho = `${singular(tabelaPai)}_id`
    valor = alvo.filter((x) => x[fkFilho] === linha.id).map((x) => ({ ...x }))
  }
  if (e.filhos.length && valor) {
    const aplicar = (v: Linha) => {
      for (const f of e.filhos) v[f.chave] = resolverEmbed(v, e.tabela, f)
      return v
    }
    valor = Array.isArray(valor) ? valor.map(aplicar) : aplicar(valor as Linha)
  }
  return valor
}

function valorEm(r: Linha, coluna: string): unknown {
  if (!coluna.includes('.')) return r[coluna]
  const [emb, col] = coluna.split('.')
  const v = r[emb]
  if (Array.isArray(v)) return v.map((x) => x?.[col])
  return (v as Linha | null)?.[col]
}

function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  return String(a) === String(b)
}

function comparar(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

class Consulta implements PromiseLike<Resultado> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private colunas = '*'
  private opcoesSelect: { count?: string; head?: boolean } = {}
  private retornar = false
  private filtros: { coluna: string; fn: Filtro }[] = []
  private ordens: { coluna: string; asc: boolean; nullsFirst?: boolean }[] = []
  private lim: number | null = null
  private modo: 'muitos' | 'um' | 'talvez' = 'muitos'
  private payload: Linha | Linha[] | null = null
  private conflito: string[] = []
  private ignorarDuplicados = false

  constructor(private nome: string) {}

  select(colunas = '*', opcoes: { count?: string; head?: boolean } = {}) {
    if (this.op === 'select') {
      this.colunas = colunas
      this.opcoesSelect = opcoes
    } else this.retornar = true
    return this
  }
  private f(coluna: string, fn: (v: unknown) => boolean) {
    this.filtros.push({ coluna, fn: (r) => fn(valorEm(r, coluna)) })
    return this
  }
  eq(c: string, v: unknown) {
    return this.f(c, (x) => (Array.isArray(x) ? x.some((y) => igual(y, v)) : igual(x, v)))
  }
  neq(c: string, v: unknown) {
    return this.f(c, (x) => !igual(x, v))
  }
  in(c: string, vs: unknown[]) {
    return this.f(c, (x) => vs.some((v) => igual(x, v)))
  }
  gt(c: string, v: unknown) {
    return this.f(c, (x) => x != null && comparar(x, v) > 0)
  }
  gte(c: string, v: unknown) {
    return this.f(c, (x) => x != null && comparar(x, v) >= 0)
  }
  lt(c: string, v: unknown) {
    return this.f(c, (x) => x != null && comparar(x, v) < 0)
  }
  lte(c: string, v: unknown) {
    return this.f(c, (x) => x != null && comparar(x, v) <= 0)
  }
  is(c: string, v: unknown) {
    return this.f(c, (x) => (v === null ? x == null : x === v))
  }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') return this.f(c, (x) => (v === null ? x != null : x !== v))
    if (op === 'eq') return this.neq(c, v)
    return this
  }
  contains(c: string, vs: unknown[]) {
    return this.f(c, (x) => Array.isArray(x) && vs.every((v) => x.some((y) => igual(y, v))))
  }
  ilike(c: string, padrao: string) {
    const re = new RegExp('^' + padrao.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
    return this.f(c, (x) => re.test(String(x ?? '')))
  }
  order(coluna: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.ordens.push({ coluna, asc: o.ascending ?? true, nullsFirst: o.nullsFirst })
    return this
  }
  limit(n: number) {
    this.lim = n
    return this
  }
  range(de: number, ate: number) {
    this.lim = ate + 1
    void de
    return this
  }
  single() {
    this.modo = 'um'
    return this
  }
  maybeSingle() {
    this.modo = 'talvez'
    return this
  }
  insert(p: Linha | Linha[]) {
    this.op = 'insert'
    this.payload = p
    return this
  }
  update(p: Linha) {
    this.op = 'update'
    this.payload = p
    return this
  }
  upsert(p: Linha | Linha[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.ignorarDuplicados = Boolean(o.ignoreDuplicates)
    this.op = 'upsert'
    this.payload = p
    this.conflito = (o.onConflict ?? 'id').split(',').map((x) => x.trim())
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  then<A = Resultado, B = never>(
    ok?: ((r: Resultado) => A | PromiseLike<A>) | null,
    erro?: ((e: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.executar())
      .then(ok, erro)
  }

  private comFiltros(linhas: Linha[]): Linha[] {
    return linhas.filter((r) => this.filtros.every((f) => f.fn(r)))
  }

  private formatar(linhas: Linha[]): Resultado {
    if (this.modo === 'um') {
      if (linhas.length !== 1)
        return { data: null, error: { message: `Esperava 1 linha em ${this.nome}, achou ${linhas.length}`, code: 'PGRST116' } }
      return { data: linhas[0], error: null }
    }
    if (this.modo === 'talvez') return { data: linhas[0] ?? null, error: null }
    return { data: linhas, error: null }
  }

  private executar(): Resultado {
    const embeds = lerEmbeds(this.colunas)

    if (this.op === 'select') {
      let linhas = linhasDe(this.nome).map((r) => {
        const c = { ...r }
        for (const e of embeds) c[e.chave] = resolverEmbed(c, this.nome, e)
        return c
      })
      // !inner: sem o par, a linha some
      for (const e of embeds.filter((x) => x.inner))
        linhas = linhas.filter((r) => (Array.isArray(r[e.chave]) ? r[e.chave].length : r[e.chave]))
      linhas = this.comFiltros(linhas)
      for (const o of [...this.ordens].reverse())
        linhas.sort((a, b) => {
          const va = valorEm(a, o.coluna)
          const vb = valorEm(b, o.coluna)
          if (va == null || vb == null) {
            if (va == null && vb == null) return 0
            const nulo = va == null ? -1 : 1
            return o.nullsFirst ? nulo : -nulo
          }
          return o.asc ? comparar(va, vb) : -comparar(va, vb)
        })
      const total = linhas.length
      if (this.lim != null) linhas = linhas.slice(0, this.lim)
      if (this.opcoesSelect.head) return { data: null, error: null, count: total }
      const r = this.formatar(linhas)
      if (this.opcoesSelect.count) r.count = total
      return r
    }

    const t = tabela(this.nome)
    const agora = new Date().toISOString()
    let afetadas: Linha[] = []

    if (this.op === 'insert' || this.op === 'upsert') {
      const lista = Array.isArray(this.payload) ? this.payload : [this.payload!]
      for (const p of lista) {
        const existente =
          this.op === 'upsert'
            ? t.find((r) => this.conflito.every((c) => igual(r[c], p[c])))
            : undefined
        if (existente && this.ignorarDuplicados) continue // fica o primeiro, como no Postgres
        if (existente) {
          Object.assign(existente, p, { updated_at: agora })
          afetadas.push(existente)
        } else {
          const nova: Linha = { id: novoId(), created_at: agora, updated_at: agora, ...(PADROES[this.nome] ?? {}), ...p }
          t.push(nova)
          afetadas.push(nova)
        }
      }
    } else if (this.op === 'update') {
      afetadas = this.comFiltros(t)
      for (const r of afetadas) Object.assign(r, this.payload, { updated_at: agora })
    } else if (this.op === 'delete') {
      afetadas = this.comFiltros(t)
      const ids = new Set(afetadas)
      const resto = t.filter((r) => !ids.has(r))
      t.splice(0, t.length, ...resto)
    }
    salvar()
    if (!this.retornar) return { data: null, error: null }
    return this.formatar(afetadas.map((r) => ({ ...r })))
  }
}

// ---------- auth ----------
type Ouvinte = (evento: string, sessao: unknown) => void
const ouvintes = new Set<Ouvinte>()

function sessaoAtual() {
  let id: string | null = null
  try {
    id = localStorage.getItem(CHAVE_SESSAO)
  } catch {
    /* ignore */
  }
  if (!id) return null
  const p = tabela('profiles').find((x) => x.id === id)
  if (!p) return null
  return { access_token: 'demo', user: { id: p.id, email: p.email } }
}

export function entrarComoPerfil(id: string) {
  try {
    localStorage.setItem(CHAVE_SESSAO, id)
  } catch {
    /* ignore */
  }
  const s = sessaoAtual()
  ouvintes.forEach((o) => o('SIGNED_IN', s))
}

const auth = {
  async getSession() {
    if (!sessaoAtual()) {
      // primeira vez na demo: entra como admin
      const admin = tabela('profiles').find((p) => p.role === 'admin')
      if (admin) entrarComoPerfil(admin.id)
    }
    return { data: { session: sessaoAtual() }, error: null }
  },
  onAuthStateChange(cb: Ouvinte) {
    ouvintes.add(cb)
    return { data: { subscription: { unsubscribe: () => ouvintes.delete(cb) } } }
  },
  async signInWithPassword({ email }: { email: string }) {
    const p = tabela('profiles').find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (!p) return { data: null, error: { message: 'Na demonstração, use o seletor de papel no topo.' } }
    entrarComoPerfil(p.id)
    return { data: { session: sessaoAtual() }, error: null }
  },
  async signOut() {
    try {
      localStorage.removeItem(CHAVE_SESSAO)
    } catch {
      /* ignore */
    }
    ouvintes.forEach((o) => o('SIGNED_OUT', null))
    return { error: null }
  },
  async resetPasswordForEmail() {
    return { data: {}, error: null }
  },
  async updateUser() {
    return { data: {}, error: null }
  },
}

// ---------- storage ----------
const arquivos = new Map<string, Blob>()

/** "foto" de exemplo para as evidências dos cenários */
const FOTO_EXEMPLO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e8e4dc"/><text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="22" fill="#666">FOTO DE TESTE</text></svg>`
  )

const storage = {
  from(bucket: string) {
    const k = (p: string) => `${bucket}/${p}`
    return {
      async upload(path: string, blob: Blob) {
        arquivos.set(k(path), blob)
        return { data: { path }, error: null }
      },
      async createSignedUrl(path: string) {
        const b = arquivos.get(k(path))
        return { data: { signedUrl: b ? URL.createObjectURL(b) : FOTO_EXEMPLO }, error: null }
      },
      async download(path: string) {
        return { data: arquivos.get(k(path)) ?? null, error: null }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: FOTO_EXEMPLO + '#' + path } }
      },
    }
  },
}

// ---------- functions (integrações externas) ----------
const functions = {
  async invoke(nome: string) {
    return {
      data: null,
      error: {
        message: `Modo demonstração: a integração "${nome}" (DocuSign, PlugNotas, Google, IA) não é chamada. Nada saiu do sistema.`,
      },
    }
  },
}

// ---------- rpc ----------
async function rpc(nome: string, args: Record<string, unknown> = {}): Promise<Resultado> {
  const fn = RPCS[nome]
  if (!fn) return { data: null, error: null }
  try {
    const data = fn(args, getBanco())
    salvar()
    return { data, error: null }
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } }
  }
}

export function criarClienteDemo() {
  return {
    from: (nome: string) => new Consulta(nome),
    rpc,
    auth,
    storage,
    functions,
  }
}
