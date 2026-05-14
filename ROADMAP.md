# 🗺️ HIGHSET v18 — Komplette Implementierungs-Roadmap

**Status**: 2026-05-14 | **Repo**: Serum2low (Worker + Frontend)

---

## 📋 **Übersicht der Komponenten**

```
HIGHSET (Fontainebleau Climbing Conditions)
├── Frontend (Framer + React)
│   ├── AreaPage_v10.tsx ✅ (Desktop + Mobile, Circuits, Verify)
│   ├── AreaNavBar.tsx ✅ (Navigation, Search)
│   ├── WeatherBar.jsx ✅ (Widget, Top 3 Sectors)
│   └── frondend_framer.tsx ⚠️ (Placeholder/Incomplete)
├── Backend (Cloudflare Worker)
│   └── worker.js ✅ (Physics-based scoring, AI descriptions, Admin panel)
├── Data (KV Store)
│   ├── area_hierarchy_v4 (Sectors + metadata)
│   ├── v4:{sector.key} (Boulder arrays)
│   ├── circuits_v4:{dbId} (GeoJSON circuit polylines)
│   ├── admin:overrides (Canopy, Terrain, Aspect, Bias)
│   ├── verify:* (Community reports: dry/wet + size matches)
│   └── cache:* (Widget, Areas, Descriptions)
└── Config
    └── wrangler.jsonc ✅ (Deployment config)
```

---

## ✅ **Was bereits implementiert ist**

### Worker Endpoints (worker.js)
| Endpoint | Method | Status | Beschreibung |
|----------|--------|--------|-------------|
| `/` | GET | ✅ | Main scoring endpoint |
| `/widget` | GET | ✅ | Top 3 areas + current weather |
| `/areas` | GET | ✅ | All areas list (for navbar search) |
| `/area/{slug}` | GET | ✅ | Area landing page (with circuits) |
| `/circuits/{dbIds}` | GET | ✅ | GeoJSON circuit polylines |
| `/verify` | POST | ✅ | Community condition reports |
| `/search?search=...` | GET | ✅ | Quick area/boulder search |
| `/refresh` | GET | ✅ | Manual cache refresh |
| `/admin` | GET | ✅ | Admin panel HTML |
| `/admin/overrides` | GET | ✅ | Read KV overrides |
| `/admin/override` | POST | ✅ | Write KV overrides |
| `/admin/sectors` | GET | ✅ | List all sectors |
| `/admin/boulders` | GET | ✅ | Read boulders for sector |
| `/admin/boulder` | POST/DELETE | ✅ | CRUD single boulder |

### Frontend Components
| Komponente | Status | Features |
|-----------|--------|----------|
| **AreaPage_v10.tsx** | ✅ | Desktop (58% map + list), Mobile (iOS tab bar), Circuits on map, Boulder verify, Size matching |
| **AreaNavBar.tsx** | ✅ | Desktop search pill + dropdowns, Mobile hamburger + overlay, Dynamic areas list |
| **WeatherBar.jsx** | ✅ | Current weather (icon, temp, humidity), Top 3 areas, Canvas animations, Desktop/Mobile responsive |
| **frondend_framer.tsx** | ⚠️ | Grade distribution, Score formatting (incomplete snippet) |

### Physics/Scoring (worker.js)
- ✅ DRY SCORE: Penman evaporation model + water load calculation
- ✅ COND SCORE: VPD + temperature friction curve + dew point
- ✅ Canopy metadata (0=open, 1=light forest, 2=dense)
- ✅ Terrain factors (0=valley, 1=normal, 2=hill, 3=plateau)
- ✅ Aspect-based solar tilt calculation
- ✅ Drying forecast (25 points over 72h)
- ✅ Confidence intervals (Nate Silver style)

### Data Layer
- ✅ area_hierarchy_v4 (hierarchical sectors with boulderCount)
- ✅ v4:{sector.key} arrays (boulders with steepness, grade, coordinates, URL)
- ✅ Rainviewer radar integration (3-tier weather)
- ✅ Admin overrides KV (aspect, canopy, terrain, bias)
- ✅ Community verify reports (dry/wet + size matches with cooldown)

---

## ⚠️ **Was FEHLT oder UNVOLLSTÄNDIG ist**

### 1. **Circuit System — PARTIAL**
- ✅ `/circuits/{dbIds}` endpoint exists
- ✅ GeoJSON rendering in AreaMap (Leaflet)
- ✅ Circuit badges on boulders
- ❌ **Circuit data NOT in KV** — Must populate `circuits_v4:{dbId}` 
- ❌ **No circuit color assignment** in boulders (p.circuitColor, p.circuitNumber)
- ❌ **No circuit-to-boulder mapping** logic

**Action**: Need to either:
- Import circuits from external data source (e.g., bleau.info DB export)
- Manually create circuit GeoJSON for each sector
- Implement circuit editor in admin panel

### 2. **frondend_framer.tsx — INCOMPLETE**
**Issue**: File is heavily minified/obfuscated snippet, not usable component

**Action**: Either:
- Unminify or find original source
- Remove if not needed (AreaPage_v10 + AreaNavBar + WeatherBar may be sufficient)

### 3. **Admin Boulder Editor — MISSING UI**
- ✅ Endpoints exist (`/admin/boulder` POST/DELETE)
- ❌ **No frontend UI** for editing boulder data
- ❌ No size categories editor
- ❌ No popularity/featured toggle

**Action**: Create `AdminBoulderEditor.tsx` component

### 4. **Circuit Map Editor — MISSING**
- ✅ Endpoints exist (`/circuits/{dbIds}` GET)
- ❌ **No circuit creation UI**
- ❌ No circuit polyline editor
- ❌ No color/number assignment UI

**Action**: Create `AdminCircuitEditor.tsx` component

### 5. **KV Data Population — PENDING**
- area_hierarchy_v4 ✅ (exists)
- v4:* boulders ✅ (exists)
- circuits_v4:* ❌ **EMPTY** — Need to populate with GeoJSON
- admin:overrides ✅ (can be created via admin panel)

**Action**: 
- Export or generate circuit GeoJSON
- Bulk upload via CLI or admin script

---

## 🔧 **Implementierungs-Plan (3 Phasen)**

### **Phase 1: Core Verification (Week 1)**
**Ziel**: Sicherstellen, dass alle bestehenden Features funktionieren

- [ ] Deploy worker.js zu Cloudflare
- [ ] Verify KV namespaces (`area_hierarchy_v4`, `v4:*`, `admin:overrides`)
- [ ] Test `/widget` endpoint
- [ ] Test `/area/{slug}` endpoint
- [ ] Test AreaPage_v10 + AreaNavBar + WeatherBar rendering
- [ ] Verify admin panel (`/admin`) login (PIN: 5007)
- [ ] Test admin overrides (canopy, terrain, aspect, bias)

**Deliverables**:
- ✅ Live widget on homepage
- ✅ /gebiete page with AreaNavBar working
- ✅ Admin panel accessible

---

### **Phase 2: Circuit System (Week 2-3)**
**Ziel**: Implement complete circuit support

#### 2a: Circuit Data Import
- [ ] Acquire circuit data (bleau.info export or manual GeoJSON)
- [ ] Create `scripts/import-circuits.js` (bulk upload to KV)
- [ ] Populate `circuits_v4:{dbId}` keys with GeoJSON FeatureCollections
- [ ] Assign circuit colors + numbers to boulders (in v4:* data)

#### 2b: AdminCircuitEditor Component
```tsx
// AdminCircuitEditor.tsx
- List circuits by sector
- Leaflet map with draw tools (draw-leaflet)
- Color picker + number input
- Save to `/admin/circuit` endpoint (NEW)
- Delete circuits
```

#### 2c: Circuit CRUD Endpoint (NEW)
```javascript
// POST /admin/circuit
// { secret, sector, dbId, properties: { color, number }, geometry }
// Saves to circuits_v4:{dbId}
// Invalidates cache:area:{slug}

// DELETE /admin/circuit
// { secret, dbId }
// Removes circuits_v4:{dbId}
```

**Deliverables**:
- ✅ Circuit polylines visible on AreaPage map
- ✅ Circuit badges on boulder markers
- ✅ Admin UI to create/edit circuits
- ✅ Circuit legend in area header

---

### **Phase 3: Boulder & Admin Refinements (Week 3-4)**
**Ziel**: Complete admin tooling for day-to-day data management

#### 3a: AdminBoulderEditor Component
```tsx
// AdminBoulderEditor.tsx
- Sector selector dropdown
- Table of boulders (name, grade, steepness, coordinates, URL)
- Inline editing for each field
- Size categories editor (height ranges + percentages)
- Popularity/Featured toggles
- Add/Delete buttons
- Bulk upload CSV support
```

#### 3b: Enhance `/admin/boulder` Endpoint
```javascript
// POST /admin/boulder?bulk=true
// { secret, sector, boulders: [{...}, {...}] }
// Bulk upsert with transaction handling
```

#### 3c: Circuit Assignment UI
- Link boulders to circuits (circuit color + number selector)
- Display circuit info in boulder row (in AreaPage)

**Deliverables**:
- ✅ Full boulder management UI
- ✅ Size categories editor
- ✅ Bulk boulder import/export
- ✅ Circuit assignment UI

---

## 📂 **File Structure nach Implementierung**

```
Serum2low/
├── worker.js (2542 lines) ✅
├── wrangler.jsonc ✅
├── AreaPage_v10.tsx ✅
├── AreaNavBar.tsx ✅
├── WeatherBar.jsx ✅
├── AdminBoulderEditor.tsx (NEW - Phase 3)
├── AdminCircuitEditor.tsx (NEW - Phase 2b)
├── area_hierarchy_kv.json ✅
├── area_hierarchy_topo.json ✅
├── scripts/
│   ├── import-circuits.js (NEW - Phase 2a)
│   ├── enrich_topo.js (existing?)
│   └── bulk-upload-boulders.js (NEW - Phase 3b)
├── ROADMAP.md (this file)
└── README.md (update with endpoints)
```

---

## 🔑 **Kritische KV-Keys nach Implementierung**

| Key Pattern | Beschreibung | TTL | Manual? |
|------------|-------------|-----|---------|
| `area_hierarchy_v4` | Sector tree with lat/lon/dbIds | ∞ | Manuell (einmalig) |
| `v4:{sector.key}` | Boulder array for sector | ∞ | Manuell oder Admin UI |
| `circuits_v4:{dbId}` | GeoJSON FeatureCollection | ∞ | Admin UI (Phase 2) |
| `admin:overrides` | Canopy/Terrain/Aspect/Bias | ∞ | Admin UI ✅ |
| `verify:*` | Community reports (dry/wet/size) | ∞ | Auto (POST /verify) |
| `cache:widget` | Top 3 + weather | 30min | Auto (cron) |
| `cache:v18:*` | Full scored results | 20min | Auto (cron) |
| `cache:area:{slug}` | Area page data | 20min | Auto (computed) |
| `cache:areas-list` | All areas (navbar) | 20min | Auto (computed) |
| `cache:areas-scores` | Pre-scores all sectors | 30min | Auto (cron) |
| `cache:aiDesc` | AI descriptions | 2h | Auto (cron + GROQ/Gemini) |
| `cache:boulderDesc` | Boulder AI descriptions | 2h | Auto (cron) |
| `cache:zoneWeather` | 7 zone weather objects | 30min | Auto (cron) |

---

## 🚀 **Deployment Checklist**

### Pre-Deployment (Phase 1)
- [ ] Verify all endpoints work locally (wrangler dev)
- [ ] Test admin panel with PIN=5007
- [ ] Check KV bindings in wrangler.jsonc
- [ ] Verify GROQ_KEY / GEMINI_API_KEY secrets in Cloudflare dashboard
- [ ] Test cron trigger (*/20 * * * *)

### Deployment
```bash
# Deploy worker
wrangler deploy

# Populate KV (if needed)
node scripts/import-circuits.js

# Verify
curl https://highset.faymonvillejulius.workers.dev/widget
```

### Post-Deployment
- [ ] Monitor worker logs for errors
- [ ] Check cron executions in Cloudflare UI
- [ ] Verify /admin panel is PIN-gated
- [ ] Test /verify endpoint with community vote
- [ ] Check cache hit rates (X-Cache headers)

---

## 🔐 **Security Notes**

1. **Admin PIN**: Currently `5007` (hardcoded + env vars)
   - ❌ NOT SECURE for production
   - Implement JWT or session tokens instead

2. **VERIFY_TOKEN**: `highset-public-v1`
   - Used for community reports
   - Should be obfuscated or rotated

3. **Admin Overrides**:
   - No permission check beyond PIN
   - Anyone with PIN can modify all sectors
   - Consider rate-limiting

---

## 📊 **Success Metrics**

After Phase 3:
- ✅ AreaPage shows circuits on map
- ✅ Boulder editing UI is fully functional
- ✅ Community verify reports working
- ✅ Admin can manage all data via UI
- ✅ Cache invalidation working smoothly
- ✅ No missing endpoints
- ✅ <100ms response times (cached)

---

## 💬 **Next Steps**

1. **Confirm Phase 1**: Verify all current features work
2. **Acquire circuit data**: Where do circuits come from?
3. **Create branches**:
   - `feature/circuits-phase-2`
   - `feature/admin-editors-phase-3`
4. **Start Phase 2a**: Import circuits script
5. **Test locally**: `wrangler dev`
6. **Deploy incrementally**: Test each phase before next

---

**Generated**: 2026-05-14
**Author**: Julius (faymonvillejulius-byte)
**Status**: DRAFT — Awaiting review & confirmation
