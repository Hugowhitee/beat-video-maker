import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/shared/state/editor'
import type { EditorWorkspaceId } from '@/config/editor-workspaces'
import type { BeatvideoProjectMode } from '@/types/project'

const PRIMARY_WORKSPACES: readonly {
  id: EditorWorkspaceId
  label: string
}[] = [
  { id: 'beat', label: 'Beat' },
  { id: 'edit', label: 'Visual' },
  { id: 'color', label: 'Nodes' },
  { id: 'master', label: 'Master' },
]

/**
 * Producer workflow: Beat → Visual → Nodes → Master.
 *
 * Motion stays a capability of selected visual items in the Inspector. The
 * internal Motion/composition workspace still exists for composition editing,
 * but it is not part of the normal Beatvideo navigation.
 */
export const WorkspaceSwitcher = memo(function WorkspaceSwitcher({
  beatvideoMode = 'video',
}: {
  beatvideoMode?: BeatvideoProjectMode
}) {
  const { t } = useTranslation()
  const workspace = useEditorStore((s) => s.workspace)
  const setWorkspace = useEditorStore((s) => s.setWorkspace)
  const visualHint =
    beatvideoMode === 'photo'
      ? 'Photo, text, motion and effects'
      : 'Footage, cuts, motion and effects'

  return (
    <div
      role="tablist"
      aria-label={t('toolbar.workspaces.label')}
      className="studio-workspace-tabs flex h-full items-center"
    >
      {PRIMARY_WORKSPACES.map(({ id, label }) => {
        const isActive = workspace === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={id === 'edit' ? visualHint : id === 'color' ? 'Grading and effects' : undefined}
            onClick={() => setWorkspace(id)}
            className={`studio-workspace-tab flex items-center justify-center ${isActive ? 'font-semibold' : 'font-medium'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
})
