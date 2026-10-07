import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { createLogger } from '@/shared/logging/logger'
import { i18n } from '@/i18n'

const logger = createLogger('ErrorBoundary')

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  level?: 'app' | 'feature' | 'component'
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console in development
    if (import.meta.env.DEV) {
      logger.error('ErrorBoundary caught:', error, errorInfo)
    }

    this.props.onError?.(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { level = 'component' } = this.props

      return (
        <div data-studio-v2="true" className="min-h-[240px] bg-background p-6 text-foreground">
          <div className="mx-auto max-w-[560px] border-y border-border py-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">Recovery</span>
            </div>
            <h2 className="mt-4 text-[20px] font-semibold">
              {level === 'app' && i18n.t('app.errorBoundary.appError')}
              {level === 'feature' && i18n.t('app.errorBoundary.featureError')}
              {level === 'component' && i18n.t('app.errorBoundary.componentError')}
            </h2>
            <p className="mt-2 break-words text-[10px] leading-4 text-muted-foreground">
              {this.state.error?.message || i18n.t('app.errorBoundary.unexpectedError')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="studio-primary-action h-9 px-3"
                onClick={this.handleReset}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {i18n.t('app.errorBoundary.tryAgain')}
              </button>
              {level === 'app' && (
                <button
                  type="button"
                  className="studio-secondary-action h-9 px-3"
                  onClick={() => window.location.reload()}
                >
                  {i18n.t('app.errorBoundary.reloadPage')}
                </button>
              )}
            </div>
            {import.meta.env.DEV && this.state.error?.stack && (
              <pre className="mt-4 max-h-48 max-w-full overflow-auto rounded-[3px] bg-secondary p-3 text-left font-mono text-[9px]">
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
