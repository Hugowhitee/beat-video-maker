import { Button } from '@/components/ui/button'

interface ShotReviewControlsProps {
  name: string
  id: string
  busy: boolean
  dirty: boolean
  sourceOpen: boolean
  onSave: () => void
  onCancel: () => void
  onSplit: () => void
  onMergeLeft: () => void
  onResetTrim: () => void
  onResetAll: () => void
}

/** Reused in Shots and Sequence; editing state belongs to SourcePlayerStore. */
export function BeatvideoShotReviewControls({
  name,
  id,
  busy,
  dirty,
  sourceOpen,
  onSave,
  onCancel,
  onSplit,
  onMergeLeft,
  onResetTrim,
  onResetAll,
}: ShotReviewControlsProps) {
  const canInspect = sourceOpen && !busy

  return (
    <div className="space-y-2 border-t border-border pt-3" aria-label="Selected shot review">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-foreground">
          {name} · Shot {id.split(':').at(-1)}
        </p>
        {dirty && sourceOpen ? (
          <span role="status" className="shrink-0 text-xs text-muted-foreground">
            Unsaved range
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Set precise In/Out frames in Source. Save the shot or discard the draft.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canInspect || !dirty}
          onClick={onSave}
        >
          Save In/Out
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canInspect || !dirty}
          onClick={onCancel}
        >
          Cancel changes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canInspect}
          onClick={onSplit}
        >
          Split at playhead
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || id.endsWith(':shot:1')}
          onClick={onMergeLeft}
        >
          Merge left
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onResetTrim}
        >
          Restore shot trim
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onResetAll}
        >
          Reset all shots
        </Button>
      </div>
    </div>
  )
}
