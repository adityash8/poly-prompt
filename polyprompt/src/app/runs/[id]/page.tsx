'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, Copy, Share2, Edit } from 'lucide-react'
import Link from 'next/link'

// Mock data for demonstration
const mockResults = {
  '1': {
    id: '1',
    title: 'Email Subject Line Generator',
    prompt: 'Write a compelling email subject line for a SaaS product launch',
    status: 'completed',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    results: [
      {
        model: 'GPT-4o',
        output: '🚀 Launch Alert: Transform Your Workflow with [Product Name] - See How Teams Save 10+ Hours/Week',
        latency: 1200,
        tokens: 45,
        cost: 0.0012,
      },
      {
        model: 'Claude 3.5 Sonnet',
        output: 'Introducing [Product Name]: The SaaS Solution That\'s Revolutionizing How Teams Collaborate',
        latency: 800,
        tokens: 38,
        cost: 0.0009,
      },
      {
        model: 'Gemini 1.5 Pro',
        output: 'Ready to Supercharge Your Productivity? [Product Name] Launches Today - Limited Time Offer Inside',
        latency: 950,
        tokens: 42,
        cost: 0.0011,
      },
    ],
  },
  '2': {
    id: '2',
    title: 'Code Review Assistant',
    prompt: 'Review this React component for best practices and potential improvements',
    status: 'running',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    results: [],
  },
  '3': {
    id: '3',
    title: 'Marketing Copy Generator',
    prompt: 'Create a 100-word marketing copy for a productivity app',
    status: 'draft',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    results: [],
  },
}

export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.id as string
  
  const [run, setRun] = useState(mockResults[runId as keyof typeof mockResults] || null)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (!run) {
      // Handle run not found
      router.push('/runs')
    }
  }, [run, router])

  if (!run) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Run not found</h2>
          <Link href="/runs">
            <button className="text-blue-600 hover:text-blue-700">Back to runs</button>
          </Link>
        </div>
      </div>
    )
  }

  const handleRunAgain = async () => {
    setIsRunning(true)
    await new Promise(resolve => setTimeout(resolve, 3000))
    setIsRunning(false)
    // In a real app, this would trigger the API calls
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const formatRelativeTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    return `${Math.floor(diffInHours / 24)}d ago`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <Link href="/runs" className="mr-4">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{run.title}</h1>
                <p className="text-gray-600">Created {formatRelativeTime(run.created_at)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRunAgain}
                disabled={isRunning}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isRunning ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Again
                  </>
                )}
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Prompt */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Prompt</h2>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-800 whitespace-pre-wrap">{run.prompt}</p>
          </div>
        </div>

        {/* Results */}
        {run.status === 'completed' && run.results.length > 0 ? (
          <div className="space-y-6">
            {run.results.map((result, index) => (
              <div key={index} className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{result.model}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{result.latency}ms</span>
                      <span>{result.tokens} tokens</span>
                      <span>${result.cost.toFixed(4)}</span>
                      <button
                        onClick={() => handleCopy(result.output)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-800 whitespace-pre-wrap">{result.output}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : run.status === 'running' ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Running your prompt...</h3>
            <p className="text-gray-600">This may take a few moments</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No results yet</h3>
            <p className="text-gray-600 mb-4">Run your prompt to see results from different models</p>
            <button
              onClick={handleRunAgain}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Run Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
