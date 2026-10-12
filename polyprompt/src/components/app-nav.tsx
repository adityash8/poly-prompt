'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap } from 'lucide-react';

export function AppNav() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation" className="app-nav">
    <div className="nav-inner">
      <Link href="/" className="brand-link"><Zap aria-hidden="true" className="h-5 w-5" />Poly Prompt</Link>
      <div className="nav-links">
        <Link aria-current={pathname === '/' || pathname === '/runs/new' ? 'page' : undefined} href="/runs/new">Compare</Link>
        <Link aria-current={pathname === '/runs' || (pathname.startsWith('/runs/') && pathname !== '/runs/new') ? 'page' : undefined} href="/runs">History</Link>
        <Link aria-current={pathname === '/templates' ? 'page' : undefined} href="/templates">Templates</Link>
        <Link aria-current={pathname === '/account' ? 'page' : undefined} href="/account">Account</Link>
        <Link aria-current={pathname === '/setup' ? 'page' : undefined} href="/setup">Setup</Link>
      </div>
    </div>
  </nav>;
}
