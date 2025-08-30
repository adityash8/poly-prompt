# Foundation Prompt for Cursor

## Role
Senior Frontend + DX lead for Poly Prompt

## Goal
Build a Superhuman-level polished LLM comparison tool with keyboard-first UX and <150ms interactions

## Non-Negotiables
- **Keyboard-first**: ⌘K palette, j/k navigation, global hotkeys
- **Speed**: <150ms perceived latency, optimistic UI, skeletons (never "loading...")
- **Three-pane layout**: Left rail (filters), main list (virtualized), right detail
- **Micro-interactions**: Framer Motion, undo toasts, haptic feedback
- **Zero chrome**: One-screen focus, minimal UI

## Deliverables
- Working code with no TODOs
- Comprehensive tests (unit + E2E)
- Performance optimized (<1.8s LCP, zero CLS)
- A11y compliant (ARIA, focus management)

## Architecture Patterns

### 1. State Management
```typescript
// TanStack Query for server state
const { data: runs } = useQuery({
  queryKey: ['runs'],
  queryFn: () => fetchRuns(),
  staleTime: 30000,
})

// Optimistic updates
const mutation = useMutation({
  mutationFn: createRun,
  onMutate: async (newRun) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['runs'] })
    
    // Snapshot previous value
    const previousRuns = queryClient.getQueryData(['runs'])
    
    // Optimistically update
    queryClient.setQueryData(['runs'], (old) => [...old, newRun])
    
    return { previousRuns }
  },
  onError: (err, newRun, context) => {
    queryClient.setQueryData(['runs'], context.previousRuns)
  },
})
```

### 2. Hotkey System
```typescript
// useHotkeys.ts
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = [
        e.metaKey ? '⌘' : '',
        e.ctrlKey ? 'Ctrl' : '',
        e.shiftKey ? '⇧' : '',
        e.key.toLowerCase()
      ].filter(Boolean).join('+')
      
      if (map[combo]) {
        e.preventDefault()
        map[combo](e)
      }
    }
    
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [map])
}
```

### 3. Command Palette
```typescript
// Command palette with fuzzy search
const Command = () => {
  const [open, setOpen] = useState(false)
  
  useHotkeys({
    '⌘+k': () => setOpen(true),
    'escape': () => setOpen(false),
  })
  
  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="Search actions..." />
      <Command.List>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => createRun()}>
            <Plus className="w-4 h-4" />
            New Run
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
```

### 4. Virtualized List
```typescript
// Virtualized list with 56px row height
const VirtualizedList = ({ items }) => {
  const parentRef = useRef()
  
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 5,
  })
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <ListItem item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## File Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes
│   ├── api/               # API routes
│   ├── runs/              # Run pages
│   └── layout.tsx         # Root layout
├── components/            # Reusable components
│   ├── ui/               # shadcn/ui components
│   ├── layout/           # Layout components
│   └── features/         # Feature components
├── hooks/                # Custom hooks
├── lib/                  # Utilities
├── types/                # TypeScript types
└── styles/               # Global styles
```

## Performance Checklist
- [ ] React Server Components for read operations
- [ ] Edge runtime for API routes
- [ ] Virtualized lists with proper overscan
- [ ] Optimistic UI for all mutations
- [ ] Background refresh with stale-while-revalidate
- [ ] Prefetch on hover for detail views
- [ ] Image optimization and lazy loading
- [ ] Code splitting and dynamic imports

## Testing Strategy
- **Unit tests**: Hotkeys, command palette, optimistic updates
- **Integration tests**: API routes, database operations
- **E2E tests**: User flows, keyboard navigation, undo functionality
- **Performance tests**: Lighthouse, Core Web Vitals
- **A11y tests**: axe-core, focus management, screen readers
