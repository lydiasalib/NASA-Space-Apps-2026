/**
 * Mock-ready 360° horizon & ephemeris data generator for South Pole sites.
 *
 * Contract matches the upcoming backend `/horizon?site=` and `/timeseries` endpoints:
 * {
 *   horizonDeg: number[720],   // 0.0° .. 359.5° azimuth in 0.5° steps
 *   sun:  { azDeg, elDeg, diameterDeg, track: Array<{ azDeg, elDeg }> },
 *   earth:{ azDeg, elDeg, safetyMarginDeg, track: Array<{ azDeg, elDeg }> },
 *   summary: { sunPct, earthPct, longestNightHrs, isMock: true }
 * }
 */

const N_POINTS = 720;

// Approximate crater centers (lat, lon, radiusKm) so custom clicks inside a crater
// bowl naturally produce steep 5°-8° enclosing walls, matching real LOLA geometry.
const CRATER_BOWLS = [
  { name: "Shackleton", lat: -89.67, lon: 129.78, radiusKm: 10.5 },
  { name: "Shoemaker", lat: -88.1, lon: 45.9, radiusKm: 25.5 },
  { name: "Faustini", lat: -87.2, lon: 84.3, radiusKm: 20.0 },
  { name: "Haworth", lat: -87.45, lon: -5.17, radiusKm: 25.0 },
  { name: "de Gerlache", lat: -88.48, lon: -88.34, radiusKm: 16.0 },
  { name: "Cabeus", lat: -85.33, lon: -42.13, radiusKm: 49.0 },
];

function hashSeed(lat, lon) {
  const s = Math.sin(lat * 127.1 + lon * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function approxSurfaceDistKm(lat1, lon1, lat2, lon2) {
  const r = 1737.4;
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;
  const dLa = la2 - la1;
  const dLo = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

function generateTerrain(baseEl, amp1, amp2, peaks, phaseSeed) {
  const arr = new Array(N_POINTS);
  for (let i = 0; i < N_POINTS; i++) {
    const az = i * 0.5;
    const rad = (az * Math.PI) / 180;
    let el =
      baseEl +
      amp1 * Math.sin(rad * 2 + phaseSeed * 6.28) +
      amp2 * Math.cos(rad * 5 - phaseSeed * 4.1) +
      0.32 * Math.sin(rad * 11 + phaseSeed * 12.4) +
      0.16 * Math.cos(rad * 23 + phaseSeed * 3.7);

    for (const pk of peaks) {
      let d = Math.abs(az - pk.az);
      if (d > 180) d = 360 - d;
      el += pk.height * Math.exp(-(d * d) / (2 * pk.width * pk.width));
    }
    arr[i] = Number(Math.max(-1.8, Math.min(9.8, el)).toFixed(2));
  }
  return arr;
}

function sampleHorizonAt(horizonDeg, azDeg) {
  const norm = ((azDeg % 360) + 360) % 360;
  const idx = Math.round(norm * 2) % N_POINTS;
  return horizonDeg[idx];
}

function buildSunTrack(lat, basePhase) {
  // At high southern latitudes, the Sun circuits 360° in ~29.5 days with slight seasonal tilt.
  const maxEl = 1.5 + Math.max(0, 90 + lat) * 0.35;
  const track = [];
  for (let az = 0; az <= 360; az += 15) {
    const el = maxEl * 0.55 + Math.sin(((az + basePhase * 60) * Math.PI) / 180) * (maxEl * 0.45);
    track.push({ azDeg: az, elDeg: Number(el.toFixed(2)) });
  }
  return track;
}

function buildEarthTrack(earthAz, earthEl) {
  // ±7° longitude / latitude libration loop around nominal DTE direction
  const track = [];
  for (let k = 0; k <= 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    const az = ((earthAz + Math.sin(t) * 6.5) % 360 + 360) % 360;
    const el = earthEl + Math.cos(t) * 2.4;
    track.push({ azDeg: Number(az.toFixed(1)), elDeg: Number(el.toFixed(2)) });
  }
  return track;
}

const PRESETS = {
  "connecting-ridge": () =>
    generateTerrain(
      0.45,
      0.55,
      0.28,
      [
        { az: 145, height: 1.4, width: 22 },
        { az: 248, height: 1.9, width: 18 },
        { az: 38, height: 0.9, width: 15 },
      ],
      0.14
    ),
  "peak-near-shackleton": () =>
    generateTerrain(
      0.35,
      0.6,
      0.35,
      [
        { az: 162, height: 2.8, width: 26 },
        { az: 305, height: 1.5, width: 20 },
      ],
      0.31
    ),
  "shackleton-floor": () =>
    generateTerrain(
      6.2,
      1.1,
      0.5,
      [
        { az: 40, height: 1.8, width: 28 },
        { az: 170, height: 2.1, width: 32 },
        { az: 290, height: 1.6, width: 26 },
      ],
      0.42
    ),
  "mons-mouton": () =>
    generateTerrain(
      0.15,
      0.42,
      0.22,
      [
        { az: 95, height: 1.1, width: 24 },
        { az: 215, height: 1.35, width: 28 },
      ],
      0.52
    ),
  "de-gerlache-rim-2": () =>
    generateTerrain(
      1.6,
      1.1,
      0.45,
      [
        { az: 210, height: 3.9, width: 32 },
        { az: 285, height: 2.7, width: 25 },
      ],
      0.67
    ),
  "haworth-rim": () =>
    generateTerrain(
      1.2,
      0.95,
      0.4,
      [
        { az: 135, height: 4.1, width: 35 },
        { az: 195, height: 2.9, width: 28 },
      ],
      0.79
    ),
  "nobile-rim-1": () =>
    generateTerrain(
      0.9,
      0.75,
      0.35,
      [
        { az: 118, height: 2.3, width: 26 },
        { az: 260, height: 2.1, width: 22 },
      ],
      0.88
    ),
};

export function getHorizonProfile(site) {
  if (!site) return null;

  const seed = hashSeed(site.lat, site.lon);
  const insideBowl = CRATER_BOWLS.find(
    (c) => approxSurfaceDistKm(site.lat, site.lon, c.lat, c.lon) < c.radiusKm * 0.72
  );

  let horizonDeg;
  if (site.id && PRESETS[site.id]) {
    horizonDeg = PRESETS[site.id]();
  } else if (insideBowl) {
    // Deep crater floor surrounded by steep 5°-8° walls
    horizonDeg = generateTerrain(
      6.1,
      1.15,
      0.55,
      [
        { az: 45, height: 1.9, width: 28 },
        { az: 175, height: 2.2, width: 32 },
        { az: 295, height: 1.5, width: 25 },
      ],
      seed
    );
  } else {
    horizonDeg = generateTerrain(
      1.1 + seed * 1.4,
      0.85,
      0.4,
      [
        { az: Math.round(seed * 360), height: 2.2 + seed * 1.8, width: 26 },
        { az: Math.round(((seed + 0.43) % 1) * 360), height: 1.6, width: 20 },
      ],
      seed
    );
  }

  // Nominal Earth direction from South Pole site: azimuth points toward lon 0° (North on nearside)
  const earthAz = (((-site.lon) % 360) + 360) % 360;
  // At 85°S..90°S, sub-Earth lat ~0° puts Earth near 0°..5° above mathematical horizon + libration
  const earthEl = Number((Math.max(0.2, (90 + site.lat) * 0.45) + 1.6).toFixed(2));

  // Sample Sun matching the globe's current subsolar longitude (55°E)
  const sunAz = (((55 - site.lon) % 360) + 360) % 360;
  const sunEl = Number((1.65 + Math.max(0, 90 + site.lat) * 0.28).toFixed(2));

  const sunTrack = buildSunTrack(site.lat, seed);
  const earthTrack = buildEarthTrack(earthAz, earthEl);

  const sunRidge = sampleHorizonAt(horizonDeg, sunAz);
  const earthRidge = sampleHorizonAt(horizonDeg, earthAz);

  const sunLit = sunEl > sunRidge;
  const earthDte = earthEl > earthRidge;

  // Compute approximate visibility % over the 720-point skyline
  let litCount = 0;
  for (let i = 0; i < N_POINTS; i++) {
    if (sunEl + 0.5 > horizonDeg[i]) litCount++;
  }
  const sunPct = Math.round((litCount / N_POINTS) * 100);
  const earthClearCount = earthTrack.filter(
    (p) => p.elDeg > sampleHorizonAt(horizonDeg, p.azDeg)
  ).length;
  const earthPct = Math.round((earthClearCount / earthTrack.length) * 100);
  const longestNightHrs = Math.max(12, Math.round(((100 - sunPct) / 100) * 708));

  return {
    horizonDeg,
    insideCrater: insideBowl?.name ?? null,
    sun: {
      azDeg: Number(sunAz.toFixed(1)),
      elDeg: sunEl,
      ridgeElDeg: sunRidge,
      diameterDeg: 0.53,
      visible: sunLit,
      track: sunTrack,
    },
    earth: {
      azDeg: Number(earthAz.toFixed(1)),
      elDeg: earthEl,
      ridgeElDeg: earthRidge,
      safetyMarginDeg: 2.0,
      visible: earthDte,
      track: earthTrack,
    },
    summary: {
      sunPct,
      earthPct,
      longestNightHrs,
      isMock: true,
    },
  };
}
