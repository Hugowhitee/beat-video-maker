import { useEffect, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/ui/cn'

interface PropertySectionProps {
  title: string
  icon?: LucideIcon
  defaultOpen?: boolean
  children: React.ReactNode
}

/** Every mounted PropertySection, so a shift-click can drive all of them at once. */
const openStateSubscribers = new Set<(open: boolean) => void>()

/**
 * Collapsible section wrapper for property groups.
 * Used for Source, Layout, Fill, Video, Audio sections.
 *
 * Shift-clicking a header collapses every section (or expands them all, when the
 * clicked header was already collapsed).
 */
export function PropertySection({
  title,
  defaultOpen = true,
  children,
}: PropertySectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    openStateSubscribers.add(setOpen)
    return () => {
      openStateSubscribers.delete(setOpen)
    }
  }, [])

  const setAllSectionsOpen = (next: boolean) => {
    for (const setSectionOpen of openStateSubscribers) setSectionOpen(next)
  }

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!event.shiftKey) return
    // Radix skips its own toggle when the click is default-prevented, so this
    // header is driven by the broadcast like every other one.
    event.preventDefault()
    setAllSectionsOpen(!open)
  }

  // Activating the button by key synthesizes a click, but only carries shiftKey
  // if Shift is still held when that click is dispatched — and Space dispatches
  // it on keyup. Read the modifier off the keydown, where it is unambiguous, and
  // suppress the activation so no click follows.
  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.shiftKey || event.repeat) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setAllSectionsOpen(!open)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-7 w-full items-center gap-1.5 border-b border-border/70 px-0 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
        />
        <span className="text-[9px] font-semibold tracking-wide">
          {title}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0 pb-2 pt-1.5">{children}</CollapsibleContent>
    </Collapsible>
  )
}
