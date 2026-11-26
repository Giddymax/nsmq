import { createClient } from '@supabase/supabase-js'

const env = (import.meta as ImportMeta & {
  readonly env: Record<string, string | undefined>
}).env

const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null
