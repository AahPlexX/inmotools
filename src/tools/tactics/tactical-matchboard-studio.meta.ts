import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "tactical-matchboard-studio",
  category: "everyday",
  shortTitle: "Tactical Matchboard Studio",
  title: "Tactical Matchboard Studio — Local Football Tactics Board & Coaching Authoring Workspace",
  audience: "Kids · parents · volunteer coaches · academy staff · analysts",
  summary: "Open Board setup, set the pitch (the drawn field), team colors, direction, and a formation (the starting arrangement of your players), then choose \"Build board\" so your squad appears. Choose \"Place opposition\" to add the opposition (the other team), move players and the ball, open \"Local video review\" to draw notes on a match video from this device, then download a diagram or a project file. The project stays in this browser. Nothing is uploaded and no account is required.",
  privacy: "Tactical projects, local match videos, drawings, tags, clips, sync anchors (time-and-position anchors for overlay tracking), and generated files stay in this browser. No account, backend, telemetry, or upload is required.",
  accepts: "In-workspace pitch and formation controls, local match video files your browser can play (mp4, WebM, Ogg, QuickTime within the tool size limit), pointer/touch placement, and precise numeric movement",
  outputs: "The board on screen, notes on a local match video, an SVG (Scalable Vector Graphics) diagram, a still image when this browser can write one, a coaching PDF package (a printable file of the session), analytics CSV (comma-separated values) or JSON (a structured data file in text form), and a project file downloaded in this browser",
  steps: [
    "Open Board setup. Enter pitch length and width, choose team colors, direction, and a formation (the starting arrangement of your players), then choose \"Build board\". Your squad appears on the pitch (the drawn field).",
    "Choose \"Place opposition\" to fit your visible squad into one half and a mirrored squad (the same shape, facing the other way, in a different kit (shirt color)) into the other half. Click a player or the ball, then click the pitch, to move it. Or open \"Local video review\", choose a match video on this device, and add drawings (marks on the video), tags (match-event labels), clips (saved spans of the video), playlists (ordered lists of clips), or a comparison angle (a second video of the same play). You see those changes on the board or on the video. The video stays in this browser.",
    "Choose \"Undo\" to put the previous board back, or \"Redo\" to bring that edit forward again. Then download a diagram with \"Export SVG\", a project file with \"Download project JSON\" or \"Download project ZIP\", or a video when this browser can encode one. The file downloads on this device. Nothing is uploaded.",
  ],
  hint: "Local video files stay in this browser. Overlay tracking — drawings stay on the points you mark — follows only the time-and-position anchors you enter. Built-in formations are editable organizational starters or clearly labeled recommendations; verify competition-specific dimensions and restart rules with the governing source that applies to your team.",
  load: () => import('./TacticalMatchboardWorkspace'),
} satisfies ToolMeta;
