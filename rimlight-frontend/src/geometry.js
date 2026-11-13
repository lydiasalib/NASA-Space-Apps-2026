// geometry.js: el 7esabat el moshtaraka ben el shashat
export const D2R = Math.PI / 180;
export const EL_MIN = -3;   // nafs range el panorama PNG (el backend)
export const EL_MAX = 7;

// irtifa3 el ard fe etgah az (bein no2tein, w beyelef 3and 360)
export function skylineAt(mask, az) {
  const i = (((az % 360) + 360) % 360) / 0.5;
  const i0 = Math.floor(i) % mask.length;
  const i1 = (i0 + 1) % mask.length;
  const f = i - Math.floor(i);
  return mask[i0] * (1 - f) + mask[i1] * f;
}

// wa2t step k bel milliseconds
export const timeOf = (ts, k) => Date.parse(ts.t0) + k * ts.step_s * 1000;

// "6 d 4 h" aw "4 h 12 min"
export function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d > 0 ? `${d} d ${h} h` : `${h} h ${mm} min`;
}

export const fmtTime = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

// windows mn ISO l arqam (mara wa7da)
export const parseWins = (ws) => ws.map((w) => ({ start: Date.parse(w.start), end: Date.parse(w.end) }));

// gowa window? we emta yetghayar?
export function statusAt(wins, t) {
  for (const w of wins) {
    if (w.start <= t && t < w.end) return { inside: true, at: w.end };
    if (w.start > t) return { inside: false, at: w.start };
  }
  return { inside: false, at: null };
}
