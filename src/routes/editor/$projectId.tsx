import { createFileRoute } from '@tanstack/react-router'
import { ProjectNotFoundError } from '@/app/route-error-cause'
import { resolveBeatvideoProjectMode } from '@/config/beatvideo'
import {
  DEFAULT_PROJECT_FPS,
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'

export const Route = createFileRoute('/editor/$projectId')({
  // Editor loader data is tiny and migration state must be fresh on reopen.
  // Avoid keeping inactive editor matches around with stale "requires upgrade" flags.
  gcTime: 0,
  preloadGcTime: 0,
  loader: async ({ params }) => {
    const [{ CURRENT_SCHEMA_VERSION }, { getProject }] = await Promise.all([
      import('@/shared/projects/migrations'),
      import('@/infrastructure/storage'),
    ])
    // Validate project exists - actual loading happens in Editor via loadTimeline
    const project = await getProject(params.projectId)

    if (!project) {
      throw new ProjectNotFoundError(params.projectId)
    }

    const storedSchemaVersion = project.schemaVersion ?? 1
    // The projects list deliberately tolerates legacy/malformed metadata so a
    // recoverable project stays visible. The editor route must be at least as
    // defensive; migration/normalization runs during timeline load.
    const metadata = project.metadata as typeof project.metadata | undefined

    // Only pass metadata needed for Editor initialization (not timeline data).
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        width: metadata?.width ?? DEFAULT_PROJECT_WIDTH,
        height: metadata?.height ?? DEFAULT_PROJECT_HEIGHT,
        fps: metadata?.fps ?? DEFAULT_PROJECT_FPS,
        backgroundColor: metadata?.backgroundColor,
        beatvideoMode: resolveBeatvideoProjectMode(project.beatvideoMode),
        beatvideoMusic: project.beatvideoMusic,
      },
      migration: {
        storedSchemaVersion,
        currentSchemaVersion: CURRENT_SCHEMA_VERSION,
        requiresUpgrade: storedSchemaVersion < CURRENT_SCHEMA_VERSION,
      },
    }
  },
})
