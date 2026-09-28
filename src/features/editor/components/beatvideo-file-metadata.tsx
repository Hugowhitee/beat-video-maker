import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  buildMp3MetadataTags,
  metadataCopyFileName,
  mp3BpmFromTags,
  mp3MetadataDraftFromTags,
  readMp3Metadata,
  resolveMediaUrl,
  rewriteMp3Metadata,
  type Mp3ArtworkMode,
  type Mp3MetadataBaseMode,
  type Mp3MetadataDraft,
  type Mp3MetadataSnapshot,
} from '@/features/editor/deps/media-library'

const EMPTY_DRAFT: Mp3MetadataDraft = {
  title: '',
  artist: '',
  album: '',
  genre: '',
  date: '',
  beatsPerMinute: '',
  comment: '',
}

function isMp3(fileName: string, mimeType: string): boolean {
  return mimeType === 'audio/mpeg' || /\.mp3$/i.test(fileName)
}

function fileStem(fileName: string): string {
  return fileName.replace(/\.mp3$/i, '').trim()
}

function localDateValue(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formatBpm(value: number | null): string {
  if (!value || !Number.isFinite(value)) return ''
  return value.toFixed(2).replace(/\.00$/, '')
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

interface BeatvideoFileMetadataProps {
  mediaId: string
  fileName: string
  mimeType: string
  projectName: string
  beatBpm: number | null
}

export function BeatvideoFileMetadata({
  mediaId,
  fileName,
  mimeType,
  projectName,
  beatBpm,
}: BeatvideoFileMetadataProps) {
  const supported = isMp3(fileName, mimeType)
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Mp3MetadataSnapshot | null>(null)
  const [draft, setDraft] = useState<Mp3MetadataDraft>(EMPTY_DRAFT)
  const [baseMode, setBaseMode] = useState<Mp3MetadataBaseMode>('preserve')
  const [artworkMode, setArtworkMode] = useState<Mp3ArtworkMode>('keep')
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const originalSummary = useMemo(() => {
    if (!snapshot) return null
    const title = snapshot.tags.title?.trim()
    const artist = snapshot.tags.artist?.trim()
    return [title, artist].filter(Boolean).join(' · ') || 'No title or artist tags'
  }, [snapshot])

  useEffect(() => {
    setSnapshot(null)
    setDraft(EMPTY_DRAFT)
    setBaseMode('preserve')
    setArtworkMode('keep')
    setArtworkFile(null)
    setProgress(0)
  }, [mediaId])

  useEffect(() => {
    if (!open || !supported || !mediaId || snapshot) return

    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const sourceUrl = await resolveMediaUrl(mediaId)
        if (!sourceUrl) throw new Error('Could not load the selected MP3')
        const response = await fetch(sourceUrl)
        if (!response.ok) throw new Error('Could not read the selected MP3')
        const nextSnapshot = await readMp3Metadata(await response.blob())
        if (cancelled) return
        setSnapshot(nextSnapshot)
        setDraft(mp3MetadataDraftFromTags(nextSnapshot.tags))
      } catch (error) {
        if (!cancelled) {
          toast.error('Could not read MP3 metadata', {
            description: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mediaId, open, snapshot, supported])

  const resetToSource = () => {
    if (!snapshot) return
    setDraft(mp3MetadataDraftFromTags(snapshot.tags))
    setBaseMode('preserve')
    setArtworkMode('keep')
    setArtworkFile(null)
  }

  const clearEditableTags = () => {
    setDraft(EMPTY_DRAFT)
    setBaseMode('clean')
    setArtworkMode('remove')
    setArtworkFile(null)
  }

  const applyBeatReadyPreset = () => {
    if (!snapshot) return
    setBaseMode('clean')
    setDraft({
      title: projectName.trim() || fileStem(fileName),
      artist: '',
      album: '',
      genre: '',
      date: localDateValue(),
      beatsPerMinute: formatBpm(beatBpm ?? mp3BpmFromTags(snapshot.tags)),
      comment: '',
    })
    setArtworkMode(snapshot.artworkCount > 0 ? 'keep' : 'remove')
    setArtworkFile(null)
  }

  const updateDraft = (field: keyof Mp3MetadataDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const exportCopy = async () => {
    if (!snapshot || exporting) return

    setExporting(true)
    setProgress(0)
    try {
      const sourceUrl = await resolveMediaUrl(mediaId)
      if (!sourceUrl) throw new Error('Could not load the selected MP3')
      const response = await fetch(sourceUrl)
      if (!response.ok) throw new Error('Could not read the selected MP3')
      const source = await response.blob()

      const replacementArtwork =
        artworkMode === 'replace' && artworkFile
          ? {
              data: new Uint8Array(await artworkFile.arrayBuffer()),
              mimeType: artworkFile.type || 'image/jpeg',
              kind: 'coverFront' as const,
              name: artworkFile.name,
            }
          : undefined

      const tags = buildMp3MetadataTags(snapshot.tags, draft, {
        baseMode,
        artworkMode,
        replacementArtwork,
      })
      const output = await rewriteMp3Metadata(source, tags, setProgress)
      const cleanOnly =
        baseMode === 'clean' &&
        artworkMode === 'remove' &&
        Object.values(draft).every((value) => value.trim() === '')

      triggerDownload(
        output,
        metadataCopyFileName(fileName, cleanOnly ? 'clean' : 'tagged'),
      )
      toast.success('MP3 metadata copy exported', {
        description: 'The audio stream was copied without re-encoding.',
      })
    } catch (error) {
      toast.error('Could not export MP3 metadata copy', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setExporting(false)
      setProgress(0)
    }
  }

  return (
    <details
      className="border-t border-border pt-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
        <span>File metadata</span>
        <span className="text-[9px] font-normal text-muted-foreground">
          {supported ? 'MP3' : 'MP3 only'}
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        {!supported ? (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Metadata editing is MP3-first for now. Other audio formats keep using their original file unchanged.
          </p>
        ) : loading ? (
          <p className="text-[10px] text-muted-foreground">Reading tags…</p>
        ) : snapshot ? (
          <>
            <div className="border-l-2 border-border pl-2">
              <div className="truncate text-[10px] text-foreground">{originalSummary}</div>
              <div className="mt-0.5 text-[9px] text-muted-foreground">
                {snapshot.rawTagCount} raw tags · {snapshot.artworkCount} embedded image{snapshot.artworkCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <Button type="button" size="sm" variant="outline" onClick={clearEditableTags}>
                Clear tags
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={applyBeatReadyPreset}>
                Beat ready
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetToSource}>
                Reset
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-1 text-[10px] text-muted-foreground">
                <span>Title</span>
                <input
                  value={draft.title}
                  onChange={(event) => updateDraft('title', event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                />
              </label>
              <label className="space-y-1 text-[10px] text-muted-foreground">
                <span>Artist / producer</span>
                <input
                  value={draft.artist}
                  onChange={(event) => updateDraft('artist', event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                />
              </label>
              <label className="space-y-1 text-[10px] text-muted-foreground">
                <span>Date</span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => updateDraft('date', event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                />
              </label>
              <label className="space-y-1 text-[10px] text-muted-foreground">
                <span>BPM</span>
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={draft.beatsPerMinute}
                  onChange={(event) => updateDraft('beatsPerMinute', event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                />
              </label>
            </div>

            <details className="border-t border-border/70 pt-2">
              <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                More tags
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  <span>Album</span>
                  <input
                    value={draft.album}
                    onChange={(event) => updateDraft('album', event.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  />
                </label>
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  <span>Genre</span>
                  <input
                    value={draft.genre}
                    onChange={(event) => updateDraft('genre', event.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  />
                </label>
                <label className="col-span-2 space-y-1 text-[10px] text-muted-foreground">
                  <span>Comment</span>
                  <input
                    value={draft.comment}
                    onChange={(event) => updateDraft('comment', event.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  />
                </label>
              </div>
            </details>

            <div className="space-y-1.5 border-t border-border/70 pt-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Cover art</span>
                <span className="truncate text-[9px] text-muted-foreground">
                  {artworkMode === 'replace' && artworkFile
                    ? artworkFile.name
                    : artworkMode === 'remove'
                      ? 'Removed in copy'
                      : snapshot.artworkCount > 0
                        ? 'Keep existing'
                        : 'None'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex h-8 cursor-pointer items-center justify-center rounded-md border border-input bg-secondary px-2 text-[10px] font-medium text-foreground hover:bg-secondary/80">
                  Choose image
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setArtworkFile(file)
                      setArtworkMode(file ? 'replace' : 'keep')
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setArtworkMode('remove')
                    setArtworkFile(null)
                  }}
                >
                  Remove cover
                </Button>
              </div>
            </div>

            {exporting ? (
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Writing metadata copy</span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-[width] duration-150"
                    style={{ width: `${Math.max(2, progress * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={exporting}
              onClick={() => void exportCopy()}
            >
              {exporting ? 'Exporting copy…' : 'Export MP3 copy'}
            </Button>

            <p className="text-[9px] leading-relaxed text-muted-foreground">
              Standard MP3 tags and cover art only. The source file is never overwritten and the audio is not re-encoded. This does not target signed provenance or watermarks embedded in the audio signal.
            </p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Open this panel again to retry reading metadata.
          </p>
        )}
      </div>
    </details>
  )
}
