import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "video-keyframe-slicer",
  category: "media",
  shortTitle: "Keyframe Video Slicer",
  title: "Lossless Keyframe Video Slicer & Encoded-Packet Remuxer",
  audience: "Video editors · creators · media engineers",
  summary: "Inspect verified video keyframes, request a trim range, see the exact packet-safe range before export, and copy compatible encoded audio/video packets into a new container without decoding or re-encoding.",
  privacy: "Container parsing, keyframe verification, packet copying, and remuxing run entirely in this browser. Video and audio bytes are never uploaded.",
  accepts: "Local MP4, MOV, or WebM video with a supported encoded video track",
  outputs: "Packet-copied MP4, MOV, or WebM slice using a compatible source codec/container combination",
  steps: [
    "Choose a local video and let the browser enumerate verified keyframes.",
    "Set requested start/end times and review the disclosed keyframe-snapped export boundaries.",
    "Export the packet-safe slice; compatible encoded video/audio packets are remuxed without decode/re-encode.",
  ],
  hint: "Lossless packet slicing cannot create arbitrary frame-accurate video cuts. Start/end boundaries may move to keyframes, and unsupported codec/container combinations are rejected rather than silently re-encoded.",
  load: () => import('./VideoWorkspace'),
} satisfies ToolMeta;
