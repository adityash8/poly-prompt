'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import {
  Play,
  Plus,
  Home,
  Settings,
  Search,
  Users,
  Share2,
  FileText,
  Zap,
  LogOut,
  User
} from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
    }
    getUser()
  }, [supabase])

  const runCommand = (callback: () => void) => {
    onOpenChange(false)
    callback()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push('/'))}>
            <Home className="mr-2 h-4 w-4" />
            <span>Home</span>
            <CommandShortcut>⌘H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/runs'))}>
            <Zap className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/runs/new'))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Run</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => router.push('/runs?search='))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Search Runs</span>
            <CommandShortcut>⌘F</CommandShortcut>
          </CommandItem>
          {user && (
            <>
              <CommandItem onSelect={() => runCommand(() => router.push('/templates'))}>
                <FileText className="mr-2 h-4 w-4" />
                <span>Browse Templates</span>
                <CommandShortcut>⌘T</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push('/shared'))}>
                <Share2 className="mr-2 h-4 w-4" />
                <span>My Shares</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </>
          )}
        </CommandGroup>

        {/* Account */}
        <CommandGroup heading="Account">
          {user ? (
            <>
              <CommandItem onSelect={() => runCommand(() => router.push('/profile'))}>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
                <CommandShortcut>⌘,</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => handleSignOut())}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </CommandItem>
            </>
          ) : (
            <CommandItem onSelect={() => runCommand(() => router.push('/login'))}>
              <User className="mr-2 h-4 w-4" />
              <span>Sign In</span>
            </CommandItem>
          )}
        </CommandGroup>

        {/* Help */}
        <CommandGroup heading="Help">
          <CommandItem onSelect={() => runCommand(() => router.push('/setup'))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Setup Status</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => window.open('https://github.com/yourusername/poly-prompt', '_blank'))}
          >
            <FileText className="mr-2 h-4 w-4" />
            <span>Documentation</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

// Hook for keyboard shortcuts
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return { open, setOpen }
}