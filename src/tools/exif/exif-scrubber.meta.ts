import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "exif-scrubber",
  category: "media",
  shortTitle: "EXIF Scrubber",
  title: "Zero-Knowledge Media EXIF Scrubber & Geotag Redactor",
  audience: "Photographers · journalists · privacy teams",
  summary: "Inspect location, device, identity, and time fields, strip them from JPEG, PNG, and WebP without recompressing, or rebuild the pixels when you need a new encoding.",
  privacy: "Image bytes, inspection, stripping, and exports stay in this browser. Nothing is uploaded.",
  accepts: "JPEG, PNG, WebP, and HEIC/HEIF images this browser can read",
  outputs: "Sanitized image, batch ZIP, and a local inspection report",
  steps: [
    "Choose or drop an image.",
    "Review location, device, identity, and time fields.",
    "Strip embedded metadata, or rebuild the pixels, then download the copy.",
  ],
  hint: "Stripping keeps the image data and animation. Rebuilding recompresses JPEG and WebP and keeps only the first frame of an animation. HEIC can be inspected here and rebuilt only if this browser can decode it.",
  load: () => import('./ExifWorkspace'),
} satisfies ToolMeta;
