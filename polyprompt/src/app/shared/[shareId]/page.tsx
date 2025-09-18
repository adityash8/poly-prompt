'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Copy, ExternalLink, Zap, Clock, DollarSign, Hash } from 'lucide-react'
import Link from 'next/link'
import { Run, Eval } from '@/types'

interface SharedRunData {
  run: Run & { user_name: string }
  evals: Eval[]
}

export default function SharedRunPage() {
  const params = useParams()
  const shareId = params.shareId as string

  const [data, setData] = useState<SharedRunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSharedRun = async () => {
      try {
        const response = await fetch(`/api/shared/${shareId}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('This shared run was not found or is no longer available.')
          } else {
            setError('Failed to load shared run.')
          }
          return
        }
        const result = await response.json()
        setData(result)
      } catch (err) {
        setError('Failed to load shared run.')
        console.error('Error fetching shared run:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSharedRun()
  }, [shareId])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    // TODO: Show toast notification
  }

  const formatRelativeTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    return `${Math.floor(diffInHours / 24)}d ago`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-red-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <ExternalLink className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Run Not Found</h1>
          <p className="text-gray-600 mb-6">
            {error || 'This shared run was not found or is no longer available.'}
          </p>
          <Link href="/">
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
              Go to Poly Prompt
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const { run, evals } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-blue-600" />
                <span className="font-bold text-gray-900">Poly Prompt</span>
              </Link>
              <div className="w-px h-6 bg-gray-300"></div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{run.title}</h1>
                <p className="text-sm text-gray-600">
                  Shared by {run.user_name} • {formatRelativeTime(run.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                Public Share
              </div>
              <Link href="/login">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  Try Poly Prompt
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Prompt */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Prompt</h2>
            <button
              onClick={() => handleCopy(run.prompt)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Copy prompt"
            >
              <Copy className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-800 whitespace-pre-wrap">{run.prompt}</p>
          </div>
          {Object.keys(run.variables || {}).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Variables:</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(run.variables || {}).map(([key, value]) => (
                  <span key={key} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                    {key}: {value as string}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {evals.length > 0 ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Results ({evals.length} models)
            </h2>
            {evals.map((result, index) => (
              <div key={index} className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{result.model}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{result.latency_ms}ms</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Hash className="h-4 w-4" />
                        <span>{result.tokens_in + result.tokens_out} tokens</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        <span>${result.cost_usd.toFixed(4)}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(result.output || '')}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Copy output"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {result.error ? (
                    <div className="bg-red-50 rounded-lg p-4 text-red-800">
                      Error: {result.error}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-gray-800 whitespace-pre-wrap">{result.output}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No results available</h3>
            <p className="text-gray-600">This run hasn&apos;t been executed yet.</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Want to create your own comparisons?
          </h3>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Join Poly Prompt to compare prompts across multiple LLMs, track performance metrics,
            and share your results with your team.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <button className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                Get Started Free
              </button>
            </Link>
            <Link href="/">
              <button className="bg-white text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-50 transition-colors border">
                Learn More
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}