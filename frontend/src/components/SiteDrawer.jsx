import { useEffect, useState } from "react";
import { BookmarkCheck, BookmarkPlus, Download, Globe2, Info, Map as MapIcon, MapPin, SlidersHorizontal, X } from "lucide-react";
import { formatCoord, isInPolarMap } from "../lib/geo";
import { downloadMissionCardPng } from "../lib/exporters";
import MetricsRight from "./MetricsRight";

const METHODOLOGY_TIP =
  "SPICE DE440 ephemeris (< 0.05° vs JPL Horizons) + LOLA 80 m DEM horizon raytrace (validated vs Gläser et al. 2014: 92.27% at 2 m) · 10-min steps · 100 m slope baseline (< 10° Artemis rule) · 2° Earth DTE margin.";

const PREFS_STORAGE_KEY = "rimlight.metricPrefs.v1";

export const DEFAULT_METRIC_PREFS = {
  // Core (ON by default)
  sunPower: true,
  earthContact: true,
  darkBattery: true,
  // Optional Extra Metrics (OFF by default)
  landingCountdowns: false,
  energyBalance: false,
  powerCommsOverlap: false,
  annualsTerrain: false,
};

const CORE_PREF_ITEMS = [
  { key: "sunPower", label: "Sun & Power" },
  { key: "earthContact", label: "Earth Contact" },
  { key: "darkBattery", label: "Longest Dark & Battery" },
];

const EXTRA_PREF_ITEMS = [
  { key: "landingCountdowns", label: "At-Landing Countdowns" },
  { key: "energyBalance", label: "Energy Balance" },
  { key: "powerCommsOverlap", label: "Power + Comms Overlap" },
  { key: "annualsTerrain", label: "6-Year Annuals & Terrain" },
];

function loadMetricPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_METRIC_PREFS;
    return { ...DEFAULT_METRIC_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_METRIC_PREFS;
  }
}

export default function SiteDrawer({
  site,
  mode,
  metrics,
  cfg,
  setCfg,
  savedCompareSites = [],
  onToggleSaveCompare,
  onOpenCompare,
  onTimeFrameChange,
  onClose,
  onInspect2D,
  onView3D,
  onPickSite,
  onNearbyChange,
}) {
  const [metricPrefs, setMetricPrefs] = useState(loadMetricPrefs);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(metricPrefs));
    } catch {
      /* ignore quota errors */
    }
  }, [metricPrefs]);

  if (!site) return null;
  const inPolar = isInPolarMap(site.lat);
  const accent = site.isCustom ? "#38bdf8" : "#ff8c2b";
  const hasXY = site.x !== null && site.y !== null && inPolar;

  const compareId = site.isCustom ? metrics?.sid || null : site.id;
  const canSaveCompare = Boolean(compareId);
  const isSaved = Boolean(compareId && savedCompareSites.some((s) => s.id === compareId));
  const extraCount = EXTRA_PREF_ITEMS.filter((it) => metricPrefs[it.key]).length;
  const allExtrasOn = extraCount === EXTRA_PREF_ITEMS.length;

  const togglePref = (key) => {
    setMetricPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllExtras = () => {
    const nextVal = !allExtrasOn;
    setMetricPrefs((prev) => ({
      ...prev,
      sunPower: true,
      earthContact: true,
      darkBattery: true,
      landingCountdowns: nextVal,
      energyBalance: nextVal,
      powerCommsOverlap: nextVal,
      annualsTerrain: nextVal,
    }));
  };

  return (
    <aside className="hud-glass site-drawer" key={site.id}>
      <div className="drawer-header-stack">
        <div className="drawer-header">
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <div
              className="drawer-pin-badge"
              style={{
                background: site.isCustom ? "rgba(56,189,248,0.15)" : "rgba(255,140,43,0.15)",
                borderColor: site.isCustom ? "rgba(56,189,248,0.45)" : "rgba(255,140,43,0.45)",
              }}
            >
              <MapPin size={15} color={accent} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{site.name}</h2>
              <div className="drawer-coords mono">
                {formatCoord(site.lat, "N", "S", 2)} · {formatCoord(site.lon, "E", "W", 2)}
                {hasXY ? ` · (${(site.x / 1000).toFixed(1)}, ${(site.y / 1000).toFixed(1)}) km` : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              className={`hud-btn prefs-trigger-btn ${prefsOpen || extraCount > 0 ? "is-active" : ""}`}
              onClick={() => setPrefsOpen((o) => !o)}
              title="Customize Detailed Metrics"
              aria-label="Customize Detailed Metrics"
              aria-expanded={prefsOpen}
              style={{ width: 28, height: 28, position: "relative" }}
            >
              <SlidersHorizontal size={13} />
              {extraCount > 0 && <span className="prefs-count-dot mono">{extraCount}</span>}
            </button>
            <span className="info-tip" tabIndex={0} aria-label="Methodology details">
              <Info size={13} />
              <span className="info-tip-pop">{METHODOLOGY_TIP}</span>
            </span>
            {mode === "3d" && inPolar && (
              <button
                className="hud-btn"
                onClick={() => onInspect2D(site)}
                title="Inspect in 2D Polar Map"
                aria-label="Inspect in 2D Polar Map"
                style={{ width: 28, height: 28 }}
              >
                <MapIcon size={13} />
              </button>
            )}
            {mode === "2d" && (
              <button
                className="hud-btn"
                onClick={() => onView3D(site)}
                title="View on 3D Globe"
                aria-label="View on 3D Globe"
                style={{ width: 28, height: 28 }}
              >
                <Globe2 size={13} />
              </button>
            )}
            <button
              className="hud-btn"
              onClick={onClose}
              title="Close inspector"
              aria-label="Close inspector"
              style={{ width: 28, height: 28 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Save to Compare + Download Card action bar (works for both Curated and Custom sites within 80°S–90°S) */}
        {metrics?.inPole && (
          <div className="drawer-compare-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className={`save-compare-btn ${isSaved ? "is-saved" : ""}`}
                disabled={!canSaveCompare}
                onClick={() => onToggleSaveCompare?.(site, metrics)}
                title={
                  !canSaveCompare
                    ? "Waiting for raytrace ID…"
                    : isSaved
                      ? "Remove this site from Compare Sites"
                      : "Save this site to Compare Sites"
                }
              >
                {isSaved ? <BookmarkCheck size={12} /> : <BookmarkPlus size={12} />}
                <span>{!canSaveCompare ? "Resolving spot…" : isSaved ? "Saved ✓" : "+ Save to Compare"}</span>
              </button>
              <button
                type="button"
                className="save-compare-btn download-card-btn"
                disabled={!metrics?.mission?.data}
                onClick={() =>
                  downloadMissionCardPng({
                    site,
                    cfg,
                    mission: metrics?.mission?.data,
                    insights: metrics?.insights?.data,
                    pano: metrics?.pano,
                  })
                }
                title="Download high-resolution PNG Mission Briefing Card for slides or reports"
              >
                <Download size={11} />
                <span>Card (.png)</span>
              </button>
            </div>
            {savedCompareSites.length >= 2 && (
              <button
                type="button"
                className="open-compare-link mono"
                onClick={() => onOpenCompare?.()}
                title="Open side-by-side comparison matrix"
              >
                Compare ({savedCompareSites.length}) →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Customizable Detailed Metrics Popover Panel */}
      {prefsOpen && (
        <div className="drawer-card metrics-prefs-panel" role="region" aria-label="Detailed metrics settings">
          <div className="prefs-panel-head">
            <span className="section-title">Displayed Metrics</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="link-btn" onClick={toggleAllExtras}>
                {allExtrasOn ? "Reset Default" : "Show All"}
              </button>
              <button
                type="button"
                className="prefs-close-btn"
                onClick={() => setPrefsOpen(false)}
                aria-label="Close metrics settings"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="prefs-group-label">Core (Default ON)</div>
          <div className="prefs-grid">
            {CORE_PREF_ITEMS.map((item) => (
              <label key={item.key} className="pref-check-item">
                <input
                  type="checkbox"
                  checked={!!metricPrefs[item.key]}
                  onChange={() => togglePref(item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className="prefs-group-label" style={{ marginTop: 4 }}>
            Detailed Metrics (Optional)
          </div>
          <div className="prefs-grid">
            {EXTRA_PREF_ITEMS.map((item) => (
              <label key={item.key} className="pref-check-item">
                <input
                  type="checkbox"
                  checked={!!metricPrefs[item.key]}
                  onChange={() => togglePref(item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {metrics && (
        <MetricsRight
          site={site}
          metrics={metrics}
          cfg={cfg}
          setCfg={setCfg}
          metricPrefs={metricPrefs}
          onTimeFrameChange={onTimeFrameChange}
          onPickSite={onPickSite}
          onNearbyChange={onNearbyChange}
        />
      )}
    </aside>
  );
}
