/**
 * Subscribe to `window.location.pathname` changes from outside the router.
 *
 * The WorkspaceGate wraps RouterProvider (so route loaders never run before
 * the workspace root is set), which means it can't use `useRouterState` to
 * read the current location. Instead, we listen to popstate + patch
 * `pushState`/`replaceState` so TanStack Router (or any navigation) notifies
 * us whenever the URL changes.
 *
 * Module-level patching: the patch installs once per module import and
 * multicasts to every subscriber. Safe with React StrictMode's double-effect.
 */

import { useSyncExternalStore } from 'react'

type PathnameListener = () => void

const listeners = new Set<PathnameListener>()
const appBasePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
let patched = false

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function ensurePatched() {
  if (patched || typeof window === 'undefined') return
  patched = true

  const originalPush = window.history.pushState.bind(window.history)
  const originalReplace = window.history.replaceState.bind(window.history)

  window.history.pushState = function (...args) {
    originalPush(...args)
    notify()
  }
  window.history.replaceState = function (...args) {
    originalReplace(...args)
    notify()
  }
  window.addEventListener('popstate', notify)
}

function subscribe(listener: PathnameListener): () => void {
  ensurePatched()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function stripAppBasePath(pathname: string): string {
  if (!appBasePath) return pathname
  if (pathname === appBasePath || pathname === `${appBasePath}/`) return '/'
  return pathname.startsWith(`${appBasePath}/`) ? pathname.slice(appBasePath.length) : pathname
}

function getSnapshot(): string {
  return typeof window === 'undefined' ? '/' : stripAppBasePath(window.location.pathname)
}

function getServerSnapshot(): string {
  return '/'
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
