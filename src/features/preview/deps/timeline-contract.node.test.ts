// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'

describe('preview timeline contract import boundary', () => {
  it('does not require window or a filmstrip decoder worker in Node', async () => {
    const contract = await import('./timeline-contract')
    expect(contract.useTimelineStore).toBeDefined()
    expect(contract.useTimelineViewportStore).toBeDefined()
  }, 15_000)
})
