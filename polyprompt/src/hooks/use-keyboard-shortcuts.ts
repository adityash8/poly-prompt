'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface KeyboardShortcutsOptions {
  onCommandPalette?: () => void
  enabled?: boolean
}

export function useKeyboardShortcuts({
  onCommandPalette,
  enabled = true
}: KeyboardShortcutsOptions = {}) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        // Allow command palette even when in input fields
        if (e.key === 'k' && (e.metaKey || e.ctrlKey) && onCommandPalette) {
          e.preventDefault()
          onCommandPalette()
        }
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // Command Palette
      if (e.key === 'k' && modifier && onCommandPalette) {
        e.preventDefault()
        onCommandPalette()
        return
      }

      // Navigation shortcuts (only work when NOT in input fields)
      if (modifier) {
        switch (e.key) {
          case 'h':
            e.preventDefault()
            router.push('/')
            break
          case 'd':
            e.preventDefault()
            router.push('/runs')
            break
          case 'n':
            e.preventDefault()
            router.push('/runs/new')
            break
          case 'f':
            e.preventDefault()
            router.push('/runs?search=')
            break
          case 't':
            e.preventDefault()
            router.push('/templates')
            break
          case 's':
            e.preventDefault()
            router.push('/shared')
            break
          case 'p':
            e.preventDefault()
            router.push('/profile')
            break
          case ',':
            e.preventDefault()
            router.push('/settings')
            break
        }
      }

      // Simple key navigation (j/k for lists, esc for closing modals)
      switch (e.key) {
        case 'Escape':
          // Close any open modals/overlays
          const closeButtons = document.querySelectorAll('[data-radix-collection-item], [role="dialog"] button')
          const lastCloseButton = closeButtons[closeButtons.length - 1] as HTMLElement
          if (lastCloseButton && lastCloseButton.getAttribute('aria-label')?.includes('Close')) {
            lastCloseButton.click()
          }
          break
        case '/':
          // Focus search input if available
          e.preventDefault()
          const searchInput = document.querySelector('input[placeholder*="search" i], input[placeholder*="Search" i]') as HTMLInputElement
          if (searchInput) {
            searchInput.focus()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [router, onCommandPalette, enabled])
}

// Hook specifically for list navigation (j/k keys)
export function useListNavigation(
  items: any[],
  onSelect?: (index: number) => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled || items.length === 0) return

    let selectedIndex = -1

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with input fields
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          selectedIndex = Math.min(selectedIndex + 1, items.length - 1)
          highlightItem(selectedIndex)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          selectedIndex = Math.max(selectedIndex - 1, 0)
          highlightItem(selectedIndex)
          break
        case 'Enter':
          if (selectedIndex >= 0 && onSelect) {
            e.preventDefault()
            onSelect(selectedIndex)
          }
          break
      }
    }

    const highlightItem = (index: number) => {
      // Remove previous highlights
      const previousHighlighted = document.querySelectorAll('.keyboard-selected')
      previousHighlighted.forEach(el => el.classList.remove('keyboard-selected'))

      // Add highlight to current item
      const items = document.querySelectorAll('[data-keyboard-nav-item]')
      if (items[index]) {
        items[index].classList.add('keyboard-selected')
        items[index].scrollIntoView({ block: 'nearest' })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [items, onSelect, enabled])
}