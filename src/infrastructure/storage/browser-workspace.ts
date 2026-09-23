/**
 * Browser-private workspace fallback.
 *
 * Brave intentionally blocks the user-facing File System Access pickers, even
 * though it exposes Origin Private File System (OPFS). The editor can use an
 * OPFS directory as the same FileSystemDirectoryHandle-shaped workspace root,
 * so browsers without showDirectoryPicker do not need to be blocked.
 */

const BROWSER_WORKSPACE_DIRECTORY = 'beatvideo-maker-workspace'

export function isBrowserWorkspaceSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  )
}

export async function getBrowserWorkspaceHandle(): Promise<FileSystemDirectoryHandle> {
  if (!isBrowserWorkspaceSupported()) {
    throw new Error('Browser-private workspace storage is unavailable.')
  }

  // Ask the browser to make local project storage durable when it supports
  // persistence. A denial is not fatal: OPFS remains usable for this session
  // and future visits under the browser's normal storage policy.
  try {
    await navigator.storage.persist?.()
  } catch {
    // Persistence is best-effort and must never block the editor.
  }

  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(BROWSER_WORKSPACE_DIRECTORY, { create: true })
}
