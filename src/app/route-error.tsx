/**
 * Router-level error screen.
 *
 * Keep recovery inside the same Studio/Figma grammar as the rest of the app.
 * Route failures can happen before editor UI mounts, so this surface must be
 * self-contained and useful without falling back to the legacy dark shell.
 */

import { useEffect, useRef, useState } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  FileQuestion,
  FolderOpen,
  RefreshCw,
} from 'lucide-react'

import { createLogger } from '@/shared/logging/logger'
import { useStudioDocumentTheme } from '@/shared/ui/use-studio-document-theme'
import {
  ensureKnownWorkspaceForCurrent,
  getWorkspaceHandleRecord,
  removeKnownWorkspace,
} from '@/infrastructure/storage/handles-db'
import {
  formatRouteErrorDetails,
  getProjectNotFoundError,
  getStorageFailureName,
} from './route-error-cause'

const logger = createLogger('RouteError')

const CAUSE_EXPLANATION_KEYS: Record<string, string> = {
  NotAllowedError: 'app.routeError.causePermission',
  NotFoundError: 'app.routeError.causeMissing',
  NotSupportedError: 'app.routeError.causeUnsupported',
  SecurityError: 'app.routeError.causePermission',
}

export function RouteErrorScreen({ error, reset }: ErrorComponentProps) {
  useStudioDocumentTheme()
  const { t } = useTranslation()
  const router = useRouter()
  const [isSwitchingFolder, setIsSwitchingFolder] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const projectNotFound = getProjectNotFoundError(error)
  const failureName = getStorageFailureName(error)
  const explanationKey = failureName ? CAUSE_EXPLANATION_KEYS[failureName] : undefined
  const title = projectNotFound
    ? t('app.routeError.projectNotFoundTitle')
    : t('app.routeError.title')
  const description = projectNotFound
    ? t('app.routeError.projectNotFoundDescription')
    : explanationKey
      ? t(explanationKey)
      : t('app.routeError.description')
  const shortDetail = error instanceof Error ? error.message : String(error)

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    },
    [],
  )

  const handleRetry = () => {
    reset()
    void router.invalidate()
  }

  const handleCopyDetails = async () => {
    try {
      await navigator.clipboard.writeText(formatRouteErrorDetails(error, window.location.href))
      setCopyStatus('copied')
    } catch (cause) {
      logger.error('Failed to copy route error details', cause)
      setCopyStatus('failed')
    }

    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    copyResetTimer.current = setTimeout(() => setCopyStatus('idle'), 2000)
  }

  const handleChooseDifferentFolder = async () => {
    setIsSwitchingFolder(true)
    try {
      await ensureKnownWorkspaceForCurrent()
      const record = await getWorkspaceHandleRecord()
      if (record?.activeWorkspaceId) {
        await removeKnownWorkspace(record.activeWorkspaceId)
      }
      window.location.reload()
    } catch (cause) {
      logger.error('Failed to release the active workspace', cause)
      setIsSwitchingFolder(false)
    }
  }

  return (
    <div data-studio="true" className="min-h-dvh bg-background text-foreground">
      <header className="flex h-12 items-center bg-[#242724] px-[18px] text-[#f6f7f3]">
        <Link to="/projects" className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-semibold">BEAT VIDEO</span>
          <span className="text-[10px] font-semibold text-[#c7e85a]">MAKER</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 py-12 sm:px-8 sm:py-20">
        <div className="border-b border-border pb-7">
          <div className="mb-5 flex items-center gap-3 text-muted-foreground">
            {projectNotFound ? (
              <FileQuestion className="h-5 w-5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            )}
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">
              {projectNotFound ? 'Project unavailable' : 'Loading error'}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold leading-8">{title}</h1>
          <p className="mt-2 max-w-[560px] text-[11px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-3 border-b border-border py-6 sm:flex-row">
          <button
            type="button"
            className="studio-primary-action h-10 justify-center px-4"
            onClick={handleRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('app.errorBoundary.tryAgain')}
          </button>

          {projectNotFound ? (
            <Link
              to="/projects"
              className="studio-secondary-action flex h-10 items-center justify-center gap-2 px-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('app.routeError.backToProjects')}
            </Link>
          ) : (
            <button
              type="button"
              className="studio-secondary-action h-10 justify-center px-4"
              onClick={() => window.location.reload()}
            >
              {t('app.errorBoundary.reloadPage')}
            </button>
          )}

          {failureName ? (
            <button
              type="button"
              className="studio-secondary-action h-10 justify-center px-4"
              disabled={isSwitchingFolder}
              onClick={handleChooseDifferentFolder}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('projects.workspaceGate.chooseDifferentFolder')}
            </button>
          ) : null}
        </div>

        <details className="group py-5">
          <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground marker:hidden hover:text-foreground [&::-webkit-details-marker]:hidden">
            Error details
          </summary>
          <div className="mt-3 rounded-[3px] bg-secondary p-3">
            <p className="break-words font-mono text-[9px] leading-4 text-foreground">
              {shortDetail}
            </p>
            <p className="mt-3 text-[9px] leading-4 text-muted-foreground">
              {t('app.routeError.supportHint')}
            </p>
            <button
              type="button"
              className="studio-secondary-action mt-3 h-8 px-3"
              aria-live="polite"
              onClick={() => void handleCopyDetails()}
            >
              {copyStatus === 'copied' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copyStatus === 'copied'
                ? t('app.routeError.detailsCopied')
                : copyStatus === 'failed'
                  ? t('app.routeError.copyFailed')
                  : t('app.routeError.copyDetails')}
            </button>
          </div>
        </details>
      </main>
    </div>
  )
}
