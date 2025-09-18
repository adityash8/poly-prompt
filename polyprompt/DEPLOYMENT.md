# Poly Prompt Deployment Guide

## Prerequisites

1. **Supabase Project**
   - Create a new project at [supabase.com](https://supabase.com)
   - Note your project URL and anon key

2. **OpenRouter API Key**
   - Sign up at [openrouter.ai](https://openrouter.ai)
   - Generate an API key for model access

3. **Vercel Account** (recommended)
   - Sign up at [vercel.com](https://vercel.com)

## Database Setup

1. **Run the SQL Schema**
   - Copy the contents of `supabase/schema.sql`
   - Paste and run in your Supabase SQL Editor
   - This creates all tables, RLS policies, and sample templates

2. **Verify Tables**
   - Check that these tables exist: `profiles`, `runs`, `evals`, `templates`
   - Confirm RLS policies are enabled

## Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenRouter
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional: Stripe (for billing)
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Optional: PostHog (for analytics)
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Deployment

### Vercel (Recommended)

1. **Connect Repository**
   - Import your GitHub repository in Vercel
   - Vercel will auto-detect Next.js

2. **Configure Environment Variables**
   - Add all environment variables in Vercel dashboard
   - Go to Project Settings → Environment Variables

3. **Deploy**
   - Vercel will automatically deploy on every push to main
   - First deployment may take 2-3 minutes

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- AWS Amplify
- DigitalOcean App Platform

## Post-Deployment

1. **Test Authentication**
   - Visit `/login` and test magic link signup
   - Check that users are created in Supabase

2. **Test Run Creation**
   - Create a new run with multiple models
   - Verify results are saved to database

3. **Test Sharing**
   - Create a share link
   - Test public access via `/shared/{shareId}`

4. **Setup Status**
   - Visit `/setup` to verify all services are working

## Features Included

✅ **Core MVP Features**
- Multi-model prompt comparison
- User authentication (magic links)
- Run history and management
- Share links for public viewing
- Template gallery
- Export functionality (JSON/CSV)
- Command palette (⌘K)
- Toast notifications

✅ **Architecture Features**
- Server-side rendering
- Real-time updates
- Responsive design
- Keyboard shortcuts
- Error handling
- Loading states

## Monitoring

The app includes built-in health checks:
- `/setup` - Service status page
- Supabase connection testing
- OpenRouter API validation

## Scaling Considerations

1. **Database**
   - Supabase handles scaling automatically
   - Consider read replicas for high traffic

2. **API Limits**
   - OpenRouter has rate limits per plan
   - Monitor usage in OpenRouter dashboard

3. **Costs**
   - Supabase: Free tier → $25/month Pro
   - OpenRouter: Pay per token usage
   - Vercel: Free tier → $20/month Pro

## Support

- Check `/setup` for service status
- View browser console for client errors
- Check Vercel function logs for server errors
- Supabase dashboard for database issues

## Next Steps

After successful deployment, consider:

1. **Billing Integration** - Add Stripe for Pro features
2. **Analytics** - Add PostHog for user tracking
3. **Monitoring** - Add Sentry for error tracking
4. **Custom Domain** - Configure in Vercel
5. **SEO** - Add meta tags and sitemap