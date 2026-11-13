// `minZoom` controls label decluttering on the 2D polar map: labels clustered
// around the pole fade in only once the map is zoomed far enough to separate them.
export const CRATER_LABELS = [
  { name: "Shackleton", lat: -89.67, lon: 129.78, minZoom: -11 },
  { name: "Schrödinger", lat: -75.0, lon: 132.4, minZoom: -11 },
  { name: "Cabeus", lat: -85.33, lon: -42.13, minZoom: -11 },
  { name: "Mons Mouton", lat: -84.6, lon: 31.0, minZoom: -11 },
  { name: "Faustini", lat: -87.2, lon: 84.3, minZoom: -9.75 },
  { name: "Haworth", lat: -87.45, lon: -5.17, minZoom: -9.75 },
  { name: "Shoemaker", lat: -88.1, lon: 45.9, minZoom: -9.25 },
  { name: "de Gerlache", lat: -88.48, lon: -88.34, minZoom: -9.0 },
];

export const CURATED_SITES = [
  {
    id: "connecting-ridge",
    name: "Connecting Ridge",
    region: "Shackleton–de Gerlache Ridge",
    lat: -89.45,
    lon: -137.3,
    note: "High-illumination ridge bridging Shackleton and de Gerlache craters.",
  },
  {
    id: "peak-near-shackleton",
    name: "Peak Near Shackleton",
    region: "Shackleton Rim",
    lat: -88.8,
    lon: 124.5,
    note: "Elevated rim crest with extended solar exposure and line-of-sight to Earth.",
  },
  {
    id: "shackleton-floor",
    name: "Shackleton Floor",
    region: "Shackleton Crater PSR",
    lat: -89.67,
    lon: 129.78,
    note: "Permanently shadowed crater floor surrounded by steep 5°–8° rim walls.",
  },
  {
    id: "mons-mouton",
    name: "Mons Mouton Plateau",
    region: "Mons Mouton (Leibnitz Beta)",
    lat: -84.65,
    lon: 31.2,
    note: "Flat-topped massif offering gentle landing slopes and broad horizon visibility.",
  },
  {
    id: "de-gerlache-rim-2",
    name: "de Gerlache Rim 2",
    region: "de Gerlache Crater",
    lat: -88.25,
    lon: -68.4,
    note: "Candidate Artemis region adjacent to permanently shadowed volatile traps.",
  },
  {
    id: "haworth-rim",
    name: "Haworth Rim",
    region: "Haworth–Shoemaker Massif",
    lat: -86.85,
    lon: -14.2,
    note: "Nearside-facing highland ridge overlooking the Haworth PSR.",
  },
  {
    id: "nobile-rim-1",
    name: "Nobile Rim 1",
    region: "Nobile Crater",
    lat: -85.2,
    lon: 55.8,
    note: "Broad plateau bordering Nobile crater with access to diverse terrain.",
  },
];
