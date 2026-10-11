import { AppNav } from '@/components/app-nav';
import { ComparisonEditor } from '@/components/comparison-editor';
export default async function NewRunPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav /><main className="max-w-7xl mx-auto p-4 sm:p-8">
    <h1 className="text-2xl font-bold mb-6">New comparison</h1><ComparisonEditor templateId={template} />
  </main></div>;
}
