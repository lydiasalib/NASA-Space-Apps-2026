# metrics.py: arqam bel zabt (sa3at, kWh) le mission (yom nenzel + kam yom), msh %
import numpy as np
from config import STEP_S, SOLAR_CONST, PANEL_AREA_M2, PANEL_EFF, LOAD_W
from stage3_vis import windows, longest

AU_KM = 149597870.7
H = STEP_S / 3600.0                           # step wa7da = kam sa3a (1/6)


def sun_dist_au(sun_vec):
    # masafet el shams bel AU kol step (bein 0.98 w 1.02 -> el power beyetghayar ~7%)
    return (np.linalg.norm(sun_vec, axis=1) / AU_KM).astype(np.float32)


def power_w(frac, r_au, panel_m2=PANEL_AREA_M2, eff=PANEL_EFF):
    # panel mewaggah lel shams: watt = 1361/r² × el 7etta el zahra × el mesa7a × el kafa2a
    return SOLAR_CONST / (r_au * r_au) * frac * panel_m2 * eff


def battery_needed_wh(p_w, load_w):
    # el battery tebda2 malyana. kol step: + shams - estehlak. el battery el lazma = akbar "nezool"
    cum = np.concatenate([[0.0], np.cumsum((p_w - load_w) * H)])
    return float((np.maximum.accumulate(cum) - cum).max())


def _hours_until(flag, k0, want=True):
    idx = np.flatnonzero(flag[k0:] == want)
    return None if idx.size == 0 else round(float(idx[0] * H), 1)


def mission(arr, r_au, k0, days, load_w=LOAD_W, panel_m2=PANEL_AREA_M2, eff=PANEL_EFF):
    # kol el magamee3 men step k0 le k0 + days
    n = int(round(days * 86400 / STEP_S))
    k1 = k0 + n
    frac = arr["sun_frac"][k0:k1].astype(np.float64)
    ev = arr["earth_vis"][k0:k1].astype(bool)
    lit = frac > 0
    p = power_w(frac, r_au[k0:k1], panel_m2, eff)
    gen_kwh = float(p.sum() * H / 1000)
    need_kwh = float(load_w * n * H / 1000)
    batt_kwh = battery_needed_wh(p, load_w) / 1000
    dark = longest(windows(~lit))
    black = longest(windows(~ev))
    full_sun = arr["sun_frac"]
    full_ev = arr["earth_vis"].astype(bool)

    # tafseel kol yom (lel chart)
    per = int(86400 / STEP_S)
    daily = []
    for d in range(int(np.ceil(n / per))):
        s = slice(d * per, min(n, (d + 1) * per))
        daily.append({"day": d + 1,
                      "sun_h": round(float(lit[s].sum() * H), 1),
                      "energy_kwh": round(float(p[s].sum() * H / 1000), 3),
                      "contact_h": round(float(ev[s].sum() * H), 1)})

    surplus = gen_kwh - need_kwh
    if surplus >= 0:
        verdict = (f"Power-positive: +{surplus:.1f} kWh over the mission. " +
                   (f"Carry at least {batt_kwh:.1f} kWh of battery to get through the longest dark ({dark:.0f} h)."
                    if batt_kwh > 0.05 else "Sun all the way: no night battery needed in this window."))
    else:
        verdict = (f"Power-negative: short by {-surplus:.1f} kWh. "
                   f"Use a bigger panel, a lower load, or another date/spot.")
    return {
        "days": days, "steps": n, "hours": round(n * H, 1),
        "sun_hours": round(float(lit.sum() * H), 1),
        "full_sun_hours": round(float((frac >= 0.999).sum() * H), 1),
        "contact_hours": round(float(ev.sum() * H), 1),
        "sun_and_contact_hours": round(float((lit & ev).sum() * H), 1),
        "dark_hours": round(float((~lit).sum() * H), 1),
        "blackout_hours": round(float((~ev).sum() * H), 1),
        "longest_dark_h": round(dark, 1),
        "longest_blackout_h": round(black, 1),
        "energy_generated_kwh": round(gen_kwh, 2),
        "energy_needed_kwh": round(need_kwh, 2),
        "energy_surplus_kwh": round(surplus, 2),
        "battery_needed_kwh": round(batt_kwh, 2),
        "power_positive": surplus >= 0,
        "verdict": verdict,
        "at_landing": {
            "sun_visible": bool(lit[0]) if n else None,
            "earth_visible": bool(ev[0]) if n else None,
            "hours_to_first_sun": _hours_until(full_sun > 0, k0, True),
            "hours_to_first_contact": _hours_until(full_ev, k0, True),
            "hours_to_first_sunset": _hours_until(full_sun > 0, k0, False) if lit[0] else 0.0,
        },
        "assumptions": {"load_w": load_w, "panel_m2": panel_m2, "panel_eff": eff,
                        "panel": "sun-tracking, mounted on the mast",
                        "solar_constant_w_m2": SOLAR_CONST, "sun_distance": "exact per step (SPICE)",
                        "earth_margin_deg": 2.0},
        "daily": daily,
    }


def best_dates(arr, r_au, days, by="energy", every_h=6, k_lo=0, k_hi=None, top=5, **kw):
    # nerateb kol bedaya momkena bel magmoo3 el 7a2i2i (cumsum -> sare3)
    n_all = len(arr["sun_frac"])
    k_hi = n_all if k_hi is None else min(k_hi, n_all)
    win = int(round(days * 86400 / STEP_S))
    if by == "energy":
        v = power_w(arr["sun_frac"].astype(np.float64), r_au)
    elif by == "contact":
        v = arr["earth_vis"].astype(np.float64)
    else:                                          # "sun": sa3at el shams
        v = (arr["sun_frac"] > 0).astype(np.float64)
    v = v + 1e-6 * arr["earth_vis"]                # tafreeq el motasaweyeen bel ard
    c = np.concatenate([[0.0], np.cumsum(v)])
    stride = max(1, int(every_h * 3600 / STEP_S))
    starts = np.arange(k_lo, k_hi - win + 1, stride)
    if starts.size == 0:
        return []
    vals = np.round(c[starts + win] - c[starts], 6)
    order = np.argsort(-vals, kind="stable")
    picked = []
    for i in order:                                # mawa3eed mesh fo2 ba3d (nos mission 3al a2al)
        if all(abs(starts[i] - s) >= max(1, win // 2) for s in picked):
            picked.append(int(starts[i]))
        if len(picked) == top:
            break
    return picked


# ---------------- 7agat sabta lel site ----------------
def slope_deg(dem, x, y, radius_m=200.0, baseline_m=100.0):
    # mail el ard: NASA Artemis landing standard = < 10 deg over a 100 m baseline
    from stage2_horizon import sample
    a, c0, r0 = dem.window(x, y, max(radius_m, baseline_m) + 3 * dem.px)
    half = baseline_m / 2.0
    hx = sample(dem, a, c0, r0, np.array([x - half, x + half]), np.array([y, y]))
    hy = sample(dem, a, c0, r0, np.array([x, x]), np.array([y - half, y + half]))
    gx0 = (float(hx[1]) - float(hx[0])) / baseline_m
    gy0 = (float(hy[1]) - float(hy[0])) / baseline_m
    at = float(np.degrees(np.arctan(np.hypot(gx0, gy0))))
    gy, gx = np.gradient(a, dem.px)
    s = np.degrees(np.arctan(np.hypot(gx, gy)))
    c, r = dem.inv * (x, y)
    ci, ri = c - 0.5 - c0, r - 0.5 - r0
    rr, cc = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    near = np.hypot(rr - ri, cc - ci) * dem.px <= radius_m
    if not np.isfinite(at):
        at = float(s[int(round(ri)), int(round(ci))])
    return {"slope_deg": round(at, 1), "max_slope_200m_deg": round(float(np.nanmax(s[near])), 1),
            "baseline_m": round(baseline_m), "safe_for_landing": bool(at < 10.0),
            "limit_deg": 10.0}


def artemis_check(meta, slope_info):
    earth_pct = float(meta.get("earth_contact_percent", 0.0))
    sun_pct = float(meta.get("percent_sunlit", 0.0))
    slope_val = float(slope_info.get("slope_deg", 0.0))
    lat_val = float(meta.get("lat", -90.0))
    rules = {
        "earth_ok": bool(earth_pct >= 25.0),
        "sun_ok": bool(sun_pct >= 5.0),
        "slope_ok": bool(slope_val < 10.0),
        "lat_ok": bool(lat_val <= -84.0),
    }
    failed = []
    if not rules["earth_ok"]:
        failed.append(f"Earth contact {earth_pct:.1f}% < 25%")
    if not rules["sun_ok"]:
        failed.append(f"Sunlit {sun_pct:.1f}% < 5%")
    if not rules["slope_ok"]:
        failed.append(f"Slope {slope_val:.1f}° ≥ 10°")
    if not rules["lat_ok"]:
        failed.append(f"Lat {lat_val:.2f}° > -84°")
    return {
        "artemis_eligible": all(rules.values()),
        "artemis_rules": {
            **rules,
            "earth_contact_percent": round(earth_pct, 1),
            "percent_sunlit": round(sun_pct, 1),
            "slope_deg": round(slope_val, 1),
            "lat": round(lat_val, 4),
            "failed_reasons": failed,
        },
    }


def site_totals(arr, r_au, load_w=LOAD_W):
    frac = arr["sun_frac"].astype(np.float64)
    lit = frac > 0
    ev = arr["earth_vis"].astype(bool)
    years = len(frac) * STEP_S / (365.25 * 86400)
    p = power_w(frac, r_au)
    sun_pct = lit.mean() * 100
    return {
        "years": round(years, 2),
        "sun_hours_total": round(float(lit.sum() * H)),
        "sun_hours_per_year": round(float(lit.sum() * H / years)),
        "contact_hours_per_year": round(float(ev.sum() * H / years)),
        "energy_kwh_per_year": round(float(p.sum() * H / 1000 / years), 1),
        "psr": bool(not lit.any()),
        "class": ("permanently shadowed" if not lit.any() else
                  "near-permanent shadow" if sun_pct < 1 else
                  "peak of near-eternal light" if sun_pct >= 80 else
                  "well lit" if sun_pct >= 50 else "partly lit"),
    }


def site_score(meta):
    # 0..100: 40% shams + 30% ard + 30% (leil asghar a7san, 720 h = 30 yom = 0)
    sun = meta["percent_sunlit"] / 100
    earth = meta["earth_contact_percent"] / 100
    night = 1 - min(meta["longest_night_h"], 720) / 720
    total = 100 * (0.4 * sun + 0.3 * earth + 0.3 * night)
    sc = round(total, 1)
    grade = "A" if sc >= 80 else "B" if sc >= 65 else "C" if sc >= 50 else "D" if sc >= 35 else "F"
    return {"score": sc, "grade": grade,
            "parts": {"sun": round(40 * sun, 1), "earth": round(30 * earth, 1), "night": round(30 * night, 1)},
            "formula": "40 x sunlit fraction + 30 x Earth-contact fraction + 30 x (1 - min(longest night, 720 h)/720)"}


def quick_eval(dem, sun_v_h, earth_v_h, lat, lon, mast, max_km):
    # 7esba sare3a (kol sa3a, horizon 2orayeb) lel ba7th 3an no2ta a7san
    from stage1_ephem import azel
    from stage2_horizon import horizon_mask
    from stage3_vis import sun_fraction, earth_visible
    hz = horizon_mask(dem, lat, lon, mast=mast, max_km=max_km)
    if not np.isfinite(hz["h_site"]):
        return None
    h = (hz["h_site"] + mast) / 1000
    fr = sun_fraction(*azel(sun_v_h, lat, lon, h), hz["mask"])
    ev = earth_visible(*azel(earth_v_h, lat, lon, h), hz["mask"])
    return {"hz": hz, "sun_pct": float((fr > 0).mean() * 100), "earth_pct": float(ev.mean() * 100)}
