import { createClientComponentClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// For client components
export const createClient = () => {
  return createClientComponentClient()
}

// For server components
export const createServerClient = () => {
  return createServerComponentClient({ cookies })
}

// For API routes and server actions
export const createServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Database types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          tier: 'free' | 'pro' | 'team'
          runs_count: number
          runs_limit: number
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          tier?: 'free' | 'pro' | 'team'
          runs_count?: number
          runs_limit?: number
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          tier?: 'free' | 'pro' | 'team'
          runs_count?: number
          runs_limit?: number
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      runs: {
        Row: {
          id: string
          title: string
          prompt: string
          status: 'draft' | 'ready' | 'running' | 'completed' | 'error'
          user_id: string
          models: string[]
          variables: Record<string, any>
          is_public: boolean
          share_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          prompt: string
          status?: 'draft' | 'ready' | 'running' | 'completed' | 'error'
          user_id: string
          models?: string[]
          variables?: Record<string, any>
          is_public?: boolean
          share_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          prompt?: string
          status?: 'draft' | 'ready' | 'running' | 'completed' | 'error'
          user_id?: string
          models?: string[]
          variables?: Record<string, any>
          is_public?: boolean
          share_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      evals: {
        Row: {
          id: string
          run_id: string
          model: string
          provider: string
          latency_ms: number
          tokens_in: number
          tokens_out: number
          cost_usd: number
          output: string | null
          score: number | null
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          model: string
          provider: string
          latency_ms?: number
          tokens_in?: number
          tokens_out?: number
          cost_usd?: number
          output?: string | null
          score?: number | null
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          model?: string
          provider?: string
          latency_ms?: number
          tokens_in?: number
          tokens_out?: number
          cost_usd?: number
          output?: string | null
          score?: number | null
          error?: string | null
          created_at?: string
        }
      }
      templates: {
        Row: {
          id: string
          title: string
          description: string | null
          prompt: string
          category: string
          variables: Record<string, any>
          is_featured: boolean
          use_count: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          prompt: string
          category?: string
          variables?: Record<string, any>
          is_featured?: boolean
          use_count?: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          prompt?: string
          category?: string
          variables?: Record<string, any>
          is_featured?: boolean
          use_count?: number
          created_by?: string | null
          created_at?: string
        }
      }
    }
  }
}