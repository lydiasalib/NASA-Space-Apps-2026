import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, Eye, EyeOff, Globe2, Map as MapIcon, MapPin } from "lucide-react";
import MoonGlobe3D from "./components/MoonGlobe3D";
import SouthPoleViewer from "./components/SouthPoleViewer";
import SiteDrawer from "./components/SiteDrawer";
import CompareModal from "./components/CompareModal";
import { toApiTime } from "./lib/api";
import { useSiteMetrics } from "./lib/useSiteMetrics";
import { CURATED_SITES } from "./data/lunarSites";
import { makeSite } from "./lib/geo";

const QUICK_SITE_IDS = [
  { id: "connecting-ridge", label: "Connecting Ridge" },
  { id: "peak-near-shackleton", label: "Shackleton Rim" },
  { id: "shackleton-floor", label: "Shackleton Floor" },
  { id: "mons-mouton", label: "Mons Mouton" },
];

const SAVED_COMPARE_KEY = "rimlight.savedCompareSites.v1";

const DEFAULT_SAVED_COMPARE = [
  "connecting-ridge",
  "mons-mouton",
  "peak-near-shackleton",
  "shackleton-floor",
]
  .map((id) => {
    const s = CURATED_SITES.find((c) => c.id === id);
    return s ? { id: s.id, name: s.name, lat: s.lat, lon: s.lon, isCustom: false } : null;
  })
  .filter(Boolean);

function loadSavedCompare() {
  try {
    const raw = localStorage.getItem(SAVED_COMPARE_KEY);
    if (!raw) return DEFAULT_SAVED_COMPARE;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_SAVED_COMPARE;
  } catch {
    return DEFAULT_SAVED_COMPARE;
  }
}

export default function App() {
  const [mode, setMode] = useState("3d");
  const [selectedSite, setSelectedSite] = useState(null);
  const [nearbySpots, setNearbySpots] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [savedCompareSites, setSavedCompareSites] = useState(loadSavedCompare);
  const [mapFocus, setMapFocus] = useState(null);
  const [globeFocus, setGlobeFocus] = useState(null);
  const [activeTimeFrame, setActiveTimeFrame] = useState(null);
  const [showSitePins, setShowSitePins] = useState(true);
  const [sitesBarCollapsed, setSitesBarCollapsed] = useState(false);
  // settings el mission (mshtaraka bein el panel el shmal wel drawer)
  const [cfg, setCfg] = useState(() => ({
    start: new Date(Math.max(Date.now(), Date.UTC(2026, 10, 13))).toISOString().slice(0, 13) + ":00",
    days: 14,
    loadW: 100,
    panelM2: 1,
  }));
  const metrics = useSiteMetrics(selectedSite, cfg);

  useEffect(() => {
    setActiveTimeFrame(null);
  }, [cfg.start]);

  const sunState = useMemo(() => {
    if (activeTimeFrame?.atUtc) {
      return {
        atUtc: activeTimeFrame.atUtc,
        offsetH: activeTimeFrame.offsetH ?? 0,
      };
    }
    return {
      atUtc: toApiTime(cfg.start),
      offsetH: 0,
    };
  }, [activeTimeFrame, cfg.start]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_COMPARE_KEY, JSON.stringify(savedCompareSites));
    } catch {
      /* ignore quota errors */
    }
  }, [savedCompareSites]);

  const toggleSaveCompare = useCallback((site, siteMetrics) => {
    if (!site) return;
    const cid = site.isCustom ? siteMetrics?.sid || null : site.id;
    if (!cid) return;
    setSavedCompareSites((prev) => {
      if (prev.some((s) => s.id === cid)) {
        return prev.length <= 1 ? prev : prev.filter((s) => s.id !== cid);
      }
      const entry = {
        id: cid,
        name: site.isCustom
          ? `Spot (${Math.abs(site.lat).toFixed(2)}°S, ${Math.abs(site.lon).toFixed(1)}°${site.lon >= 0 ? "E" : "W"})`
          : site.name,
        lat: site.lat,
        lon: site.lon,
        isCustom: !!site.isCustom,
        summary: siteMetrics?.point?.data?.coverage === "full" ? siteMetrics.point.data : null,
      };
      return [...prev, entry];
    });
  }, []);

  const addSavedCompare = useCallback((entry) => {
    if (!entry?.id) return;
    setSavedCompareSites((prev) => (prev.some((s) => s.id === entry.id) ? prev : [...prev, entry]));
  }, []);

  const removeSavedCompare = useCallback((id) => {
    setSavedCompareSites((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }, []);

  // "better spot nearby" -> site gedeed w nroo7lo
  const pickSite = useCallback(
    (spot) => {
      const site = makeSite({ lat: spot.lat, lon: spot.lon });
      setSelectedSite(site);
      if (mode === "3d") setGlobeFocus({ lat: site.lat, lon: site.lon, nonce: Date.now() });
      else setMapFocus({ lat: site.lat, lon: site.lon, zoom: -4, nonce: Date.now() });
    },
    [mode]
  );

  const inspect2D = useCallback((site) => {
    if (site) {
      setSelectedSite(site);
      setMapFocus({ lat: site.lat, lon: site.lon, zoom: -7, nonce: Date.now() });
    } else {
      setMapFocus({ lat: null, lon: null, zoom: -8.75, nonce: Date.now() });
    }
    setMode("2d");
  }, []);

  const view3D = useCallback((site) => {
    setMode("3d");
    if (site) setGlobeFocus({ lat: site.lat, lon: site.lon, nonce: Date.now() });
  }, []);

  const quickSelectSite = useCallback(
    (idOrSite) => {
      if (typeof idOrSite === "object" && idOrSite !== null) {
        const curated = CURATED_SITES.find((s) => s.id === idOrSite.id) || null;
        const site = makeSite({ lat: idOrSite.lat, lon: idOrSite.lon, curated });
        if (!curated && idOrSite.name) site.name = idOrSite.name;
        setSelectedSite(site);
        if (mode === "3d") {
          setGlobeFocus({ lat: site.lat, lon: site.lon, nonce: Date.now() });
        } else {
          setMapFocus({ lat: site.lat, lon: site.lon, zoom: -7, nonce: Date.now() });
        }
        return;
      }
      const raw = CURATED_SITES.find((s) => s.id === idOrSite);
      if (!raw) return;
      const site = makeSite({ lat: raw.lat, lon: raw.lon, curated: raw });
      setSelectedSite(site);
      if (mode === "3d") {
        setGlobeFocus({ lat: site.lat, lon: site.lon, nonce: Date.now() });
      } else {
        setMapFocus({ lat: site.lat, lon: site.lon, zoom: -7, nonce: Date.now() });
      }
    },
    [mode]
  );

  return (
    <div className="app-root">
      <div className={`view-layer ${mode === "3d" ? "is-active" : ""}`}>
        <MoonGlobe3D
          active={mode === "3d"}
          selectedSite={selectedSite}
          nearbySpots={nearbySpots}
          sunState={sunState}
          showSitePins={showSitePins}
          onSelectSite={setSelectedSite}
          onInspect2D={inspect2D}
          focusRequest={globeFocus}
        />
      </div>
      <div className={`view-layer ${mode === "2d" ? "is-active" : ""}`}>
        <SouthPoleViewer
          active={mode === "2d"}
          selectedSite={selectedSite}
          nearbySpots={nearbySpots}
          showSitePins={showSitePins}
          onSelectSite={setSelectedSite}
          focusRequest={mapFocus}
        />
      </div>

      <div className="hud-glass mode-toggle" role="tablist" aria-label="View mode">
        <button
          role="tab"
          aria-selected={mode === "3d"}
          className={mode === "3d" ? "active" : ""}
          onClick={() => setMode("3d")}
        >
          <Globe2 size={14} /> 3D Globe
        </button>
        <button
          role="tab"
          aria-selected={mode === "2d"}
          className={mode === "2d" ? "active" : ""}
          onClick={() => setMode("2d")}
        >
          <MapIcon size={14} /> 2D Polar Map
        </button>
        <span className="mode-toggle-thumb" style={{ transform: `translateX(${mode === "3d" ? 0 : 100}%)` }} />
      </div>

      <div
        className={`hud-glass sites-quickbar ${sitesBarCollapsed ? "is-collapsed" : ""}`}
        role="group"
        aria-label="Quick-open South Pole sites"
      >
        <button
          type="button"
          className="sites-collapse-btn"
          aria-expanded={!sitesBarCollapsed}
          title={sitesBarCollapsed ? "Expand preset sites" : "Collapse preset sites"}
          onClick={() => setSitesBarCollapsed((v) => !v)}
        >
          <MapPin size={12} color="#ff8c2b" />
          <span>SITES</span>
          {sitesBarCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        {!sitesBarCollapsed &&
          QUICK_SITE_IDS.map((item) => {
            const isActive = selectedSite && !selectedSite.isCustom && selectedSite.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`sites-quick-pill ${isActive ? "is-active" : ""}`}
                onClick={() => quickSelectSite(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        <span className="quickbar-sep" />
        <button
          type="button"
          className={`sites-quick-pill pins-toggle-btn ${showSitePins ? "is-active" : ""}`}
          aria-pressed={showSitePins}
          title={showSitePins ? "Hide default site pins" : "Show default site pins"}
          onClick={() => setShowSitePins((v) => !v)}
        >
          {showSitePins ? <Eye size={12} /> : <EyeOff size={12} />}
          Pins
        </button>
        <button
          type="button"
          className={`sites-quick-pill compare-trigger ${compareOpen ? "is-active" : ""}`}
          onClick={() => setCompareOpen(true)}
        >
          <Columns3 size={12} />
          Compare Sites ({savedCompareSites.length})
        </button>
      </div>

      <SiteDrawer
        site={selectedSite}
        mode={mode}
        metrics={metrics}
        cfg={cfg}
        setCfg={setCfg}
        savedCompareSites={savedCompareSites}
        onToggleSaveCompare={toggleSaveCompare}
        onOpenCompare={() => setCompareOpen(true)}
        onTimeFrameChange={setActiveTimeFrame}
        onPickSite={pickSite}
        onNearbyChange={setNearbySpots}
        onClose={() => {
          setSelectedSite(null);
          setNearbySpots([]);
        }}
        onInspect2D={inspect2D}
        onView3D={view3D}
      />

      <CompareModal
        open={compareOpen}
        cfg={cfg}
        savedSites={savedCompareSites}
        onAddSavedSite={addSavedCompare}
        onRemoveSavedSite={removeSavedCompare}
        onClose={() => setCompareOpen(false)}
        onSelectSite={quickSelectSite}
      />
    </div>
  );
}
