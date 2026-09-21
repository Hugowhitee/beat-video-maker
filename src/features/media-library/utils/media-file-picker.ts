export type MediaPickerKind = 'video' | 'audio' | 'image' | 'lottie'

export const MEDIA_FILE_PICKER_TYPES = [
  {
    description: 'Media files',
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
      'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      'application/lottie+json': ['.json', '.lottie'],
    },
  },
] satisfies FilePickerAcceptType[]

const FORMAT_LABEL_OVERRIDES: Record<string, string> = {
  webm: 'WebM',
  webp: 'WebP',
}

export function getSupportedMediaFormatLabels(): string[] {
  const extensions = Object.values(MEDIA_FILE_PICKER_TYPES[0]?.accept ?? {}).flat()
  return extensions.map((extension) => {
    const normalized = extension.replace(/^\./, '')
    return FORMAT_LABEL_OVERRIDES[normalized] ?? normalized.toUpperCase()
  })
}

export function hasMediaFilePickerSupport(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

function getPickerTypes(allowedKinds?: readonly MediaPickerKind[]): FilePickerAcceptType[] {
  if (!allowedKinds || allowedKinds.length === 0) return MEDIA_FILE_PICKER_TYPES

  const allow = new Set(allowedKinds)
  const accept: Record<string, string[]> = {}
  if (allow.has('video')) accept['video/*'] = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  if (allow.has('audio')) accept['audio/*'] = ['.mp3', '.wav', '.ogg', '.m4a', '.aac']
  if (allow.has('image')) accept['image/*'] = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
  if (allow.has('lottie')) accept['application/lottie+json'] = ['.json', '.lottie']

  return [{ description: 'Media files', accept }]
}

export async function showMediaFilePicker(options?: {
  multiple?: boolean
  allowedKinds?: readonly MediaPickerKind[]
}): Promise<FileSystemFileHandle[]> {
  return window.showOpenFilePicker({
    multiple: options?.multiple ?? true,
    types: getPickerTypes(options?.allowedKinds),
  })
}
