'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Search, Clock, Zap } from 'lucide-react'
import { Run } from '@/types'

// Remove mockRuns

export default function RunsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const response = await fetch('/api/runs')
        if (!response.ok) throw new Error('Failed to fetch runs')
        const data = await response.json()
        setRuns(data)
      } catch (error) {
        console.error('Error fetching runs:', error)
        // Add toast or alert
      }
    }
    fetchRuns()
  }, [])

  const filteredRuns = runs.filter(run => {
    const matchesSearch = run.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         run.prompt.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = selectedStatus === 'all' || run.status === selectedStatus
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'running': return 'bg-blue-100 text-blue-800'
      case 'draft': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
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
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Runs</h1>
              <p className="text-gray-600">Compare prompts across multiple LLMs</p>
            </div>
            <Link href="/runs/new">
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Run
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search runs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Runs List */}
        <div className="bg-white rounded-lg shadow">
          {filteredRuns.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No runs found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || selectedStatus !== 'all' 
                  ? 'Try adjusting your search or filters'
                  : 'Get started by creating your first run'
                }
              </p>
              {!searchTerm && selectedStatus === 'all' && (
                <div className="mt-6">
                  <Link href="/runs/new">
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      Create your first run
                    </button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredRuns.map((run) => (
                <Link key={run.id} href={`/runs/${run.id}`}>
                  <div className="p-6 hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{run.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(run.status)}`}>
                            {run.status}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-2 line-clamp-2">{run.prompt}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatRelativeTime(run.created_at)}
                          </div>
                          {run.models.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Zap className="h-4 w-4" />
                              {run.models.length} models
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
