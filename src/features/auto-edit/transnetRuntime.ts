import {
  TRANSNET_V2_CONTEXT_FRAMES,
  TRANSNET_V2_FRAME_HEIGHT,
  TRANSNET_V2_FRAME_WIDTH,
  TRANSNET_V2_OUTPUT_FRAMES,
  TRANSNET_V2_WINDOW_FRAMES,
} from './shotBoundary';
import type { DetectorWindow } from './transnetWindowing';

const ORT_VERSION = '1.30.0';
const ORT_DIST_URL =
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ORT_MODULE_URL = ORT_DIST_URL + 'ort.wasm.min.mjs';

export const TRANSNET_V2_MODEL_REVISION = '231666d';
export const TRANSNET_V2_MODEL_SHA256 =
  'c4d54a682bace32f25136ef83ca2c9d403e8f8193775efeb995172a0d95a8e0c';
export const TRANSNET_V2_MODEL_URL =
  `https://huggingface.co/elya5/transnetv2/resolve/${TRANSNET_V2_MODEL_REVISION}/transnetv2.onnx`;

const MODEL_CACHE = 'beatvideo-models-v1';

type OrtTensor = {
  data: ArrayLike<number>;
};

type OrtTensorMetadata = {
  isTensor?: boolean;
  name?: string;
  shape?: readonly (string | number)[];
  type?: string;
};

type OrtSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  inputMetadata?: readonly OrtTensorMetadata[];
  outputMetadata?: readonly OrtTensorMetadata[];
  run: (
    feeds: Record<string, unknown>,
    fetches?: readonly string[],
  ) => Promise<Record<string, OrtTensor>>;
  release?: () => Promise<void>;
};

type OrtModule = {
  env: {
    wasm: {
      wasmPaths?: string | Record<string, string>;
      numThreads?: number;
      proxy?: boolean;
    };
  };
  Tensor: new (
    type: 'float32' | 'uint8',
    data: Float32Array | Uint8Array,
    dimensions: readonly number[],
  ) => unknown;
  InferenceSession: {
    create: (
      model: Uint8Array,
      options?: Record<string, unknown>,
    ) => Promise<OrtSession>;
  };
};

export type TransNetRuntimeProgress =
  | { phase: 'runtime'; detail: string }
  | { phase: 'model'; detail: string };

export type TransNetRuntime = {
  runWindow: (window: DetectorWindow) => Promise<Float32Array>;
  dispose: () => Promise<void>;
};

function abortError() {
  return new DOMException('Video analysis was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function cachedModel(signal?: AbortSignal) {
  throwIfAborted(signal);

  if (typeof caches !== 'undefined') {
    const cache = await caches.open(MODEL_CACHE);
    const cached = await cache.match(TRANSNET_V2_MODEL_URL);
    if (cached?.headers.get('x-beatvideo-sha256') === TRANSNET_V2_MODEL_SHA256) {
      return new Uint8Array(await cached.arrayBuffer());
    }
  }

  const response = await fetch(TRANSNET_V2_MODEL_URL, {
    signal,
    cache: 'force-cache',
    mode: 'cors',
  });
  if (!response.ok) {
    throw new Error(`Could not download TransNetV2 model (HTTP ${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  throwIfAborted(signal);
  const actualHash = await sha256Hex(buffer);
  if (actualHash !== TRANSNET_V2_MODEL_SHA256) {
    throw new Error('TransNetV2 model integrity check failed.');
  }

  if (typeof caches !== 'undefined') {
    const cache = await caches.open(MODEL_CACHE);
    const headers = new Headers({
      'content-type': 'application/octet-stream',
      'x-beatvideo-sha256': TRANSNET_V2_MODEL_SHA256,
    });
    await cache.put(
      TRANSNET_V2_MODEL_URL,
      new Response(buffer.slice(0), { headers }),
    );
  }

  return new Uint8Array(buffer);
}

async function loadOrtModule(): Promise<OrtModule> {
  const moduleUrl = ORT_MODULE_URL;
  const imported = await import(/* @vite-ignore */ moduleUrl) as OrtModule;
  imported.env.wasm.wasmPaths = ORT_DIST_URL;
  imported.env.wasm.numThreads = 1;
  imported.env.wasm.proxy = false;
  return imported;
}

function validateInput(session: OrtSession) {
  if (session.inputNames.length !== 1) {
    throw new Error(
      `Unexpected TransNetV2 input count: ${session.inputNames.length}.`,
    );
  }

  const metadata = session.inputMetadata?.[0];
  const expected = [
    1,
    TRANSNET_V2_WINDOW_FRAMES,
    TRANSNET_V2_FRAME_HEIGHT,
    TRANSNET_V2_FRAME_WIDTH,
    3,
  ];

  if (metadata?.isTensor === false) {
    throw new Error('TransNetV2 input is not a tensor.');
  }
  if (metadata?.shape?.length) {
    const matches = expected.every((dimension, index) => {
      const actual = metadata.shape?.[index];
      return typeof actual !== 'number' || actual === dimension;
    });
    if (!matches || metadata.shape.length !== expected.length) {
      throw new Error(
        `Unexpected TransNetV2 input shape: ${metadata.shape.join('x')}.`,
      );
    }
  }

  const type = metadata?.type ?? 'float32';
  if (type !== 'float32' && type !== 'uint8') {
    throw new Error(`Unsupported TransNetV2 input type: ${type}.`);
  }

  return {
    name: session.inputNames[0]!,
    type: type as 'float32' | 'uint8',
    dimensions: expected,
  };
}

function outputName(session: OrtSession) {
  const byKnownName = session.outputNames.find((name) => name === '534');
  if (byKnownName) return byKnownName;

  const byShape = session.outputMetadata?.find((metadata) => {
    if (metadata.isTensor === false) return false;
    const shape = metadata.shape ?? [];
    return shape.some((dimension) => dimension === TRANSNET_V2_WINDOW_FRAMES);
  });
  if (byShape?.name && session.outputNames.includes(byShape.name)) {
    return byShape.name;
  }

  const fallback = session.outputNames[0];
  if (!fallback) throw new Error('TransNetV2 model exposes no output tensor.');
  return fallback;
}

function tensorData(
  rgb: Uint8Array,
  type: 'float32' | 'uint8',
) {
  if (type === 'uint8') return rgb;

  const values = new Float32Array(rgb.length);
  for (let index = 0; index < rgb.length; index += 1) {
    values[index] = rgb[index] ?? 0;
  }
  return values;
}

function sigmoid(value: number) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function centerPredictions(output: ArrayLike<number>, outputFrameCount: number) {
  if (output.length < TRANSNET_V2_WINDOW_FRAMES) {
    throw new Error(
      `TransNetV2 output has only ${output.length} values; expected at least 100.`,
    );
  }

  const count = Math.min(TRANSNET_V2_OUTPUT_FRAMES, outputFrameCount);
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const raw = Number(output[TRANSNET_V2_CONTEXT_FRAMES + index] ?? 0);
    values[index] = sigmoid(raw);
  }
  return values;
}

export async function createTransNetRuntime(options: {
  signal?: AbortSignal;
  onProgress?: (progress: TransNetRuntimeProgress) => void;
} = {}): Promise<TransNetRuntime> {
  const { signal, onProgress } = options;
  throwIfAborted(signal);

  onProgress?.({ phase: 'runtime', detail: 'Loading ONNX Runtime' });
  const ort = await loadOrtModule();
  throwIfAborted(signal);

  onProgress?.({ phase: 'model', detail: 'Loading TransNetV2 model' });
  const model = await cachedModel(signal);
  throwIfAborted(signal);

  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
  });
  const input = validateInput(session);
  const output = outputName(session);

  return {
    runWindow: async (window) => {
      throwIfAborted(signal);
      const values = tensorData(window.rgb, input.type);
      const tensor = new ort.Tensor(input.type, values, input.dimensions);
      const result = await session.run({ [input.name]: tensor }, [output]);
      throwIfAborted(signal);
      const outputTensor = result[output];
      if (!outputTensor?.data) {
        throw new Error(`TransNetV2 output "${output}" is missing tensor data.`);
      }
      return centerPredictions(outputTensor.data, window.outputFrameCount);
    },
    dispose: async () => {
      await session.release?.();
    },
  };
}

export const transNetRuntimeInternals = {
  centerPredictions,
  validateInput,
  outputName,
};
