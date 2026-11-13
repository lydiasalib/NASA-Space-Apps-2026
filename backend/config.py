# config.py: kol el arqam el sabta f makan wa7ed
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
KERNELS = DATA / "kernels"
LOLA = DATA / "lola"
OUT = DATA / "out"
OUT.mkdir(parents=True, exist_ok=True)

R_MOON_KM = 1737.4
R_MOON_M = 1737400.0

START_UTC = "2026-11-13T00:00:00"   # bedayet el data
YEARS = 6
STEP_S = 600                         # kol 10 dae2e2

N_RAYS = 720                         # shoa3 kol 0.5 daraga
MAX_KM = 200                         # tool el shoa3
MAST_M = 2.0                         # irtifa3 el antenna/el panels

SUN_R_DEG = 0.265                    # nos 2otr el shams
EARTH_MARGIN_DEG = 2.0               # hamesh aman lel ittisal (assumption bta3na)

DEM_80 = LOLA / "LDEM_80S_80MPP_ADJ.TIF"

# Stage 2 extra: el map el 20 m lel ard el orayeba (optional). None = msh mosta5dam.
# momken path local aw link mobasher mn NASA (rasterio beye2ra el 7etta elly me7tagha bs):
# FINE_DEM = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
FINE_DEM = None
FINE_KM = 15                         # el 20 m le awel 15 km bs

# Stage 3 extras: power
SOLAR_CONST = 1361.0                 # W/m2 3and masafet el ard mn el shams
PANEL_AREA_M2 = 1.0
PANEL_EFF = 0.30
LOAD_W = 100.0                       # estehlak el lander bel watt (assumption)
