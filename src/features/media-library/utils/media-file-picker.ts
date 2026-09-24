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
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

function createTransientFileHandle(file: File): FileSystemFileHandle {
  const handle = {
    kind: 'file' as const,
    name: file.name,
    getFile: async () => file,
    queryPermission: async () => 'granted' as PermissionState,
    requestPermission: async () => 'granted' as PermissionState,
    isSameEntry: async (other: FileSystemHandle) => other === handle,
    createWritable: async () => {
      throw new DOMException('Transient file input handles are read-only.', 'NotSupportedError')
    },
  }

  return handle as unknown as FileSystemFileHandle
}

function getMediaInputAccept(): string {
  return Object.values(MEDIA_FILE_PICKER_TYPES[0]?.accept ?? {})
    .flat()
    .join(',')
}

async function showMediaFileInput(options?: { multiple?: boolean }): Promise<FileSystemFileHandle[]> {
  if (typeof document === 'undefined') {
    throw new Error('File input is unavailable in this environment.')
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = options?.multiple ?? true
  input.accept = getMediaInputAccept()
  input.style.display = 'none'
  document.body.appendChild(input)

  return new Promise((resolve) => {
    let settled = false

    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files.map(createTransientFileHandle))
    }

    input.addEventListener(
      'change',
      () => {
        finish(Array.from(input.files ?? []))
      },
      { once: true },
    )
    input.addEventListener('cancel', () => finish([]), { once: true })
    input.click()
  })
}

export async function showMediaFilePicker(options?: {
  multiple?: boolean
  allowFileInputFallback?: boolean
}): Promise<FileSystemFileHandle[]> {
  if (hasMediaFilePickerSupport()) {
    return window.showOpenFilePicker({
      multiple: options?.multiple ?? true,
      types: MEDIA_FILE_PICKER_TYPES,
    })
  }

  if (options?.allowFileInputFallback) {
    return showMediaFileInput({ multiple: options.multiple })
  }

  throw new DOMException('File System Access picker is unavailable.', 'NotSupportedError')
}
