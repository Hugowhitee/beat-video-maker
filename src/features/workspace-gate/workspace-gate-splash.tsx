import { Trans, useTranslation } from 'react-i18next'
import { FolderOpen, FolderX, Loader2, RefreshCw, AlertTriangle, BookOpen } from 'lucide-react'

type Status =
  | { kind: 'initializing' }
  | { kind: 'unavailable' }
  | { kind: 'pick' }
  | { kind: 'reconnect'; handleName: string }

interface Props {
  status: Status
  error?: string | null
  onPickFolder: () => void
  onReconnect: () => void
}

export function WorkspaceGateSplash({ status, error, onPickFolder, onReconnect }: Props) {
  const { t } = useTranslation()

  return (
    <div data-studio-v2="true" className="min-h-dvh bg-background text-foreground">
      <header className="flex h-12 items-center bg-[#242724] px-[18px] text-[#f6f7f3]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-semibold">BEAT VIDEO</span>
          <span className="text-[10px] font-semibold text-[#c7e85a]">MAKER</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 py-12 sm:px-8 sm:py-20">
        <div className="border-b border-border pb-7">
          <div className="mb-5 flex items-center gap-2 text-muted-foreground">
            {status.kind === 'unavailable' ? (
              <FolderX className="h-4 w-4" aria-hidden="true" />
            ) : status.kind === 'initializing' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">Workspace</span>
          </div>

          {status.kind === 'initializing' ? (
            <>
              <h1 className="text-[26px] font-semibold leading-8">{t('common.loading')}</h1>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Preparing local project storage…
              </p>
            </>
          ) : status.kind === 'unavailable' ? (
            <>
              <h1 className="text-[26px] font-semibold leading-8">
                {t('projects.workspaceGate.unsupportedBrowser')}
              </h1>
              <p className="mt-2 max-w-[560px] text-[11px] leading-5 text-muted-foreground">
                {t('projects.workspaceGate.unsupportedBrowserDescription')}
              </p>
            </>
          ) : status.kind === 'pick' ? (
            <>
              <h1 className="text-[26px] font-semibold leading-8">
                {t('projects.workspaceGate.pickTitle')}
              </h1>
              <p className="mt-2 max-w-[560px] text-[11px] leading-5 text-muted-foreground">
                {t('projects.workspaceGate.pickDescription')}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[26px] font-semibold leading-8">
                {t('projects.workspaceGate.reconnectTitle')}
              </h1>
              <p className="mt-2 max-w-[560px] text-[11px] leading-5 text-muted-foreground">
                <Trans
                  i18nKey="projects.workspaceGate.reconnectDescription"
                  values={{ name: status.handleName }}
                  components={{ code: <span className="font-mono" /> }}
                />
              </p>
            </>
          )}
        </div>

        {error ? (
          <div className="mt-5 flex gap-2 border-l-2 border-destructive bg-panel-bg px-3 py-3 text-[10px] leading-4 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {status.kind !== 'initializing' ? (
          <div className="flex flex-col gap-2 border-b border-border py-6 sm:flex-row">
            {status.kind === 'pick' ? (
              <button
                type="button"
                className="studio-primary-action h-10 px-4"
                onClick={onPickFolder}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t('projects.workspaceGate.chooseFolder')}
              </button>
            ) : null}

            {status.kind === 'reconnect' ? (
              <>
                <button
                  type="button"
                  className="studio-primary-action h-10 px-4"
                  onClick={onReconnect}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('projects.workspaceGate.reconnect')}
                </button>
                <button
                  type="button"
                  className="studio-secondary-action h-10 px-4"
                  onClick={onPickFolder}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t('projects.workspaceGate.chooseDifferentFolder')}
                </button>
              </>
            ) : null}

            <a
              href={`${import.meta.env.BASE_URL}docs/workspaces`}
              className="studio-secondary-action flex h-10 items-center justify-center gap-2 px-4"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t('projects.workspaceGate.workspaceGuide')}
            </a>
          </div>
        ) : null}

        {status.kind === 'pick' ? (
          <p className="pt-5 text-[9px] leading-4 text-muted-foreground">
            {t('projects.workspaceGate.pickTip')}
          </p>
        ) : null}
      </main>
    </div>
  )
}
