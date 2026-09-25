/// <reference lib="webworker" />
import init, { transform } from 'lightningcss-wasm';
import wasmUrl from 'lightningcss-wasm/lightningcss_node.wasm?url';
import { minify } from 'terser';
let ready: Promise<unknown> | undefined;
self.onmessage = async (event: MessageEvent<{ language: 'css' | 'js'; source: string; chrome: number; safari: number; firefox: number }>) => {
  try {
    const { language, source, chrome, safari, firefox } = event.data;
    if (source.length > 150_000) throw new Error('Source exceeds the compiler limit.');
    if (language === 'css') {
      ready ??= init(wasmUrl); await ready;
      const result = transform({ filename: 'style.css', code: new TextEncoder().encode(source), minify: true, targets: { chrome: chrome << 16, safari: safari << 16, firefox: firefox << 16 } });
      self.postMessage({ output: new TextDecoder().decode(result.code) });
    } else {
      const result = await minify(source, { module: false, compress: true, mangle: true });
      self.postMessage({ output: result.code ?? '' });
    }
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : String(e) }); }
};
