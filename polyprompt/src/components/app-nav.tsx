import Link from 'next/link';
import { Zap } from 'lucide-react';

export function AppNav() {
  return <nav aria-label="Main navigation" className="bg-white border-b text-gray-900">
    <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <Link href="/" className="font-bold text-lg flex items-center gap-2 mr-auto"><Zap className="h-5 w-5 text-blue-600" />Poly Prompt</Link>
      <Link className="text-sm hover:text-blue-700" href="/runs/new">Compare</Link>
      <Link className="text-sm hover:text-blue-700" href="/runs">History</Link>
      <Link className="text-sm hover:text-blue-700" href="/templates">Templates</Link>
      <Link className="text-sm hover:text-blue-700" href="/account">Account</Link>
      <Link className="text-sm hover:text-blue-700" href="/setup">Setup</Link>
    </div>
  </nav>;
}
