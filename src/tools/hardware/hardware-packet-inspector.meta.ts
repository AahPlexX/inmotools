import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "hardware-packet-inspector",
  category: "developer",
  shortTitle: "Packet Inspector",
  title: "Web Serial / Web Bluetooth Hardware Packet Inspector",
  audience: "IoT developers · embedded engineers · robotics makers",
  summary: "Inspect live byte streams, view ASCII and hex, transmit packets, and test parsing rules without installing a desktop terminal.",
  privacy: "Hardware traffic is handled by browser device APIs and displayed on this device. Simulator mode works without hardware access.",
  accepts: "Serial byte streams, hex packets, or simulator events",
  outputs: "Live packet stream and transmitted bytes",
  steps: [
    "Connect a serial device when supported, or start the simulator.",
    "Inspect incoming ASCII/hex frames.",
    "Send validated hex packets back to the device.",
  ],
  hint: "Web Serial is primarily available in Chromium-based browsers and requires a secure context. Unsupported browsers can still use simulator mode.",
  load: () => import('./HardwareWorkspace'),
} satisfies ToolMeta;
