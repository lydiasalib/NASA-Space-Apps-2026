import proj4 from "proj4";
import mapMeta from "../data/mapMeta.json";

export const MOON_RADIUS_M = 1737400;
export const LUNAR_LONLAT = "+proj=longlat +R=1737400 +no_defs";
export const LUNAR_STEREO = mapMeta.proj4;

/** Southernmost-latitude limit covered by the 2D polar mosaic. */
export const POLAR_MAP_LAT_LIMIT = -60;

export function lonLatToXY(lon, lat) {
  return proj4(LUNAR_LONLAT, LUNAR_STEREO, [lon, lat]);
}

export function xyToLonLat(x, y) {
  return proj4(LUNAR_STEREO, LUNAR_LONLAT, [x, y]);
}

export function isInPolarMap(lat) {
  return Number.isFinite(lat) && lat <= POLAR_MAP_LAT_LIMIT;
}

export function normalizeLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return l;
}

/**
 * Unit-sphere position matching THREE.SphereGeometry + equirectangular texture
 * (texture left edge = lon -180):  x = cos(lat)cos(lon), y = sin(lat), z = -cos(lat)sin(lon)
 */
export function latLonToUnit(lat, lon) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

export function unitToLatLon(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  const lat = (Math.asin(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI;
  const lon = (Math.atan2(-z, x) * 180) / Math.PI;
  return { lat, lon: normalizeLon(lon) };
}

export function formatCoord(val, posHem, negHem, decimals = 4) {
  const hem = val >= 0 ? posHem : negHem;
  return `${Math.abs(val).toFixed(decimals)}° ${hem}`;
}

/** Build a uniform site object for the drawer from a curated site or a raw lat/lon. */
export function makeSite({ lat, lon, curated = null }) {
  const [x, y] = lonLatToXY(lon, lat);
  const finiteXY = Number.isFinite(x) && Number.isFinite(y);
  if (curated) {
    return {
      ...curated,
      lat,
      lon,
      x: finiteXY ? Math.round(x) : null,
      y: finiteXY ? Math.round(y) : null,
      isCustom: false,
    };
  }
  return {
    id: `custom-${lat.toFixed(5)}-${lon.toFixed(5)}`,
    name: "Custom Lunar Site",
    region:
      lat <= -80
        ? "South Polar Region (≥80°S)"
        : lat <= POLAR_MAP_LAT_LIMIT
          ? "Southern Highlands"
          : lat < 0
            ? "Southern Hemisphere"
            : "Northern Hemisphere",
    lat,
    lon,
    x: finiteXY ? Math.round(x) : null,
    y: finiteXY ? Math.round(y) : null,
    note: "User-selected surface coordinate ready for solar & Earth visibility analysis.",
    isCustom: true,
  };
}
