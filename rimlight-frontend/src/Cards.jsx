// Cards.jsx: el countdowns (nafs el windows, bel wa2t bta3 el slider)
import { statusAt, fmtDur } from "./geometry";

export default function Cards({ site, wins, now }) {
  const s = statusAt(wins.sun, now), e = statusAt(wins.earth, now);
  const sunTxt = s.at == null ? "no change in loaded data" : s.inside ? `Sun sets in ${fmtDur(s.at - now)}` : `Sun rises in ${fmtDur(s.at - now)}`;
  const earthTxt = e.at == null ? "no change in loaded data" : e.inside ? `Contact lost in ${fmtDur(e.at - now)}` : `Contact returns in ${fmtDur(e.at - now)}`;
  return (
    <div className="cards">
      <div className="kpi sun"><small>Sun</small><b>{sunTxt}</b></div>
      <div className="kpi earth"><small>Earth link</small><b>{earthTxt}</b></div>
      <div className="kpi"><small>Longest night (6 yr)</small><b>{site.longest_night_h} h</b>
        <small className="muted">{site.percent_sunlit}% sunlit · {site.earth_contact_percent}% contact</small></div>
    </div>
  );
}
