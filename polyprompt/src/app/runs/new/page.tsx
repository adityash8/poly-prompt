import { AppNav } from '@/components/app-nav';
import { ComparisonEditor } from '@/components/comparison-editor';
export default async function NewRunPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  return <div className="app-shell"><AppNav /><main className="workspace-main">
    <h1 className="page-title mb-6">New comparison</h1><ComparisonEditor templateId={template} />
  </main></div>;
}
