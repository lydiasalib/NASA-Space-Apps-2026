import { useMemo } from "react";
import { Globe2, Map as MapIcon, MapPin, Moon, Radio, Sun, X } from "lucide-react";
import { formatCoord, isInPolarMap } from "../lib/geo";
import { getHorizonProfile } from "../data/horizonProfiles";
import HorizonPanorama from "./HorizonPanorama";

export default function SiteDrawer({ site, mode, onClose, onInspect2D, onView3D }) {
  const inPolar = site ? isInPolarMap(site.lat) : false;
  const horizonData = useMemo(() => (site && inPolar ? getHorizonProfile(site) : null), [site, inPolar]);

  if (!site) return null;
  const accent = site.isCustom ? "#38bdf8" : "#ff8c2b";
  const hasXY = site.x !== null && site.y !== null && inPolar;
  const summary = horizonData?.summary;

  return (
    <aside className="hud-glass site-drawer" key={site.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: site.isCustom ? "rgba(56,189,248,0.15)" : "rgba(255,140,43,0.15)",
              border: `1px solid ${site.isCustom ? "rgba(56,189,248,0.45)" : "rgba(255,140,43,0.45)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MapPin size={17} color={accent} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>{site.name}</h2>
            <div style={{ fontSize: 12, color: "rgba(216,224,238,0.65)", marginTop: 2 }}>
              {site.region}
            </div>
          </div>
        </div>
        <button
          className="hud-btn"
          onClick={onClose}
          title="Close inspector"
          aria-label="Close inspector"
          style={{ width: 30, height: 30 }}
        >
          <X size={15} />
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "rgba(226,232,240,0.78)" }}>
        {site.note}
      </p>

      <div className="drawer-card mono" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="LATITUDE" value={formatCoord(site.lat, "N", "S")} strong />
        <Field label="LONGITUDE" value={formatCoord(site.lon, "E", "W")} strong />
        <Field label="STEREO X" value={hasXY ? `${site.x.toLocaleString()} m` : "—"} />
        <Field label="STEREO Y" value={hasXY ? `${site.y.toLocaleString()} m` : "—"} />
      </div>

      {mode === "3d" && (
        <button className="action-btn" disabled={!inPolar} onClick={() => onInspect2D(site)}>
          <MapIcon size={15} />
          {inPolar ? "Inspect in 2D Polar Map" : "Outside 2D polar map (60°S–90°S)"}
        </button>
      )}
      {mode === "2d" && (
        <button className="action-btn" onClick={() => onView3D(site)}>
          <Globe2 size={15} />
          View on 3D Globe
        </button>
      )}

      {inPolar && <HorizonPanorama data={horizonData} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="section-title">Site Illumination &amp; Comms Metrics</div>
        <MetricCard
          icon={<Sun size={16} color="#fbbf24" />}
          title="Sun Visibility"
          value={summary ? `${summary.sunPct}%` : "— %"}
          subtitle={hasXY ? `Ready for /site?x=${site.x}&y=${site.y}` : "Requires polar-map coordinate"}
        />
        <MetricCard
          icon={<Radio size={16} color="#38bdf8" />}
          title="Earth Contact"
          value={summary ? `${summary.earthPct}%` : "— %"}
          subtitle="Direct-to-Earth line-of-sight window"
        />
        <MetricCard
          icon={<Moon size={16} color="#a78bfa" />}
          title="Longest Night"
          value={summary ? `${summary.longestNightHrs} hrs` : "— hrs"}
          subtitle="Maximum continuous shadow duration"
        />
      </div>
    </aside>
  );
}

function Field({ label, value, strong }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "rgba(216,224,238,0.55)" }}>{label}</div>
      <div
        style={{
          fontSize: strong ? 13 : 12.5,
          fontWeight: strong ? 600 : 400,
          color: strong ? "#fff" : "#cbd5e1",
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MetricCard({ icon, title, value, subtitle }) {
  return (
    <div className="drawer-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{title}</div>
          <div style={{ fontSize: 11, color: "rgba(216,224,238,0.52)", marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}
