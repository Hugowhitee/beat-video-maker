export type ClassifiedMedia = {
  image: File | null;
  audio: File | null;
  videos: File[];
  unsupported: File[];
};

function extension(file: File) {
  const dot = file.name.lastIndexOf('.');
  return dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
}

export function classifyMediaFiles(files: readonly File[]): ClassifiedMedia {
  let image: File | null = null;
  let audio: File | null = null;
  const videos: File[] = [];
  const unsupported: File[] = [];

  for (const file of files) {
    const ext = extension(file);
    const isImage = file.type.startsWith('image/')
      || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    const isAudio = file.type.startsWith('audio/')
      || ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg'].includes(ext);
    const isVideo = file.type.startsWith('video/')
      || ['mp4', 'webm', 'mov', 'mkv', 'm4v'].includes(ext);

    if (isImage && !image) {
      image = file;
    } else if (isAudio && !audio) {
      audio = file;
    } else if (isVideo) {
      videos.push(file);
    } else {
      unsupported.push(file);
    }
  }

  return { image, audio, videos, unsupported };
}
