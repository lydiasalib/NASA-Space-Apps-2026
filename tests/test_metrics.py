# test_metrics.py: el magamee3 bel zabt (sa3at, kWh, battery)
import sys
from pathlib import Path
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from config import STEP_S, SOLAR_CONST
import metrics as M

PER_DAY = 86400 // STEP_S          # 144


def fake(days, sun_pattern, earth_pattern):
    n = days * PER_DAY
    f = np.resize(np.array(sun_pattern, np.float32), n)
    e = np.resize(np.array(earth_pattern, bool), n)
    return {"sun_frac": f, "earth_vis": e}, np.ones(n, np.float32)


def test_full_sun_sums():
    arr, r = fake(14, [1.0], [True])
    m = M.mission(arr, r, 0, 14, load_w=100, panel_m2=1, eff=0.3)
    assert m["sun_hours"] == 336 and m["contact_hours"] == 336
    assert m["energy_generated_kwh"] == pytest.approx(SOLAR_CONST * 0.3 * 336 / 1000, rel=1e-4)
    assert m["energy_needed_kwh"] == pytest.approx(33.6)
    assert m["battery_needed_kwh"] == 0 and m["longest_dark_h"] == 0
    assert len(m["daily"]) == 14 and m["daily"][0]["sun_h"] == 24


def test_battery_is_the_longest_dark_when_sun_is_strong():
    # 12 h nour, 12 h dalma -> battery = 12 h x 100 W = 1.2 kWh
    half = PER_DAY // 2
    arr, r = fake(4, [1.0] * half + [0.0] * half, [True])
    m = M.mission(arr, r, 0, 4, load_w=100)
    assert m["longest_dark_h"] == 12
    assert m["battery_needed_kwh"] == pytest.approx(1.2, abs=1e-6)
    assert m["dark_hours"] == 48


def test_power_negative():
    arr, r = fake(3, [0.0], [False])
    m = M.mission(arr, r, 0, 3, load_w=50)
    assert not m["power_positive"] and m["energy_surplus_kwh"] == pytest.approx(-3.6)
    assert m["battery_needed_kwh"] == pytest.approx(3.6)
    assert m["at_landing"]["hours_to_first_sun"] is None


def test_sun_distance_scales_power():
    p1 = M.power_w(np.array([1.0]), np.array([1.0]), 1, 1)
    p2 = M.power_w(np.array([1.0]), np.array([2.0]), 1, 1)
    assert p1[0] == pytest.approx(4 * p2[0])


def test_hours_to_first_sun():
    arr, r = fake(2, [0.0] * 30 + [1.0] * 114, [True])
    m = M.mission(arr, r, 0, 1)
    assert m["at_landing"]["hours_to_first_sun"] == 5.0
    assert m["at_landing"]["sun_visible"] is False


def test_best_dates_pick_the_sunny_part():
    n = 60 * PER_DAY
    f = np.zeros(n, np.float32); f[30 * PER_DAY:44 * PER_DAY] = 1
    arr = {"sun_frac": f, "earth_vis": np.zeros(n, bool)}
    ks = M.best_dates(arr, np.ones(n, np.float32), 14, top=3)
    assert ks[0] == 30 * PER_DAY
    assert all(abs(a - b) >= 7 * PER_DAY for i, a in enumerate(ks) for b in ks[:i])


def test_best_dates_last_start_and_empty():
    arr, r = fake(14, [1.0], [True])
    assert M.best_dates(arr, r, 14) == [0]
    assert M.best_dates(arr, r, 15) == []


def test_score_bounds():
    best = M.site_score({"percent_sunlit": 100, "earth_contact_percent": 100, "longest_night_h": 0})
    worst = M.site_score({"percent_sunlit": 0, "earth_contact_percent": 0, "longest_night_h": 5000})
    assert best["score"] == 100 and worst["score"] == 0
    assert best["grade"] == "A" and worst["grade"] == "F"


def test_totals_psr():
    arr, r = fake(10, [0.0], [True])
    t = M.site_totals(arr, r)
    assert t["psr"] and t["class"] == "permanently shadowed" and t["sun_hours_total"] == 0


def test_artemis_check():
    pass_meta = {"earth_contact_percent": 39.5, "percent_sunlit": 84.3, "lat": -89.4667}
    pass_slope = {"slope_deg": 2.4}
    res = M.artemis_check(pass_meta, pass_slope)
    assert res["artemis_eligible"] is True
    assert res["artemis_rules"]["failed_reasons"] == []

    fail_meta = {"earth_contact_percent": 1.9, "percent_sunlit": 0.0, "lat": -82.0}
    fail_slope = {"slope_deg": 11.2}
    res_fail = M.artemis_check(fail_meta, fail_slope)
    assert res_fail["artemis_eligible"] is False
    assert len(res_fail["artemis_rules"]["failed_reasons"]) == 4
