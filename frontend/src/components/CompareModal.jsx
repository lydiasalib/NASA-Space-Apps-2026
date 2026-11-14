// CompareModal.jsx: moqarna ganb ba3d le 2+ saved landing sites (curated + custom spots)
import { useEffect, useMemo, useState } from "react";
import { Award, Check, Columns3, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { CURATED_SITES } from "../data/lunarSites";
import { Loading, Notice, fmt, fmtDur } from "./MetricCard";

export default function CompareModal({
  open,
  cfg,
  savedSites = [],
  onAddSavedSite,
  onRemoveSavedSite,
  onClose,
  onSelectSite,
}) {
  const [catalog, setCatalog] = useState([]);
  const [state, setState] = useState({ status: "idle", rows: [], error: null });

  // Load curated site catalog for quick-add chips
  useEffect(() => {
    if (!open) return;
    api
      .sites()
      .then((list) => {
        if (Array.isArray(list) && list.length) setCatalog(list);
      })
      .catch(() => {
        setCatalog(CURATED_SITES.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })));
      });
  }, [open]);

  const savedIdsKey = savedSites.map((s) => s.id).join(",");

  // Fetch /compare + /mission + /insights for all saved sites (curated + custom)
  useEffect(() => {
    if (!open || savedSites.length < 1) {
      setState({ status: "idle", rows: [], error: null });
      return undefined;
    }
    let dead = false;
    setState((s) => ({ ...s, status: "loading", error: null }));

    const runCompare = async () => {
      // Warm any custom points first so backend SITES cache has them registered
      const customEntries = savedSites.filter((s) => s.isCustom || String(s.id).startsWith("pt_"));
      if (customEntries.length > 0) {
        await Promise.all(
          customEntries.map((c) => api.point(c.lat, c.lon).catch(() => null))
        );
      }
      const ids = savedSites.map((s) => s.id);
      const [summaryList, extras] = await Promise.all([
        api.compare(ids).catch(async () => {
          // Fallback to saved summary metadata if offline
          return savedSites.map((s) => s.summary || s);
        }),
        Promise.all(
          ids.map((id) =>
            Promise.all([
              api.mission(id, cfg).catch(() => null),
              api.insights(id).catch(() => null),
            ])
          )
        ),
      ]);
      if (dead) return;
      const byId = new Map((summaryList || []).filter(Boolean).map((item) => [item.id, item]));
      const rows = savedSites.map((saved, idx) => {
        const sum = byId.get(saved.id) || saved.summary || saved;
        return {
          ...sum,
          id: saved.id,
          name: saved.name || sum.name || saved.id,
          lat: saved.lat ?? sum.lat ?? -90,
          lon: saved.lon ?? sum.lon ?? 0,
          isCustom: !!saved.isCustom,
          mission: extras[idx]?.[0] || null,
          insights: extras[idx]?.[1] || null,
        };
      });
      setState({ status: "ready", rows, error: null });
    };

    runCompare().catch((e) => {
      if (!dead) setState({ status: "error", rows: [], error: e.message });
    });

    return () => {
      dead = true;
    };
  }, [open, savedIdsKey, cfg.start, cfg.days, cfg.loadW, cfg.panelM2, savedSites]);

  const metrics = useMemo(() => {
    const rows = state.rows;
    if (!rows.length) return [];
    const specs = [
      {
        key: "score",
        label: "Score / 100",
        get: (r) => r.insights?.score,
        better: "max",
        format: (v) => (v == null ? "—" : `${fmt(v, 1)} / 100`),
      },
      {
        key: "sun",
        label: "% Sunlit (6-yr)",
        get: (r) => r.percent_sunlit,
        better: "max",
        format: (v) => (v == null ? "—" : `${fmt(v, 1)}%`),
      },
      {
        key: "earth",
        label: "Earth Contact %",
        get: (r) => r.earth_contact_percent,
        better: "max",
        format: (v) => (v == null ? "—" : `${fmt(v, 2)}%`),
      },
      {
        key: "night",
        label: "Longest Night",
        get: (r) => r.longest_night_h,
        better: "min",
        format: (v) => fmtDur(v),
      },
      {
        key: "batt",
        label: `Battery Needed (${cfg.days} d)`,
        get: (r) => r.mission?.battery_needed_kwh,
        better: "min",
        format: (v) => (v == null ? "—" : `${fmt(v, 2)} kWh`),
      },
      {
        key: "surplus",
        label: `Energy Surplus (${cfg.days} d)`,
        get: (r) => r.mission?.energy_surplus_kwh,
        better: "max",
        format: (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${fmt(v, 1)} kWh`),
      },
      {
        key: "elev",
        label: "Elevation",
        get: (r) => r.h_site_m,
        better: "none",
        format: (v) => (v == null ? "—" : `${fmt(v, 0)} m`),
      },
    ];
    return specs.map((sp) => {
      const vals = rows.map(sp.get).filter((v) => Number.isFinite(v));
      const bestVal =
        sp.better === "max" && vals.length
          ? Math.max(...vals)
          : sp.better === "min" && vals.length
            ? Math.min(...vals)
            : null;
      return { ...sp, bestVal };
    });
  }, [state.rows, cfg.days]);

  if (!open) return null;

  const chipCatalog = catalog.length ? catalog : CURATED_SITES;
  const savedIdSet = new Set(savedSites.map((s) => s.id));
  const customSaved = savedSites.filter((s) => s.isCustom || !chipCatalog.some((c) => c.id === s.id));

  return (
    <div
      className="compare-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Compare lunar landing sites"
      onClick={onClose}
    >
      <div className="hud-glass compare-modal" onClick={(e) => e.stopPropagation()}>
        <header className="compare-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="compare-icon">
              <Columns3 size={17} color="#ff8c2b" />
            </div>
            <div>
              <div className="section-title">Side-by-Side Comparison ({savedSites.length} saved)</div>
              <h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, color: "#fff" }}>
                Lunar South Pole Candidate Matrix
              </h2>
            </div>
          </div>
          <button className="hud-btn" onClick={onClose} aria-label="Close comparison" style={{ width: 32, height: 32 }}>
            <X size={16} />
          </button>
        </header>

        {/* Saved & Curated site selector chips */}
        <div className="compare-chips">
          <span className="section-title" style={{ marginRight: 4 }}>
            Saved &amp; Curated:
          </span>
          {chipCatalog.map((s) => {
            const on = savedIdSet.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`sites-quick-pill compare-chip ${on ? "is-active" : ""}`}
                onClick={() => {
                  if (on) {
                    if (savedSites.length > 1) onRemoveSavedSite?.(s.id);
                  } else {
                    onAddSavedSite?.({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, isCustom: false });
                  }
                }}
              >
                {on ? <Check size={11} style={{ marginRight: 4 }} /> : <Plus size={11} style={{ marginRight: 4, opacity: 0.65 }} />}
                {s.name}
              </button>
            );
          })}
          {customSaved.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sites-quick-pill compare-chip compare-chip-custom is-active"
              onClick={() => {
                if (savedSites.length > 1) onRemoveSavedSite?.(s.id);
              }}
              title="Click to remove custom saved site from comparison"
            >
              <Check size={11} style={{ marginRight: 4 }} />
              {s.name}
              <X size={11} style={{ marginLeft: 5, opacity: 0.75 }} />
            </button>
          ))}
        </div>

        <div className="compare-sub mono">
          Mission window: {cfg.days} days · {cfg.loadW} W load · {cfg.panelM2} m² panel · best metric highlighted in green
        </div>

        {state.status === "loading" && !state.rows.length && <Loading text="Fetching /compare + mission sums…" />}
        {state.status === "error" && <Notice tone="bad">{state.error}</Notice>}

        {state.rows.length > 0 && (
          <div className={`compare-table-wrap ${state.status === "loading" ? "is-stale" : ""}`}>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {state.rows.map((r) => (
                    <th key={r.id}>
                      <div className="compare-th-box">
                        <button
                          type="button"
                          className={`compare-site-btn ${r.isCustom ? "is-custom" : ""}`}
                          onClick={() => {
                            onSelectSite?.(r);
                            onClose?.();
                          }}
                          title="Open this site on the Moon"
                        >
                          <span>{r.name}</span>
                          <span className="compare-coords mono">
                            {Math.abs(r.lat).toFixed(2)}°S, {Math.abs(r.lon).toFixed(2)}°{r.lon >= 0 ? "E" : "W"}
                          </span>
                        </button>
                        {savedSites.length > 1 && (
                          <button
                            type="button"
                            className="compare-remove-btn"
                            onClick={() => onRemoveSavedSite?.(r.id)}
                            title={`Remove ${r.name} from comparison`}
                            aria-label={`Remove ${r.name} from comparison`}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((row) => (
                  <tr key={row.key}>
                    <td className="compare-metric-label">{row.label}</td>
                    {state.rows.map((r) => {
                      const raw = row.get(r);
                      const isBest =
                        state.rows.length >= 2 &&
                        row.bestVal !== null &&
                        Number.isFinite(raw) &&
                        Math.abs(raw - row.bestVal) < 1e-6;
                      return (
                        <td key={r.id} className={`mono compare-cell ${isBest ? "is-best" : ""}`}>
                          <span>{row.format(raw)}</span>
                          {isBest && <Award size={12} color="#34d399" className="compare-best-icon" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
