'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, Copy, Share2, Download } from 'lucide-react'
import Link from 'next/link'
import { Run, Eval } from '@/types'
import { useToast } from '@/hooks/use-toast'

// Remove mockResults

export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.id as string
  
  const [run, setRun] = useState<Run | null>(null)
  const [evals, setEvals] = useState<Eval[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const runResponse = await fetch(`/api/runs/${runId}`)
        if (runResponse.ok) {
          const runData = await runResponse.json()
          setRun(runData)

          // Set share URL if run is already shared
          if (runData.share_id) {
            setShareUrl(`${window.location.origin}/shared/${runData.share_id}`)
          }
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

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied!",
        description: "Text copied to clipboard",
        variant: "success",
      })
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleShare = async () => {
    if (!run) return

    setIsSharing(true)
    try {
      if (shareUrl) {
        // Copy existing share URL
        await navigator.clipboard.writeText(shareUrl)
        toast({
          title: "Share link copied!",
          description: "Anyone with this link can view your run",
          variant: "success",
        })
      } else {
        // Create new share link
        const response = await fetch(`/api/runs/${runId}/share`, {
          method: 'POST'
        })

        if (!response.ok) {
          throw new Error('Failed to create share link')
        }

        const data = await response.json()
        setShareUrl(data.shareUrl)
        setRun({ ...run, is_public: true, share_id: data.shareId })

        await navigator.clipboard.writeText(data.shareUrl)
        toast({
          title: "Share link created!",
          description: "Link copied to clipboard. Anyone can now view this run.",
          variant: "success",
        })
      }
    } catch (error) {
      console.error('Error creating share link:', error)
      toast({
        title: "Failed to create share link",
        description: "Please try again",
        variant: "destructive",
      })
    } finally {
      setIsSharing(false)
    }
  }

  const handleUnshare = async () => {
    if (!run || !shareUrl) return

    try {
      const response = await fetch(`/api/runs/${runId}/share`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to remove share link')
      }

      setShareUrl(null)
      setRun({ ...run, is_public: false, share_id: undefined })
      toast({
        title: "Share link removed",
        description: "Your run is now private",
        variant: "success",
      })
    } catch (error) {
      console.error('Error removing share link:', error)
      toast({
        title: "Failed to remove share link",
        description: "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`/api/runs/${runId}/export?format=${format}`)
      if (!response.ok) {
        throw new Error('Failed to export run')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `poly-prompt-${run?.title?.replace(/[^a-zA-Z0-9]/g, '-') || 'run'}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Export successful!",
        description: `Run exported as ${format.toUpperCase()}`,
        variant: "success",
      })
    } catch (error) {
      console.error('Error exporting run:', error)
      toast({
        title: "Export failed",
        description: "Please try again",
        variant: "destructive",
      })
    }
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

              {/* Share Button */}
              <div className="relative">
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {isSharing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      {shareUrl ? 'Copy Link' : 'Share'}
                    </>
                  )}
                </button>
                {shareUrl && (
                  <button
                    onClick={handleUnshare}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                    title="Remove share link"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Export Button */}
              {run?.status === 'completed' && evals.length > 0 && (
                <div className="relative group">
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </button>
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                    <div className="py-1 min-w-[120px]">
                      <button
                        onClick={() => handleExport('json')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        JSON
                      </button>
                      <button
                        onClick={() => handleExport('csv')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
