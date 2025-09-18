'use client'

import { CommandPalette, useCommandPalette } from "@/components/command-palette"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { Toaster } from "@/components/ui/toaster"

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useCommandPalette()

  useKeyboardShortcuts({
    onCommandPalette: () => setOpen(true),
  })

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
      <Toaster />
    </>
  )
}