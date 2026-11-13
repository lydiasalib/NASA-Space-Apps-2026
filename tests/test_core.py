# test_core.py: unit tests lel stage3_vis + shwayet checks 3al wa2t (run mn backend/: python -m pytest ../tests)
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from config import STEP_S, SUN_R_DEG, EARTH_MARGIN_DEG, N_RAYS, SOLAR_CONST, PANEL_AREA_M2, PANEL_EFF, LOAD_W, START_UTC
import stage3_vis as s3

T, F = True, False


# ---------------- windows ----------------
@pytest.mark.parametrize("flag, expected", [
    ([T] * 5, [(0, 5, T, T)]),
    ([F] * 5, []),
    ([T], [(0, 1, T, T)]),
    ([F], []),
    ([T, T], [(0, 2, T, T)]),
    ([F, F], []),
    ([T, F], [(0, 1, T, F)]),
    ([F, T], [(1, 2, F, T)]),
    ([T, F, T, F, T], [(0, 1, T, F), (2, 3, F, F), (4, 5, F, T)]),
    ([F, T, F, T, F], [(1, 2, F, F), (3, 4, F, F)]),
    ([F, T, T, F], [(1, 3, F, F)]),
    ([T, T, F, F, T, T, T], [(0, 2, T, F), (4, 7, F, T)]),
])
def test_windows(flag, expected):
    assert s3.windows(np.array(flag)) == expected
    assert s3.windows(flag) == expected                       # list input kaman


def test_windows_empty():
    # array fady (masalan days=0 fel timeseries) -> [] msh IndexError
    assert s3.windows(np.array([], bool)) == []


def test_windows_random_roundtrip():
    rng = np.random.default_rng(0)
    f = rng.random(5000) < 0.6
    rebuilt = np.zeros_like(f)
    for s, e, os_, oe in s3.windows(f):
        assert s < e
        rebuilt[s:e] = True
        assert os_ == (s == 0) and oe == (e == len(f))
    assert np.array_equal(rebuilt, f)


# ---------------- longest ----------------
def test_longest_closed_and_open():
    w = s3.windows(np.array([T, T, F, T, T, T, F, F, T, T, T, T]))
    # closed: (3,6) = 3 steps; open: (0,2) w (8,12) = 4 steps
    assert s3.longest(w, include_open=False) == pytest.approx(3 * STEP_S / 3600)
    assert s3.longest(w, include_open=True) == pytest.approx(4 * STEP_S / 3600)


def test_longest_only_open():
    w = s3.windows(np.array([T, T, F]))
    assert s3.longest(w, include_open=False) == 0.0
    assert s3.longest(w, include_open=True) == pytest.approx(2 * STEP_S / 3600)
    assert s3.longest([]) == 0.0


# ---------------- next_change ----------------
def test_next_change():
    f = np.array([T, T, F, F, T])
    assert s3.next_change(f, 0) == 2
    assert s3.next_change(f, 2) == 4
    assert s3.next_change(f, 4) is None                      # akher index
    assert s3.next_change(np.ones(10, bool), 3) is None      # mafish taghyeer


# ---------------- sun_fraction ----------------
FLAT = np.zeros(N_RAYS, np.float32)


def frac_at(dx_deg):
    el = np.atleast_1d(np.asarray(dx_deg, dtype=np.float64))
    return s3.sun_fraction(np.zeros_like(el), el, FLAT)


def test_sun_fraction_limits():
    assert frac_at(SUN_R_DEG)[0] == pytest.approx(1.0)
    assert frac_at(-SUN_R_DEG)[0] == pytest.approx(0.0, abs=1e-6)
    assert frac_at(0.0)[0] == pytest.approx(0.5, abs=1e-6)
    assert frac_at(5 * SUN_R_DEG)[0] == 1.0
    assert frac_at(-5 * SUN_R_DEG)[0] == 0.0
    assert frac_at(-1.0001 * SUN_R_DEG)[0] == 0.0             # ta7t el ofo2 shewaya -> msh "lit"


def test_sun_fraction_monotone_symmetric():
    x = np.linspace(-2, 2, 40001) * SUN_R_DEG
    f = frac_at(x)
    assert f.dtype == np.float32
    assert np.all((f >= 0) & (f <= 1))
    assert np.all(np.diff(f) >= -1e-7)
    assert np.allclose(f + f[::-1], 1.0, atol=1e-6)


def test_sun_fraction_float32_inputs():
    # el run_site beyb3at float32 (mn azel); el natiga lazem tefdal sa7 3and el 7ewaf
    el = np.array([-SUN_R_DEG, -0.5 * SUN_R_DEG, 0, SUN_R_DEG], np.float32)
    f = s3.sun_fraction(np.zeros(4, np.float32), el, FLAT)
    assert f[0] < 1e-6 and f[-1] > 1 - 1e-6 and f[2] == pytest.approx(0.5, abs=1e-5)


# ---------------- earth_visible ----------------
def test_earth_visible_margin():
    sky = np.full(N_RAYS, 1.0, np.float32)
    el = np.array([1.0 + EARTH_MARGIN_DEG - 1e-3, 1.0 + EARTH_MARGIN_DEG, 1.0 + EARTH_MARGIN_DEG + 1e-3])
    assert list(s3.earth_visible(np.zeros(3), el, sky)) == [F, F, T]
    assert list(s3.earth_visible(np.zeros(3), np.array([0.99, 1.01, 1.5]), sky, margin=0)) == [F, T, T]


# ---------------- skyline_at ----------------
def test_skyline_wraparound():
    m = np.zeros(N_RAYS, np.float32)
    m[-1] = 1.0                                             # 359.5 daraga
    assert s3.skyline_at(m, 359.5) == pytest.approx(1.0)
    assert s3.skyline_at(m, 359.75) == pytest.approx(0.5)
    assert s3.skyline_at(m, 359.9) == pytest.approx(0.2)
    assert s3.skyline_at(m, 0.0) == pytest.approx(0.0)
    assert s3.skyline_at(m, 360.0) == pytest.approx(0.0)
    assert s3.skyline_at(m, -0.25) == pytest.approx(0.5)
    assert s3.skyline_at(m, 719.75) == pytest.approx(0.5)
    assert s3.AZ_GRID[1] - s3.AZ_GRID[0] == pytest.approx(360 / N_RAYS)


# ---------------- stats ----------------
def test_stats_edges():
    n = 1000
    st = s3.stats(np.ones(n, np.float32), np.ones(n, bool))
    assert st["percent_sunlit"] == 100.0 and st["both_percent"] == 100.0
    st = s3.stats(np.zeros(n, np.float32), np.zeros(n, bool))
    assert st["percent_sunlit"] == 0.0 and st["earth_contact_percent"] == 0.0
    frac = np.array([0, 0.5, 1, 1], np.float32)
    ev = np.array([T, F, T, F])
    st = s3.stats(frac, ev)
    assert st["percent_sunlit"] == 75.0
    assert st["mean_sun_fraction"] == 62.5
    assert st["earth_contact_percent"] == 50.0
    assert st["both_percent"] == 25.0
    json.dumps(st)                                          # kollo python types


def test_stats_night_closed():
    frac = np.ones(100, np.float32)
    frac[10:16] = 0                                         # leil 6 steps = 1 sa3a
    assert s3.stats(frac, np.ones(100, bool))["longest_night_h"] == pytest.approx(6 * STEP_S / 3600, abs=0.05)


def test_stats_always_dark_not_zero_night():
    # site fe ma7ras dayem el dalma: "atwal leil 0 sa3a" ghalat
    st = s3.stats(np.zeros(1000, np.float32), np.zeros(1000, bool))
    assert st["longest_night_h"] > 0
    assert st["longest_blackout_h"] > 0


# ---------------- power / energy / battery ----------------
def test_power_energy():
    p = s3.power_w(np.array([0, 0.5, 1], np.float32))
    full = SOLAR_CONST * PANEL_AREA_M2 * PANEL_EFF
    assert np.allclose(p, [0, full / 2, full], rtol=1e-6)
    assert s3.energy_per_day_wh(np.ones(144, np.float32)) == pytest.approx(full * 24, rel=1e-6)
    assert s3.energy_per_day_wh(np.zeros(144, np.float32)) == 0.0


def test_battery_never_dark():
    assert s3.battery_wh(np.ones(1000, np.float32)) == 0.0


def test_battery_one_night():
    frac = np.ones(1000, np.float32)
    frac[100:112] = 0                                       # 12 steps = 2 h
    assert s3.battery_wh(frac) == pytest.approx(2 * STEP_S / 600 * LOAD_W)


def test_battery_always_dark():
    # dayman dalma -> battery msh momken tkoon 0 (aqal 7aga: kol el modda)
    n = 1000
    assert s3.battery_wh(np.zeros(n, np.float32)) >= n * STEP_S / 3600 * LOAD_W


def test_longest_day():
    frac = np.zeros(100, np.float32)
    frac[20:50] = 0.3
    assert s3.longest_day_h(frac) == pytest.approx(30 * STEP_S / 3600)


# ---------------- best_landing ----------------
WIN1 = int(86400 / STEP_S)                                   # yom wa7ed


def test_best_landing_short_series():
    assert s3.best_landing(np.ones(WIN1 - 1, np.float32), np.ones(WIN1 - 1, bool), days=1) == []


def test_best_landing_exact_length():
    # series = window bel zabt -> fe bedaya wa7da momkena (step 0)
    out = s3.best_landing(np.ones(WIN1, np.float32), np.ones(WIN1, bool), days=1)
    assert [b["start_step"] for b in out] == [0]


def test_best_landing_ties_prefer_earliest():
    # kol el bedayat motasaweya -> el a2dam (msh 7aga 3ashwa2eya mn roundoff)
    for n in (10 * WIN1, 50000, 315576):
        out = s3.best_landing(np.ones(n, np.float32), np.ones(n, bool), days=1)
        assert out[0]["start_step"] == 0


def test_best_landing_finds_peak_and_no_overlap():
    rng = np.random.default_rng(1)
    n = 30 * WIN1
    frac = (rng.random(n) < 0.3).astype(np.float32)
    frac[10 * WIN1: 11 * WIN1] = 1.0                         # yom kollo shams
    ev = rng.random(n) < 0.5
    out = s3.best_landing(frac, ev, days=1, every_h=1)
    assert out[0]["start_step"] == 10 * WIN1
    assert out[0]["sunlit_percent"] == 100.0
    ss = [b["start_step"] for b in out]
    assert len(out) == 3
    for i in range(3):
        for j in range(i + 1, 3):
            assert abs(ss[i] - ss[j]) >= WIN1                # mafish overlap
    stride = int(3600 / STEP_S)
    assert all(s % stride == 0 for s in ss)


def test_best_landing_earth_breaks_tie():
    n = 4 * WIN1
    frac = np.ones(n, np.float32)
    ev = np.zeros(n, bool)
    ev[2 * WIN1: 3 * WIN1] = True
    out = s3.best_landing(frac, ev, days=1, every_h=24)
    assert out[0]["start_step"] == 2 * WIN1 and out[0]["earth_percent"] == 100.0


def test_best_landing_every_h_below_step():
    # every_h asghar mn step wa7da -> msh crash
    n = 3 * WIN1
    out = s3.best_landing(np.ones(n, np.float32), np.ones(n, bool), days=1, every_h=0.05)
    assert len(out) >= 1


# ---------------- full_stats ----------------
def test_full_stats_keys_json():
    rng = np.random.default_rng(2)
    frac = np.clip(rng.normal(0.6, 0.5, 5000), 0, 1).astype(np.float32)
    ev = rng.random(5000) < 0.7
    st = s3.full_stats(frac, ev)
    for k in ("percent_sunlit", "mean_sun_fraction", "earth_contact_percent", "both_percent",
              "longest_night_h", "longest_blackout_h", "longest_day_h", "energy_wh_per_day",
              "battery_wh_for_load", "load_w"):
        assert k in st
    assert st["battery_wh_for_load"] == pytest.approx(st["longest_night_h"] * LOAD_W, abs=LOAD_W * 0.05 + 1)
    json.dumps(st)


# ---------------- wa2t: run_site / app / SPICE ----------------
def test_step_to_utc_matches_start():
    from run_site import step_to_utc
    assert step_to_utc(START_UTC + "Z", 0) == START_UTC + "Z"
    assert step_to_utc(START_UTC, 6) == "2026-11-13T01:00:00Z"


def test_step_to_utc_matches_spice():
    spice = pytest.importorskip("spiceypy")
    from stage1_ephem import load_kernels, make_times
    from run_site import step_to_utc
    load_kernels()
    ets = make_times()
    for k in (0, 1, 144, len(ets) // 2, len(ets) - 1):
        assert step_to_utc(START_UTC + "Z", k) == spice.et2utc(ets[k], "ISOC", 0) + "Z"


def test_app_iso_and_step_of():
    pytest.importorskip("fastapi")
    import app
    from run_site import step_to_utc
    for k in (0, 7, 315575):
        assert app.iso(k) == step_to_utc(START_UTC + "Z", k)
        assert app.step_of(app.iso(k), 10 ** 6) == k
    assert app.step_of("2026-11-13T00:04:59Z", 100) == 0
    assert app.step_of("2026-11-13T00:05:01Z", 100) == 1
    from fastapi import HTTPException
    for bad in ("2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z", "garbage"):   # bara el range -> 400 msh clamp
        with pytest.raises(HTTPException):
            app.step_of(bad, 100)


def test_app_step_of_naive_time():
    # el frontend momken yeb3at wa2t men gher "Z" -> lazem yet3amel UTC msh 500
    pytest.importorskip("fastapi")
    import app
    assert app.step_of("2026-11-13T01:00:00", 100) == 6


# ---------------- real DEM (skip law mafish file) ----------------
def _dem():
    from config import DEM_80
    if not Path(DEM_80).exists():
        pytest.skip("no LOLA DEM")
    from stage2_horizon import Dem
    return Dem(DEM_80)


def test_horizon_off_map_raises():
    # 3and el 7aga bta3et el map (lat -80, lon 0) el irtifa3 NaN -> lazem error msh natayeg NaN
    from stage2_horizon import horizon_mask
    with pytest.raises(ValueError):
        horizon_mask(_dem(), -80.0, 0.0)


def test_shadow_cache_bounded():
    from panorama import LocalTerrain
    lt = LocalTerrain(_dem(), -89.4667, -136.6667, 2000, 80.0)
    for a in range(0, 360, 10):
        lt.lit_grid(float(a), 1.0)
    assert len(lt._shadow) <= 16
