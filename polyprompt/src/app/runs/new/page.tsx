'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Play, Save } from 'lucide-react'
import Link from 'next/link'

const AVAILABLE_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
  { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },
  { id: 'gemini-1-5-flash', name: 'Gemini 1.5 Flash', provider: 'Google' },
  { id: 'mistral-large', name: 'Mistral Large', provider: 'Mistral' },
  { id: 'mistral-medium', name: 'Mistral Medium', provider: 'Mistral' },
]

export default function NewRunPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)

  // Handle template pre-filling
  useEffect(() => {
    const templateTitle = searchParams.get('title')
    const templatePrompt = searchParams.get('prompt')
    const templateVariables = searchParams.get('variables')

    if (templateTitle) setTitle(templateTitle)
    if (templatePrompt) {
      let processedPrompt = templatePrompt

      // Replace variables with actual values if provided
      if (templateVariables) {
        try {
          const variables = JSON.parse(templateVariables)
          Object.entries(variables).forEach(([key, value]) => {
            processedPrompt = processedPrompt.replace(
              new RegExp(`{{${key}}}`, 'g'),
              value as string
            )
          })
        } catch (error) {
          console.error('Failed to parse template variables:', error)
        }
      }

      setPrompt(processedPrompt)
    }
  }, [searchParams])

  const handleModelToggle = (modelId: string) => {
    setSelectedModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    )
  }

  const handleSave = async () => {
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt, models: selectedModels }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503) {
          alert("Setup required: Please configure Supabase environment variables. Visit /setup for instructions.");
          return;
        }
        throw new Error(errorData.message || "Failed to save run");
      }

      const run = await response.json();
      router.push(`/runs/${run.id}`);
    } catch (error) {
      console.error("Error saving run:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save run. Please try again.";
      alert(errorMessage);
    }
  };

  const handleRun = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt");
      return;
    }

    if (selectedModels.length === 0) {
      alert("Please select at least one model");
      return;
    }

    setIsRunning(true);

    try {
      const createResponse = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt, models: selectedModels }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        if (createResponse.status === 503) {
          alert("Setup required: Please configure Supabase and OpenRouter environment variables. Visit /setup for instructions.");
          return;
        }
        throw new Error(errorData.message || "Failed to create run");
      }

      const run = await createResponse.json();

      const executeResponse = await fetch(`/api/runs/${run.id}/run`, {
        method: "POST",
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json().catch(() => ({}));
        if (executeResponse.status === 503) {
          alert("Setup required: Please configure OpenRouter API key. Visit /setup for instructions.");
          return;
        }
        throw new Error(errorData.message || "Failed to execute run");
      }

      router.push(`/runs/${run.id}`);
    } catch (error) {
      console.error("Error running prompt:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to run prompt. Please try again.";
      alert(errorMessage);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Link href="/runs" className="mr-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">New Run</h1>
              <p className="text-gray-600">Create a new prompt comparison</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your run..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
              Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here... You can use variables like {product} or {tone}"
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              Use variable syntax for dynamic content
            </p>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Models ({selectedModels.length} selected)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelToggle(model.id)}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    selectedModels.includes(model.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium text-sm">{model.name}</div>
                  <div className="text-xs text-gray-500">{model.provider}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>First time?</strong> Make sure to configure your environment variables first. 
              <Link href="/setup" className="text-blue-600 hover:text-blue-700 underline ml-1">
                Check setup status →
              </Link>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save as Draft
            </button>
            <button
              onClick={handleRun}
              disabled={isRunning || !prompt.trim() || selectedModels.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Prompt
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
