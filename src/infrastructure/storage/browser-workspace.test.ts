import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  getBrowserWorkspaceHandle,
  isBrowserWorkspaceSupported,
} from './browser-workspace'

describe('browser workspace fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects OPFS support without requiring a directory picker', () => {
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn(),
      },
    })

    expect(isBrowserWorkspaceSupported()).toBe(true)
  })

  it('creates a stable Beatvideo Maker workspace directory in OPFS', async () => {
    const workspaceHandle = { name: 'beatvideo-maker-workspace' }
    const getDirectoryHandle = vi.fn().mockResolvedValue(workspaceHandle)
    const getDirectory = vi.fn().mockResolvedValue({ getDirectoryHandle })
    const persist = vi.fn().mockResolvedValue(true)

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory,
        persist,
      },
    })

    await expect(getBrowserWorkspaceHandle()).resolves.toBe(workspaceHandle)
    expect(persist).toHaveBeenCalledOnce()
    expect(getDirectory).toHaveBeenCalledOnce()
    expect(getDirectoryHandle).toHaveBeenCalledWith('beatvideo-maker-workspace', {
      create: true,
    })
  })

  it('keeps working when persistence is refused', async () => {
    const workspaceHandle = { name: 'beatvideo-maker-workspace' }
    const getDirectoryHandle = vi.fn().mockResolvedValue(workspaceHandle)

    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({ getDirectoryHandle }),
        persist: vi.fn().mockRejectedValue(new Error('denied')),
      },
    })

    await expect(getBrowserWorkspaceHandle()).resolves.toBe(workspaceHandle)
  })

  it('reports unsupported when OPFS is missing', () => {
    vi.stubGlobal('navigator', { storage: {} })

    expect(isBrowserWorkspaceSupported()).toBe(false)
  })
})
