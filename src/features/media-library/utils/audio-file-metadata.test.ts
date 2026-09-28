import { describe, expect, it } from 'vite-plus/test'
import type { MetadataTags } from 'mediabunny'
import {
  buildMp3MetadataTags,
  metadataCopyFileName,
  mp3MetadataDraftFromTags,
} from './audio-file-metadata'

const cover = {
  data: new Uint8Array([1, 2, 3]),
  mimeType: 'image/png',
  kind: 'coverFront' as const,
}

describe('MP3 metadata helpers', () => {
  it('creates a clean Beat-ready tag set without carrying unrelated raw tags', () => {
    const source: MetadataTags = {
      title: 'Old title',
      artist: 'Old artist',
      lyrics: 'old lyrics',
      images: [cover],
      raw: {
        TIT2: 'Old title',
        TXXX: { generator: 'example' },
      },
    }

    const result = buildMp3MetadataTags(
      source,
      {
        title: 'New beat',
        artist: 'Producer',
        album: '',
        genre: '',
        date: '2026-09-28',
        beatsPerMinute: '92',
        comment: '',
      },
      {
        baseMode: 'clean',
        artworkMode: 'keep',
      },
    )

    expect(result.title).toBe('New beat')
    expect(result.artist).toBe('Producer')
    expect(result.beatsPerMinute).toBe(92)
    expect(result.date?.toISOString().slice(0, 10)).toBe('2026-09-28')
    expect(result.images).toEqual([cover])
    expect(result.raw).toBeUndefined()
    expect(result.lyrics).toBeUndefined()
  })

  it('preserves unknown raw fields while avoiding duplicate normalized ID3 fields', () => {
    const source: MetadataTags = {
      title: 'Old title',
      artist: 'Old artist',
      description: 'Keep this',
      raw: {
        TIT2: 'Old title',
        TPE1: 'Old artist',
        TXXX: { catalog: 'private-note' },
      },
    }

    const draft = mp3MetadataDraftFromTags(source)
    draft.title = 'Edited title'

    const result = buildMp3MetadataTags(source, draft, {
      baseMode: 'preserve',
      artworkMode: 'keep',
    })

    expect(result.title).toBe('Edited title')
    expect(result.description).toBe('Keep this')
    expect(result.raw).toEqual({
      TXXX: { catalog: 'private-note' },
    })
  })

  it('removes artwork when requested', () => {
    const source: MetadataTags = { images: [cover] }
    const result = buildMp3MetadataTags(
      source,
      mp3MetadataDraftFromTags(source),
      {
        baseMode: 'preserve',
        artworkMode: 'remove',
      },
    )

    expect(result.images).toBeUndefined()
  })

  it('creates a safe non-destructive output filename', () => {
    expect(metadataCopyFileName('my:beat?.MP3', 'clean')).toBe('my_beat_-clean.mp3')
  })
})
