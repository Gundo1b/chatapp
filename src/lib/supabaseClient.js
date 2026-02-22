import { createClient } from '@supabase/supabase-js'

const env = (typeof process !== 'undefined' && process.env) || {}

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
