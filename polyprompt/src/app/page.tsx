import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">
          Poly Prompt
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          One prompt. Every LLM. Side-by-side.
        </p>
        <div className="space-y-4">
          <Link href="/runs">
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
              Get Started
            </button>
          </Link>
          <Link href="/setup">
            <button className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors">
              Setup Status
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
