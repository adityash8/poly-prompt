'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, Star, Play, Copy, User, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

interface Template {
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

const categories = [
  { id: 'all', name: 'All Templates' },
  { id: 'sales', name: 'Sales' },
  { id: 'content', name: 'Content' },
  { id: 'ecommerce', name: 'E-commerce' },
  { id: 'development', name: 'Development' },
  { id: 'productivity', name: 'Productivity' },
  { id: 'general', name: 'General' },
]

export default function TemplatesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showFeatured, setShowFeatured] = useState(false)

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const params = new URLSearchParams()
        if (selectedCategory !== 'all') params.set('category', selectedCategory)
        if (showFeatured) params.set('featured', 'true')

        const response = await fetch(`/api/templates?${params}`)
        if (!response.ok) throw new Error('Failed to fetch templates')

        const data = await response.json()
        setTemplates(data)
      } catch (error) {
        console.error('Error fetching templates:', error)
        toast({
          title: "Failed to load templates",
          description: "Please try again",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchTemplates()
  }, [selectedCategory, showFeatured, toast])

  const filteredTemplates = templates.filter(template =>
    template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.prompt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleUseTemplate = async (template: Template) => {
    try {
      // Track template usage
      await fetch(`/api/templates/${template.id}/use`, { method: 'POST' })

      // Navigate to new run with template pre-filled
      const queryParams = new URLSearchParams({
        template: template.id,
        title: template.title,
        prompt: template.prompt,
        variables: JSON.stringify(template.variables)
      })
      router.push(`/runs/new?${queryParams}`)
    } catch (error) {
      console.error('Error using template:', error)
      toast({
        title: "Failed to use template",
        description: "Please try again",
        variant: "destructive",
      })
    }
  }

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      toast({
        title: "Prompt copied!",
        description: "Template prompt copied to clipboard",
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white p-6 rounded-lg shadow">
                  <div className="h-6 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Template Gallery</h1>
              <p className="text-gray-600">Ready-to-use prompts for common tasks</p>
            </div>
            <Link href="/runs/new">
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                <Play className="h-4 w-4" />
                Custom Run
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          {/* Featured Filter */}
          <button
            onClick={() => setShowFeatured(!showFeatured)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              showFeatured
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Star className={`h-4 w-4 ${showFeatured ? 'fill-current' : ''}`} />
            Featured
          </button>
        </div>

        {/* Results */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No templates found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{template.title}</h3>
                        {template.is_featured && (
                          <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="bg-gray-100 px-2 py-1 rounded-full">
                          {template.category}
                        </span>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          <span>{template.use_count} uses</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  {/* Prompt Preview */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="text-gray-700 text-sm line-clamp-3 font-mono">
                      {template.prompt}
                    </p>
                  </div>

                  {/* Variables */}
                  {Object.keys(template.variables).length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">Variables:</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(template.variables).map((key) => (
                          <span key={key} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUseTemplate(template)}
                      className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Use Template
                    </button>
                    <button
                      onClick={() => handleCopyPrompt(template.prompt)}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Copy prompt"
                    >
                      <Copy className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}