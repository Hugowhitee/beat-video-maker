import { describe, expect, it, vi } from 'vite-plus/test'
import {
  getSupportedMediaFormatLabels,
  hasMediaFilePickerSupport,
  MEDIA_FILE_PICKER_TYPES,
  showMediaFilePicker,
} from './media-file-picker'

describe('media-file-picker', () => {
  it('detects file picker support from window.showOpenFilePicker', () => {
    const originalWindow = globalThis.window

    vi.stubGlobal('window', {} as Window & typeof globalThis)
    expect(hasMediaFilePickerSupport()).toBe(false)

    vi.stubGlobal('window', {
      showOpenFilePicker: vi.fn(),
    } as unknown as Window & typeof globalThis)
    expect(hasMediaFilePickerSupport()).toBe(true)

    vi.stubGlobal('window', originalWindow)
  })

  it('passes the shared media picker types to the browser file picker', async () => {
    const showOpenFilePicker = vi.fn().mockResolvedValue(['handle-1'])
    const originalWindow = globalThis.window

    vi.stubGlobal('window', {
      showOpenFilePicker,
    } as unknown as Window & typeof globalThis)

    const result = await showMediaFilePicker({ multiple: false })

    expect(result).toEqual(['handle-1'])
    expect(showOpenFilePicker).toHaveBeenCalledWith({
      multiple: false,
      types: MEDIA_FILE_PICKER_TYPES,
    })

    vi.stubGlobal('window', originalWindow)
  })


  it('falls back to a normal file input for copied media', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const file = new File(['audio'], 'beat.mp3', { type: 'audio/mpeg' })
    let changeListener: (() => void) | undefined

    const input = {
      type: '',
      multiple: false,
      accept: '',
      style: { display: '' },
      files: [file],
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'change') changeListener = listener
      }),
      click: vi.fn(() => changeListener?.()),
      remove: vi.fn(),
    }

    vi.stubGlobal('window', {} as Window & typeof globalThis)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => input),
      body: { appendChild: vi.fn() },
    } as unknown as Document)

    const handles = await showMediaFilePicker({
      multiple: false,
      allowFileInputFallback: true,
    })

    expect(handles).toHaveLength(1)
    expect(await handles[0]?.getFile()).toBe(file)
    expect(input.multiple).toBe(false)
    expect(input.accept).toContain('.mp3')
    expect(input.remove).toHaveBeenCalledOnce()

    vi.stubGlobal('window', originalWindow)
    vi.stubGlobal('document', originalDocument)
  })

  it('includes every accepted media extension in display order', () => {
    expect(getSupportedMediaFormatLabels()).toEqual([
      'MP4',
      'WebM',
      'MOV',
      'AVI',
      'MKV',
      'MP3',
      'WAV',
      'OGG',
      'M4A',
      'AAC',
      'JPG',
      'JPEG',
      'PNG',
      'GIF',
      'WebP',
      'SVG',
      'JSON',
      'LOTTIE',
    ])
  })
})
