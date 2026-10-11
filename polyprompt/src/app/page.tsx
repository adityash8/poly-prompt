import { AppNav } from '@/components/app-nav';
import { ComparisonEditor } from '@/components/comparison-editor';

export default function HomePage() {
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav />
    <main className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8"><h1 className="text-3xl sm:text-4xl font-bold mb-3">One prompt. Compare the outputs.</h1>
        <p className="text-gray-600 max-w-2xl">Run real requests across the current model catalog. Compare the full text, tokens, cost and latency side by side. Start with your own provider key.</p>
      </header><ComparisonEditor />
    </main>
  </div>;
}
