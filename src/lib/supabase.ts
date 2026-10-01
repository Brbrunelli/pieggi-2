import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MODO_DEMO } from '@/demo/modo'
import { criarClienteDemo } from '@/demo/cliente'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!MODO_DEMO && (!url || !anonKey)) {
  // Mensagem clara em dev quando o .env não foi configurado
  console.error(
    'Supabase não configurado. Copie .env.example para .env e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  )
}

// Modo demonstração (src/demo): o mesmo "supabase" que as telas usam,
// respondendo dos cenários de teste em memória — nada chega ao banco real.
export const supabase: SupabaseClient = MODO_DEMO
  ? (criarClienteDemo() as unknown as SupabaseClient)
  : createClient(url ?? 'http://localhost', anonKey ?? 'anon')
