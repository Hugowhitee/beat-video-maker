/** Shared card wrapper classes for media and composition cards */

export const CARD_GRID_BASE =
  'group relative bg-background border border-border rounded-sm overflow-hidden transition-colors flex flex-col'

export const CARD_LIST_BASE =
  'group bg-background border border-border rounded-sm overflow-hidden transition-colors flex items-center gap-2 px-2 py-1.5'

export const CARD_PERF_STYLE = {
  contain: 'layout style paint',
  contentVisibility: 'auto',
} as const
