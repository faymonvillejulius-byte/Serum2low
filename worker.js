// HIGHSET — BLEAU CONDITIONS WORKER v16.6
// Physics-based model:
//   DRY:  Accumulated Penman evaporation since last rain ÷ rain water load
//   COND: VPD × temp-friction curve × dew-point condensation check
//   Aspect + elevation from OpenTopoData (pre-computed in KV via enrich_topo.js)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

const CACHE_TTL = 1200; // 20 min

// ── Physics constants ─────────────────────────────────────────────────────────
const LAT_BLEAU_RAD = 48.42 * Math.PI / 180; // Fontainebleau ~48.42°N
const ALBEDO_SANDSTONE = 0.32;                 // dry Fontainebleau quartz sandstone
const PSYCHRO = 0.067;                         // psychrometric constant kPa/°C
const T_FRICTION_PEAK = 4;                     // °C — rubber-on-sandstone friction peak

// ── Geological / Canopy Metadata ─────────────────────────────────────────────
// Fontainebleau sandstone is geologically homogeneous (quartz-arenite, ~5–8% porosity).
// The dominant differentiator between areas is canopy coverage (tree crown density):
//   0 = open ridge / clearing  → full solar + wind reach the rock
//   1 = light forest            → standard mixed Fontainebleau exposure (default)
//   2 = dense forest / valley  → rock strongly shaded, wind strongly attenuated
//
// Impact on dryScore:  dense canopy ≈ −30…−50% evaporation rate → much slower drying
// Impact on condScore: dense canopy lowers rock-surface temp + friction in humid conditions
// ── Canopy: tree density affecting solar + wind reaching the rock ─────────────
// 0 = open/plateau/Freifläche  1 = light mixed forest (default)  2 = dense forest/valley
// Keys match area_hierarchy_v4 sector labels exactly
const CANOPY_META = {
  // ── Open / plateau / Freifläche (0) ──────────────────────────────────────
  'Rocher Guichot':             0,  'Rocher des Potets':          0,
  'Rocher des Demoiselles':     0,  'Rocher de Bouligny':         0,
  'Rocher du Général':          0,  'Canche aux Merciers':        0,
  'Rocher Fin':                 0,  '91.1':                       0,
  '95.2':                       0,  'Apremont':                   0,
  'Cul de Chien':               0,  'Gros Sablons':               0,
  'Rocher Saint-Germain Est':   0,
  // ── Dense forest / sheltered valley (2) ──────────────────────────────────
  'Gorge aux Châts':            2,  'Roche aux Sabots':           2,
  'Franchard Hautes Plaines':   2,  'Franchard Isatis':           2,
  'Buthiers Canard':            2,  'Rocher de la Reine':         2,
  'Le Calvaire':                2,  'Cuvier':                     2,  // schattig
  'Cuvier Reconnaissance':      2,  // Senke
  // All other Fontainebleau sectors default to 1 (light mixed forest)
};

// ── Aspect overrides: expert-calibrated rock face direction (degrees, 0=N 90=E 180=S 270=W)
// Keys match area_hierarchy_v4 sector labels exactly
const ASPECT_OVERRIDES = {
  // ── Cuvier ────────────────────────────────────────────────────────────────
  'Cuvier':                       135,  // SE (Bas Cuvier), abgeschattet
  'Cuvier Bellevue':              180,  // S, Hügel
  'Cuvier Est':                   180,  // S
  'Cuvier Merveille':             180,  // S
  'Cuvier Ouest':                 135,  // SE, Hügel
  'Cuvier Rempart':               180,  // S, Hügel
  'Cuvier Petit Rempart':         180,  // S/N gemischt, S dominant
  'Cuvier Reconnaissance':        180,  // S, Senke
  // ── Apremont ──────────────────────────────────────────────────────────────
  'Apremont':                     315,  // NW, Plateau
  'Apremont Bizons':                0,  // N
  'Apremont Butte aux Dames':       0,  // N
  'Apremont Désert':                0,  // N
  'Apremont Envers':                0,  // N (Schattenseite)
  'Apremont Est':                  45,  // NE
  'Apremont Ouest':                 0,  // N
  'Apremont Portes du Désert':      0,  // N
  'Apremont Solitude':              0,  // N (= Vallon de la Solitude)
  'Apremont Sully':                 0,  // N (= Vallon de Sully)
  // ── Franchard ─────────────────────────────────────────────────────────────
  'Franchard Cuisinière':         315,  // NW, teilweise Plateau
  'Franchard Cuisinière Crêtes Sud': 135, // SE
  'Franchard Hautes Plaines':       0,  // N
  'Franchard Isatis':               0,  // N
  'Franchard Meyer':                0,  // N
  'Franchard Raymond':            180,  // S
  'Franchard Sablons':              0,  // N
  'Franchard Sablons Carriers':     0,  // N
  'Mont Aigu':                    180,  // S, Plateau
  // ── Nord Fontainebleau ────────────────────────────────────────────────────
  'Le Calvaire':                  180,  // S
  'Mont Ussy':                    180,  // S
  'Mont Ussy Est':                180,  // S
  "Roche d'Hercule":              180,  // S
  'Rocher Canon':                  90,  // E
  'Rocher Canon Ouest':            90,  // E
  'Rocher Saint-Germain Est':     112,  // ESE, Freifläche
  // ── Sud Fontainebleau ─────────────────────────────────────────────────────
  'Restant du Long Rocher':       112,  // ESE
  'Restant du Long Rocher Sud':   112,  // ESE
  "Rocher d'Avon":                112,  // ESE
  "Rocher d'Avon Est":            112,  // ESE
  // ── Larchant ──────────────────────────────────────────────────────────────
  'Dame Jouanne':                 180,  // S
  'Éléphant':                      90,  // E
  'Maunoury':                     180,  // S
  // ── Trois Pignons Ouest ───────────────────────────────────────────────────
  'Cul de Chien':                 180,  // S, Freifläche
  'Gorge aux Châts':              135,  // SE
  'Gros Sablons':                 135,  // SE
  'Gros Sablons Nord':            180,  // S
  'La Ségognole':                 270,  // W
  'Roche aux Oiseaux':             90,  // E
  'Roche aux Sabots':             270,  // W
  // ── Trois Pignons Sud ─────────────────────────────────────────────────────
  'Diplodocus':                   180,  // S
  'J.A. Martin':                  180,  // S
  'Rocher du Potala':             180,  // S
  'Rocher Fin':                   180,  // S, Plateau
  // ── Trois Pignons Est ─────────────────────────────────────────────────────
  'Bois Rond':                    180,  // S
  'Bois Rond Auberge':            225,  // SW
  'Canche aux Merciers':           90,  // E
  'Drei Zinnen':                  270,  // W
  'Rocher de la Reine':           270,  // W
  'Rocher du Télégraphe':          45,  // NE
};

// ── Terrain position: affects wind, humidity, effective sun exposure ──────────
// 0=Senke/valley  1=normal(default)  2=Hügel/elevated  3=Plateau/Freifläche
// Keys match area_hierarchy_v4 sector labels exactly
const TERRAIN_META = {
  // ── Senke / Tal (0) — cold air, low wind, humidity stays high ────────────
  'Cuvier':                  0,   // schattig, von Hügeln umgeben (Bas Cuvier)
  'Cuvier Reconnaissance':   0,   // Senke
  // ── Hügel / erhöht (2) — better sun + wind ────────────────────────────
  'Cuvier Bellevue':         2,   'Cuvier Ouest':        2,
  'Cuvier Rempart':          2,   'Franchard Cuisinière': 2,
  'Mont Aigu':               2,
  // ── Plateau / Freifläche (3) — max wind + drainage, fastest drying ───────
  'Apremont':                3,   'Cul de Chien':        3,
  'Rocher Fin':              3,   'Rocher Saint-Germain Est': 3,
};

// ── DryScore bias (additive, applied after physics calc) ──────────────────────
// Used to calibrate systematic under/over-scoring for well-understood sectors.
// KV admin overrides take precedence; these are code-level defaults.
const BIAS_META = {
  'Cuvier Rempart':  10,  // Hügel-S reliably tops the Cuvier cluster — nudge it up
  'Cuvier Bellevue':  5,  // similar Hügel position, slightly less sheltered
  'Canche aux Merciers': 5, // open E-facing, dries fast
};

function getCanopy(sectorLabel, ov = {})  { return ov[sectorLabel]?.canopy  ?? CANOPY_META[sectorLabel]      ?? 1;    }
function getAspect(sectorLabel, ov = {})  { return ov[sectorLabel]?.aspect  ?? ASPECT_OVERRIDES[sectorLabel] ?? null; }
function getTerrain(sectorLabel, ov = {}) { return ov[sectorLabel]?.terrain ?? TERRAIN_META[sectorLabel]     ?? 1;    }
function getDryBias(sectorLabel, ov = {}) { return ov[sectorLabel]?.bias    ?? BIAS_META[sectorLabel]        ?? 0;    }

async function loadAdminOverrides(store) {
  try { return (await store.get('admin:overrides', { type: 'json' })) || {}; }
  catch { return {}; }
}

// Returns [solarFactor, windFactor] from canopy level
function canopyFactors(level) {
  if (level === 0) return [1.25, 1.20]; // open: more direct sun + wind
  if (level >= 2) return [0.40, 0.35];  // dense forest: heavily blocked
  return [1.0, 1.0];
}

// Returns [solarFactor, windFactor, humidityDelta] from terrain position
function terrainFactors(level) {
  if (level === 0) return [0.80, 0.45, +10]; // Senke: less sun+wind, humidity higher
  if (level === 2) return [1.05, 1.20,  -3]; // Hügel: better sun+wind
  if (level === 3) return [1.07, 1.28,  -4]; // Plateau: max wind+sun, driest
  return [1.0, 1.0, 0];
}

// Combined area-factors weather snapshot (canopy × terrain, non-mutating)
function applyAreaFactors(w, canopy, terrain) {
  const [csf, cwf]      = canopyFactors(canopy);
  const [tsf, twf, rhd] = terrainFactors(terrain);
  const sf = csf * tsf;
  const wf = cwf * twf;
  if (sf === 1.0 && wf === 1.0 && rhd === 0) return w;
  return {
    ...w,
    radiation: Math.round((w.radiation || 0) * sf),
    directRad: Math.round((w.directRad || 0) * sf),
    wind:      Math.round((w.wind      || 0) * wf),
    humidity:  Math.min(100, Math.round((w.humidity || 70) + rhd)),
    _h: w._h ? {
      ...w._h,
      solar:  w._h.solar.map(v => Math.round(v * sf)),
      direct: w._h.direct.map(v => Math.round(v * sf)),
      wind:   w._h.wind.map(v  => Math.round(v * wf)),
      rh:     w._h.rh.map(v   => Math.min(100, Math.round(v + rhd))),
    } : w._h,
  };
}

// Backward-compat alias (terrain=1 = no terrain adjustment)
function applyCanopy(w, canopy) { return applyAreaFactors(w, canopy, 1); }

// ── Saturation vapor pressure [kPa] (Magnus formula, ±0.4°C accuracy) ─────────
function satVP(T) {
  return 0.61094 * Math.exp((17.625 * T) / (T + 243.04));
}

// ── Slope of saturation VP curve [kPa/°C] ─────────────────────────────────────
function deltaVP(T) {
  return 4098 * satVP(T) / Math.pow(T + 237.3, 2);
}

// ── Vapor Pressure Deficit [kPa] ──────────────────────────────────────────────
function calcVPD(T, rh) {
  return Math.max(0, satVP(T) * (1 - rh / 100));
}

// ── Dew point temperature [°C] ────────────────────────────────────────────────
function calcDewPoint(T, rh) {
  const lnEa = Math.log(Math.max(0.001, satVP(T) * rh / 100) / 0.61094);
  return (243.04 * lnEa) / (17.625 - lnEa);
}

// ── Day of year (1–365) from a date string "YYYY-MM-DDTHH:MM" ─────────────────
function dayOfYear(timeStr) {
  const d = new Date(timeStr.replace('T', ' ') + ':00+02:00');
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

// ── Solar tilt factor: irradiance on tilted surface / horizontal irradiance ────
// aspect: 0=N 90=E 180=S 270=W  |  slopeAngle: 80° = near-vertical rock face
// Returns multiplier ≥ 0 (can exceed 1 when surface directly faces sun)
function aspectTiltFactor(aspect, solarHour, doy, slopeAngle = 80) {
  const decl  = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI / 365 * (284 + doy));
  const omega  = (solarHour - 12) * 15 * Math.PI / 180; // hour angle
  const lat    = LAT_BLEAU_RAD;

  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(omega);
  if (sinAlt <= 0.02) return 0; // sun below / near horizon

  const cosZen = sinAlt;
  const sinZen = Math.sqrt(Math.max(0, 1 - cosZen * cosZen));

  // Solar azimuth from south → convert to azimuth from north (0=N 90=E)
  const azSouth = Math.atan2(
    Math.sin(omega),
    Math.sin(lat) * Math.cos(omega) - Math.cos(lat) * Math.tan(decl)
  );
  const azNorthRad = azSouth + Math.PI; // shift reference to north

  const slopeRad  = slopeAngle * Math.PI / 180;
  const aspectRad = aspect * Math.PI / 180;

  // Angle of incidence on tilted surface
  const cosTheta = cosZen * Math.cos(slopeRad)
                 + sinZen * Math.sin(slopeRad) * Math.cos(azNorthRad - aspectRad);

  if (cosTheta <= 0) return 0; // sun behind the face
  return cosTheta / cosZen;    // ratio to horizontal radiation
}

// ── Radiation on tilted surface [W/m²] from direct + diffuse components ────────
function tiledIrradiance(direct, global, aspect, solarHour, doy) {
  const diffuse   = Math.max(0, global - direct);
  const tilt      = aspectTiltFactor(aspect, solarHour, doy);
  const slopeRad  = 80 * Math.PI / 180;
  return Math.max(0, direct * tilt + diffuse * (1 + Math.cos(slopeRad)) / 2);
}

// ── Rock surface temperature [°C] ─────────────────────────────────────────────
// Energy balance: absorbed solar - convective/radiative cooling
function rockSurfaceTemp(tAir, solarW, windKmh) {
  const windMs = windKmh / 3.6;
  const hConv  = 5.7 + 3.8 * windMs; // convective coefficient W/m²K
  const hRad   = 5;                    // radiative coefficient W/m²K
  return tAir + solarW * (1 - ALBEDO_SANDSTONE) / (hConv + hRad);
}

// ── Evaporation rate from wet rock [mm/hour] — simplified Penman (no rs) ──────
// direct: direct beam W/m²  global: GHI W/m² (aspect-corrected outside)
function evapRate(T, rh, windKmh, solarW_tilted) {
  const u2    = (windKmh / 3.6) * Math.pow(2 / 10, 0.143); // 10m → 2m
  const vpd   = calcVPD(T, rh);
  const delta = deltaVP(T);
  // Net radiation: W/m² → mm/day (÷28.6) → mm/hour (÷24)
  const Rn = Math.max(0, solarW_tilted * (1 - ALBEDO_SANDSTONE)) / 28.6 / 24;
  // Penman: radiation term + aerodynamic term
  const E = (delta * Rn + PSYCHRO * u2 * vpd * 0.55) / (delta + PSYCHRO);
  return Math.max(0, E);
}

// ── Initial water load [evap-equivalent mm] from rain amounts ─────────────────
// Fontainebleau sandstone porosity 5–8%; recent rain weighted much higher
function rainWaterLoad(rain3, rain6, rain12, rain24, rain48) {
  const r3to6  = Math.max(0, rain6  - rain3);
  const r6to12 = Math.max(0, rain12 - rain6);
  const r12to24= Math.max(0, rain24 - rain12);
  const r24to48= Math.max(0, rain48 - rain24);
  const w = rain3 * 4.0 + r3to6 * 3.0 + r6to12 * 2.0 + r12to24 * 1.2 + r24to48 * 0.5;
  return Math.min(90, Math.max(0, w));
}

// ── KV accessor ─────────────────────────────────────────────────────────────
function kv(env) {
  return env.BLEAU;
}

// ── Haversine ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371,
    dLat = (lat2 - lat1) * Math.PI / 180,
    dLon = (lon2 - lon1) * Math.PI / 180,
    a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Wind direction label ─────────────────────────────────────────────────────
function windDirLabel(deg) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round((deg % 360) / 45) % 8];
}

// ── Style normalizer ─────────────────────────────────────────────────────────
function mapStyle(raw) {
  if (!raw) return 'other';
  // Already-normalised values (new KV format has steepness pre-normalised)
  const normalised = ['slab','wall','overhang','roof','traverse','other'];
  if (normalised.includes(raw)) return raw;
  // Map raw style names from bleau_kv_bulk style field
  const m = {
    Slab:     'slab',  slab:     'slab',
    Wall:     'wall',  wall:     'wall',
    Crack:    'wall',  crack:    'wall',
    Pillar:   'wall',  pillar:   'wall',
    Overhang: 'overhang', overhang: 'overhang',
    Prow:     'overhang',
    Roof:     'roof',  roof:     'roof',
    Traverse: 'traverse', traverse: 'traverse',
    Arete:    'other', Dyno: 'other',
  };
  return m[raw] || 'other';
}

// ── Parse size categories from bleau_kv_bulk format ──────────────────────────
// categories: ["150..154","155..159",...] or grade strings ["6a","6b"]
// We only care about the height-range ones (contains "..")
function parseSizes(categories, percentages) {
  if (!categories?.length || !percentages?.length) return [];
  const out = [];
  categories.forEach((cat, i) => {
    const s = String(cat);
    if (s.includes('..')) {
      const [lo, hi] = s.split('..').map(Number);
      if (!isNaN(lo) && !isNaN(hi)) {
        out.push({ min: lo, max: hi, percent: percentages[i] || 0 });
      }
    }
  });
  return out;
}

// ── Size match ───────────────────────────────────────────────────────────────
function getSizeScore(userHeight, sizes) {
  if (!sizes || !sizes.length || !userHeight) return null;
  const h = Number(userHeight);
  if (isNaN(h)) return null;
  for (const b of sizes) {
    if (h >= b.min && h <= b.max) return Math.round(b.percent);
  }
  // slightly outside range: interpolate toward nearest bucket
  const sorted = [...sizes].sort((a, b) => a.min - b.min);
  const first = sorted[0], last = sorted[sorted.length - 1];
  if (h < first.min && h >= first.min - 5) return Math.round(first.percent * 0.5);
  if (h > last.max && h <= last.max + 5) return Math.round(last.percent * 0.5);
  return 0;
}

// ── Weather fetch for a single lat/lon ───────────────────────────────────────
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,precipitation_probability,windspeed_10m,winddirection_10m,` +
    `relativehumidity_2m,temperature_2m,shortwave_radiation,direct_radiation,dewpoint_2m,weathercode` +
    // Ebene 2: real-time current values (15min resolution, more accurate than hourly)
    `&current=precipitation,rain,weathercode,windspeed_10m,winddirection_10m,` +
    `relativehumidity_2m,temperature_2m,shortwave_radiation,direct_radiation` +
    `&past_days=2&forecast_days=3&timezone=Europe%2FParis`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const d = await res.json();
  const h = d.hourly;
  const n = h.precipitation.length;

  // Find current hour index
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const pad = x => String(x).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
  let idx = h.time?.findIndex(t => t === nowStr);
  if (idx < 0) idx = Math.max(0, n - 1);

  const precip    = h.precipitation;
  const precipProb= h.precipitation_probability || [];
  const wind      = h.windspeed_10m;
  const windDeg   = h.winddirection_10m;
  const rh        = h.relativehumidity_2m;
  const temp      = h.temperature_2m;
  const solar     = h.shortwave_radiation  || [];
  const direct    = h.direct_radiation     || [];
  const dewp      = h.dewpoint_2m          || [];
  const wcode     = h.weathercode          || [];

  // Hour of day for each slot (for tilt factor calculation)
  const hourArr = (h.time || []).map(s => parseInt(s.split('T')[1] || '12', 10));

  // Rain accumulations (for drying physics — unchanged)
  const r1  = precip.slice(Math.max(0, idx - 1),  idx + 1).reduce((a, b) => a + b, 0);
  const r3  = precip.slice(Math.max(0, idx - 3),  idx + 1).reduce((a, b) => a + b, 0);
  const r6  = precip.slice(Math.max(0, idx - 6),  idx + 1).reduce((a, b) => a + b, 0);
  const r12 = precip.slice(Math.max(0, idx - 12), idx + 1).reduce((a, b) => a + b, 0);
  const r24 = precip.slice(Math.max(0, idx - 24), idx + 1).reduce((a, b) => a + b, 0);
  const r48 = precip.slice(Math.max(0, idx - 48), idx + 1).reduce((a, b) => a + b, 0);

  // Ebene 2: prefer current (15min) values over hourly averages
  const cur        = d.current || {};
  const curCode    = cur.weathercode         ?? wcode[idx]   ?? 0;
  const curPrecip  = cur.precipitation       ?? precip[idx]  ?? 0;
  const curWind    = cur.windspeed_10m       ?? wind[idx]    ?? 0;
  const curWindDeg = cur.winddirection_10m   ?? windDeg[idx] ?? 0;
  const curRh      = cur.relativehumidity_2m ?? rh[idx]      ?? 70;
  const curTemp    = cur.temperature_2m      ?? temp[idx]    ?? 15;
  const curSolar   = cur.shortwave_radiation ?? solar[idx]   ?? 0;
  const curDirect  = cur.direct_radiation    ?? direct[idx]  ?? 0;

  // Ebene 1: isRaining — nur aktuelle Bedingungen, KEIN akkumulierter r1-Fallback
  // Historische Regenmengen (r1–r48) fließen in die Trocknungsphysik ein, nicht in isRaining.
  // WMO codes: 0-48 = kein Niederschlag (0-3 klar/bewölkt, 45/48 Nebel)
  //            51+  = Nieselregen / Regen / Schnee / Schauer / Gewitter
  const pp2       = precipProb.length ? Math.max(...precipProb.slice(Math.max(0, idx - 1), idx + 2)) : 0;
  const isRaining = curCode >= 51    // WMO Niederschlagscode
                 || curPrecip > 0.05; // aktueller 15min-Niederschlag

  // Find last rain index and hours dry
  let lastRainIdx = -1;
  let hoursDry    = 0;
  if (!isRaining) {
    for (let i = idx; i >= Math.max(0, idx - 72); i--) {
      if (precip[i] > 0.05) { lastRainIdx = i; break; }
    }
    hoursDry = lastRainIdx < 0 ? 72 : idx - lastRainIdx;
  }

  // Day of year for solar calculations
  const doy     = h.time?.[idx] ? dayOfYear(h.time[idx]) : 180;
  const dewpNow = dewp[idx] != null ? dewp[idx] : calcDewPoint(curTemp, curRh);

  return {
    rain48:    Math.round(r48 * 10) / 10,
    rain24:    Math.round(r24 * 10) / 10,
    rain12:    Math.round(r12 * 10) / 10,
    rain6:     Math.round(r6  * 10) / 10,
    rain3:     Math.round(r3  * 10) / 10,
    isRaining,
    hoursDry,
    wind:      Math.round(curWind),
    windDeg:   curWindDeg,
    windDir:   windDirLabel(curWindDeg),
    humidity:  Math.round(curRh),
    temp:      Math.round(curTemp * 10) / 10,
    dewpoint:  Math.round(dewpNow * 10) / 10,
    radiation: Math.round(curSolar),
    directRad: Math.round(curDirect),
    code:      curCode,
    _h: { temp, rh, wind, solar, direct, precip, hour: hourArr, wcode },
    _idx:          idx,
    _lastRainIdx:  lastRainIdx,
    _doy:          doy,
  };
}

// ── Rainviewer rain radar (Ebene 3) ──────────────────────────────────────────
async function fetchRainviewerMaps() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json',
      { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function latLonToTile(lat, lon, z) {
  const n   = Math.pow(2, z);
  const x   = Math.floor((lon + 180) / 360 * n);
  const latR = lat * Math.PI / 180;
  const y   = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
  return { x, y };
}

// Returns true (radar echo = rain), false (no echo), null (API unavailable)
// Rainviewer tiles are 4-bit indexed PNGs. Map overlay always contributes ~13324
// non-background pixels per tile. Actual radar echo adds pixels on top of that.
const RV_MAP_BASELINE  = 13324;
const RV_RAIN_THRESHOLD = RV_MAP_BASELINE + 300; // extra 300 pixels = rain signal

async function checkRainviewerTile(maps, lat, lon) {
  try {
    const past = maps?.radar?.past;
    if (!past?.length) return null;
    const latest = past[past.length - 1];
    const host   = maps.host || 'https://tilecache.rainviewer.com';
    const { x, y } = latLonToTile(lat, lon, 12);  // zoom 12 ≈ 6km per tile
    const url    = `${host}${latest.path}/256/12/${x}/${y}/2/0_0.png`;
    const ctrl   = new AbortController();
    const t      = setTimeout(() => ctrl.abort(), 4000);
    const res    = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const buf    = new Uint8Array(await res.arrayBuffer());

    // Parse PNG chunks to find IDAT data and transparent palette index
    let pos = 8;
    const idatChunks = [];
    let bgNibble = 1;
    while (pos < buf.length - 12) {
      const len  = ((buf[pos]<<24)|(buf[pos+1]<<16)|(buf[pos+2]<<8)|buf[pos+3]) >>> 0;
      const type = String.fromCharCode(buf[pos+4],buf[pos+5],buf[pos+6],buf[pos+7]);
      const data = buf.subarray(pos+8, pos+8+len);
      if (type === 'tRNS') {
        for (let i = 0; i < data.length; i++) { if (data[i] === 0) { bgNibble = i; break; } }
      }
      if (type === 'IDAT') idatChunks.push(data);
      if (type === 'IEND') break;
      pos += 12 + len;
    }
    if (!idatChunks.length) return null;

    // Merge + decompress IDAT (PNG uses zlib/deflate)
    const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
    const merged   = new Uint8Array(totalLen);
    let off = 0;
    for (const c of idatChunks) { merged.set(c, off); off += c.length; }
    const ds     = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(merged); writer.close();
    const rawChunks = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) rawChunks.push(r.value);
    const raw = new Uint8Array(rawChunks.reduce((s, c) => s + c.length, 0));
    off = 0; for (const c of rawChunks) { raw.set(c, off); off += c.length; }

    // Count non-background pixels (4-bit indexed: 1 filter byte + 128 pixel bytes per row)
    let nonBg = 0;
    for (let row = 0; row < 256 && row * 129 < raw.length; row++) {
      const base = row * 129;
      for (let b = 1; b < 129 && base + b < raw.length; b++) {
        const byte = raw[base + b];
        if (((byte >> 4) & 0xF) !== bgNibble) nonBg++;
        if ((byte & 0xF) !== bgNibble) nonBg++;
      }
    }
    return nonBg > RV_RAIN_THRESHOLD;
  } catch { return null; }
}

// ── DRY SCORE (physics-based) ─────────────────────────────────────────────────
// Accumulated Penman evaporation since last rain vs initial water load from rain.
// Wind alignment with rock face modulates evap rate via tilt factor.
function calcDryScore(w, steepness, aspect, blendedMult = null) {
  if (w.isRaining || w.hoursDry === 0) return 0;

  const st = (steepness || '').toLowerCase();

  // Wall dries fastest (rain runs off, sun hits directly).
  // Overhang stays dry UNDER the roof during rain but exits get wet;
  // once wet it dries slower than wall (restricted airflow + sun).
  // Slab holds most water and dries slowest.
  const loadMult = blendedMult ?? (
    st === 'wall'                      ? 0.75
  : st === 'traverse'                  ? 0.85
  : st === 'slab'                      ? 1.55
  : st === 'overhang'                  ? 1.20
  : st === 'roof'                      ? 1.30
  : 1.0
  );

  const waterLoad = rainWaterLoad(w.rain3, w.rain6, w.rain12, w.rain24, w.rain48) * loadMult;

  // No meaningful rain → bone dry
  if (waterLoad < 0.3) return Math.min(100, 92 + Math.round(w.hoursDry / 15));

  // Accumulate hourly evaporation from last rain to now
  let evapAccum = 0;
  const h = w._h;
  const idx = w._idx;
  const lastRain = w._lastRainIdx;
  const doy = w._doy || 180;

  if (h && lastRain >= 0 && idx > lastRain) {
    for (let i = lastRain + 1; i <= idx && i < h.temp.length; i++) {
      const hr      = h.hour[i] + 0.5;           // midpoint of hour
      const glob    = h.solar[i]  || 0;
      const dir     = h.direct[i] || 0;
      // Aspect-corrected solar on the rock face
      const solarTilted = aspect != null && glob > 5
        ? tiledIrradiance(dir, glob, aspect, hr, doy)
        : glob * 0.5;                             // fallback: assume partial exposure
      evapAccum += evapRate(h.temp[i], h.rh[i], h.wind[i], solarTilted);
    }
  } else {
    // Fallback: approximate with current conditions × hours dry
    const solarEst = aspect != null && w.radiation > 5
      ? tiledIrradiance(w.directRad, w.radiation, aspect, new Date().getHours() + 0.5, doy)
      : w.radiation * 0.5;
    evapAccum = w.hoursDry * evapRate(w.temp, w.humidity, w.wind, solarEst);
  }

  const dryFraction = Math.min(1, evapAccum / waterLoad);
  let score = Math.round(dryFraction * 100);

  // Slab absorbs water deep → cap recovery
  if (st === 'slab') score = Math.min(score, 88);

  return Math.max(0, Math.min(100, score));
}

// ── DRYING FORECAST ───────────────────────────────────────────────────────────
// Returns { hours, dryAt, trajectory } where:
//   hours      = estimated hours until dry (0 = already dry, null = >72h)
//   dryAt      = Unix ms timestamp when dry (null if already dry or >72h)
//   trajectory = array of 25 dryPct values at 0h,3h,6h,...,72h (0–100)
function estimateDryingForecast(w, steepness, aspect) {
  const st = (steepness || '').toLowerCase();
  const loadMult = st === 'overhang' || st === 'roof' ? 0.35
                 : st === 'slab'                      ? 1.6
                 : 1.0;
  const waterLoad = rainWaterLoad(w.rain3, w.rain6, w.rain12, w.rain24, w.rain48) * loadMult;
  if (waterLoad < 0.3) return { hours: 0, dryAt: null, trajectory: null };

  const h = w._h;
  const idx = w._idx;
  const lastRain = w._lastRainIdx;
  const doy = w._doy || 180;
  const now = Date.now();

  // Rebuild current evap state (same as calcDryScore)
  let evapAccum = 0;
  if (h && lastRain >= 0 && idx > lastRain) {
    for (let i = lastRain + 1; i <= idx && i < h.temp.length; i++) {
      const hr  = h.hour[i] + 0.5;
      const glob = h.solar[i] || 0;
      const dir  = h.direct[i] || 0;
      const sol  = aspect != null && glob > 5 ? tiledIrradiance(dir, glob, aspect, hr, doy) : glob * 0.5;
      evapAccum += evapRate(h.temp[i], h.rh[i], h.wind[i], sol);
    }
  }
  if (evapAccum >= waterLoad) return { hours: 0, dryAt: null, trajectory: null };

  // Map WMO weathercode + solar to simplified icon key (used by frontend)
  // 0=sun 1=partly 2=cloud 3=rain 4=fog 5=snow 6=thunder 7=night
  function condIcon(code, solar) {
    if (!solar || solar <= 5) return 7; // night
    if (code === 0)                     return 0; // sun
    if (code <= 2)                      return 1; // partly
    if (code === 3)                     return 2; // cloud
    if (code >= 45 && code <= 48)       return 4; // fog
    if (code >= 71 && code <= 77)       return 5; // snow
    if (code >= 95)                     return 6; // thunder
    if (code >= 51)                     return 3; // rain/drizzle
    return 1;
  }

  // Project forward, capture trajectory + conditions every 3h (25 points: 0,3,6,...,72)
  let rolling = waterLoad - evapAccum;
  const toPct = r => Math.round(Math.min(100, Math.max(0, (1 - r / waterLoad) * 100)));
  const trajectory  = [toPct(rolling)];
  const conditions  = [{ ic: condIcon(h.wcode?.[idx] || 0, h.solar[idx] || 0), hr: h.hour[idx] }];
  let dryHour = null;
  let nextCheck = 3;

  for (let i = idx + 1; i < h.temp.length && (i - idx) <= 72; i++) {
    const elapsed = i - idx;
    const rain = h.precip[i] || 0;
    if (rain > 0.1) rolling = Math.max(rolling, rolling + rain * 2.0);
    const hr   = h.hour[i] + 0.5;
    const glob = h.solar[i] || 0;
    const dir  = h.direct[i] || 0;
    const sol  = aspect != null && glob > 5 ? tiledIrradiance(dir, glob, aspect, hr, doy) : glob * 0.5;
    rolling -= evapRate(h.temp[i], h.rh[i], h.wind[i], sol);
    if (rolling < 0) rolling = 0;

    if (rolling === 0 && dryHour === null) dryHour = elapsed;

    // Snapshot every 3h
    while (elapsed >= nextCheck && nextCheck <= 72) {
      trajectory.push(dryHour !== null ? 100 : toPct(rolling));
      conditions.push({ ic: condIcon(h.wcode?.[i] || 0, glob), hr: h.hour[i] });
      nextCheck += 3;
    }
  }
  // Pad to 25 points
  while (trajectory.length < 25) {
    trajectory.push(dryHour !== null ? 100 : trajectory[trajectory.length - 1] || 0);
    conditions.push(conditions[conditions.length - 1] || { ic: 7, hr: 0 });
  }

  return {
    hours:      dryHour,
    dryAt:      dryHour !== null ? now + dryHour * 3600000 : null,
    trajectory,
    conditions,
  };
}

// ── COND SCORE (physics-based) ────────────────────────────────────────────────
// Friction quality = VPD × temperature-friction curve × dew-point safety check.
// Rock surface temperature computed from energy balance (not just air temp).
function calcCondScore(w, steepness, dryScore, aspect) {
  if (dryScore === 0) return 0;

  const st  = (steepness || '').toLowerCase();
  const doy = w._doy || 180;
  const hr  = new Date().getHours() + 0.5;

  // Rock surface temperature (sun warms rock, wind cools it)
  const solarTilted = aspect != null && w.radiation > 5
    ? tiledIrradiance(w.directRad, w.radiation, aspect, hr, doy)
    : w.radiation * 0.5;
  const tRock = rockSurfaceTemp(w.temp, solarTilted, w.wind);

  // Condensation check: if rock is colder than dew point → moisture on surface
  const tdew  = w.dewpoint ?? calcDewPoint(w.temp, w.humidity);
  const dewMargin = tRock - tdew;
  if (dewMargin < 0) return 0;  // condensation on rock = zero grip

  // VPD score: primary friction driver (low VPD = humid air = poor grip)
  // 1.5 kPa = ideal threshold; < 0.3 kPa = very poor
  const vpd = calcVPD(w.temp, w.humidity);
  const vpdScore = Math.min(100, Math.round((vpd / 1.5) * 100));

  // Temperature-friction score: rubber on sandstone peaks at 2–5°C
  // Drops ~3 pts/°C from optimum, harder below freezing
  const tempDelta  = Math.abs(tRock - T_FRICTION_PEAK);
  const tempScore  = Math.max(0, Math.round(100 - tempDelta * 3.0));

  // Wind direction: continental dry winds (NE/E/SE) help grip,
  // Atlantic wet winds (W/SW) reduce it
  const dir = w.windDir;
  let windMod = 0;
  if (w.wind > 8) {
    if      (['NE','E','SE'].includes(dir) && w.wind > 15) windMod =  12;
    else if (['NE','E','SE'].includes(dir))                windMod =   6;
    else if (['W','SW'].includes(dir) && w.wind > 15)      windMod = -10;
    else if (['W','SW'].includes(dir))                     windMod =  -5;
  }

  // Steepness: overhang/roof less affected by humidity (holds less water)
  let stMod = 0;
  if (vpd < 0.6) {
    if (st === 'slab')                       stMod = -12;
    else if (st === 'overhang' || st === 'roof') stMod =  8;
  }

  // Near-condensation warning (dewMargin 0–3°C → strong grip penalty)
  const dewPenalty = dewMargin < 3 ? Math.round((1 - dewMargin / 3) * 50) : 0;

  // Combine: VPD 50%, temp 40%, wind + steepness 10%
  let score = Math.round(vpdScore * 0.50 + tempScore * 0.40 + windMod + stMod) - dewPenalty;

  // Hard cap by dryScore (wet rock can't have great grip regardless)
  if      (dryScore < 15) score = Math.min(score, dryScore);
  else if (dryScore < 35) score = Math.min(score, dryScore + 10);
  else if (dryScore < 60) score = Math.min(score, dryScore + 18);

  return Math.max(0, Math.min(100, score));
}

// ── CONFIDENCE INTERVAL (Nate Silver Direktive) ──────────────────────────────
// Returns { low, high, sigma } — Bayesian uncertainty range around dryScore.
// Base epistemic uncertainty: ±14%. Modulated by:
//   - Rain recency (hydrological lag unknown → wider interval)
//   - Hours dry (longer dry period → more predictable)
//   - Known canopy metadata (reduces structural uncertainty)
// The interval is NOT a symmetric ±; it's clamped to [0,100].
function calcConfidence(w, dryScore, canopy) {
  if (w.isRaining) return { low: 0, high: 0, sigma: 0 };
  let sigma = 14; // base ±14% epistemic uncertainty
  // Recent rain increases uncertainty (rock dries unevenly, model has less data)
  if      (w.rain24 > 20) sigma += 12;
  else if (w.rain24 > 10) sigma +=  8;
  else if (w.rain24 > 3)  sigma +=  4;
  // Long dry periods are more predictable
  if      (w.hoursDry > 72) sigma -= 6;
  else if (w.hoursDry > 48) sigma -= 4;
  else if (w.hoursDry >  6) sigma -= 2;
  // Known canopy meta reduces structural uncertainty (we model this area better)
  if (canopy != null && CANOPY_META[Object.keys(CANOPY_META).find(k => canopy === CANOPY_META[k]) ?? ''] != null) sigma -= 2;
  sigma = Math.max(5, Math.min(28, sigma));
  return {
    low:   Math.max(0,   dryScore - sigma),
    high:  Math.min(100, dryScore + sigma),
    sigma,
  };
}

// ── Dominant steepness in a sector ──────────────────────────────────────────
function dominantSteepness(problems) {
  const counts = {};
  problems.forEach(p => {
    const s = mapStyle(p.steepness) || mapStyle(p.style) || 'other';
    counts[s] = (counts[s] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'other';
}

// Weighted average of loadMult across all boulders in a sector.
// More accurate than a single dominant type for mixed sectors.
function blendedLoadMult(problems) {
  const MULTS = { wall: 0.75, traverse: 0.85, slab: 1.55, overhang: 1.20, roof: 1.30, other: 1.0 };
  if (!problems || !problems.length) return 1.0;
  let sum = 0;
  for (const p of problems) {
    const s = mapStyle(p.steepness) || mapStyle(p.style) || 'other';
    sum += (MULTS[s] ?? 1.0);
  }
  return sum / problems.length;
}

// ── Compute centroid from boulder coordinates ────────────────────────────────
function centroid(problems) {
  const coords = problems
    .map(p => p.coordinates)
    .filter(c => c && !isNaN(c[0]) && !isNaN(c[1]));
  if (!coords.length) return null;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  return { lat, lon };
}

// ── Logic reason string ──────────────────────────────────────────────────────
function makeLogicReason(w, dryScore, condScore, hoursDry) {
  const parts = [];
  if (w.isRaining) parts.push('regnet gerade');
  else if (hoursDry === 0) parts.push('soeben geregnet');
  else if (hoursDry < 6)   parts.push(`${hoursDry}h nach Regen`);
  else if (hoursDry < 24)  parts.push(`${hoursDry}h trocken`);
  else                     parts.push(`${hoursDry}h+ trocken`);

  if (w.rain24 > 20) parts.push(`starker Regen (${w.rain24}mm/24h)`);
  else if (w.rain6 > 2) parts.push(`Regen vor Kurzem (${w.rain6}mm/6h)`);

  if (w.radiation > 300) parts.push(`${w.radiation}W/m² Sonne`);
  if (w.wind > 15)       parts.push(`Wind ${w.wind}km/h ${w.windDir}`);

  parts.push(`Feuchte ${w.humidity}%`);
  parts.push(`${w.temp}°C`);

  return `DRY:${dryScore} COND:${condScore} - ${parts.join(', ')}`;
}

// ── Boulder description ───────────────────────────────────────────────────────
function generateBoulderDesc(pDry, pCond, pSteepness, pRawStyle, pW, sizes, sizeScore, userHeight) {
  const parts = [];
  const SEP = ' | ';
  const st = (pSteepness || '').toLowerCase();
  const rs = (pRawStyle || '').toLowerCase();

  // 1. Felszustand (DRY) — with specific rain amounts
  if (pDry === 0) {
    if (pW.isRaining) {
      const mm = pW.rain6 > 0 ? ` (${pW.rain6}mm/6h)` : '';
      parts.push(`Fels nass${mm}`);
    } else {
      parts.push(`Fels nass — ${pW.rain24}mm in 24h`);
    }
    // Overhang benefit even when raining
    if (st === 'overhang' || st === 'roof') {
      parts.push('Ueberhang: kaum direkt nass');
    }
  } else if (pDry >= 80) {
    const whys = [];
    if (pW.radiation > 350) whys.push(`${pW.radiation}W/m² Sonne`);
    if (pW.wind > 12) whys.push(`Wind ${pW.windDir} ${pW.wind}km/h`);
    if (pW.hoursDry >= 24) whys.push(`${pW.hoursDry}h trocken`);
    parts.push(`Optimal trocken${whys.length ? ' (' + whys.join(', ') + ')' : ''}`);
  } else if (pDry >= 60) {
    parts.push(`Gut trocken (${pW.hoursDry}h, ${pW.rain24}mm/24h)`);
  } else if (pDry >= 35) {
    parts.push(`Leicht feucht (${pW.rain6}mm/6h, ${pW.hoursDry}h)`);
  } else {
    parts.push(`Feucht — ${pW.rain6}mm/6h, ${pW.rain24}mm/24h`);
  }

  // 2. Grip (COND)
  if (pDry > 0) {
    if (pCond >= 80) {
      const gripWhy = pW.temp <= 14 && pW.temp >= 4
        ? `${pW.temp}C ideal` : pW.humidity < 50 ? `${pW.humidity}% trocken` : `${pW.humidity}% Feuchte`;
      parts.push(`Top Grip (${gripWhy})`);
    } else if (pCond >= 60) {
      parts.push(`Guter Grip (${pW.humidity}% Feuchte, ${pW.temp}C)`);
    } else if (pCond >= 35) {
      const why = pW.humidity > 80 ? `${pW.humidity}% zu feucht` : pW.temp > 22 ? `${pW.temp}C zu warm` : `${pW.humidity}%`;
      parts.push(`Grip reduziert (${why})`);
    } else if (pDry > 0) {
      parts.push(`Schlechter Grip (${pW.humidity > 80 ? pW.humidity + '% Feuchte' : pW.temp + 'C'})`);
    }
  }

  // 3. Steepness effect on current conditions
  if (pDry > 0) {
    if (st === 'slab') {
      parts.push(pDry < 50 ? 'Slab: Reibung stark reduziert' : pDry < 75 ? 'Slab: Reibung eingeschraenkt' : 'Slab: Reibung ok');
    } else if (st === 'overhang' || st === 'roof') {
      parts.push(pCond >= 60 ? 'Ueberhang: Power-Bedingungen' : 'Ueberhang: Zug-Route');
    } else if (rs === 'crack') {
      parts.push('Crack: Naesse in Rissen moeglich');
    } else if (rs === 'arete') {
      parts.push('Arete: Windexponiert');
    }
  }

  // 4. Size match
  if (sizes && sizes.length > 0 && userHeight) {
    if      (sizeScore >= 70) parts.push(`Groesse passt (${Math.round(sizeScore)}%)`);
    else if (sizeScore >= 35) parts.push(`Groesse ok (${Math.round(sizeScore)}%)`);
    else if (sizeScore > 0)   parts.push(`Groesse grenzwertig (${Math.round(sizeScore)}%)`);
    else                      parts.push(`Groesse unueblich fuer ${userHeight}cm`);
  }

  return parts.join(SEP);
}

// ── AI shared helpers ─────────────────────────────────────────────────────────
function fmtDryAt(a) {
  if (a.dryScore >= 100) return 'trocken';
  if (a.dryingHours === null) return '>72h';
  if (a.dryingHours === 0)   return '<1h';
  if (a.dryAt) {
    const t = new Date(a.dryAt), now = new Date();
    const hh = String(t.getHours()).padStart(2,'0'), mm = String(t.getMinutes()).padStart(2,'0');
    return t.toDateString() === now.toDateString() ? `heute ${hh}:${mm}` : `morgen ${hh}:${mm}`;
  }
  return `${a.dryingHours}h`;
}

// Gemini 2.0 Flash — primary AI (free tier: 15 req/min, 1M tokens/day)
async function geminiJson(prompt, env, maxTokens = 2500) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) { console.error('Gemini error:', res.status, await res.text()); return {}; }
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}

// Groq — kept as fallback
async function groqJson(prompt, env, maxTokens = 2500) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) { console.error('Groq error:', res.status, await res.text()); return {}; }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}

// ── Groq: AI area descriptions ────────────────────────────────────────────────
async function generateAreaDescriptions(areas, env) {
  if (!env.GEMINI_API_KEY && !env.GROQ_KEY) return {};

  // Build compact area data (fewer tokens)
  function windAngle(z, exposition) {
    if (!z.windDeg || exposition === 'gemischt') return null;
    const expDeg = { N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315 }[exposition] ?? null;
    if (expDeg === null) return null;
    const diff = Math.abs(((z.windDeg - expDeg) + 360) % 360);
    return Math.min(diff, 360 - diff); // 0=direkt, 180=abgewandt
  }

  const areaData = areas.slice(0, 12).map(a => {
    const z = a.zone ?? {};
    const wa = windAngle(z, a.exposition);
    const wEff = wa === null ? null : wa < 45 ? 'direkt' : wa < 90 ? 'streifend' : wa < 135 ? 'parallel' : 'abgewandt';
    return {
      n:      a.name,
      exp:    a.exposition,
      st:     a.dominant,
      ds:     a.dryScore,
      cs:     a.condScore,
      dry:    fmtDryAt(a),
      hDry:   z.hoursDry ?? 0,
      rain6:  z.rain6 ?? 0,
      raining: z.isRaining ? 1 : 0,
      temp:   z.temp,
      rh:     z.humidity,
      wind:   `${z.windDir} ${z.wind}km/h ${wEff||''}`.trim(),
    };
  });

  const prompt = `Du bist Kletterexperte in Fontainebleau. Schreibe für jedes Gebiet EINEN deutschen Satz (max 18 Wörter).

PFLICHT: Jeder Satz MUSS mit dem exakten Gebietsnamen (Feld "n") beginnen, gefolgt von " – ".
Beispielformat: "Bas Cuvier – Slab mit Nordexpo komplett nass, braucht mehr als zwei Tage."

Score-Regeln (ds entscheidet Ton):
- ds=0: nass wegen [Steepness + Expo]. Kein Trocknungsdatum.
- ds=1..49: [Steepness/Expo-Grund] bremst Trocknung, trocken [dry].
- ds=50..99: seit [hDry]h trocken, [konkreter Vorbehalt oder Grip-Hinweis].
- ds=100: seit [hDry]h perfekt trocken, [warum so schnell – Expo/Wind].

VERBOTEN: Jede Uhrzeit im Format HH:MM (zB 16:20, 21:00, 14:30) – NIEMALS verwenden! Nutze stattdessen: "morgen Nachmittag", "heute Abend", "übermorgen früh", "in ~Xh".
VERBOTEN: Prozentzahlen.
Steepness: slab=langsam, wall=mittel, overhang/roof=schnell trotz Regen.
Exposition: N/NW=feucht+schattig langsam, S/SE=sonnig schnell.

Gib NUR flaches JSON: {"Gebietsname": "Name – Satz.", ...}
Beispiel ds=0:   {"Bas Cuvier": "Bas Cuvier – Slab mit Nordexpo komplett nass, mehr als zwei Tage warten."}
Beispiel ds=40:  {"Roche d'Hercule": "Roche d'Hercule – Überhang-Kern trocknet, Zustieg noch feucht bis heute Abend."}
Beispiel ds=100: {"Cuvier": "Cuvier – seit achtzehn Stunden trocken, Südexpo und Wind halfen den Slabs."}

${JSON.stringify(areaData)}`;

  try {
    if (env.GEMINI_API_KEY) return await geminiJson(prompt, env, 1400);
    return await groqJson(prompt, env, 1400);
  } catch (e) {
    console.error('Area desc failed:', e.message);
    return {};
  }
}

// ── AI boulder descriptions (top 12 globally) ────────────────────────────────
async function generateBoulderDescriptions(areas, env) {
  if (!env.GEMINI_API_KEY && !env.GROQ_KEY) return {};

  // Collect top boulders, compact format
  const allBoulders = [];
  for (const area of areas) {
    const z = area.zone ?? {};
    for (const p of (area.problems || [])) {
      allBoulders.push({
        _r:   p.rankScore,
        n:    p.name,
        g:    p.grade,
        a:    area.name,           // area name → geographic context + uniqueness
        st:   p.steepness,
        pop:  p.popularity || 0,   // 0=unbekannt, >0=beliebter Klassiker
        ds:   p.dryScore,
        cs:   p.condScore,
        hDry: z.hoursDry ?? 0,    // Stunden seit letztem Regen
        rh:   z.humidity,
        t:    z.temp,
        r6:   z.rain6 ?? 0,
        rain: z.isRaining ? 1 : 0,
      });
    }
  }
  const top = allBoulders.sort((a,b) => b._r - a._r).slice(0, 12)
    .map(({ _r, ...rest }) => rest);

  // Assign a unique focus theme per boulder slot — forces Groq to describe different aspects
  const FOKUS = [
    'Griff-Zustand',      // #1
    'Stil-Technik',       // #2
    'Charakter & Klasse', // #3
    'Zustieg/Topout',     // #4
    'Wetter-Einfluss',    // #5
    'Trocknungs-Stand',   // #6
    'Reibung & Grip',     // #7
    'Besonderheit',       // #8
    'Empfehlung',         // #9
    'Heute-Tipp',         // #10
    'Popularität',        // #11
    'Bedingungs-Fazit',   // #12
  ];
  const numberedTop = top.map((b, i) => ({ '#': i + 1, fokus: FOKUS[i] ?? 'Zustand', ...b }));

  const prompt = `Du bist Kletterexperte in Fontainebleau. Schreibe für jeden Boulder EINEN deutschen Satz.

KERN-REGELN:
- MAX 12 Wörter pro Satz.
- KEINE Zahlen, Prozent oder Scores im Satztext.
- ds=0: Nass. ds=1-40: Feucht. ds=41-79: Bedingt. ds=80+: Gut.
- overhang/roof: Kern trocken, aber Zustieg und Topout oft noch nass.
- slab: Reibung leidet bei Feuchtigkeit stark.

EINZIGARTIGKEIT – PFLICHT:
Das Feld "fokus" gibt das EINZIGE erlaubte Thema vor. Beschreibe NUR diesen Aspekt:
- "Griff-Zustand" → Wie fühlen sich die Griffe an? Trocken, feucht, sandig?
- "Stil-Technik" → Welche Technik braucht dieser Boulder-Typ (overhang/slab)?
- "Charakter & Klasse" → Ist es ein Klassiker, Kult-Problem, selten besuchter Stein?
- "Zustieg/Topout" → Wie ist der Weg zum Boulder oder der Ausstieg?
- "Wetter-Einfluss" → Wie beeinflusst Temperatur oder Luftfeuchtigkeit (rh, t) die Session?
- "Trocknungs-Stand" → Wie weit ist der Boulder in der Trocknungsphase?
- "Reibung & Grip" → Qualität der Reibung auf dem Sandstein heute?
- "Besonderheit" → Was macht diesen Boulder einzigartig (Lage, Form, Name)?
- "Empfehlung" → Klarer Besuchs-Tipp: ja/nein/mit Vorbehalt?
- "Heute-Tipp" → Was ist heute der wichtigste praktische Hinweis für diesen Boulder?
- "Popularität" → Wird er heute voll sein oder eher leer (wegen Wetter/Bedingungen)?
- "Bedingungs-Fazit" → Lohnt sich der Boulder heute? Klares Ja/Nein/Vorbehalt als Satz.

Format: NUR flaches JSON {"Bouldernam": "Satz.", ...}
Beispiele (fokus variiert):
{"Morceau de Sable": "Sandstein-Textur trocken, Griffe greifen perfekt."}
{"Le Pilier": "Typischer Kult-Überhang – heute bedingt kletterbar."}
{"Orange Mécanique": "Zustieg noch feucht, Topout rutschig nach Regen."}
{"Le Statique": "Luftfeuchte hoch – Finger schwitzen stärker als sonst."}

Boulder-Daten:
${JSON.stringify(numberedTop)}`;

  try {
    if (env.GEMINI_API_KEY) return await geminiJson(prompt, env, 1200);
    return await groqJson(prompt, env, 1200);
  } catch (e) {
    console.error('Boulder desc failed:', e.message);
    return {};
  }
}

// ── normalize for search ─────────────────────────────────────────────────────
function normalize(s) {
  return s.toLowerCase()
    .replace(/[àáâ]/g,'a').replace(/[èéê]/g,'e')
    .replace(/[îï]/g,'i').replace(/[ôö]/g,'o')
    .replace(/[ùûü]/g,'u').replace(/[ç]/g,'c')
    .replace(/[^a-z0-9 ]/g,'');
}

// ── MAIN COMPUTE ─────────────────────────────────────────────────────────────
async function computeScored(env, userHeight) {
  const store = kv(env);
  const adminOv = await loadAdminOverrides(store);

  // 1. Load area_hierarchy (v4 first, legacy fallback)
  const hierRaw = await store.get('area_hierarchy_v4', { type: 'text' })
               || await store.get('area_hierarchy', { type: 'text' });
  if (!hierRaw) throw new Error('area_hierarchy nicht gefunden in KV');
  let hierarchy;
  try { hierarchy = JSON.parse(hierRaw); } catch (e) { throw new Error('area_hierarchy Parse-Fehler: ' + e.message); }

  // Flatten: collect all sectors (key, lat, lon, boulderCount, parent)
  const allSectors = [];
  for (const [parentName, parent] of Object.entries(hierarchy)) {
    for (const sector of (parent.sectors || [])) {
      allSectors.push({
        key:          sector.key,
        label:        sector.label || sector.key,
        lat:          sector.lat || parent.lat,
        lon:          sector.lon || parent.lon,
        boulderCount: sector.boulderCount || 0,
        parent:       parentName,
        aspect:       getAspect(sector.label || sector.key, adminOv) ?? sector.aspect ?? null,
        elevation:    sector.elevation ?? null,  // metres above sea level
      });
    }
  }
  if (!allSectors.length) throw new Error('Keine Sektoren in area_hierarchy');

  // 2. Fetch weather for 7 zones + Rainviewer radar maps in parallel
  const ZONES = [
    { id: 'nord',       lat: 48.448, lon: 2.638 },
    { id: 'nord_west',  lat: 48.443, lon: 2.515 },
    { id: 'center',     lat: 48.409, lon: 2.603 },
    { id: 'sw',         lat: 48.377, lon: 2.525 },
    { id: 'est',        lat: 48.405, lon: 2.725 },
    { id: 'sud',        lat: 48.285, lon: 2.594 },
    { id: 'ouest',      lat: 48.392, lon: 2.458 },
  ];

  const [zwRes, rvMaps] = await Promise.all([
    Promise.allSettled(ZONES.map(z => fetchWeather(z.lat, z.lon))),
    fetchRainviewerMaps(),
  ]);

  const weatherMap = {};
  let fallback = null;
  ZONES.forEach((z, i) => {
    if (zwRes[i].status === 'fulfilled') {
      weatherMap[z.id] = zwRes[i].value;
      if (!fallback) fallback = zwRes[i].value;
    }
  });
  if (!fallback) throw new Error('Wetterdaten nicht verfügbar');
  ZONES.forEach(z => { if (!weatherMap[z.id]) weatherMap[z.id] = fallback; });

  // Ebene 3: Rainviewer radar tiles — veto isRaining when radar is clear
  if (rvMaps) {
    const rvResults = await Promise.all(ZONES.map(z => checkRainviewerTile(rvMaps, z.lat, z.lon)));
    ZONES.forEach((z, i) => {
      const w = weatherMap[z.id];
      if (!w || rvResults[i] === null) return;
      if (rvResults[i] === false && w.isRaining && (w.code < 51 || w.rain3 < 2.0)) {
        // Radar clear + (WMO non-precip code OR moderate recent rain) → override to not raining
        const precip = w._h?.precip || [];
        const wIdx   = w._idx ?? 0;
        let lastRain = -1;
        for (let j = wIdx; j >= Math.max(0, wIdx - 72); j--) {
          if (precip[j] > 0.05) { lastRain = j; break; }
        }
        weatherMap[z.id] = { ...w, isRaining: false, hoursDry: lastRain < 0 ? 72 : wIdx - lastRain };
      }
      if (rvResults[i] === true && !w.isRaining && w.rain3 > 0.05) {
        // Radar echo + some recent precip → confirm raining
        weatherMap[z.id] = { ...w, isRaining: true, hoursDry: 0 };
      }
    });
  }

  // Center weather for global summary
  const cw = weatherMap['center'] || fallback;

  // Helper: nearest zone weather for a lat/lon
  function nearestWeather(lat, lon) {
    let best = 'center', bd = Infinity;
    for (const z of ZONES) {
      const d = haversine(lat, lon, z.lat, z.lon);
      if (d < bd) { bd = d; best = z.id; }
    }
    return weatherMap[best] || fallback;
  }

  // 3. Score each sector
  // Only sectors with meaningful boulder count
  const scoredSectors = [];

  for (const sector of allSectors) {
    if (!sector.lat || !sector.lon) continue;

    const w = nearestWeather(sector.lat, sector.lon);
    const dom = 'other'; // we don't know dominant style without loading data yet — will be updated below

    // Pre-score sector — use expert aspect override + canopy + terrain
    const sLabel     = sector.label || sector.key;
    const canopyPre  = getCanopy(sLabel, adminOv);
    const terrainPre = getTerrain(sLabel, adminOv);
    const wPre       = applyAreaFactors(w, canopyPre, terrainPre);
    const sectorDry  = calcDryScore(wPre, dom, sector.aspect);
    const sectorCond = calcCondScore(wPre, dom, sectorDry, sector.aspect);
    const rankBase   = Math.round(sectorDry * 0.5 + sectorCond * 0.5 + Math.min(sector.boulderCount / 10, 10));

    scoredSectors.push({
      ...sector,
      w,
      sectorDry,
      sectorCond,
      rankBase,
    });
  }

  // 4. Load boulder data for ALL sectors (v4 first, legacy fallback)
  const boulderRaws = await Promise.all(scoredSectors.map(async s => {
    return await store.get('v4:' + s.key, { type: 'text' })
        || await store.get(s.key, { type: 'text' });
  }));

  const resultAreas = [];

  scoredSectors.forEach((sector, si) => {
    const raw = boulderRaws[si];
    if (!raw) return;
    let problems;
    try { problems = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(problems) || !problems.length) return;

    const w = sector.w;

    // Compute dominant steepness from actual data
    const dom = dominantSteepness(problems);

    // Expert-calibrated aspect (override > topo DEM)
    const avgAspect = sector.aspect ?? null;

    // Apply canopy + terrain microclimate factors
    const secLabel = sector.label || sector.key;
    const canopy   = getCanopy(secLabel, adminOv);
    const terrain  = getTerrain(secLabel, adminOv);
    const wAdj    = applyAreaFactors(w, canopy, terrain);

    // Area-level scores with blended steepness, expert aspect + terrain
    const bMult    = blendedLoadMult(problems);
    const bias     = getDryBias(secLabel, adminOv);
    const rawDry   = calcDryScore(wAdj, dom, avgAspect, bMult);
    const dryScore = rawDry > 0 ? Math.min(100, Math.max(0, rawDry + bias)) : 0;
    const condScore = calcCondScore(wAdj, dom, dryScore, avgAspect);

    // Score each boulder individually
    const validProblems = [];
    const sectorLat = sector.lat;
    const sectorLon = sector.lon;

    problems.forEach(p => {
      // GPS sanity check: boulder must be within 3km of sector center
      // This filters out cross-sector contamination (same boulder name in multiple sectors)
      const coord = p.coordinates;
      if (coord && sectorLat && sectorLon) {
        const dist = haversine(sectorLat, sectorLon, coord[1], coord[0]);
        if (dist > 3.0) return; // skip — belongs to a different sector
      }
      // steepness: normalised value for score calc (slab/wall/overhang/roof/traverse/other)
      // In new KV format p.steepness is already normalised ("wall","slab",etc.)
      // p.style is the raw descriptive type ("Arete","Crack","Prow",etc.)
      const pSteepness = mapStyle(p.steepness || p.style);
      const pRawStyle  = p.style || null;

      const pWRaw   = coord ? nearestWeather(coord[1], coord[0]) : w;
      const pW      = applyAreaFactors(pWRaw, canopy, terrain);
      const pAspect = avgAspect;

      const pDry  = calcDryScore(pW, pSteepness, pAspect);
      const pCond = calcCondScore(pW, pSteepness, pDry, pAspect);

      // Size match — always parse and store sizes array for client-side recalc
      const sizes = parseSizes(p.heightStats?.categories ?? p.categories, p.heightStats?.percentages ?? p.percentages);
      let sizeScore = null;
      if (sizes.length) {
        sizeScore = userHeight ? getSizeScore(userHeight, sizes) : null;
        // Never filter out — a size mismatch just lowers rank, not excludes
        // sizeScore=0 means "no data for this height" → rank penalty, still shown
      }

      // morphoW: 50 = neutral (no data), 0-100 from size match
      // sizeScore=0 → penalty (20), no sizes → neutral (50)
      const morphoW = sizeScore != null ? Math.max(sizeScore, 10) : 50;
      const rankScore = Math.round(pDry * 0.42 + pCond * 0.38 + morphoW * 0.20);

      validProblems.push({
        name:        p.name,
        grade:       p.grade,
        steepness:   pSteepness,
        style:       pRawStyle,
        url:         p.url  || null,
        sizes:       sizes.length ? sizes : null,
        sizeScore,
        dryScore:    pDry,
        condScore:   pCond,
        rankScore,
        description: generateBoulderDesc(pDry, pCond, pSteepness, pRawStyle, pW, sizes, sizeScore, userHeight),
        popularity:  p.popularity || 0,
        featured:    p.featured   || false,
        id:          p.id         || null,
        lat:         coord ? coord[1] : null,
        lon:         coord ? coord[0] : null,
      });
    });

    if (!validProblems.length) return;
    validProblems.sort((a, b) => b.rankScore - a.rankScore);

    const avgMorpho = Math.round(validProblems.reduce((s, p) => s + (p.sizeScore ?? 50), 0) / validProblems.length);
    const rawComposite = Math.round(dryScore * 0.38 + condScore * 0.38 + avgMorpho * 0.14 + Math.min(validProblems.length / 5, 10));
    const compositeScore = (dryScore === 0 && condScore === 0) ? 0 : rawComposite;

    const logicReason = makeLogicReason(wAdj, dryScore, condScore, wAdj.hoursDry);
    const confidence  = calcConfidence(wAdj, dryScore, canopy);

    const bleauSlug = validProblems.find(p => p.url)?.url?.match(/bleau\.info\/([^/]+)\//)?.[1] ?? null;
    const bleauUrl  = bleauSlug ? `https://bleau.info/${bleauSlug}` : `https://bleau.info/?q=${encodeURIComponent(sector.label)}`;
    // Backfill missing boulder URLs using sector slug + bleauId (bleau.info internal ID)
    if (bleauSlug) {
      for (const p of validProblems) {
        if (!p.url && p.bleauId) p.url = `https://bleau.info/${bleauSlug}/${p.bleauId}.html`;
      }
    }
    // Compute forecast using canopy-adjusted weather
    const dryForecast = dryScore < 100
      ? estimateDryingForecast(wAdj, dom, avgAspect)
      : { hours: 0, dryAt: null, trajectory: null };

    resultAreas.push({
      name:          sector.label,
      key:           sector.key,
      parent:        sector.parent,
      bleauUrl,
      dryScore,
      condScore,
      dryingHours:    dryForecast.hours,
      dryAt:          dryForecast.dryAt,
      dryTrajectory:  dryForecast.trajectory,
      dryConditions:  dryForecast.conditions ?? null,
      personalScore: compositeScore,
      lat:           sector.lat,
      lon:           sector.lon,
      dominant:      dom,
      exposition:    avgAspect != null ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(avgAspect / 45) % 8] : 'gemischt',
      elevation:     sector.elevation ?? null,
      canopy,
      confidence,
      boulderCount:  validProblems.length,
      problems:      validProblems,
      logicReason,
      zone: {
        rain48:    wAdj.rain48,
        rain24:    wAdj.rain24,
        rain12:    wAdj.rain12,
        rain6:     wAdj.rain6,
        rain3:     wAdj.rain3,
        isRaining: wAdj.isRaining,
        wind:      wAdj.wind,
        windDir:   wAdj.windDir,
        windDeg:   wAdj.windDeg,
        humidity:  wAdj.humidity,
        temp:      wAdj.temp,
        hoursDry:  wAdj.hoursDry,
        radiation: wAdj.radiation,
        dewpoint:  wAdj.dewpoint,
      },
    });
  });

  resultAreas.sort((a, b) => {
    const condA = a.dryScore + a.condScore;
    const condB = b.dryScore + b.condScore;
    if (condB !== condA) return condB - condA;
    return b.personalScore - a.personalScore;
  });

  // ── All-sector scores (from full scoring, used by search bar) ─────────────
  const allSectorScores = {};
  for (const area of resultAreas) {
    allSectorScores[area.name] = {
      dryScore:  area.dryScore,
      condScore: area.condScore,
      rankScore: area.personalScore,
    };
  }

  return {
    weather:   {
      temp:      cw.temp,
      humidity:  cw.humidity,
      wind:      cw.wind,
      windDir:   cw.windDir,
      windDeg:   cw.windDeg,
      rain48:    cw.rain48,
      rain6:     cw.rain6,
      rain24:    cw.rain24,
      hoursDry:  cw.hoursDry,
      isRaining: cw.isRaining,
      radiation: cw.radiation,
      dewpoint:  cw.dewpoint,
      vpd:       Math.round(calcVPD(cw.temp, cw.humidity) * 100) / 100,
    },
    zones:     Object.fromEntries(Object.entries(weatherMap).map(([k, v]) => [k, { wind: v.wind, windDir: v.windDir, humidity: v.humidity, temp: v.temp, rain48: v.rain48, rain6: v.rain6, hoursDry: v.hoursDry }])),
    _weatherMap: weatherMap,   // full zone objects for AreaPage (stripped before client response)
    allSectorScores,           // flat map name→{dryScore,condScore,rankScore} for ALL sectors
    areas:     resultAreas,
    cachedAt:  Date.now(),
    userHeight: userHeight || null,
    sectorCount: allSectors.length,
  };
}

// ── EXPORT ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      const url  = new URL(request.url);
      const store = kv(env);

      // ── Search endpoint ──────────────────────────────────────────────────
      if (url.searchParams.has('search')) {
        const q    = normalize(url.searchParams.get('search'));
        const type = url.searchParams.get('type') || 'a';

        const hierRaw = await store.get('area_hierarchy_v4', { type: 'text' })
                     || await store.get('area_hierarchy', { type: 'text' });
        if (!hierRaw) return new Response(JSON.stringify([]), { headers: CORS });
        const hierarchy = JSON.parse(hierRaw);

        if (type === 'a') {
          // Search sector names
          const results = [];
          for (const [, parent] of Object.entries(hierarchy)) {
            for (const sector of (parent.sectors || [])) {
              if (normalize(sector.label || sector.key).includes(q)) {
                results.push({ _t: 'area', l: sector.label || sector.key });
              }
            }
            if (results.length >= 10) break;
          }
          return new Response(JSON.stringify(results), { headers: CORS });
        }

        // Boulder search: load KV keys matching query area, search boulders
        const areaKeys = [];
        for (const [, parent] of Object.entries(hierarchy)) {
          for (const sector of (parent.sectors || [])) {
            areaKeys.push(sector.key);
          }
        }
        const searchResults = [];
        const batchSize = 15;
        for (let i = 0; i < areaKeys.length && searchResults.length < 10; i += batchSize) {
          const batch = areaKeys.slice(i, i + batchSize);
          const raws  = await Promise.all(batch.map(async k =>
            await store.get('v4:' + k, { type: 'text' }) || await store.get(k, { type: 'text' })
          ));
          batch.forEach((aKey, j) => {
            if (!raws[j]) return;
            let boulders;
            try { boulders = JSON.parse(raws[j]); } catch { return; }
            if (!Array.isArray(boulders)) return;
            boulders
              .filter(p => normalize(p.name || '').includes(q))
              .forEach(p => searchResults.push({ _t: 'boulder', l: p.name, g: p.grade, a: aKey }));
          });
        }
        return new Response(JSON.stringify(searchResults.slice(0, 10)), { headers: CORS });
      }

      // ── Cache refresh endpoint ──────────────────────────────────────────
      if (url.pathname === '/refresh') {
        const secret = url.searchParams.get('secret');
        if (secret !== env.REFRESH_SECRET)
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

        // Same logic as cron: compute + AI descriptions + write both caches
        const result = await computeScored(env, 180);
        let aiCount = 0, boulderAiCount = 0, groqError = null;
        if (env.GROQ_KEY) {
          // Sequential to avoid Groq rate limits
          let aDescs = {}, bDescs = {};
          try {
            aDescs = await generateAreaDescriptions(result.areas, env);
          } catch(e) { groqError = 'area: ' + e.message; }
          try {
            bDescs = await generateBoulderDescriptions(result.areas, env);
          } catch(e) { groqError = (groqError||'') + ' boulder: ' + e.message; }
          await Promise.all([
            store.put('cache:aiDesc',      JSON.stringify(aDescs), { expirationTtl: 7200 }),
            store.put('cache:boulderDesc', JSON.stringify(bDescs), { expirationTtl: 7200 }),
          ]);
          for (const area of result.areas) {
            area.aiDesc = aDescs[area.name] ?? null;
            for (const p of (area.problems || [])) {
              p.aiDesc = bDescs[p.name] ?? null;
            }
          }
          aiCount        = result.areas.filter(a => a.aiDesc).length;
          boulderAiCount = result.areas.reduce((s,a) => s + (a.problems||[]).filter(p=>p.aiDesc).length, 0);
        }
        // Save full zone weather for AreaPage consistency
        if (result._weatherMap) {
          await store.put('cache:zoneWeather', JSON.stringify(result._weatherMap), { expirationTtl: 1800 });
        }
        const { _weatherMap: _wm2, allSectorScores: _aSS, ...resultClean } = result;
        // Delete ALL height-variant caches so stale data for any height is cleared
        const oldKeys = await store.list({ prefix: 'cache:v18:' });
        await Promise.all((oldKeys.keys || []).map(k => store.delete(k.name)));
        await store.put('cache:widget', JSON.stringify(resultClean), { expirationTtl: 1800 });
        await store.put('cache:v18:180', JSON.stringify(resultClean), { expirationTtl: CACHE_TTL });
        // Store ALL sector pre-scores for search bar (covers all ~224 sectors)
        if (result.allSectorScores) {
          await store.put('cache:areas-scores', JSON.stringify(result.allSectorScores), { expirationTtl: 1800 });
          await store.delete('cache:areas-list'); // force search bar to rebuild with new scores
        }

        return new Response(JSON.stringify({ ok: true, areas: result.areas.length, aiDescriptions: aiCount, boulderAiDescs: boulderAiCount, clearedKeys: (oldKeys.keys||[]).length, groqError }), { headers: CORS });
      }

      // ── Widget endpoint (mini weather summary) ──────────────────────────
      if (url.pathname === '/widget') {
        const w = await fetchWeather(48.409, 2.603);
        // Read from dedicated widget cache (populated by cron every 20 min)
        // Fall back to main cache if widget cache not yet populated
        const widgetCache = await store.get('cache:widget', { type: 'json' })
                         || await store.get('cache:v18:180', { type: 'json' });
        let top3 = (widgetCache?.areas || []).slice(0, 3).map(a => ({
          name:      a.name,
          dryScore:  a.dryScore,
          condScore: a.condScore,
          bleauUrl:  a.bleauUrl,
          parent:    a.parent || null,
        }));
        // Fallback: areas-list cache (immer vorhanden, nach rankScore sortiert)
        if (top3.length === 0) {
          const areasList = await store.get('cache:areas-list', { type: 'json' });
          top3 = (areasList || []).filter(a => a.dryScore > 0).slice(0, 3).map(a => ({
            name:      a.name,
            dryScore:  a.dryScore,
            condScore: a.condScore || 0,
            bleauUrl:  null,
            parent:    a.parent || null,
          }));
        }
        const topSector = top3[0] || null;
        // Strip internal computation fields before sending
        const current = {
          temp:      w.temp,
          humidity:  w.humidity,
          wind:      w.wind,
          windDir:   w.windDir,
          windDeg:   w.windDeg,
          code:      w.code,
          rain48:    w.rain48,
          rain24:    w.rain24,
          rain6:     w.rain6,
          rain3:     w.rain3,
          hoursDry:  w.hoursDry,
          isRaining: w.isRaining,
          dewpoint:  w.dewpoint,
          radiation: w.radiation,
          vpd:       Math.round(calcVPD(w.temp, w.humidity) * 100) / 100,
        };
        // Also include full areas list (with parent field) for navbar search
        const areas = (widgetCache?.areas || []).map(a => ({
          name:      a.name,
          dryScore:  a.dryScore,
          condScore: a.condScore,
          rankScore: a.personalScore || 0,
          parent:    a.parent || null,
        }));
        return new Response(JSON.stringify({ current, topSector, top3, areas }), { headers: CORS });
      }

      // ── Admin: PIN-gated override panel ────────────────────────────────
      // GET /admin  →  HTML panel
      if (url.pathname === '/admin' && request.method === 'GET') {
        const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HIGHSET Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;background:#f2f2f7;color:#1c1c1e;min-height:100vh}
#pw{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px}
#pw h1{font-size:28px;font-weight:700;letter-spacing:-.5px}
#pin{font-size:18px;padding:12px 20px;border-radius:12px;border:1.5px solid #c6c6c8;background:#fff;width:200px;text-align:center;outline:none}
#pin:focus{border-color:#007aff}
#pbtn{background:#007aff;color:#fff;border:none;border-radius:12px;padding:12px 32px;font-size:16px;font-weight:600;cursor:pointer}
#pbtn:hover{background:#0062cc}
#perr{color:#ff3b30;font-size:14px;min-height:18px}
#main{display:none;padding:20px 24px;max-width:1100px;margin:0 auto}
.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap}
.hdr h1{font-size:22px;font-weight:700}
.hdr-right{display:flex;gap:8px;align-items:center}
#filter-par,#q{padding:8px 12px;border-radius:10px;border:1.5px solid #c6c6c8;background:#fff;font-size:14px;font-family:inherit}
#q{width:220px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);font-size:13px}
thead th{background:#f2f2f7;padding:9px 10px;text-align:left;font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
tbody tr{border-top:1px solid #f2f2f7}
tbody tr:hover{background:#f9f9fb}
td{padding:7px 10px;vertical-align:middle}
.sn{font-weight:500}
.sp{color:#6e6e73;font-size:11px}
input.v,select.v{padding:4px 7px;border-radius:8px;border:1.5px solid #e5e5ea;font-size:13px;font-family:inherit;background:#fff;outline:none}
input.v{width:62px;text-align:center}
select.v{cursor:pointer}
.v:focus{border-color:#007aff}
.v.ov{border-color:#007aff;color:#007aff;font-weight:600}
.btn-s{background:#007aff;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn-s:hover{background:#0062cc}
.btn-r{background:#ff3b30;color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer}
.btn-r:hover{background:#d63029}
.ok{color:#34c759;font-size:12px;font-weight:600}
.hint{margin-top:10px;font-size:11px;color:#8e8e93}
</style>
</head>
<body>
<div id="pw">
  <h1>HIGHSET Admin</h1>
  <p style="color:#6e6e73;font-size:14px">Sektor-Overrides</p>
  <input id="pin" type="password" placeholder="PIN" autofocus>
  <button id="pbtn">Entsperren</button>
  <span id="perr"></span>
</div>
<div id="main">
  <div class="hdr">
    <h1>Sektor-Einstellungen</h1>
    <div class="hdr-right">
      <select id="filter-par" onchange="render()"><option value="">Alle Bereiche</option></select>
      <input id="q" type="text" placeholder="Sektor…" oninput="render()">
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Sektor</th>
        <th title="Himmelsrichtung der Felsfront: 0=N 90=E 180=S 270=W">Aspekt °</th>
        <th title="0=offen/Plateau  1=lichter Wald(default)  2=dichter Wald/Tal">Canopy</th>
        <th title="0=Senke  1=normal(default)  2=Hügel  3=Plateau/Freifläche">Terrain</th>
        <th title="Additiver Bonus/Malus auf DryScore (z.B. +10 oder -15)">Bias</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="tb"></tbody>
  </table>
  <p class="hint">Blaue Felder = aktiver KV-Override. Grau = Codewert. Änderungen löschen den Score-Cache sofort.</p>
</div>
<script>
let pin='', sectors=[], ov={}, hc={};
const $ = id => document.getElementById(id);

$('pbtn').onclick = unlock;
$('pin').addEventListener('keydown', e => { if(e.key==='Enter') unlock(); });

async function unlock(){
  pin = $('pin').value.trim();
  if(!pin){ $('perr').textContent='PIN eingeben'; return; }
  const r = await fetch('/admin/overrides?pin='+encodeURIComponent(pin));
  if(r.status===401){ $('perr').textContent='Falscher PIN'; pin=''; return; }
  const d = await r.json();
  ov = d.overrides||{}; hc = d.hardcoded||{};

  const rs = await fetch('/admin/sectors?secret='+encodeURIComponent(pin));
  const sd = await rs.json();
  sectors = sd.sectors||[];

  $('pw').style.display='none'; $('main').style.display='block';

  const parents = [...new Set(sectors.map(s=>s.parent))].sort();
  for(const p of parents){
    const o=document.createElement('option'); o.value=p; o.textContent=p;
    $('filter-par').appendChild(o);
  }
  render();
}

function val(label, field, def){
  if(ov[label]?.[field]!==undefined) return ov[label][field];
  if(hc[label]?.[field]!==undefined) return hc[label][field];
  return def;
}
function isOv(label, field){ return ov[label]?.[field]!==undefined; }

function render(){
  const q = $('q').value.toLowerCase();
  const par = $('filter-par').value;
  const tb = $('tb');
  tb.innerHTML='';
  const list = sectors.filter(s=>(!par||s.parent===par)&&(!q||s.label.toLowerCase().includes(q)));
  for(const s of list){
    const lbl = s.label;
    const asp  = val(lbl,'aspect','');
    const can  = val(lbl,'canopy',1);
    const ter  = val(lbl,'terrain',1);
    const bia  = val(lbl,'bias',0);
    const oA=isOv(lbl,'aspect'), oC=isOv(lbl,'canopy'), oT=isOv(lbl,'terrain'), oB=isOv(lbl,'bias')&&ov[lbl]&&ov[lbl].bias!==0;
    const hasOv = oA||oC||oT||oB;
    const tr = document.createElement('tr');
    tr.dataset.lbl = lbl;
    // Build row via DOM to avoid all string-escaping issues with sector labels
    const sn = document.createElement('td');
    sn.innerHTML = '<div class="sn">'+lbl+'</div><div class="sp">'+s.parent+'</div>';
    const mkInput = (field, isOv, value, extra) => {
      const td = document.createElement('td');
      const el = Object.assign(document.createElement('input'), {className:'v'+(isOv?' ov':''), type:'number', value, placeholder:'—', dataset:{f:field}});
      Object.entries(extra||{}).forEach(([k,v])=>el.setAttribute(k,v));
      el.addEventListener('change',()=>el.classList.add('ov'));
      td.appendChild(el); return td;
    };
    const mkSelect = (field, isOv, selected, opts) => {
      const td = document.createElement('td');
      const el = Object.assign(document.createElement('select'), {className:'v'+(isOv?' ov':''), dataset:{f:field}});
      opts.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;if(v==selected)o.selected=true;el.appendChild(o);});
      el.addEventListener('change',()=>el.classList.add('ov'));
      td.appendChild(el); return td;
    };
    const btnTd = document.createElement('td');
    btnTd.style.cssText='display:flex;gap:5px;align-items:center';
    const saveBtn = Object.assign(document.createElement('button'),{className:'btn-s',textContent:'Speichern'});
    saveBtn.addEventListener('click', () => save(lbl));
    btnTd.appendChild(saveBtn);
    if(hasOv){
      const rstBtn = Object.assign(document.createElement('button'),{className:'btn-r',textContent:'×'});
      rstBtn.addEventListener('click', () => reset(lbl));
      btnTd.appendChild(rstBtn);
    }
    const okSpan = Object.assign(document.createElement('span'),{className:'ok',textContent:'✓'});
    okSpan.style.display='none';
    btnTd.appendChild(okSpan);
    tr.append(
      sn,
      mkInput('aspect', oA, asp, {min:0,max:359,step:1}),
      mkSelect('canopy', oC, can, [['0','0 offen'],['1','1 Wald'],['2','2 dicht']]),
      mkSelect('terrain', oT, ter, [['0','0 Senke'],['1','1 normal'],['2','2 Hügel'],['3','3 Plateau']]),
      mkInput('bias', oB, bia, {min:-30,max:30,step:1}),
      btnTd
    );
    tb.appendChild(tr);
  }
}

async function save(lbl){
  const tr = $('tb').querySelector('tr[data-lbl="'+CSS.escape(lbl)+'"]');
  const body = { pin, sector: lbl };
  tr.querySelectorAll('[data-f]').forEach(el=>{
    const v = el.value.trim();
    if(v===''||v===null) return;
    body[el.dataset.f] = Number(v);
  });
  const r = await fetch('/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d = await r.json();
  if(d.ok){
    ov[lbl]=d.override||{};
    const ok=tr.querySelector('.ok');
    ok.style.display='';
    setTimeout(()=>{ok.style.display='none';render();},1400);
  } else alert('Fehler: '+(d.error||'?'));
}

async function reset(lbl){
  if(!confirm('Override fuer "'+lbl+'" loeschen?')) return;
  const r = await fetch('/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin,sector:lbl,_reset:true})});
  const d = await r.json();
  if(d.ok){ delete ov[lbl]; render(); }
  else alert('Fehler: '+(d.error||'?'));
}
</script>
</body>
</html>`;
        return new Response(html, { headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // GET /admin/overrides?pin=5007
      if (url.pathname === '/admin/overrides' && request.method === 'GET') {
        const pin = url.searchParams.get('pin');
        if (pin !== '5007' && pin !== (env.ADMIN_SECRET || '') && pin !== (env.REFRESH_SECRET || ''))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

        const kvOv = await loadAdminOverrides(store);

        // Build hardcoded snapshot from static metadata
        const hardcoded = {};
        const allLabels = new Set([
          ...Object.keys(ASPECT_OVERRIDES),
          ...Object.keys(CANOPY_META),
          ...Object.keys(TERRAIN_META),
          ...Object.keys(BIAS_META),
        ]);
        for (const label of allLabels) {
          const hc = {};
          if (ASPECT_OVERRIDES[label] !== undefined) hc.aspect  = ASPECT_OVERRIDES[label];
          if (CANOPY_META[label]      !== undefined) hc.canopy  = CANOPY_META[label];
          if (TERRAIN_META[label]     !== undefined) hc.terrain = TERRAIN_META[label];
          if (BIAS_META[label]        !== undefined) hc.bias    = BIAS_META[label];
          hardcoded[label] = hc;
        }

        return new Response(JSON.stringify({ overrides: kvOv, hardcoded }), { headers: CORS });
      }

      // POST /admin/override  body: { pin, sector, aspect?, canopy?, terrain?, bias?, _reset? }
      if (url.pathname === '/admin/override' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS });
        }
        const { pin, sector, _reset } = body;

        if (pin !== '5007' && pin !== (env.ADMIN_SECRET || '') && pin !== (env.REFRESH_SECRET || ''))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
        if (!sector || typeof sector !== 'string')
          return new Response(JSON.stringify({ error: 'sector required' }), { status: 400, headers: CORS });

        const all = (await store.get('admin:overrides', { type: 'json' })) || {};

        if (_reset) {
          delete all[sector];
        } else {
          const entry = all[sector] || {};
          if (body.aspect  !== undefined && !isNaN(body.aspect))  entry.aspect  = Number(body.aspect);
          if (body.canopy  !== undefined && !isNaN(body.canopy))  entry.canopy  = Number(body.canopy);
          if (body.terrain !== undefined && !isNaN(body.terrain)) entry.terrain = Number(body.terrain);
          if (body.bias    !== undefined && !isNaN(body.bias))    entry.bias    = Number(body.bias);
          all[sector] = entry;
        }

        await store.put('admin:overrides', JSON.stringify(all));

        // Invalidate all score + area caches
        const cacheKeys = await store.list({ prefix: 'cache:' });
        await Promise.all(
          cacheKeys.keys
            .filter(k => k.name.startsWith('cache:v18:') || ['cache:widget','cache:areas-scores','cache:areas-list'].includes(k.name))
            .map(k => store.delete(k.name))
        );

        return new Response(JSON.stringify({ ok: true, sector, override: all[sector] ?? null }), { headers: CORS });
      }

      // ── Admin: list all sectors ─────────────────────────────────────────
      // GET /admin/sectors
      if (url.pathname === '/admin/sectors') {
        const secret = url.searchParams.get('secret');
        if (secret !== '5007' && secret !== (env.ADMIN_SECRET || '') && secret !== (env.REFRESH_SECRET || ''))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

        const hierRaw = await store.get('area_hierarchy_v4', { type: 'text' })
                     || await store.get('area_hierarchy', { type: 'text' });
        if (!hierRaw) return new Response(JSON.stringify({ error: 'area_hierarchy not found' }), { status: 404, headers: CORS });
        const hierarchy = JSON.parse(hierRaw);

        const sectors = [];
        for (const [parentName, parent] of Object.entries(hierarchy)) {
          for (const sector of (parent.sectors || [])) {
            sectors.push({
              key:    sector.key,
              label:  sector.label || sector.key,
              parent: parentName,
              lat:    sector.lat || parent.lat,
              lon:    sector.lon || parent.lon,
              boulderCount: sector.boulderCount || 0,
            });
          }
        }
        sectors.sort((a, b) => a.label.localeCompare(b.label));
        return new Response(JSON.stringify({ sectors }), { headers: CORS });
      }

      // ── Admin: read boulders for a sector ──────────────────────────────
      // GET /admin/boulders?sector=KEY&secret=X
      if (url.pathname === '/admin/boulders') {
        const secret = url.searchParams.get('secret');
        if (secret !== (env.ADMIN_SECRET || env.REFRESH_SECRET))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

        const sectorKey = url.searchParams.get('sector');
        if (!sectorKey) return new Response(JSON.stringify({ error: 'sector param required' }), { status: 400, headers: CORS });

        const raw = await store.get('v4:' + sectorKey, { type: 'text' })
                 || await store.get(sectorKey, { type: 'text' });
        if (!raw) return new Response(JSON.stringify({ boulders: [] }), { headers: CORS });
        let boulders;
        try { boulders = JSON.parse(raw); } catch { boulders = []; }
        if (!Array.isArray(boulders)) boulders = [];
        return new Response(JSON.stringify({ boulders }), { headers: CORS });
      }

      // ── Admin: write / update a single boulder ──────────────────────────
      // POST /admin/boulder  body: { secret, sector, boulder }
      // boulder fields: name, grade, steepness, style, coordinates[lon,lat], popularity,
      //                 categories (["150..154",...]), percentages ([0,100,...]), url, id
      if (url.pathname === '/admin/boulder' && request.method === 'POST') {
        const body = await request.json();
        const { secret, sector: sectorKey, boulder } = body;

        if (secret !== (env.ADMIN_SECRET || env.REFRESH_SECRET))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
        if (!sectorKey || !boulder?.name)
          return new Response(JSON.stringify({ error: 'sector and boulder.name required' }), { status: 400, headers: CORS });

        // Load existing boulders for this sector (v4 first, legacy fallback)
        const raw = await store.get('v4:' + sectorKey, { type: 'text' })
                 || await store.get(sectorKey, { type: 'text' });
        let boulders = [];
        if (raw) { try { boulders = JSON.parse(raw); } catch {} }
        if (!Array.isArray(boulders)) boulders = [];

        // Build clean boulder object matching bleau_kv_bulk format
        const clean = {
          name:       boulder.name.trim(),
          grade:      boulder.grade || '',
          steepness:  boulder.steepness || 'other',
          style:      boulder.style || null,
          coordinates: boulder.coordinates || null,
          popularity: boulder.popularity || 0,
          featured:   boulder.featured || false,
          id:         boulder.id || null,
          url:        boulder.url || null,
        };
        // Only add size fields if provided
        if (boulder.categories?.length && boulder.percentages?.length) {
          clean.categories  = boulder.categories;
          clean.percentages = boulder.percentages;
        }

        // Upsert: replace if name matches, else append
        const idx = boulders.findIndex(b => b.name === clean.name);
        if (idx >= 0) {
          boulders[idx] = { ...boulders[idx], ...clean };
        } else {
          boulders.push(clean);
        }

        await store.put('v4:' + sectorKey, JSON.stringify(boulders));

        // Invalidate all caches for this sector
        const cacheKeys = await store.list({ prefix: 'cache:v18:' });
        await Promise.all(cacheKeys.keys.map(k => store.delete(k.name)));

        return new Response(JSON.stringify({ ok: true, total: boulders.length, boulder: clean }), { headers: CORS });
      }

      // ── Admin: delete a single boulder ─────────────────────────────────
      // DELETE /admin/boulder?sector=KEY&name=NAME&secret=X
      if (url.pathname === '/admin/boulder' && request.method === 'DELETE') {
        const secret    = url.searchParams.get('secret');
        const sectorKey = url.searchParams.get('sector');
        const name      = url.searchParams.get('name');

        if (secret !== (env.ADMIN_SECRET || env.REFRESH_SECRET))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
        if (!sectorKey || !name)
          return new Response(JSON.stringify({ error: 'sector and name required' }), { status: 400, headers: CORS });

        const raw = await store.get('v4:' + sectorKey, { type: 'text' })
                 || await store.get(sectorKey, { type: 'text' });
        if (!raw) return new Response(JSON.stringify({ ok: true, total: 0 }), { headers: CORS });
        let boulders = [];
        try { boulders = JSON.parse(raw); } catch {}
        const before = boulders.length;
        boulders = boulders.filter(b => b.name !== name);
        await store.put('v4:' + sectorKey, JSON.stringify(boulders));

        const cacheKeys = await store.list({ prefix: 'cache:v18:' });
        await Promise.all(cacheKeys.keys.map(k => store.delete(k.name)));

        return new Response(JSON.stringify({ ok: true, deleted: before - boulders.length, total: boulders.length }), { headers: CORS });
      }

      // ── Community condition reports ────────────────────────────────────
      // POST /verify  Area-level:    { secret, areaKey, status:"dry"|"wet", userId }
      //               Boulder-level: { secret, boulderId, kind:"condition", status:"dry"|"wet", userId }
      //               Boulder-size:  { secret, boulderId, kind:"size", status:"yes"|"no", userId, height? }
      // KV cost: 1 write per call (read-mutate-write the reports array).
      if (url.pathname === '/verify' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS });
        }

        const { secret, areaKey, boulderId, kind, status, userId, height } = body;

        const validTokens = [env.VERIFY_TOKEN, env.ADMIN_SECRET, env.REFRESH_SECRET].filter(Boolean);
        if (!validTokens.includes(secret))
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

        if (!userId || typeof userId !== 'string' || !userId.trim())
          return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: CORS });

        // ── Route: Boulder-level vs Area-level ──
        const isBoulder = boulderId != null;
        if (isBoulder) {
          // Validate kind + status combination
          if (kind !== 'condition' && kind !== 'size')
            return new Response(JSON.stringify({ error: 'kind must be "condition" or "size"' }), { status: 400, headers: CORS });
          if (kind === 'condition' && status !== 'dry' && status !== 'wet')
            return new Response(JSON.stringify({ error: 'condition status must be "dry" or "wet"' }), { status: 400, headers: CORS });
          if (kind === 'size' && status !== 'yes' && status !== 'no')
            return new Response(JSON.stringify({ error: 'size status must be "yes" or "no"' }), { status: 400, headers: CORS });
        } else {
          if (!areaKey || typeof areaKey !== 'string' || !areaKey.trim())
            return new Response(JSON.stringify({ error: 'areaKey or boulderId required' }), { status: 400, headers: CORS });
          if (status !== 'dry' && status !== 'wet')
            return new Response(JSON.stringify({ error: 'status must be "dry" or "wet"' }), { status: 400, headers: CORS });
        }

        const kvKey = isBoulder
          ? `verify:b:${boulderId}:${kind}`
          : `verify:${areaKey.trim()}`;
        const COOLDOWN_MS = 24 * 60 * 60 * 1000;

        let reports = [];
        try {
          const existing = await store.get(kvKey, { type: 'json' });
          if (Array.isArray(existing)) reports = existing;
        } catch { /* start fresh on corrupt data */ }

        const now = Date.now();
        const lastByUser = reports
          .filter(r => r.userId === userId.trim())
          .sort((a, b) => b.ts - a.ts)[0];

        if (lastByUser && (now - lastByUser.ts) < COOLDOWN_MS) {
          const yesCount = reports.filter(r => r.status === 'dry' || r.status === 'yes').length;
          const noCount  = reports.length - yesCount;
          return new Response(JSON.stringify({
            ok: true, duplicate: true,
            nextAvailableTs: lastByUser.ts + COOLDOWN_MS,
            lastStatus: lastByUser.status,
            dryPct: reports.length ? Math.round((yesCount / reports.length) * 100) : 0,
            wetPct: reports.length ? Math.round((noCount  / reports.length) * 100) : 0,
            total:  reports.length,
          }), { headers: CORS });
        }

        const entry = { status, ts: now, userId: userId.trim() };
        if (isBoulder && kind === 'size' && typeof height === 'number') entry.height = height;
        reports.push(entry);
        if (reports.length > 50) reports = reports.slice(-50);

        await store.put(kvKey, JSON.stringify(reports));

        // Quote — "yes" entspricht "dry" (positiv) für size-reports
        const yesCount = reports.filter(r => r.status === 'dry' || r.status === 'yes').length;
        const noCount  = reports.length - yesCount;
        const majority = yesCount >= noCount
          ? (isBoulder && kind === 'size' ? 'yes' : 'dry')
          : (isBoulder && kind === 'size' ? 'no'  : 'wet');

        const userReports = reports.filter(r => r.userId === userId.trim());
        const userCorrect = userReports.filter(r => r.status === majority).length;
        const userAccuracy = userReports.length > 0
          ? Math.round((userCorrect / userReports.length) * 100)
          : null;

        return new Response(JSON.stringify({
          ok: true,
          ...(isBoulder ? { boulderId, kind } : { areaKey: areaKey.trim() }),
          dryCount: yesCount,
          wetCount: noCount,
          dryPct: reports.length > 0 ? Math.round((yesCount / reports.length) * 100) : 0,
          wetPct: reports.length > 0 ? Math.round((noCount  / reports.length) * 100) : 0,
          total: reports.length,
          userReports: userReports.length,
          userAccuracy,
        }), { headers: CORS });
      }

      // ── All areas list (for navbar search) ────────────────────────────
      // GET /areas  →  flat list of every parent + sector from area_hierarchy
      // Cached 20 min. Scores merged from widget cache where available.
      if (url.pathname === '/areas') {
        const cached = await store.get('cache:areas-list', { type: 'json' });
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...CORS, 'X-Cache': 'HIT' } });

        const hierRaw = await store.get('area_hierarchy_v4', { type: 'text' })
                     || await store.get('area_hierarchy', { type: 'text' });
        if (!hierRaw) return new Response(JSON.stringify([]), { headers: CORS });
        const hierarchy = JSON.parse(hierRaw);

        // Build scoreMap: start with ALL-sector pre-scores (full coverage),
        // then override with precise scores from widget cache (top-20, boulder data).
        // Fallback chain: areas-scores → widget → v18:180 → v18:* (any)
        const scoreMap = {};
        // Layer 1: broad coverage — all ~224 sectors with pre-scores
        const allScores = await store.get('cache:areas-scores', { type: 'json' });
        if (allScores) { Object.assign(scoreMap, allScores); }
        // Layer 2: precise top-20 overrides (boulder-data-calibrated scores)
        let wCache = await store.get('cache:widget',  { type: 'json' })
                  || await store.get('cache:v18:180', { type: 'json' });
        if (!wCache) {
          const v18keys = await store.list({ prefix: 'cache:v18:' });
          if (v18keys.keys.length) wCache = await store.get(v18keys.keys[0].name, { type: 'json' });
        }
        for (const a of (wCache?.areas || [])) {
          scoreMap[a.name] = {
            dryScore:  Math.round(a.dryScore  ?? 0),
            condScore: Math.round(a.condScore ?? 0),
            rankScore: Math.round(a.personalScore ?? 0),
          };
        }

        function sl(name) {
          return name.toLowerCase()
            .replace(/[àáâãä]/g,'a').replace(/[èéêë]/g,'e').replace(/[îï]/g,'i')
            .replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u').replace(/[ç]/g,'c')
            .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        }

        const areas = [];
        for (const [parentName, parent] of Object.entries(hierarchy)) {
          const ps = scoreMap[parentName] || { dryScore:0, condScore:0, rankScore:0 };
          areas.push({ name: parentName, slug: sl(parentName), type:'parent',
            dryScore: ps.dryScore, condScore: ps.condScore, rankScore: ps.rankScore });
          for (const sector of (parent.sectors || [])) {
            const sName = sector.label || sector.key;
            if (sName === parentName) continue; // skip self-referential sector (same name as parent)
            const ss = scoreMap[sName] || ps; // fallback to parent score
            areas.push({ name: sName, slug: sl(sName), type:'sector', parent: parentName,
              dryScore: ss.dryScore, condScore: ss.condScore, rankScore: ss.rankScore });
          }
        }

        // Sort by rankScore desc so best areas come first
        areas.sort((a, b) => b.rankScore - a.rankScore);

        await store.put('cache:areas-list', JSON.stringify(areas), { expirationTtl: CACHE_TTL });
        return new Response(JSON.stringify(areas), { headers: CORS });
      }

      // ── Circuits endpoint ──────────────────────────────────────────────
      // GET /circuits/:areaId  →  GeoJSON FeatureCollection mit Circuit-Linien
      // areaId kann komma-getrennt sein für Parent-Areas mit mehreren Sektoren
      // z.B. /circuits/4,43,44,45  →  merged GeoJSON
      if (url.pathname.startsWith('/circuits/')) {
        const idsRaw = url.pathname.replace('/circuits/', '').trim();
        if (!idsRaw) return new Response(JSON.stringify({ error: 'areaId required' }), { status: 400, headers: CORS });

        const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20); // max 20 IDs

        // Load all circuit GeoJSON in parallel (v4 first, legacy fallback)
        const raws = await Promise.all(ids.map(async id =>
          await store.get(`circuits_v4:${id}`, { type: 'text' })
       || await store.get(`circuits:${id}`,    { type: 'text' })
        ));

        const allFeatures = [];
        for (const raw of raws) {
          if (!raw) continue;
          try {
            const geo = JSON.parse(raw);
            if (geo.features) allFeatures.push(...geo.features);
          } catch {}
        }

        const merged = { type: 'FeatureCollection', features: allFeatures };
        return new Response(JSON.stringify(merged), {
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
        });
      }

      // ── Area landing page endpoint ─────────────────────────────────────
      // GET /area/:slug  →  { name, slug, dryScore, condScore, center, weather, boulders[] }
      // Supports both parent areas (apremont) and sectors (bas-cuvier)
      // Cached 20 min in KV as cache:area:{slug}
      if (url.pathname.startsWith('/area/')) {
        const slug = url.pathname.replace('/area/', '').trim();
        if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400, headers: CORS });

        // Cache check
        const areaCacheKey = `cache:area:${slug}`;
        const areaCached   = await store.get(areaCacheKey, { type: 'json' });
        if (areaCached) return new Response(JSON.stringify(areaCached), { headers: { ...CORS, 'X-Cache': 'HIT' } });

        const _areaAdminOv = await loadAdminOverrides(store);

        // Slug normalizer (matches toSlug() in AreaNavBar + AreaPage)
        function slugify(name) {
          return name.toLowerCase()
            .replace(/[àáâãä]/g,'a').replace(/[èéêë]/g,'e').replace(/[îï]/g,'i')
            .replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u').replace(/[ç]/g,'c')
            .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        }

        // ── Hierarchy lookup: prefer v4, fallback to legacy ──
        // v4 keys: area_hierarchy_v4  →  boulder data under "v4:{slug}"  +  dbIds for circuits
        // legacy:  area_hierarchy     →  boulder data under sector.key    +  no dbIds
        const [hierV4Raw, hierRaw] = await Promise.all([
          store.get('area_hierarchy_v4', { type: 'text' }),
          store.get('area_hierarchy',    { type: 'text' }),
        ]);
        if (!hierRaw && !hierV4Raw) return new Response(JSON.stringify({ error: 'area_hierarchy not found' }), { status: 500, headers: CORS });

        let useV4 = false;
        let matchedParent = null;
        let matchedSector = null;

        // 1a. Try v4 hierarchy
        if (hierV4Raw) {
          const hierV4 = JSON.parse(hierV4Raw);
          const v4Entry = Object.entries(hierV4).find(([n]) => slugify(n) === slug);
          if (!v4Entry) {
            for (const [, pd] of Object.entries(hierV4)) {
              const sec = (pd.sectors || []).find(s => slugify(s.label || s.key) === slug);
              if (sec) { matchedSector = { sec, parentName: null, parentData: pd }; useV4 = true; break; }
            }
          } else {
            matchedParent = v4Entry;
            useV4 = true;
          }
        }

        // 1b. Fall back to legacy hierarchy
        if (!matchedParent && !matchedSector && hierRaw) {
          const hierarchy = JSON.parse(hierRaw);
          matchedParent = Object.entries(hierarchy).find(([n]) => slugify(n) === slug) || null;
          if (!matchedParent) {
            for (const [parentName, parentData] of Object.entries(hierarchy)) {
              const sec = (parentData.sectors || []).find(s => slugify(s.label || s.key) === slug);
              if (sec) { matchedSector = { sec, parentName, parentData }; break; }
            }
          }
        }

        if (!matchedParent && !matchedSector) {
          return new Response(JSON.stringify({ error: `Gebiet '${slug}' nicht gefunden` }), { status: 404, headers: CORS });
        }

        // Build sector list to process
        let areaName, centerLat, centerLon, sectorsToProcess;
        if (matchedParent) {
          const [n, d] = matchedParent;
          areaName = n; centerLat = d.lat; centerLon = d.lon;
          sectorsToProcess = d.sectors || [];
        } else {
          const { sec } = matchedSector;
          areaName = sec.label || sec.key;
          centerLat = sec.lat; centerLon = sec.lon;
          sectorsToProcess = [sec];
        }

        // Collect all DB IDs for circuit fetching — available in v4 hierarchy
        const dbIds = useV4
          ? sectorsToProcess.map(s => s.dbId).filter(Boolean)
          : [];

        // ── Weather: use cached zone weather (same source as main widget) for consistency.
        // Falls back to fresh Open-Meteo fetch only if zone cache is missing.
        const AREA_ZONES = [
          { id: 'nord',      lat: 48.448, lon: 2.638 },
          { id: 'nord_west', lat: 48.443, lon: 2.515 },
          { id: 'center',    lat: 48.409, lon: 2.603 },
          { id: 'sw',        lat: 48.377, lon: 2.525 },
          { id: 'est',       lat: 48.405, lon: 2.725 },
          { id: 'sud',       lat: 48.285, lon: 2.594 },
          { id: 'ouest',     lat: 48.392, lon: 2.458 },
        ];
        const zoneCache = await store.get('cache:zoneWeather', { type: 'json' });
        let aw;
        if (zoneCache) {
          let best = 'center', bd = Infinity;
          for (const z of AREA_ZONES) {
            const d = haversine(centerLat, centerLon, z.lat, z.lon);
            if (d < bd) { bd = d; best = z.id; }
          }
          aw = zoneCache[best] || zoneCache['center'];
        } else {
          aw = await fetchWeather(centerLat, centerLon);
        }

        // Load boulders: v4 uses "v4:{sector.key}", legacy uses sector.key directly
        const rawBoulders = await Promise.all(
          sectorsToProcess.map(s => store.get(useV4 ? `v4:${s.key}` : s.key, { type: 'text' }))
        );

        const allBoulders = [];
        let sumDry = 0, sumCond = 0, bCount = 0;

        sectorsToProcess.forEach((sector, si) => {
          const raw = rawBoulders[si];
          if (!raw) return;
          let problems;
          try { problems = JSON.parse(raw); } catch { return; }
          if (!Array.isArray(problems)) return;

          const sLat = sector.lat || centerLat;
          const sLon = sector.lon || centerLon;

          problems.forEach(p => {
            const coord = p.coordinates; // [lon, lat]
            // GPS sanity: must be within 5km of sector center
            if (coord && sLat && sLon) {
              if (haversine(sLat, sLon, coord[1], coord[0]) > 5.0) return;
            }

            const pSteep    = mapStyle(p.steepness || p.style);
            const secLbl    = sector.label || sector.key;
            const sCanopy   = getCanopy(secLbl, _areaAdminOv);
            const sTerrain  = getTerrain(secLbl, _areaAdminOv);
            const awAdj     = applyAreaFactors(aw, sCanopy, sTerrain);
            const sAspect   = getAspect(secLbl, _areaAdminOv) ?? sector.aspect ?? null;
            const pDry      = calcDryScore(awAdj, pSteep, sAspect);
            const pCond     = calcCondScore(awAdj, pSteep, pDry, sAspect);

            sumDry  += pDry;
            sumCond += pCond;
            bCount++;

            allBoulders.push({
              id:           p.id          || null,
              name:         p.name,
              grade:        p.grade       || null,
              lat:          coord ? coord[1] : null,
              lng:          coord ? coord[0] : null,
              dryScore:     pDry,
              condScore:    pCond,
              style:        pSteep !== 'other' ? pSteep : (p.style || null),
              sector:       sector.label  || sector.key,
              popularity:   p.popularity  || 0,
              url:          p.url         || null,
              circuitColor: p.circuitColor  || null,
              circuitNumber:p.circuitNumber || null,
              sitStart:     p.sitStart    || false,
            });
          });
        });

        // Sort: best conditions first
        allBoulders.sort((a, b) => (b.dryScore + b.condScore) - (a.dryScore + a.condScore));

        const areaDry    = bCount > 0 ? Math.round(sumDry  / bCount) : 0;
        const areaCond   = bCount > 0 ? Math.round(sumCond / bCount) : 0;
        // Canopy for primary sector (first in list)
        const areaCanopy = sectorsToProcess.length > 0 ? getCanopy(sectorsToProcess[0].key) : 1;
        const awConf     = applyCanopy(aw, areaCanopy);
        const areaConf   = calcConfidence(awConf, areaDry, areaCanopy);

        // Drying forecast for the area (primary sector aspect + dominant steepness)
        const areaDom       = dominantSteepness(allBoulders);
        const areaAspect    = sectorsToProcess[0]?.aspect ?? null;
        const dryForecast   = areaDry < 100
          ? estimateDryingForecast(awConf, areaDom, areaAspect)
          : { hours: 0, dryAt: null };

        // Merge AI descriptions from KV cache (populated by cron/refresh)
        const [aDescs, bDescs] = await Promise.all([
          store.get('cache:aiDesc',      { type: 'json' }),
          store.get('cache:boulderDesc', { type: 'json' }),
        ]);
        const areaAiDesc = aDescs?.[areaName] ?? null;
        if (bDescs) {
          for (const b of allBoulders) {
            b.aiDesc = bDescs[b.name] ?? null;
          }
        }

        const areaResult = {
          name:        areaName,
          slug,
          dryScore:    areaDry,
          condScore:   areaCond,
          center:      [centerLat, centerLon],
          dbIds,                           // DB integer IDs for circuit overlay fetch
          aiDesc:      areaAiDesc,         // AI-generated area description
          weather: {
            temp:      aw.temp,
            code:      aw.code,
            wind:      aw.wind,
            windDir:   aw.windDir,
            humidity:  aw.humidity,
            isRaining: aw.isRaining  || false,
            hoursDry:  aw.hoursDry   ?? 0,
          },
          dryingHours: dryForecast.hours,
          dryAt:       dryForecast.dryAt,
          confidence:  areaConf,
          canopy:      areaCanopy,
          boulders:    allBoulders,
          sectorCount: sectorsToProcess.length,
          cachedAt:    Date.now(),
        };

        await store.put(areaCacheKey, JSON.stringify(areaResult), { expirationTtl: CACHE_TTL });
        return new Response(JSON.stringify(areaResult), { headers: { ...CORS, 'X-Cache': 'MISS' } });
      }

      // ── Main scored areas endpoint ──────────────────────────────────────
      const userHeight = url.searchParams.has('h') ? url.searchParams.get('h') : 'none';
      const CACHE_KEY  = `cache:v18:${userHeight}`;

      // Helper: merge AI descriptions (area + boulder) into result
      async function mergeAiDescs(res) {
        const [aDescs, bDescs] = await Promise.all([
          store.get('cache:aiDesc',      { type: 'json' }),
          store.get('cache:boulderDesc', { type: 'json' }),
        ]);
        for (const area of res.areas) {
          if (aDescs && !area.aiDesc) area.aiDesc = aDescs[area.name] ?? null;
          if (bDescs) {
            for (const p of (area.problems || [])) {
              if (!p.aiDesc) p.aiDesc = bDescs[p.name] ?? null;
            }
          }
        }
        return res;
      }

      const cached = await store.get(CACHE_KEY, { type: 'json' });
      if (cached) {
        const withDescs = await mergeAiDescs(cached);
        return new Response(JSON.stringify(withDescs), {
          headers: { ...CORS, 'X-Cache': 'HIT', 'X-Cached-At': new Date(cached.cachedAt).toISOString() }
        });
      }

      const heightForCalc = userHeight === 'none' ? null : userHeight;
      const result = await computeScored(env, heightForCalc);
      await store.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
      const withDescs = await mergeAiDescs(result);

      return new Response(JSON.stringify(withDescs), {
        headers: { ...CORS, 'X-Cache': 'MISS', 'X-Cached-At': new Date(result.cachedAt).toISOString() }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500, headers: CORS
      });
    }
  },

  // ── Cron: refresh widget cache every 20 min ───────────────────────────────
  async scheduled(_event, env, _ctx) {
    try {
      const store = kv(env);
      const result = await computeScored(env, 180);

      // Attach AI descriptions if GROQ_KEY is configured
      if (env.GROQ_KEY) {
        const [aDescs, bDescs] = await Promise.all([
          generateAreaDescriptions(result.areas, env),
          generateBoulderDescriptions(result.areas, env),
        ]);
        await Promise.all([
          store.put('cache:aiDesc',      JSON.stringify(aDescs), { expirationTtl: 7200 }),
          store.put('cache:boulderDesc', JSON.stringify(bDescs), { expirationTtl: 7200 }),
        ]);
        for (const area of result.areas) {
          area.aiDesc = aDescs[area.name] ?? null;
          for (const p of (area.problems || [])) {
            p.aiDesc = bDescs[p.name] ?? null;
          }
        }
      }

      // Save full zone weather separately for AreaPage consistency
      if (result._weatherMap) {
        await store.put('cache:zoneWeather', JSON.stringify(result._weatherMap), { expirationTtl: 1800 });
      }
      const { _weatherMap: _wm, allSectorScores: _aSS2, ...resultForCache } = result;
      await store.put('cache:widget', JSON.stringify(resultForCache), { expirationTtl: 1800 });
      await store.put('cache:v18:180', JSON.stringify(resultForCache), { expirationTtl: CACHE_TTL });
      // Store ALL sector pre-scores for search bar
      if (result.allSectorScores) {
        await store.put('cache:areas-scores', JSON.stringify(result.allSectorScores), { expirationTtl: 1800 });
        await store.delete('cache:areas-list');
      }
    } catch (e) {
      console.error('Cron failed:', e.message);
    }
  }
};
