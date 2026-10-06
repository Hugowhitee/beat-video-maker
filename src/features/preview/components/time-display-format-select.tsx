/** Canonical labelled timecode/frame selector shared by Program and Source. */
export function TimeDisplayFormatSelect({
  showFrames,
  onChange,
}: {
  showFrames: boolean
  onChange: (showFrames: boolean) => void
}) {
  return (
    <select
      aria-label="Time display format"
      value={showFrames ? 'frames' : 'timecode'}
      onChange={(event) => onChange(event.currentTarget.value === 'frames')}
      className="h-8 min-w-[4.5rem] shrink-0 rounded-sm border border-border bg-muted px-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="timecode">TC</option>
      <option value="frames">Frames</option>
    </select>
  )
}
