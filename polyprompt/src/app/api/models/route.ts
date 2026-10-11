import { api } from '@/lib/http';
import { loadCatalog } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export async function GET() { return api(() => loadCatalog()); }
