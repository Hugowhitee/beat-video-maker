import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Power,
  PowerOff,
  Lock,
  GripVertical,
  Radio,
  FoldHorizontal,
  Link2,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import type { TimelineTrack } from '@/types/timeline'
import { useTrackDrag } from '../hooks/use-track-drag'
import { TIMELINE_SIDEBAR_WIDTH } from '../constants'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import { useItemsStore } from '../stores/items-store'
import { isTrackDisabled } from '@/features/timeline/utils/classic-tracks'
import { isTrackSyncLockActive } from '../utils/track-sync-lock'

interface TrackHeaderProps {
  track: TimelineTrack
  isActive: boolean
  isSelected: boolean
  canDeleteTrack: boolean
  canDeleteEmptyTracks: boolean
  simplified?: boolean
  displayName?: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onToggleLock: () => void
  onToggleSyncLock: () => void
  onToggleDisabled: () => void
  onToggleSolo: () => void
  onSelect: (e: React.MouseEvent) => void
  onCloseGaps?: () => void
  onAddVideoTrack: () => void
  onAddAudioTrack: () => void
  onDeleteTrack: () => void
  onDeleteEmptyTracks: () => void
}

/**
 * Custom equality for TrackHeader memo - ignores callback props which are recreated each render
 */
function areTrackHeaderPropsEqual(prev: TrackHeaderProps, next: TrackHeaderProps): boolean {
  return (
    prev.track === next.track &&
    prev.isActive === next.isActive &&
    prev.isSelected === next.isSelected &&
    prev.canDeleteTrack === next.canDeleteTrack &&
    prev.canDeleteEmptyTracks === next.canDeleteEmptyTracks &&
    prev.simplified === next.simplified &&
    prev.displayName === next.displayName &&
    prev.collapsed === next.collapsed
  )
  // Callbacks (onToggleLock, etc.) are ignored - they're recreated each render but functionality is same
}

/**
 * Track Header Component
 *
 * Displays track name, controls, and handles selection.
 * Shows active state with background color.
 * Supports group tracks with collapse/expand and indentation.
 * Right-click context menu for track actions.
 * Memoized to prevent re-renders when props haven't changed.
 */
export const TrackHeader = memo(function TrackHeader({
  track,
  isActive,
  isSelected,
  canDeleteTrack,
  canDeleteEmptyTracks,
  simplified = false,
  displayName,
  collapsed = false,
  onToggleCollapsed,
  onToggleLock,
  onToggleSyncLock,
  onToggleDisabled,
  onToggleSolo,
  onSelect,
  onCloseGaps,
  onAddVideoTrack,
  onAddAudioTrack,
  onDeleteTrack,
  onDeleteEmptyTracks,
}: TrackHeaderProps) {
  const { t } = useTranslation()
  const itemCount = useItemsStore((s) => s.itemsByTrackId[track.id]?.length ?? 0)
  const syncLockEnabled = isTrackSyncLockActive(track)
  const trackDisabled = isTrackDisabled(track)
  const displayTrackColor =
    track.color ??
    (track.name === 'Beat'
      ? '#38bdf8'
      : track.name === 'Producer tags'
        ? '#f59e0b'
        : track.name === 'Watermarks'
          ? '#14b8a6'
          : undefined)

  // Use track drag hook (visuals handled centrally by timeline.tsx via DOM)
  const { handleDragStart } = useTrackDrag(track)
  const itemCountLabel = t('timeline.trackHeader.clipCount', { count: itemCount })
  const producerTrackLabel =
    displayName ??
    (/^V\d+$/i.test(track.name)
      ? `Video ${track.name.slice(1)}`
      : /^A\d+$/i.test(track.name)
        ? `Audio ${track.name.slice(1)}`
        : track.name)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="relative overflow-hidden"
          style={{
            height: `${track.height}px`,
            contentVisibility: 'auto',
            containIntrinsicSize: `${TIMELINE_SIDEBAR_WIDTH}px ${track.height}px`,
          }}
          data-track-id={track.id}
          data-track-disabled={trackDisabled ? 'true' : undefined}
          data-track-active={isActive ? 'true' : undefined}
          data-track-selected={isSelected ? 'true' : undefined}
        >
          <div
            className={`
              flex flex-col overflow-hidden
              ${simplified ? 'cursor-default px-0' : 'cursor-grab active:cursor-grabbing px-1'} relative
              ${
                simplified
                  ? isSelected
                    ? 'bg-accent/60'
                    : 'hover:bg-accent/35'
                  : isSelected
                    ? 'bg-primary/10'
                    : trackDisabled
                      ? 'bg-muted/30 hover:bg-muted/40'
                      : 'hover:bg-secondary/50'
              }
              ${
                simplified
                  ? 'border-l-0'
                  : isActive
                    ? 'border-l-3 border-l-primary'
                    : 'border-l-3 border-l-transparent'
              }
              ${!simplified && trackDisabled ? 'text-muted-foreground' : ''}
              transition-colors duration-150
            `}
            style={{ height: `${track.height}px` }}
            onClick={onSelect}
            onMouseDown={simplified ? undefined : handleDragStart}
          >
            {simplified ? (
              <div
                className="grid h-full min-h-0 grid-cols-[20px_minmax(0,1fr)_24px_24px_24px_24px] items-center gap-0.5 pl-3 pr-0.5"
                data-collapsed={collapsed ? 'true' : undefined}
                onDoubleClick={(event) => {
                  if (!onToggleCollapsed) return
                  event.stopPropagation()
                  onToggleCollapsed()
                }}
              >
                {isActive || isSelected ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={!onToggleCollapsed}
                  aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${producerTrackLabel} track`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleCollapsed?.()
                  }}
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </Button>
                <span
                  className={`min-w-0 flex-1 truncate text-xs font-normal leading-4 ${trackDisabled ? 'text-muted-foreground' : 'text-foreground'}`}
                  title={track.name}
                >
                  {producerTrackLabel}
                </span>
                {track.kind === 'audio' ? (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6 font-mono text-[11px] font-normal aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      aria-label={trackDisabled ? 'Unmute track' : 'Mute track'}
                      aria-pressed={trackDisabled}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleDisabled()
                      }}
                    >
                      M
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6 font-mono text-[11px] font-normal aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      aria-label={track.solo ? 'Unsolo track' : 'Solo track'}
                      aria-pressed={track.solo}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleSolo()
                      }}
                    >
                      S
                    </Button>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={trackDisabled ? 'Show track' : 'Hide track'}
                      aria-pressed={!trackDisabled}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleDisabled()
                      }}
                    >
                      {trackDisabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={track.locked ? 'Unlock track' : 'Lock track'}
                  aria-pressed={track.locked}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleLock()
                  }}
                >
                  <Lock className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={`${producerTrackLabel} track options`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={onToggleSyncLock}>
                      {syncLockEnabled ? 'Disable sync lock' : 'Enable sync lock'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onCloseGaps}>Close all gaps</DropdownMenuItem>
                    {canDeleteTrack ? (
                      <DropdownMenuItem onSelect={onDeleteTrack}>Delete track</DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                <div className="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden border-b border-border/60">
                  <div className="flex h-5 w-4 shrink-0 items-center justify-center">
                    <GripVertical
                      className="w-3.5 h-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  {/* Disable Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded hover:bg-secondary"
                    style={{
                      width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                      height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleDisabled()
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label={
                      trackDisabled
                        ? t('timeline.trackHeader.enableTrack')
                        : t('timeline.trackHeader.disableTrack')
                    }
                    data-tooltip={
                      trackDisabled
                        ? t('timeline.trackHeader.enableTrack')
                        : t('timeline.trackHeader.disableTrack')
                    }
                  >
                    {trackDisabled ? (
                      <PowerOff className="w-3 h-3 text-primary" />
                    ) : (
                      <Power className="w-3 h-3 opacity-70" />
                    )}
                  </Button>

                  {/* Solo Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded hover:bg-secondary"
                    style={{
                      width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                      height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSolo()
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label={
                      track.solo
                        ? t('timeline.trackHeader.unsoloTrack')
                        : t('timeline.trackHeader.soloTrack')
                    }
                    data-tooltip={
                      track.solo
                        ? t('timeline.trackHeader.unsoloTrack')
                        : t('timeline.trackHeader.soloTrack')
                    }
                  >
                    <Radio className={`w-3 h-3 ${track.solo ? 'text-primary' : ''}`} />
                  </Button>

                  {/* Lock Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded hover:bg-secondary"
                    style={{
                      width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                      height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleLock()
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label={
                      track.locked
                        ? t('timeline.trackHeader.unlockTrack')
                        : t('timeline.trackHeader.lockTrack')
                    }
                    data-tooltip={
                      track.locked
                        ? t('timeline.trackHeader.unlockTrack')
                        : t('timeline.trackHeader.lockTrack')
                    }
                  >
                    <Lock className={`w-3 h-3 ${track.locked ? 'text-primary' : 'opacity-70'}`} />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded hover:bg-secondary"
                    style={{
                      width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                      height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSyncLock()
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label={
                      syncLockEnabled
                        ? t('timeline.trackHeader.disableSyncLock')
                        : t('timeline.trackHeader.enableSyncLock')
                    }
                    data-tooltip={
                      syncLockEnabled
                        ? t('timeline.trackHeader.disableSyncLock')
                        : t('timeline.trackHeader.enableSyncLock')
                    }
                  >
                    <Link2
                      className={`w-3 h-3 ${syncLockEnabled ? 'text-primary' : 'opacity-70'}`}
                    />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded hover:bg-secondary"
                    style={{
                      width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                      height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseGaps?.()
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label={t('timeline.trackHeader.closeAllGaps')}
                    data-tooltip={t('timeline.trackHeader.closeAllGaps')}
                  >
                    <FoldHorizontal className="w-3 h-3" />
                  </Button>
                </div>

                <div className="flex min-h-0 flex-1 items-center gap-1.5 overflow-hidden px-1.5">
                  {displayTrackColor ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: displayTrackColor }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="min-w-0 truncate text-xs font-semibold leading-none font-mono">
                    {track.name}
                  </span>
                  <span className="shrink-0 text-[10px] leading-none text-muted-foreground">
                    {itemCountLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        {simplified && onToggleCollapsed ? (
          <>
            <ContextMenuItem onClick={onToggleCollapsed}>
              {collapsed
                ? t('timeline.trackHeader.expandTrack', { defaultValue: 'Expand track' })
                : t('timeline.trackHeader.collapseTrack', { defaultValue: 'Collapse track' })}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onClick={onToggleDisabled}>
          {trackDisabled
            ? t('timeline.trackHeader.enableTrack')
            : t('timeline.trackHeader.disableTrack')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleSolo}>
          {track.solo ? t('timeline.trackHeader.unsoloTrack') : t('timeline.trackHeader.soloTrack')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleLock}>
          {track.locked
            ? t('timeline.trackHeader.unlockTrack')
            : t('timeline.trackHeader.lockTrack')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleSyncLock}>
          {syncLockEnabled
            ? t('timeline.trackHeader.disableSyncLock')
            : t('timeline.trackHeader.enableSyncLock')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onCloseGaps}>
          {t('timeline.trackHeader.closeAllGaps')}
        </ContextMenuItem>

        {!simplified ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onAddVideoTrack}>
              {t('timeline.trackHeader.addVideoTrack')}
            </ContextMenuItem>
            <ContextMenuItem onClick={onAddAudioTrack}>
              {t('timeline.trackHeader.addAudioTrack')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={!canDeleteTrack} onClick={onDeleteTrack}>
              {t('timeline.trackHeader.deleteTrack')}
            </ContextMenuItem>
            <ContextMenuItem disabled={!canDeleteEmptyTracks} onClick={onDeleteEmptyTracks}>
              {t('timeline.trackHeader.deleteEmptyTracks')}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}, areTrackHeaderPropsEqual)
