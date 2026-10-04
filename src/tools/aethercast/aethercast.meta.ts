import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "aethercast",
  category: "maps",
  aliases: ["#/aethercast"],
  shortTitle: "AetherCast",
  title: "AetherCast — Local Air Quality Index & Solar UV Exposure Workbench",
  audience: "Outdoor coaches · endurance athletes · respiratory/cardiac risk households · environmental researchers",
  summary: "Load live hourly air-quality and UV conditions for your location from Open-Meteo, or import a file you already have, then compute US EPA AQI, European EAQI, and WHO 2021 guideline comparisons, estimate Fitzpatrick sun-exposure limits, screen for wildfire/inversion anomalies, and plan outdoor activity windows.",
  privacy: "Opening AetherCast sends nothing. Only when you choose Use my location, a searched city or postal code, or Load live data for the remembered location does it send that location to the keyless Open-Meteo forecast, air-quality and geocoding services, and nothing else. The chosen location is remembered in this browser; automatic 15-minute refresh runs only after you start live data and can be stopped. All AQI/EAQI/WHO/UV computation, anomaly screening, and PDF/CSV/PNG export run only in this browser; an imported file never leaves this device.",
  accepts: "Your browser location or a searched city or postal code (live Open-Meteo data), or as a fallback an Open-Meteo Air Quality API JSON export, a mapped CSV of hourly pollutant/UV readings, or a previously exported AetherCast JSON file",
  outputs: "Interactive AQI/UV forecast chart, WHO guideline comparison, activity advisory, anomaly log, and PDF/CSV/PNG/JSON export",
  steps: [
    "Choose Use my location, search for a place, or Load live data for your remembered location; or import an hourly air-quality/UV file.",
    "Choose your index standard, Fitzpatrick skin type, and any vulnerability lens.",
    "Scrub the chart, review the advisory and anomaly log, then export a brief or dataset.",
  ],
  hint: "AQI/UV estimates and wildfire/inversion flags are local screening aids, not medical or regulatory guidance — verify with your local air-quality authority for health-critical decisions.",
  load: () => import('./AetherCastWorkspace'),
} satisfies ToolMeta;
