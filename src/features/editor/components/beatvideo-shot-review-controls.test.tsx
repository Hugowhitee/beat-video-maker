import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import { BeatvideoShotReviewControls } from './beatvideo-shot-review-controls'

function renderReview({ dirty = true, sourceOpen = true } = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(
    <BeatvideoShotReviewControls
      name="footage.mp4"
      id="media:shot:2"
      busy={false}
      dirty={dirty}
      sourceOpen={sourceOpen}
      onSave={onSave}
      onCancel={onCancel}
      onSplit={vi.fn()}
      onMergeLeft={vi.fn()}
      onResetTrim={vi.fn()}
      onResetAll={vi.fn()}
    />,
  )
  return { onSave, onCancel }
}

describe('shot review controls', () => {
  it('shows a draft and exposes distinct Save and Cancel actions', () => {
    const { onSave, onCancel } = renderReview()
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved range')
    fireEvent.click(screen.getByRole('button', { name: 'Save In/Out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }))
    expect(onSave).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does not submit a stale shot or an unchanged range', () => {
    renderReview({ dirty: false, sourceOpen: false })
    expect(screen.getByRole('button', { name: 'Save In/Out' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel changes' })).toBeDisabled()
  })
})
