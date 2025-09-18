'use client'

import { CommandPalette, useCommandPalette } from "@/components/command-palette"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { Toaster } from "@/components/ui/toaster"
import { useEffect } from "react"

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useCommandPalette()

  useKeyboardShortcuts({
    onCommandPalette: () => setOpen(true),
  })

  // Initialize GrowthOS/PostHog
  useEffect(() => {
    const initAnalytics = async () => {
      try {
        // Import and initialize GrowthOS
        const { initGrowthOS } = await import('@/lib/growthos.js')
        const growthos = initGrowthOS()
        
        // Track app initialization
        growthos.track('app_initialized', {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent
        })
        
        console.log('GrowthOS initialized successfully')
      } catch (error) {
        console.error('Failed to initialize GrowthOS:', error)
      }
    }
    
    initAnalytics()
  }, [])

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
      <Toaster />
    </>
  )
}