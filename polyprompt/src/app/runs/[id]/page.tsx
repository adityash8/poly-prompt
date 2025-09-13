'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, Copy, Share2 } from 'lucide-react'
import Link from 'next/link'
import { Run, Eval } from '@/types'

// Remove mockResults

export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.id as string
  
  const [run, setRun] = useState<Run | null>(null)
  const [evals, setEvals] = useState<Eval[]>([])
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const runResponse = await fetch(`/api/runs/${runId}`)
        if (runResponse.ok) {
          setRun(await runResponse.json())
        } else if (runResponse.status === 404) {
          router.push('/runs')
          return
        }

        const evalsResponse = await fetch(`/api/runs/${runId}/evals`)
        if (evalsResponse.ok) {
          setEvals(await evalsResponse.json())
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }

    fetchData()
  }, [runId, router])

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined
    if (run?.status === 'running') {
      interval = setInterval(async () => {
        const runResponse = await fetch(`/api/runs/${runId}`)
        if (runResponse.ok) {
          const updatedRun = await runResponse.json()
          setRun(updatedRun)
          if (updatedRun.status !== 'running') {
            const evalsResponse = await fetch(`/api/runs/${runId}/evals`)
            if (evalsResponse.ok) setEvals(await evalsResponse.json())
          }
        }
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [run?.status, runId])

  if (!run) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const handleRunAgain = async () => {
    setIsRunning(true)
    try {
      const response = await fetch(`/api/runs/${runId}/run`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to run')
      // Refetch data
      const runResponse = await fetch(`/api/runs/${runId}`)
      setRun(await runResponse.json())
      const evalsResponse = await fetch(`/api/runs/${runId}/evals`)
      setEvals(await evalsResponse.json())
    } catch (error) {
      console.error('Error running again:', error)
      alert('Failed to run again. Please try later.')
    } finally {
      setIsRunning(false)
    }
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
        {run.status === 'completed' && evals.length > 0 ? (
          <div className="space-y-6">
            {evals.map((result, index) => (
              <div key={index} className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{result.model}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{result.latency_ms}ms</span>
                      <span>{result.tokens_in + result.tokens_out} tokens</span>
                      <span>${result.cost_usd.toFixed(4)}</span>
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
