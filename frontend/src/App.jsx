import { useCallback, useState } from "react";
import { Globe2, Map as MapIcon, MapPin } from "lucide-react";
import MoonGlobe3D from "./components/MoonGlobe3D";
import SouthPoleViewer from "./components/SouthPoleViewer";
import SiteDrawer from "./components/SiteDrawer";
import { CURATED_SITES } from "./data/lunarSites";
import { makeSite } from "./lib/geo";

const QUICK_SITE_IDS = [
  { id: "connecting-ridge", label: "Connecting Ridge" },
  { id: "peak-near-shackleton", label: "Shackleton Rim" },
  { id: "shackleton-floor", label: "Shackleton Floor" },
  { id: "mons-mouton", label: "Mons Mouton" },
];

export default function App() {
  const [mode, setMode] = useState("3d");
  const [selectedSite, setSelectedSite] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  const [globeFocus, setGlobeFocus] = useState(null);

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
    (id) => {
      const raw = CURATED_SITES.find((s) => s.id === id);
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
          onSelectSite={setSelectedSite}
          onInspect2D={inspect2D}
          focusRequest={globeFocus}
        />
      </div>
      <div className={`view-layer ${mode === "2d" ? "is-active" : ""}`}>
        <SouthPoleViewer
          active={mode === "2d"}
          selectedSite={selectedSite}
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

      <div className="hud-glass sites-quickbar" role="group" aria-label="Quick-open South Pole sites">
        <span className="sites-quickbar-label">
          <MapPin size={12} color="#ff8c2b" />
          SITES
        </span>
        {QUICK_SITE_IDS.map((item) => {
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
      </div>

      <SiteDrawer
        site={selectedSite}
        mode={mode}
        onClose={() => setSelectedSite(null)}
        onInspect2D={inspect2D}
        onView3D={view3D}
      />
    </div>
  );
}
