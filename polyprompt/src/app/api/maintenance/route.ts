import { timingSafeEqual } from 'node:crypto';
import { api } from '@/lib/http';
import { createServiceClient } from '@/lib/supabase-server';
import { AppError } from '@/lib/validation';
export async function GET(request: Request) {
  return api(async () => {
    const configured = process.env.CRON_SECRET;
    const supplied = request.headers.get('authorization');
    if (!configured || !supplied) throw new AppError(401, 'Unauthorized.');
    const expected = Buffer.from(`Bearer ${configured}`);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AppError(401, 'Unauthorized.');
    const admin = createServiceClient();
    if (!admin) throw new AppError(503, 'Retention maintenance needs cloud execution setup.');
    const { error } = await admin.rpc('polyprompt_prune_expired_runs', { p_user_id: null });
    if (error) throw new AppError(503, 'Retention maintenance needs the supplied migration.');
    return { complete: true };
  });
}
