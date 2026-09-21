import { useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/features/editor/deps/projects'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { useTimelineStore } from '@/features/editor/deps/timeline-contract'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import { setupBeatvideoPhotoTimeline } from '../utils/beatvideo-photo-setup'

export function BeatvideoPhotoQuickStart() {
  const itemCount = useTimelineStore((state) => state.items.length)
  const [busy, setBusy] = useState(false)

  const handleChoose = async () => {
    if (busy) return
    setBusy(true)

    try {
      const imported = await useMediaLibraryStore.getState().importMedia({
        allowedKinds: ['image', 'audio'],
      })
      if (imported.length === 0) return

      if (itemCount === 0) {
        const project = useProjectStore.getState().currentProject
        const result = await setupBeatvideoPhotoTimeline({
          importedMedia: imported,
          width: project?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
          height: project?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
        })

        if (result.status === 'unresolved-media') {
          toast.error('Media was imported, but could not be placed on the timeline.')
        }
      }
    } catch (error) {
      toast.error('Could not add cover and beat.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-border p-3">
      <Button
        type="button"
        variant="secondary"
        className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-left"
        onClick={() => void handleChoose()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {itemCount === 0 ? 'Cover + beat' : 'Add media'}
          </span>
          <span className="block text-xs font-normal text-muted-foreground">
            {itemCount === 0 ? 'Choose an image and audio file' : 'Images or audio'}
          </span>
        </span>
      </Button>
    </div>
  )
}
