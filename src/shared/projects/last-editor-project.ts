const LAST_EDITOR_PROJECT_ID_KEY = 'freecut-last-editor-project-id'
const appBasePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripAppBasePath(pathname: string): string {
  if (!appBasePath) return pathname
  if (pathname === appBasePath || pathname === `${appBasePath}/`) return '/'
  return pathname.startsWith(`${appBasePath}/`) ? pathname.slice(appBasePath.length) : pathname
}

export function getEditorProjectIdFromPathname(pathname: string): string | undefined {
  const projectId = stripAppBasePath(pathname).match(/^\/editor\/([^/]+)/)?.[1]
  return projectId ? safeDecodeURIComponent(projectId) : undefined
}

export function rememberLastEditorProjectId(projectId: string): void {
  try {
    window.localStorage.setItem(LAST_EDITOR_PROJECT_ID_KEY, projectId)
  } catch {
    // Ignore restricted-storage failures so bootstrap/reload flows do not crash.
  }
}

function getLastEditorProjectId(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_EDITOR_PROJECT_ID_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function getEditorProjectReloadPathWithCacheBust(): string {
  const nextUrl = new URL(window.location.href)
  const currentProjectId = getEditorProjectIdFromPathname(nextUrl.pathname)
  const projectId = currentProjectId ?? getLastEditorProjectId()

  const appRootPath = appBasePath || '/'
  const isAtAppRoot =
    nextUrl.pathname === appRootPath || nextUrl.pathname === `${appRootPath.replace(/\/$/, '')}/`

  if (projectId && !currentProjectId && isAtAppRoot) {
    nextUrl.pathname = `${appBasePath}/editor/${encodeURIComponent(projectId)}`
  }

  nextUrl.searchParams.set('__freecut_updated', Date.now().toString())
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}
