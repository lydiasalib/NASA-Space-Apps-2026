// App.jsx: el state el wa7eed (site + wa2t k) we kol el shashat beta2ra meno
import { useEffect, useMemo, useState } from "react";
import { get } from "./api";
import { timeOf, parseWins, statusAt } from "./geometry";
import MapPicker from "./MapPicker";
import SkyDial from "./SkyDial";
import HorizonView from "./HorizonView";
import WindowStrip from "./WindowStrip";
import TimeBar from "./TimeBar";
import Cards from "./Cards";

export default function App() {
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState(null);      // meta mn /sites aw /site
  const [hz, setHz] = useState(null);          // /horizon
  const [ts, setTs] = useState(null);          // /timeseries (30 yom)
  const [wins, setWins] = useState(null);      // sun / earth / both
  const [k, setK] = useState(0);               // EL WA2T: rakam el step gowa ts
  const [busy, setBusy] = useState("");
  const [realistic, setRealistic] = useState(false);

  useEffect(() => {
    get("/sites").then((s) => { setSites(s); if (s.length) setSite(s[0]); })
      .catch((e) => setBusy(String(e)));
  }, []);

  useEffect(() => {
    if (!site) return;
    const id = site.id;
    setBusy("Loading " + site.name + "...");
    Promise.all([
      get(`/horizon?site=${id}`),
      get(`/timeseries?site=${id}&days=30`),
      get(`/windows?site=${id}&body=sun`),
      get(`/windows?site=${id}&body=earth`),
      get(`/windows?site=${id}&body=both`),
    ]).then(([h, t, ws, we, wb]) => {
      setHz(h); setTs(t); setK(0);
      setWins({ sun: parseWins(ws.windows), earth: parseWins(we.windows), both: parseWins(wb.windows) });
      setBusy("");
    }).catch((e) => setBusy(String(e)));
  }, [site]);

  function pick(x, y) {
    setBusy("Computing this spot...");
    get(`/site?x=${x}&y=${y}`).then(setSite).catch((e) => setBusy(String(e)));
  }

  const ready = hz && ts && wins && ts.sun_az.length > 0;
  const now = ready ? timeOf(ts, k) : 0;
  const sun = ready && { az: ts.sun_az[k], el: ts.sun_el[k], frac: ts.sun_frac[k] };
  const earth = ready && { az: ts.earth_az[k], el: ts.earth_el[k], vis: ts.earth_vis[k] };

  // jump buttons: el step elly fih el 7ala el gaya
  const jumpTo = useMemo(() => (body) => {
    if (!ready) return;
    const s = statusAt(wins[body], now);
    if (s.at == null) return;
    const kk = Math.round((s.at - Date.parse(ts.t0)) / (ts.step_s * 1000));
    setK(Math.min(Math.max(kk, 0), ts.sun_az.length - 1));
  }, [ready, wins, now, ts]);

  return (
    <div className="app">
      <header>
        <b>RIMLIGHT</b> <span className="muted">Lunar south pole landing-site navigator</span>
        <span className="busy">{busy}</span>
      </header>
      <aside className="deck">
        {sites.map((s) => (
          <button key={s.id} className={site?.id === s.id ? "card on" : "card"} onClick={() => setSite(s)}>
            <div>{s.name}</div>
            <div className="muted">{s.percent_sunlit}% sunlit · {s.earth_contact_percent}% Earth</div>
          </button>
        ))}
      </aside>
      <main className="map"><MapPicker sites={sites} current={site} onPick={pick} /></main>
      <section className="side">
        {ready && <SkyDial mask={hz.mask} sun={sun} earth={earth} ts={ts} k={k} />}
        {ready && <Cards site={site} wins={wins} now={now} />}
      </section>
      <section className="bottom">
        {ready && (
          <>
            <HorizonView hz={hz} ts={ts} k={k} sun={sun} earth={earth} site={site} realistic={realistic} />
            <label className="muted"><input type="checkbox" checked={realistic} onChange={(e) => setRealistic(e.target.checked)} /> Realistic render</label>
            <WindowStrip ts={ts} wins={wins} k={k} setK={setK} />
            <TimeBar ts={ts} k={k} setK={setK} jumpTo={jumpTo} />
          </>
        )}
      </section>
    </div>
  );
}
