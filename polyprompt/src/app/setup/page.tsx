'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function SetupPage() {
  const [status, setStatus] = useState({
    supabase: 'checking',
    openrouter: 'checking'
  })

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check if API routes are working
        const response = await fetch('/api/runs')
        if (response.status === 503) {
          setStatus(prev => ({ ...prev, supabase: 'not-configured' }))
        } else if (response.status === 401) {
          setStatus(prev => ({ ...prev, supabase: 'configured' }))
        } else {
          setStatus(prev => ({ ...prev, supabase: 'configured' }))
        }
      } catch {
        setStatus(prev => ({ ...prev, supabase: 'error' }))
      }

      // Check OpenRouter (we can't really test this without making a call)
      setStatus(prev => ({ ...prev, openrouter: 'unknown' }))
    }

    checkStatus()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'configured': return 'text-green-600 bg-green-100'
      case 'not-configured': return 'text-yellow-600 bg-yellow-100'
      case 'error': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'configured': return '✅ Configured'
      case 'not-configured': return '⚠️ Not Configured'
      case 'error': return '❌ Error'
      default: return '🔄 Checking...'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Poly Prompt Setup Status
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Check the configuration status of your Poly Prompt deployment
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Supabase</h3>
                <p className="text-sm text-gray-500">Database and authentication</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status.supabase)}`}>
                {getStatusText(status.supabase)}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">OpenRouter</h3>
                <p className="text-sm text-gray-500">LLM API access</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status.openrouter)}`}>
                {getStatusText(status.openrouter)}
              </span>
            </div>
          </div>

          {status.supabase === 'not-configured' && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">Setup Required</h4>
              <p className="text-sm text-yellow-700 mb-3">
                Add these environment variables to your Vercel deployment:
              </p>
              <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono">
                <div>NEXT_PUBLIC_SUPABASE_URL=your_supabase_url</div>
                <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key</div>
                <div>OPENROUTER_API_KEY=your_openrouter_key</div>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Link 
              href="/"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Home
            </Link>
            <Link 
              href="/runs"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try App
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
