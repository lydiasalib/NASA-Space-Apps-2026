// TimeBar.jsx: el slider + play + jump buttons (kolohom beyghayaro k bs)
import { useEffect, useState } from "react";
import { timeOf, fmtTime } from "./geometry";

const SPEEDS = { "1 h/s": 6 / 60, "6 h/s": 36 / 60, "1 day/s": 144 / 60 };   // steps le kol frame (60 fps)

export default function TimeBar({ ts, k, setK, jumpTo }) {
  const [speed, setSpeed] = useState(0);
  const n = ts.sun_az.length;

  useEffect(() => {
    if (!speed) return;
    let acc = 0, id;
    const tick = () => {
      acc += speed;
      const whole = Math.floor(acc); acc -= whole;
      if (whole) setK((kk) => (kk + whole >= n - 1 ? 0 : kk + whole));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [speed, n, setK]);

  return (
    <div className="timebar">
      <span className="time">{fmtTime(timeOf(ts, k))}</span>
      <input type="range" min={0} max={n - 1} value={k} onChange={(e) => setK(+e.target.value)} />
      {Object.entries(SPEEDS).map(([lab, v]) => (
        <button key={lab} className={speed === v ? "on" : ""} onClick={() => setSpeed(speed === v ? 0 : v)}>{speed === v ? "Pause" : "Play " + lab}</button>
      ))}
      <button onClick={() => jumpTo("sun")}>Next sun change</button>
      <button onClick={() => jumpTo("earth")}>Next Earth change</button>
    </div>
  );
}
