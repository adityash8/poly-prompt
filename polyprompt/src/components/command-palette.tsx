'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const destinations = [['Compare models', '/runs/new'], ['Run history', '/runs'], ['Prompt templates', '/templates'], ['Account and privacy', '/account'], ['Sign in', '/login'], ['Setup status', '/setup']];
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const router = useRouter();
  return <CommandDialog open={open} onOpenChange={onOpenChange}><CommandInput placeholder="Find a page…" /><CommandList><CommandEmpty>No matching page.</CommandEmpty><CommandGroup heading="Navigation">
    {destinations.map(([label, path]) => <CommandItem key={path} onSelect={() => { onOpenChange(false); router.push(path); }}>{label}</CommandItem>)}
  </CommandGroup></CommandList></CommandDialog>;
}
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setOpen(current => !current); } };
    document.addEventListener('keydown', down); return () => document.removeEventListener('keydown', down);
  }, []);
  return { open, setOpen };
}
