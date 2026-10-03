import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "convolution-room-profiler",
  category: "audio",
  shortTitle: "Room Profiler",
  title: "Local Convolution Room Profiler & 24-Bit Offline Renderer",
  audience: "Audio engineers · producers · sound designers",
  summary: "Load dry audio and an impulse response, audition an equal-power dry/wet convolution graph with pre-delay and filters, inspect live spectrum energy, pause/resume playback, and render the same graph to 24-bit PCM WAV.",
  privacy: "Audio decoding, convolution, playback analysis, and offline rendering use browser Web Audio APIs on this device. Source audio is never uploaded.",
  accepts: "Browser-decodable audio plus a room/cabinet impulse response",
  outputs: "Live convolved audition and downloadable 24-bit PCM WAV render",
  steps: [
    "Choose a dry source and impulse-response file.",
    "Set wet mix, pre-delay, low cut, and high cut, then audition or pause/resume locally.",
    "Render the configured graph with OfflineAudioContext and download the 24-bit WAV.",
  ],
  hint: "Long sources and impulse responses require browser memory for decoded buffers and offline rendering. Keep originals and audition the render before replacing production assets.",
  load: () => import('./AudioWorkspace'),
} satisfies ToolMeta;
