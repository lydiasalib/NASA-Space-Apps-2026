import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Crosshair, Home, Minus, Plus } from "lucide-react";
import mapMeta from "../data/mapMeta.json";
import { CRATER_LABELS, CURATED_SITES } from "../data/lunarSites";
import { isInPolarMap, lonLatToXY, makeSite, xyToLonLat } from "../lib/geo";

const SCALE_STEPS_KM = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const LABEL_FADE_SPAN = 0.5;

function computeScaleBar(map) {
  const p0 = map.latLngToContainerPoint([0, 0]);
  const p1 = map.latLngToContainerPoint([0, 100000]);
  const pxPerMeter = Math.abs(p1.x - p0.x) / 100000;
  if (!pxPerMeter || !Number.isFinite(pxPerMeter)) return { label: "200 km", widthPx: 100 };
  let bestKm = SCALE_STEPS_KM[0];
  let bestDiff = Infinity;
  for (const km of SCALE_STEPS_KM) {
    const px = km * 1000 * pxPerMeter;
    if (px >= 56 && px <= 170 && Math.abs(px - 110) < bestDiff) {
      bestDiff = Math.abs(px - 110);
      bestKm = km;
    }
  }
  const widthPx = Math.max(40, Math.min(200, Math.round(bestKm * 1000 * pxPerMeter)));
  return { label: `${bestKm} km`, widthPx };
}

function pinIcon(selected) {
  return L.divIcon({
    className: "site-pin-icon",
    html: `<div class="site-pin-wrapper">${selected ? '<div class="site-pin-pulse"></div>' : ""}<div class="site-pin-core"></div></div>`,
    iconSize: [0, 0],
  });
}

function customIcon(lat, lon) {
  const latTxt = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonTxt = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return L.divIcon({
    className: "custom-pin-icon",
    html: `<div class="custom-pin-wrapper">
      <div class="custom-pin-ping"></div>
      <div class="custom-pin-pulse"></div>
      <div class="custom-pin-core"></div>
      <div class="coord-badge">${latTxt} · ${lonTxt}</div>
    </div>`,
    iconSize: [0, 0],
  });
}

function nearbyIcon(spot, idx = 0) {
  const gain = spot.gain_sun_hours_per_year ?? 0;
  const rank = `#${idx + 1}`;
  const gainTxt = `${gain >= 0 ? "+" : ""}${Math.round(gain)}h/yr`;
  const posClass = `nearby-pos-${idx % 3}`;
  return L.divIcon({
    className: "nearby-pin-icon",
    html: `<div class="nearby-pin-wrapper ${posClass}">
      <div class="nearby-pin-pulse"></div>
      <div class="nearby-pin-core"></div>
      <div class="nearby-badge">
        <span class="nearby-badge-rank">${rank}</span>
        <span class="nearby-badge-dist">${spot.distance_m}m</span>
        <span class="nearby-badge-extra"> · ${gainTxt}</span>
      </div>
    </div>`,
    iconSize: [0, 0],
  });
}

export default function SouthPoleViewer({
  active,
  selectedSite,
  nearbySpots = [],
  showSitePins = true,
  onSelectSite,
  focusRequest,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const curatedMarkersRef = useRef(new Map());
  const customMarkerRef = useRef(null);
  const nearbyMarkersRef = useRef([]);
  const reticleRef = useRef(null);
  const reticleLabelRef = useRef(null);
  const readoutLatRef = useRef(null);
  const readoutLonRef = useRef(null);
  const onSelectRef = useRef(onSelectSite);
  onSelectRef.current = onSelectSite;

  const [scaleBar, setScaleBar] = useState({ label: "200 km", widthPx: 100 });

  const bounds = useMemo(() => {
    const { xmin, ymin, xmax, ymax } = mapMeta.bounds;
    return [
      [ymin, xmin],
      [ymax, xmax],
    ];
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -11,
      maxZoom: -3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 80,
      attributionControl: false,
      zoomControl: false,
      maxBounds: [
        [mapMeta.bounds.ymin - 250000, mapMeta.bounds.xmin - 250000],
        [mapMeta.bounds.ymax + 250000, mapMeta.bounds.xmax + 250000],
      ],
      maxBoundsViscosity: 0.75,
    });

    L.imageOverlay("/south_pole.png", bounds, { interactive: false }).addTo(map);
    map.fitBounds(bounds, { padding: [24, 24] });

    // 80°S LOLA Full-Terrain Coverage Boundary Ring (always visible, high contrast + subtle glow)
    const [x80, y80] = lonLatToXY(0, -80);
    const r80 = Math.hypot(x80, y80);

    L.circle([0, 0], {
      radius: r80,
      color: "#38bdf8",
      weight: 6,
      opacity: 0.28,
      fill: false,
      interactive: false,
    }).addTo(map);

    L.circle([0, 0], {
      radius: r80,
      color: "#38bdf8",
      weight: 2.2,
      opacity: 0.88,
      dashArray: "7 5",
      fill: false,
      interactive: false,
    }).addTo(map);

    L.marker([r80, 0], {
      icon: L.divIcon({
        className: "coverage-ring-icon",
        html: `<span class="coverage-ring-label coverage-ring-label-2d">80°S · LOLA TERRAIN COVERAGE</span>`,
        iconSize: [0, 0],
      }),
      zIndexOffset: 260,
      interactive: false,
      keyboard: false,
    }).addTo(map);

    // Crater labels with zoom-dependent decluttering
    const labelMarkers = CRATER_LABELS.map((crater) => {
      const [x, y] = lonLatToXY(crater.lon, crater.lat);
      const icon = L.divIcon({
        className: "crater-label-icon",
        html: `<span class="crater-label-text">${crater.name}</span>`,
        iconSize: [0, 0],
      });
      const marker = L.marker([y, x], { icon, interactive: false, keyboard: false }).addTo(map);
      return { marker, minZoom: crater.minZoom };
    });

    const updateLabels = () => {
      const z = map.getZoom();
      for (const { marker, minZoom } of labelMarkers) {
        const el = marker.getElement();
        if (!el) continue;
        const o = Math.max(0, Math.min(1, (z - (minZoom - LABEL_FADE_SPAN)) / LABEL_FADE_SPAN));
        el.style.opacity = String(o);
        el.style.visibility = o <= 0.01 ? "hidden" : "visible";
      }
    };

    // Curated landing site pins
    for (const site of CURATED_SITES) {
      const [x, y] = lonLatToXY(site.lon, site.lat);
      const marker = L.marker([y, x], { icon: pinIcon(false), zIndexOffset: 300 }).addTo(map);
      marker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        onSelectRef.current(makeSite({ lat: site.lat, lon: site.lon, curated: site }));
      });
      curatedMarkersRef.current.set(site.id, marker);
    }

    const updateScale = () => setScaleBar(computeScaleBar(map));
    const onZoom = () => {
      updateScale();
      updateLabels();
    };
    onZoom();
    map.on("zoom zoomend resize", onZoom);

    // Reticle + live readout (direct DOM writes, throttled to animation frames)
    let pending = null;
    let rafId = 0;
    const flushHover = () => {
      rafId = 0;
      if (!pending) return;
      const { cx, cy, lat, lon } = pending;
      const ret = reticleRef.current;
      if (ret) {
        ret.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
        ret.style.opacity = "1";
      }
      if (reticleLabelRef.current) {
        reticleLabelRef.current.textContent = `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
      }
      if (readoutLatRef.current) readoutLatRef.current.textContent = `${lat.toFixed(2)}°`;
      if (readoutLonRef.current) readoutLonRef.current.textContent = `${lon.toFixed(2)}°`;
    };

    map.on("mousemove", (e) => {
      const [lon, lat] = xyToLonLat(e.latlng.lng, e.latlng.lat);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      pending = { cx: e.containerPoint.x, cy: e.containerPoint.y, lat, lon };
      if (!rafId) rafId = requestAnimationFrame(flushHover);
    });
    map.on("mouseout", () => {
      if (reticleRef.current) reticleRef.current.style.opacity = "0";
    });

    map.on("click", (e) => {
      const [lon, lat] = xyToLonLat(e.latlng.lng, e.latlng.lat);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      onSelectRef.current(makeSite({ lat, lon }));
    });

    mapRef.current = map;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      map.remove();
      mapRef.current = null;
      curatedMarkersRef.current.clear();
      customMarkerRef.current = null;
      nearbyMarkersRef.current = [];
    };
  }, [bounds]);

  // Sync markers with the shared selection (from 2D or 3D) and pins visibility toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, marker] of curatedMarkersRef.current.entries()) {
      const isSelected = !!selectedSite && !selectedSite.isCustom && selectedSite.id === id;
      const shouldShow = showSitePins || isSelected;
      if (shouldShow) {
        if (!map.hasLayer(marker)) marker.addTo(map);
        marker.setIcon(pinIcon(isSelected));
        marker.setZIndexOffset(isSelected ? 500 : 300);
      } else if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    }
    if (selectedSite?.isCustom && isInPolarMap(selectedSite.lat)) {
      const [x, y] = lonLatToXY(selectedSite.lon, selectedSite.lat);
      const icon = customIcon(selectedSite.lat, selectedSite.lon);
      if (customMarkerRef.current) {
        customMarkerRef.current.setLatLng([y, x]).setIcon(icon);
      } else {
        customMarkerRef.current = L.marker([y, x], {
          icon,
          zIndexOffset: 400,
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }
    } else if (customMarkerRef.current) {
      map.removeLayer(customMarkerRef.current);
      customMarkerRef.current = null;
    }
  }, [selectedSite, showSitePins]);

  // Render glowing green candidate pins returned by /nearby
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of nearbyMarkersRef.current) map.removeLayer(m);
    nearbyMarkersRef.current = [];
    for (let idx = 0; idx < (nearbySpots || []).length; idx++) {
      const spot = nearbySpots[idx];
      if (!isInPolarMap(spot.lat)) continue;
      const [x, y] = lonLatToXY(spot.lon, spot.lat);
      const marker = L.marker([y, x], {
        icon: nearbyIcon(spot, idx),
        zIndexOffset: 460 - idx * 5,
      }).addTo(map);
      marker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        onSelectRef.current(makeSite({ lat: spot.lat, lon: spot.lon }));
      });
      nearbyMarkersRef.current.push(marker);
    }
  }, [nearbySpots]);

  // Fly to a requested focus (e.g. from the 3D globe)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) return;
    map.invalidateSize();
    if (Number.isFinite(focusRequest.lat) && Number.isFinite(focusRequest.lon)) {
      const [x, y] = lonLatToXY(focusRequest.lon, focusRequest.lat);
      map.flyTo([y, x], focusRequest.zoom ?? -7, { duration: 1.2 });
    } else {
      map.flyTo([0, 0], focusRequest.zoom ?? -8.75, { duration: 1.2 });
    }
  }, [focusRequest]);

  useEffect(() => {
    if (active) mapRef.current?.invalidateSize();
  }, [active]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleResetView = () => mapRef.current?.fitBounds(bounds, { padding: [24, 24], animate: true });

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <div ref={containerRef} className="polar-map" style={{ width: "100%", height: "100%" }} />

      {/* NASA-style hover reticle */}
      <div ref={reticleRef} className="map-reticle" aria-hidden="true">
        <svg width="44" height="44" viewBox="-22 -22 44 44">
          <circle r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <circle r="16" fill="none" stroke="rgba(255,140,43,0.35)" strokeWidth="1" strokeDasharray="2 4" />
          <line x1="-21" y1="0" x2="-14" y2="0" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />
          <line x1="14" y1="0" x2="21" y2="0" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />
          <line x1="0" y1="-21" x2="0" y2="-14" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />
          <line x1="0" y1="14" x2="0" y2="21" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />
          <circle r="1.6" fill="#ff8c2b" />
        </svg>
        <span ref={reticleLabelRef} className="map-reticle-label" />
      </div>

      <div className="hud-glass hud-title">
        <div className="hud-dot" />
        <div>
          <div className="hud-title-main">RIMLIGHT · SOUTH POLE NAVIGATOR</div>
          <div className="hud-title-sub">LRO WAC Polar Stereographic (60°S–90°S) · Click map or pin to inspect</div>
        </div>
      </div>

      <div className="hud-glass hud-bottom-left">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="hud-btn" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
            <Plus size={16} />
          </button>
          <button className="hud-btn" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
            <Minus size={16} />
          </button>
          <button className="hud-btn" onClick={handleResetView} title="Reset view" aria-label="Reset view">
            <Home size={15} />
          </button>
        </div>
        <div className="hud-divider" />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 4 }}>
          <div className="mono" style={{ fontSize: 11, color: "rgba(232,237,245,0.85)", textAlign: "center" }}>
            {scaleBar.label}
          </div>
          <div className="scale-bar" style={{ width: scaleBar.widthPx }} />
        </div>
      </div>

      <div className="hud-glass hud-readout mono">
        <Crosshair size={14} color="#ff8c2b" />
        <span className="readout-key">LAT</span>
        <span ref={readoutLatRef} className="readout-val" style={{ minWidth: 66 }}>-90.00°</span>
        <span style={{ color: "rgba(255,255,255,0.18)" }}>|</span>
        <span className="readout-key">LON</span>
        <span ref={readoutLonRef} className="readout-val" style={{ minWidth: 72 }}>0.00°</span>
      </div>
    </div>
  );
}
