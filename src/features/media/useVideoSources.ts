import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeVideoSource } from '../auto-edit/analyzeVideoSource';
import type { VideoAnalysisProgress } from '../auto-edit/analyzeVideoSource';
import { createTransNetRuntime } from '../auto-edit/transnetRuntime';
import type { TransNetRuntimeProgress } from '../auto-edit/transnetRuntime';
import type { ClipSource } from '../auto-edit/types';
import { openVideoSource } from './videoSource';
import type { VideoSourceMetadata } from './videoSource';

export type VideoSourceRole = 'footage' | 'intro' | 'outro';
export type VideoSourceState =
  | 'queued'
  | 'opening'
  | 'preparing'
  | 'analyzing'
  | 'ready'
  | 'cancelled'
  | 'error';

export type VideoSourceItem = {
  id: string;
  file: File;
  role: VideoSourceRole;
  state: VideoSourceState;
  progress: number;
  detail: string;
  metadata: VideoSourceMetadata | null;
  clipSource: ClipSource | null;
  error: string | null;
};

export type VideoDetectorState = {
  state: 'idle' | 'loading' | 'ready' | 'error';
  detail: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Video analysis failed.';
}

function cancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useVideoSources() {
  const [items, setItems] = useState<VideoSourceItem[]>([]);
  const [detector, setDetector] = useState<VideoDetectorState>({
    state: 'idle',
    detail: '',
  });
  const counterRef = useRef(0);
  const runtimeRef = useRef<Promise<Awaited<ReturnType<typeof createTransNetRuntime>>> | null>(null);
  const queueRef = useRef(Promise.resolve());
  const controllersRef = useRef(new Map<string, AbortController>());
  const removedRef = useRef(new Set<string>());

  const patch = useCallback((
    id: string,
    updater: (item: VideoSourceItem) => VideoSourceItem,
  ) => {
    setItems((current) => current.map((item) => item.id === id ? updater(item) : item));
  }, []);

  const getRuntime = useCallback(() => {
    if (!runtimeRef.current) {
      setDetector({ state: 'loading', detail: 'Preparing shot detector…' });
      runtimeRef.current = createTransNetRuntime({
        onProgress: (progress: TransNetRuntimeProgress) => {
          setDetector({
            state: 'loading',
            detail: progress.detail,
          });
        },
      })
        .then((runtime) => {
          setDetector({
            state: 'ready',
            detail: 'Shot detector ready',
          });
          return runtime;
        })
        .catch((error) => {
          runtimeRef.current = null;
          setDetector({
            state: 'error',
            detail: errorMessage(error),
          });
          throw error;
        });
    }
    return runtimeRef.current;
  }, []);

  const analyze = useCallback(async (
    id: string,
    file: File,
    controller: AbortController,
  ) => {
    if (removedRef.current.has(id)) return;

    patch(id, (item) => ({
      ...item,
      state: 'opening',
      progress: 0,
      detail: 'Reading local video…',
      error: null,
    }));

    let session: Awaited<ReturnType<typeof openVideoSource>> | null = null;
    try {
      session = await openVideoSource(file, id);
      if (removedRef.current.has(id) || controller.signal.aborted) return;

      patch(id, (item) => ({
        ...item,
        metadata: session!.metadata,
        state: 'preparing',
        detail: 'Preparing shot detector…',
      }));

      const runtime = await getRuntime();
      if (removedRef.current.has(id) || controller.signal.aborted) return;

      patch(id, (item) => ({
        ...item,
        state: 'analyzing',
        detail: 'Detecting cuts and transitions…',
      }));

      const clipSource = await analyzeVideoSource(session, runtime, {
        signal: controller.signal,
        onProgress: (progress: VideoAnalysisProgress) => {
          const fraction = progress.duration > 0
            ? Math.max(0, Math.min(1, progress.currentTime / progress.duration))
            : 0;
          patch(id, (item) => ({
            ...item,
            state: 'analyzing',
            progress: fraction,
            detail: progress.phase === 'decode'
              ? 'Reading frames…'
              : 'Detecting shot boundaries…',
          }));
        },
      });

      if (removedRef.current.has(id) || controller.signal.aborted) return;
      patch(id, (item) => ({
        ...item,
        state: 'ready',
        progress: 1,
        detail: clipSource.shots.length === 1
          ? '1 shot detected'
          : clipSource.shots.length + ' shots detected',
        clipSource: { ...clipSource, role: item.role },
        error: null,
      }));
    } catch (error) {
      if (removedRef.current.has(id)) return;
      if (cancelled(error) || controller.signal.aborted) {
        patch(id, (item) => ({
          ...item,
          state: 'cancelled',
          detail: 'Analysis cancelled',
          error: null,
        }));
      } else {
        patch(id, (item) => ({
          ...item,
          state: 'error',
          detail: 'Could not analyze video',
          error: errorMessage(error),
        }));
      }
    } finally {
      session?.dispose();
      controllersRef.current.delete(id);
    }
  }, [getRuntime, patch]);

  const enqueue = useCallback((id: string, file: File) => {
    const controller = new AbortController();
    controllersRef.current.set(id, controller);
    queueRef.current = queueRef.current
      .then(() => analyze(id, file, controller))
      .catch(() => undefined);
  }, [analyze]);

  const addFiles = useCallback((files: File[]) => {
    const next = files.map<VideoSourceItem>((file) => {
      counterRef.current += 1;
      const id = 'video-' + Date.now().toString(36) + '-' + counterRef.current;
      removedRef.current.delete(id);
      return {
        id,
        file,
        role: 'footage',
        state: 'queued',
        progress: 0,
        detail: 'Queued for local analysis',
        metadata: null,
        clipSource: null,
        error: null,
      };
    });

    if (next.length === 0) return;
    setItems((current) => [...current, ...next]);
    for (const item of next) enqueue(item.id, item.file);
  }, [enqueue]);

  const cancel = useCallback((id: string) => {
    controllersRef.current.get(id)?.abort();
    patch(id, (item) => ({
      ...item,
      state: item.state === 'ready' || item.state === 'error'
        ? item.state
        : 'cancelled',
      detail: item.state === 'ready' || item.state === 'error'
        ? item.detail
        : 'Analysis cancelled',
    }));
  }, [patch]);

  const retry = useCallback((id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    controllersRef.current.get(id)?.abort();
    removedRef.current.delete(id);
    patch(id, (current) => ({
      ...current,
      state: 'queued',
      progress: 0,
      detail: 'Queued for local analysis',
      error: null,
      clipSource: null,
    }));
    enqueue(id, item.file);
  }, [enqueue, items, patch]);

  const remove = useCallback((id: string) => {
    removedRef.current.add(id);
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const setRole = useCallback((id: string, role: VideoSourceRole) => {
    patch(id, (item) => ({
      ...item,
      role,
      clipSource: item.clipSource ? { ...item.clipSource, role } : null,
    }));
  }, [patch]);

  useEffect(() => () => {
    for (const controller of controllersRef.current.values()) controller.abort();
    void runtimeRef.current?.then((runtime) => runtime.dispose()).catch(() => undefined);
  }, []);

  return {
    items,
    detector,
    addFiles,
    cancel,
    retry,
    remove,
    setRole,
  };
}
