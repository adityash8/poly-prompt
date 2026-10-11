import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: '/tmp/poly-prompt-browser-output',
  reporter: 'list',
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4318', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 4318',
    url: 'http://127.0.0.1:4318',
    timeout: 60000,
    reuseExistingServer: false,
    env: Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
      'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY',
      'STRIPE_SECRET_KEY', 'STRIPE_PRO_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_POSTHOG_KEY', 'CRON_SECRET'].map(name => [name, ''])),
  },
});
