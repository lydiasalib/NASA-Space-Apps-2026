# stage3_vis.py: el shams zahra? el ard zahra? emta beyetghayar?
import numpy as np
from config import N_RAYS, SUN_R_DEG, EARTH_MARGIN_DEG, STEP_S

AZ_GRID = np.arange(N_RAYS) * 360.0 / N_RAYS        # 0, 0.5, 1, ... 359.5


def skyline_at(mask, az):
    # irtifa3 el ard fe etgah az (bein no2tein, w beyelef 3and 360)
    return np.interp(az, AZ_GRID, mask, period=360)


def is_lit(sun_az, sun_el, mask):
    # awel test: markaz el shams foo2 el skyline?
    return sun_el > skyline_at(mask, sun_az)


def sun_fraction(sun_az, sun_el, mask, r=SUN_R_DEG):
    # kam % mn 2orss el shams zaher (0..1)
    x = np.clip((sun_el - skyline_at(mask, sun_az)) / r, -1.0, 1.0)
    return (1.0 - (np.arccos(x) - x * np.sqrt(1.0 - x * x)) / np.pi).astype(np.float32)


def earth_visible(earth_az, earth_el, mask, margin=EARTH_MARGIN_DEG):
    return earth_el > skyline_at(mask, earth_az) + margin


def windows(flag):
    # ->  list of (start_idx, end_idx, open_start, open_end); end_idx = awel step ba3d ma ye2fel
    f = np.asarray(flag, dtype=np.int8)
    if f.size == 0:
        return []
    d = np.diff(f)
    starts = list(np.flatnonzero(d == 1) + 1)
    ends = list(np.flatnonzero(d == -1) + 1)
    open_start = bool(f[0])
    open_end = bool(f[-1])
    if open_start:
        starts = [0] + starts
    if open_end:
        ends = ends + [len(f)]
    out = []
    for i, (s, e) in enumerate(zip(starts, ends)):
        out.append((int(s), int(e), open_start and i == 0, open_end and i == len(starts) - 1))
    return out


def longest(wins, step_s=STEP_S, include_open=True):
    # atwal window bel sa3at. el maftoo7a msh kamla bas tool-ha a2al 7add, fa lazem ted5ol fel max
    # (law shelnaha, site dayem el dalma yetla3 "atwal leil = 0 sa3a")
    lens = [(e - s) * step_s / 3600 for s, e, os_, oe in wins if include_open or not (os_ or oe)]
    return max(lens) if lens else 0.0


def next_change(flag, k):
    # awel step ba3d k el 7ala betetghayar fih (None law mafish)
    idx = np.flatnonzero(flag[k:] != flag[k])
    return int(k + idx[0]) if idx.size else None


def stats(frac, earth_vis, step_s=STEP_S):
    lit = frac > 0
    both = lit & earth_vis
    return {
        "percent_sunlit": round(float(lit.mean() * 100), 2),
        "mean_sun_fraction": round(float(frac.mean() * 100), 2),   # mwazan bel 7etta el zahra
        "earth_contact_percent": round(float(earth_vis.mean() * 100), 2),
        "both_percent": round(float(both.mean() * 100), 2),
        "longest_night_h": round(longest(windows(~lit), step_s), 1),
        "longest_blackout_h": round(longest(windows(~earth_vis), step_s), 1),
    }


# ---------------- extras: power, mast, landing date ----------------
from config import SOLAR_CONST, PANEL_AREA_M2, PANEL_EFF, LOAD_W


def power_w(frac, area=PANEL_AREA_M2, eff=PANEL_EFF):
    # panel wa2ef (vertical) dayman mewaggah lel shams: el power = el shams × el 7etta el zahra
    return (SOLAR_CONST * frac * area * eff).astype(np.float32)


def energy_per_day_wh(frac, step_s=STEP_S, **kw):
    return float(power_w(frac, **kw).mean() * 24)              # mtawasset el yom


def battery_wh(frac, load_w=LOAD_W, step_s=STEP_S):
    # el battery lazem te3ish atwal leil (kamel) w el lander shaghal
    return float(longest(windows(frac <= 0), step_s) * load_w)


def longest_day_h(frac, step_s=STEP_S):
    return longest(windows(frac > 0), step_s)


def best_landing(frac, earth_vis, days=14, step_s=STEP_S, every_h=6):
    # ay yom nenzel feeh 3ashan awel `days` youm yekoon feeh a3la shams (w ard)?
    win = int(days * 86400 / step_s)
    score = (frac > 0).astype(np.float32) + 0.01 * earth_vis   # el shams awel 7aga, el ard bs tafreeq bein el motasaweyeen
    c = np.concatenate([[0.0], np.cumsum(score)])
    stride = max(1, int(every_h * 3600 / step_s))               # every_h asghar mn step -> 1
    starts = np.arange(0, len(frac) - win + 1, stride)           # +1: akher bedaya momkena
    vals = np.round((c[starts + win] - c[starts]) / win, 9)     # nshil roundoff el cumsum
    order = np.argsort(-vals, kind="stable")                    # el motasaweyeen -> el a2dam awel
    out = []
    for i in order:                                            # 3 a7san mawa3eed mesh orayebeen men ba3d
        if all(abs(starts[i] - s) > win for s, _ in out):
            out.append((int(starts[i]), float(vals[i])))
        if len(out) == 3:
            break
    return [{"start_step": s, "sunlit_percent": round(float((frac[s:s + win] > 0).mean() * 100), 1),
             "earth_percent": round(float(earth_vis[s:s + win].mean() * 100), 1)} for s, _ in out]


def full_stats(frac, earth_vis, step_s=STEP_S):
    s = stats(frac, earth_vis, step_s)
    s.update({
        "longest_day_h": round(longest_day_h(frac, step_s), 1),
        "energy_wh_per_day": round(energy_per_day_wh(frac, step_s), 1),
        "battery_wh_for_load": round(battery_wh(frac, step_s=step_s), 0),
        "load_w": LOAD_W,
    })
    return s
