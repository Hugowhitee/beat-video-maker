import type { AttachedImage, MetadataTags } from 'mediabunny'

const NORMALIZED_MP3_RAW_KEYS = new Set([
  'TAG',
  'TIT2',
  'TIT3',
  'TPE1',
  'TPE2',
  'TALB',
  'TRCK',
  'TPOS',
  'TBPM',
  'TCON',
  'TDRC',
  'TYER',
  'TDAT',
  'TIME',
  'COMM',
  'USLT',
  'APIC',
  'PIC',
])

const INVALID_FILE_NAME_CHARACTERS = new Set([
  '<',
  '>',
  ':',
  '"',
  '/',
  '\\',
  '|',
  '?',
  '*',
])

export type Mp3MetadataBaseMode = 'preserve' | 'clean'
export type Mp3ArtworkMode = 'keep' | 'remove' | 'replace'

export interface Mp3MetadataDraft {
  title: string
  artist: string
  album: string
  genre: string
  date: string
  beatsPerMinute: string
  comment: string
}

export interface Mp3MetadataSnapshot {
  tags: MetadataTags
  rawTagCount: number
  artworkCount: number
}

export interface BuildMp3MetadataTagsOptions {
  baseMode: Mp3MetadataBaseMode
  artworkMode: Mp3ArtworkMode
  replacementArtwork?: AttachedImage
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function optionalDate(value: string): Date | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function keepUnknownRawTags(raw: MetadataTags['raw']): MetadataTags['raw'] {
  if (!raw) return undefined

  const kept = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !NORMALIZED_MP3_RAW_KEYS.has(key.toUpperCase())),
  )
  return Object.keys(kept).length > 0 ? kept : undefined
}

export function mp3BpmFromTags(tags: MetadataTags): number | null {
  const rawBpm = tags.raw?.TBPM
  if (typeof rawBpm !== 'string') return null
  const parsed = Number(rawBpm.replace(',', '.').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function mp3MetadataDraftFromTags(tags: MetadataTags): Mp3MetadataDraft {
  const bpm = mp3BpmFromTags(tags)
  return {
    title: tags.title ?? '',
    artist: tags.artist ?? '',
    album: tags.album ?? '',
    genre: tags.genre ?? '',
    date: tags.date ? tags.date.toISOString().slice(0, 10) : '',
    beatsPerMinute: bpm === null ? '' : String(bpm),
    comment: tags.comment ?? '',
  }
}

/**
 * Builds the descriptive metadata written to a new MP3 copy.
 *
 * Preserve mode keeps normalized fields the tool does not edit plus unknown raw
 * frames, while stripping raw duplicates for normalized ID3 fields. Clean mode
 * intentionally starts from no descriptive tags at all.
 *
 * Mediabunny 1.50.x predates its normalized beatsPerMinute field, so BPM is
 * read/written through the standard ID3 TBPM frame in raw metadata.
 */
export function buildMp3MetadataTags(
  sourceTags: MetadataTags,
  draft: Mp3MetadataDraft,
  options: BuildMp3MetadataTagsOptions,
): MetadataTags {
  const tags: MetadataTags =
    options.baseMode === 'preserve'
      ? {
          ...sourceTags,
          raw: keepUnknownRawTags(sourceTags.raw),
        }
      : {}

  tags.title = optionalText(draft.title)
  tags.artist = optionalText(draft.artist)
  tags.album = optionalText(draft.album)
  tags.genre = optionalText(draft.genre)
  tags.date = optionalDate(draft.date)
  tags.comment = optionalText(draft.comment)

  const bpm = optionalNumber(draft.beatsPerMinute)
  if (bpm !== undefined) {
    tags.raw = {
      ...(tags.raw ?? {}),
      TBPM: String(bpm),
    }
  }

  if (options.artworkMode === 'remove') {
    tags.images = undefined
  } else if (options.artworkMode === 'replace') {
    tags.images = options.replacementArtwork ? [options.replacementArtwork] : undefined
  } else if (options.baseMode === 'clean') {
    // "Keep artwork" remains useful for the Beat-ready preset even though the
    // rest of the descriptive metadata starts clean.
    tags.images = sourceTags.images
  }

  return tags
}

export async function readMp3Metadata(source: Blob): Promise<Mp3MetadataSnapshot> {
  const mediabunny = await import('mediabunny')
  const input = new mediabunny.Input({
    formats: [mediabunny.MP3],
    source: new mediabunny.BlobSource(source),
  })

  try {
    const tags = await input.getMetadataTags()
    return {
      tags,
      rawTagCount: Object.keys(tags.raw ?? {}).length,
      artworkCount: tags.images?.length ?? 0,
    }
  } finally {
    input.dispose()
  }
}

/**
 * Rewrites MP3 descriptive metadata by copying the encoded MP3 packets into a
 * fresh MP3 container. Audio is never decoded or re-encoded for this operation.
 */
export async function rewriteMp3Metadata(
  source: Blob,
  tags: MetadataTags,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const mediabunny = await import('mediabunny')
  const input = new mediabunny.Input({
    formats: [mediabunny.MP3],
    source: new mediabunny.BlobSource(source),
  })
  const target = new mediabunny.BufferTarget()
  const output = new mediabunny.Output({
    format: new mediabunny.Mp3OutputFormat(),
    target,
  })

  let outputStarted = false
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) throw new Error('This MP3 has no audio track')

    const codec = await track.getCodec()
    if (codec !== 'mp3') {
      throw new Error('This file is not an MP3 audio stream')
    }

    const packetSource = new mediabunny.EncodedAudioPacketSource(codec)
    output.addAudioTrack(packetSource)
    output.setMetadataTags(tags)

    const firstTimestamp = await track.getFirstTimestamp()
    const duration = await input.computeDuration()
    const packetSink = new mediabunny.EncodedPacketSink(track)
    const decoderConfig = await track.getDecoderConfig()
    const packetMetadata = {
      decoderConfig: decoderConfig ?? undefined,
    }

    await output.start()
    outputStarted = true

    for await (const packet of packetSink.packets()) {
      const timestamp = Math.max(0, packet.timestamp - firstTimestamp)
      const copiedPacket =
        timestamp === packet.timestamp
          ? packet
          : packet.clone({ timestamp })

      await packetSource.add(copiedPacket, packetMetadata)

      if (onProgress && duration > 0) {
        onProgress(
          Math.min(1, (packet.timestamp + packet.duration - firstTimestamp) / duration),
        )
      }
    }

    packetSource.close()
    await output.finalize()
    onProgress?.(1)

    if (!target.buffer) throw new Error('No MP3 output was generated')
    return new Blob([target.buffer], { type: 'audio/mpeg' })
  } catch (error) {
    if (outputStarted && output.state !== 'finalized') {
      await output.cancel().catch(() => undefined)
    }
    throw error
  } finally {
    input.dispose()
  }
}

export function metadataCopyFileName(
  sourceFileName: string,
  kind: 'clean' | 'tagged' = 'tagged',
): string {
  const base = sourceFileName.replace(/\.mp3$/i, '').trim() || 'beat'
  const safe = Array.from(base, (character) =>
    character.charCodeAt(0) < 32 || INVALID_FILE_NAME_CHARACTERS.has(character)
      ? '_'
      : character,
  ).join('')
  return `${safe}-${kind}.mp3`
}
