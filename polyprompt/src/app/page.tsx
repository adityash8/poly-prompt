'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { User } from '@supabase/supabase-js'
import { Zap, Play, Share, BarChart3, ArrowRight } from 'lucide-react'

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="absolute top-4 right-4">
        {loading ? (
          <div className="animate-pulse bg-gray-200 h-10 w-24 rounded-lg"></div>
        ) : user ? (
          <div className="flex items-center gap-3">
            <span className="text-gray-700">Welcome back!</span>
            <Link href="/runs">
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Dashboard
              </button>
            </Link>
          </div>
        ) : (
          <Link href="/login">
            <button className="bg-white text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border">
              Sign In
            </button>
          </Link>
        )}
      </div>

      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-4xl mx-auto">
          {/* Logo and title */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <Zap className="h-12 w-12 text-blue-600" />
            <h1 className="text-6xl font-bold text-gray-900">
              Poly Prompt
            </h1>
          </div>

          <p className="text-2xl text-gray-600 mb-4">
            One prompt. Every LLM. Side-by-side.
          </p>

          <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
            Compare prompts across GPT-4o, Claude 3.5, Gemini, and more.
            Get instant results with tokens, costs, and latency metrics.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            {user ? (
              <Link href="/runs/new">
                <button className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Create New Run
                </button>
              </Link>
            ) : (
              <Link href="/login">
                <button className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium flex items-center gap-2">
                  Get Started Free
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
            )}

            <Link href="/setup">
              <button className="bg-white text-gray-700 px-8 py-4 rounded-lg hover:bg-gray-50 transition-colors text-lg border">
                Setup Status
              </button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <Play className="h-10 w-10 text-blue-600 mb-4 mx-auto" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Instant Comparison</h3>
              <p className="text-gray-600">
                Run your prompt across multiple LLMs simultaneously and get results in seconds.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <BarChart3 className="h-10 w-10 text-green-600 mb-4 mx-auto" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Detailed Metrics</h3>
              <p className="text-gray-600">
                Track tokens, costs, latency, and quality to make data-driven model choices.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <Share className="h-10 w-10 text-purple-600 mb-4 mx-auto" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Easy Sharing</h3>
              <p className="text-gray-600">
                Share results with your team via public links or export to popular formats.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 text-center mb-12">
            <div>
              <div className="text-3xl font-bold text-gray-900">8+</div>
              <div className="text-gray-600">LLM Models</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">50</div>
              <div className="text-gray-600">Free Runs/Month</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">&lt;5s</div>
              <div className="text-gray-600">Average Response</div>
            </div>
          </div>

          {/* Demo prompt */}
          <div className="bg-white rounded-lg p-6 max-w-2xl mx-auto text-left shadow-sm">
            <h4 className="font-semibold text-gray-900 mb-3">Try this example prompt:</h4>
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm text-gray-700 mb-4">
              {`Write a cold email to {{contact_name}} at {{company}} about our new AI-powered analytics platform. Keep it under 100 words and include a clear call-to-action.`}
            </div>
            <p className="text-sm text-gray-500">
              Compare how different models handle personalization, tone, and persuasiveness.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
