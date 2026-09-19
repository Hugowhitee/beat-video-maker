import { BufferTarget, StreamTarget } from 'mediabunny';

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

export type ExportTargetHandle = {
  target: BufferTarget | StreamTarget;
  kind: 'memory' | 'opfs';
  complete: () => Promise<Blob>;
  discard: () => Promise<void>;
};

const SCRATCH_DIRECTORY = 'beatvideo-export-output';
const CHUNK_SIZE = 4 * 1024 * 1024;

async function createOpfsTarget(extension: string, mimeType: string): Promise<ExportTargetHandle | null> {
  const storage = navigator.storage as StorageManagerWithDirectory;
  if (!storage.getDirectory) return null;

  const root = await storage.getDirectory();
  const directory = await root.getDirectoryHandle(SCRATCH_DIRECTORY, { create: true });
  const fileName = 'current-export.' + extension;

  try {
    await directory.removeEntry(fileName);
  } catch {
    // No stale export to remove.
  }

  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const target = new StreamTarget(writable, {
    chunked: true,
    chunkSize: CHUNK_SIZE,
  });

  return {
    target,
    kind: 'opfs',
    complete: async () => {
      const file = await fileHandle.getFile();
      if (file.size < 32) throw new Error('The encoder returned an empty output file.');
      return new Blob([file], { type: mimeType });
    },
    discard: async () => {
      try {
        await directory.removeEntry(fileName);
      } catch {
        // Already removed or the storage context was cleared.
      }
    },
  };
}

export async function createExportTarget(
  extension: string,
  mimeType: string,
): Promise<ExportTargetHandle> {
  try {
    const opfs = await createOpfsTarget(extension, mimeType);
    if (opfs) return opfs;
  } catch {
    // OPFS is an optimization. Keep export working if storage is unavailable.
  }

  const target = new BufferTarget();
  return {
    target,
    kind: 'memory',
    complete: async () => {
      if (!target.buffer || target.buffer.byteLength < 32) {
        throw new Error('The encoder returned an empty output file.');
      }
      return new Blob([target.buffer], { type: mimeType });
    },
    discard: async () => {},
  };
}
