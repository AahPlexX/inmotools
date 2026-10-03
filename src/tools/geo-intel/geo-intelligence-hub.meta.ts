import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "geo-intelligence-hub",
  category: "maps",
  workspaceFirst: true,
  shortTitle: "Geo Intelligence Hub",
  title: "Geo Intelligence Hub — Location Lookup with Sourced Data",
  audience: "Everyone · travellers · researchers · GIS and data teams · journalists",
  summary: "Look up any place, postal code, coordinate, Plus Code, UTM or MGRS reference and get one location profile: country, admin areas, time zone, sun times, elevation, holidays, population and regional statistics. Every value names its source, year, license and precision.",
  privacy: "Searches go only to the keyless public source needed to answer them (the text or coordinates you asked about; no files, accounts or keys). Device location is used only after you agree. Results, history, tags and settings stay in this browser (IndexedDB); country, time-zone and place data are bundled for offline use.",
  accepts: "Place names, postal codes, decimal or DMS/DDM coordinates, UTM, MGRS, Plus Codes, geohash (gh:), Maidenhead (grid:), geo: URIs and map links, map clicks, device location, shared links, CSV files of postal codes, and this tool's own JSON exports",
  outputs: "JSON with per-field provenance, GeoJSON, KML, flat CSV, PDF location brief, iCalendar holidays, PNG and SVG maps, a 1200×630 social card, and a ZIP bundle, all with your title, author, tags, license and notes",
  steps: [
    "Type a place, postal code, coordinate or Plus Code and press Look up, click the map, or use your device location.",
    "Read the profile. The round i button beside each value shows where it came from, the year, the license and how precise it is.",
    "Pin up to six locations to compare, or use the tools for conversion, distance, area, nearby places and a country choropleth.",
    "Open Export to edit the title, author, tags and license, then download one format or a ZIP bundle.",
  ],
  hint: "Postal codes are delivery routes, not census areas, so no postal-code population is shown; figures are labelled with the country, NUTS region or populated place they describe. Nominatim stays off unless you enable it in Sources. Country, time-zone and nearby-place lookups keep working offline.",
  load: () => import('./GeoIntelWorkspace'),
} satisfies ToolMeta;
