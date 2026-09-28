import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import { disposePhotoRenderer, renderPhoto } from '../../src/tools/photo/photo-renderer';

interface WorkerRequest {
  revision: number;
  width: number;
  height: number;
}

class FakePhotoWorker {
  static latest: FakePhotoWorker | null = null;

  readonly requests: WorkerRequest[] = [];
  private readonly messageListeners: Array<(event: MessageEvent) => void> = [];

  constructor() {
    FakePhotoWorker.latest = this;
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === 'message') this.messageListeners.push(listener as (event: MessageEvent) => void);
  }

  postMessage(request: WorkerRequest) {
    this.requests.push(request);
  }

  respond(index: number, pixels: number[]) {
    const request = this.requests[index];
    const buffer = new Uint8ClampedArray(pixels).buffer;
    for (const listener of this.messageListeners) {
      listener({
        data: {
          type: 'processed',
          revision: request.revision,
          width: request.width,
          height: request.height,
          buffer,
        },
      } as MessageEvent);
    }
  }

  terminate() {}
}

class FakeContext2d {
  fillStyle = '';
  imageSmoothingEnabled = true;
  imageSmoothingQuality = 'high';

  clearRect() {}
  fillRect() {}
  drawImage() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  putImageData() {}

  getImageData(_x: number, _y: number, width: number, height: number) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      data.set([1, 2, 3, 255], offset);
    }
    return { data };
  }
}

class FakeOffscreenCanvas {
  readonly context = new FakeContext2d();

  constructor(public width: number, public height: number) {}

  getContext() {
    return this.context;
  }

  async convertToBlob(options: { type: string }) {
    return new Blob(['encoded'], { type: options.type });
  }
}

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

afterEach(() => {
  disposePhotoRenderer();
  FakePhotoWorker.latest = null;
  vi.unstubAllGlobals();
});

describe('Photo Studio render worker correlation', () => {
  test('keeps overlapping callers with the same revision independently correlated', async () => {
    vi.stubGlobal('Worker', FakePhotoWorker);
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('ImageData', FakeImageData);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 1,
      height: 1,
      close() {},
    })));

    const first = renderPhoto({
      file: new Blob(['first'], { type: 'image/png' }),
      recipe: DEFAULT_RECIPE,
      revision: 1,
    });
    const second = renderPhoto({
      file: new Blob(['second'], { type: 'image/png' }),
      recipe: DEFAULT_RECIPE,
      revision: 1,
    });

    await vi.waitFor(() => expect(FakePhotoWorker.latest?.requests).toHaveLength(2));
    const activeWorker = FakePhotoWorker.latest!;
    expect(activeWorker.requests[0].revision).not.toBe(activeWorker.requests[1].revision);

    activeWorker.respond(1, [0, 0, 255, 255]);
    activeWorker.respond(0, [255, 0, 0, 255]);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.revision).toBe(1);
    expect(secondResult.revision).toBe(1);
    expect(firstResult.histogram.red[255]).toBe(1);
    expect(secondResult.histogram.blue[255]).toBe(1);
  });
});
