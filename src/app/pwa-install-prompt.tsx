import { useCallback, useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const INSTALL_DISMISSED_UNTIL_KEY = 'beat-video-maker-pwa-install-dismissed-until'
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandaloneDisplayMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isDismissed() {
  const dismissedUntil = Number(window.localStorage.getItem(INSTALL_DISMISSED_UNTIL_KEY) ?? 0)
  return Number.isFinite(dismissedUntil) && dismissedUntil > Date.now()
}

export function PwaInstallPrompt() {
  const { t } = useTranslation()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplayMode()) {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()

      if (isDismissed()) {
        return
      }

      setInstallPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    const handleAppInstalled = () => {
      window.localStorage.removeItem(INSTALL_DISMISSED_UNTIL_KEY)
      setVisible(false)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    window.localStorage.setItem(
      INSTALL_DISMISSED_UNTIL_KEY,
      String(Date.now() + INSTALL_DISMISS_MS),
    )
    setVisible(false)
  }, [])

  const install = useCallback(async () => {
    if (!installPrompt) {
      return
    }

    setVisible(false)
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice

    if (choice.outcome === 'dismissed') {
      dismiss()
    } else {
      window.localStorage.removeItem(INSTALL_DISMISSED_UNTIL_KEY)
    }

    setInstallPrompt(null)
  }, [dismiss, installPrompt])

  if (!visible || !installPrompt) {
    return null
  }

  return (
    <aside
      data-studio="true"
      aria-label={t('appShell.installPrompt.label')}
      className="fixed bottom-4 left-4 z-50 w-[min(calc(100vw-2rem),340px)] rounded-[3px] border border-border bg-panel-bg p-3 text-foreground shadow-[0_8px_28px_rgba(23,25,23,0.16)]"
    >
      <div className="flex items-start gap-2.5">
        <Download className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold leading-4">
            {t('appShell.installPrompt.title')}
          </div>
          <div className="mt-1 text-[9px] leading-4 text-muted-foreground">
            {t('appShell.installPrompt.description')}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="studio-primary-action h-8 px-3" onClick={install}>
              <Download className="h-3.5 w-3.5" />
              {t('appShell.installPrompt.install')}
            </button>
            <button type="button" className="studio-secondary-action h-8 px-3" onClick={dismiss}>
              {t('appShell.installPrompt.notNow')}
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('appShell.installPrompt.dismiss')}
          className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          onClick={dismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}
