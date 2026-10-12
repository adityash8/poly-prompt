import { AppNav } from '@/components/app-nav';
import { ComparisonEditor } from '@/components/comparison-editor';

export default function HomePage() {
  return <div className="app-shell"><AppNav />
    <main className="workspace-main">
      <header className="mb-8"><h1 className="page-title home-title mb-3">One prompt. Compare the outputs.</h1>
        <p className="text-muted-foreground max-w-2xl">Run real requests across the current model catalog. Compare the full text, tokens, cost and latency side by side. Start with your own provider key.</p>
      </header><ComparisonEditor />
    </main>
  </div>;
}
