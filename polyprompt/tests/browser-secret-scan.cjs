const fs = require('node:fs');
const path = require('node:path');

// Check the actual assigned app environment against built browser assets. Never print values or read backups.
try {
  if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY',
    'STRIPE_SECRET_KEY', 'STRIPE_PRO_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'CRON_SECRET', 'NEXT_PUBLIC_POSTHOG_KEY'];
  console.log(JSON.stringify({ environmentPresence: Object.fromEntries(names.map(name => [name, Boolean(process.env[name])])) }));
  const assets = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file); else assets.push(fs.readFileSync(file));
    }
  }
  walk('.next/static');
  for (const name of names.filter(name => !name.startsWith('NEXT_PUBLIC_') && process.env[name])) {
    const present = assets.some(data => data.includes(process.env[name]));
    console.log(JSON.stringify({ name, browserValuePresent: present, assetsScanned: assets.length }));
    if (present) process.exitCode = 1;
  }
} catch {
  console.error('FAIL: browser secret scan could not finish. Sensitive error details suppressed.');
  process.exitCode = 1;
}
