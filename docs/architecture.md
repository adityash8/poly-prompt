# Poly Prompt - Architecture

## Vision
One prompt. Every LLM. Side-by-side. Become the "Superhuman" of model comparison: fast, minimal, async, delightful.

## UX Pillars (Enforced in Code Reviews)

### 1. Speed First
- **<150ms perceived latency** - Optimistic UI + skeletons; never "loading…"
- **Keyboard-first** - ⌘K command palette, global hotkeys, j/k navigation
- **One-screen focus** - Three-pane layout, zero chrome
- **Micro-interactions** - Subtle motion, haptics, undo toasts
- **Search-as-the-home** - Spotlight bar, fuzzy search everywhere

### 2. Stack Specification
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind + shadcn/ui + Radix
- **Motion**: Framer Motion for micro-interactions
- **Auth**: Supabase magic links
- **Data**: Supabase + PostgREST; TanStack Query with stale-while-revalidate
- **Observability**: PostHog + Sentry
- **Performance**: React Server Components, edge runtime where possible

## Technical Architecture

### Three-Pane Layout
```
┌─────────────────┬─────────────────┬─────────────────┐
│   Left Rail     │   Main List     │  Right Detail   │
│   (w-72)        │   (flex-1)      │   (w-96)        │
│   • Filters     │   • Virtualized │   • Sticky      │
│   • Tags        │   • Row height  │   • Actions     │
│   • Collapsible │     56px        │   • Content     │
│   (⌘B toggle)   │   • Hover/      │   • Markdown    │
│                 │     selected    │   • Code styles │
└─────────────────┴─────────────────┴─────────────────┘
```

### Command Palette & Hotkeys
- **⌘K**: Global command palette (shadcn Command)
- **j/k**: Navigate prev/next
- **o/Enter**: Open item
- **e**: Edit current item
- **⌘/**: Help
- **⌘B**: Toggle left rail
- **Esc**: Close/dismiss

### Design Tokens
```css
:root {
  --radius: 16px;
  --shadow-sm: 0 2px 10px rgba(0,0,0,.06);
  --shadow-md: 0 8px 30px rgba(0,0,0,.08);
  --ease-smooth: cubic-bezier(.22,.61,.36,1);
}
```

## Data Model

### Core Entities

#### Run
```typescript
interface Run {
  id: string;           // UUID
  title: string;        // Text
  prompt: string;       // Text
  status: 'draft' | 'ready' | 'running' | 'completed' | 'error';
  created_at: string;   // ISO timestamp
  updated_at: string;   // ISO timestamp
  user_id: string;      // UUID (FK to auth.users)
  is_public: boolean;   // For sharing
  variables?: Record<string, string>; // Template variables
}
```

#### Eval (Evaluation)
```typescript
interface Eval {
  id: string;           // UUID
  run_id: string;       // UUID (FK to runs)
  model: string;        // 'gpt-4o', 'claude-3.5-sonnet', etc.
  provider: string;     // 'openai', 'anthropic', 'google', etc.
  latency_ms: number;   // Integer
  tokens_in: number;    // Integer
  tokens_out: number;   // Integer
  cost_usd: number;     // Numeric
  output: string;       // Text
  score?: number;       // Integer (optional manual scoring)
  error?: string;       // Text (if failed)
  created_at: string;   // ISO timestamp
}
```

### API Endpoints
```
GET    /api/runs                    # List runs
POST   /api/runs                    # Create run
GET    /api/runs/:id                # Get run details
PATCH  /api/runs/:id                # Update run
DELETE /api/runs/:id                # Delete run

GET    /api/runs/:id/evals          # List evals for run
POST   /api/runs/:id/evals          # Create eval (run model)
GET    /api/runs/:id/evals/:evalId  # Get eval details

POST   /api/runs/:id/run            # Execute run across models
GET    /api/shared/:shareId         # Public share link
```

## Performance Requirements

### Core Web Vitals Targets
- **LCP**: < 1.8s
- **FID**: < 100ms
- **CLS**: ~0 (zero layout shift)

### Latency Budgets
- **List → Detail**: < 150ms
- **Create → Visible**: < 200ms
- **Search → Results**: < 100ms
- **Model Execution**: < 5s (with optimistic UI)

### Optimization Strategies
- **React Server Components** for read operations
- **Edge runtime** for API routes
- **Virtualized lists** with @tanstack/react-virtual
- **Optimistic UI** for all mutations
- **Background refresh** with TanStack Query
- **Prefetch on hover** for detail views

## Security & Privacy

### Authentication
- Supabase magic link authentication
- Session management with SSR
- Row Level Security (RLS) on all tables

### Data Protection
- API keys stored encrypted in Supabase
- Public sharing via secure tokens
- Rate limiting on model execution
- Input sanitization and validation

## Monitoring & Observability

### PostHog Events
```typescript
// User interactions
'palette_open'
'palette_action'
'hotkey_press'
'run_created'
'run_executed'
'model_selected'

// Performance
'optimistic_commit'
'undo_action'
'error_occurred'
```

### Sentry Integration
- Error tracking and performance monitoring
- User context and breadcrumbs
- Release tracking

## Development Workflow

### Code Quality
- **ESLint** + **Prettier** + strict TypeScript
- **Playwright** for E2E testing
- **Unit tests** for hotkeys, palette, mutations
- **A11y checks** with axe-core

### Deployment
- **Vercel** for hosting and edge functions
- **Supabase** for database and auth
- **Stripe** for billing
- **PostHog** for analytics
- **Sentry** for monitoring

## Success Metrics

### Week 1 Targets
- 500 runs in first week
- 40% return usage after first run
- 20+ shared compare links
- Free → Pro conversion ≥ 10%

### Technical Metrics
- Zero hydration warnings
- All Playwright tests passing
- Lighthouse score > 90
- Zero critical Sentry errors
