import { Button } from "@/components/ui/button"
import { Plus, Zap, BarChart3, Share2 } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Poly Prompt
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            One prompt. Every LLM. Side-by-side.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              New Run
            </Button>
            <Button variant="outline" size="lg" className="gap-2">
              <Zap className="h-5 w-5" />
              Try Demo
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Lightning Fast</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Compare prompts across multiple LLMs in seconds with our optimized interface.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Detailed Metrics</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Get cost, latency, and token usage for each model to make informed decisions.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
              <Share2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Easy Sharing</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Share your comparisons with public links or export results for your team.
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            Join thousands of developers comparing LLM outputs with Poly Prompt.
          </p>
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Your First Run
          </Button>
        </div>
      </div>
    </div>
  )
}
