// AreaPage.tsx — HIGHSET Area Landing Page v10
// Desktop: Side-by-Side (Karte links, Liste rechts)
// Mobile:  iOS-Style — Peek-Card auf Map, Grade-Chart in Liste, Bottom Tab Bar
// NEU v10: Circuit-Polylinien auf Karte, Circuit-Badge in Boulder-Liste
import { addPropertyControls, ControlType } from "framer"
import React, { useState, useEffect, useRef } from "react"

const WORKER       = "https://highset.faymonvillejulius.workers.dev"
const VERIFY_TOKEN = "highset-public-v1"
const FONT         = `-apple-system, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", sans-serif`
const BG           = "#0d0d0d"
const MOBILE_BP    = 680
const GREEN        = "#30D158"

// Circuit-Farben (Boolder-Standard → Apple HIG)
const CIRCUIT_COLORS: Record<string, string> = {
    yellow:  "#FFD60A",
    orange:  "#FF9F0A",
    red:     "#FF453A",
    blue:    "#0A84FF",
    skyblue: "#32ADE6",
    white:   "#E8E8ED",
    black:   "#8E8E93",  // nicht pures Schwarz für Sichtbarkeit
    purple:  "#BF5AF2",
    green:   "#30D158",
    salmon:  "#FF6B6B",
}

interface Boulder {
    id?: number
    name: string; grade: string; lat?: number; lng?: number
    dryScore: number; condScore: number; style?: string
    circuitColor?: string; circuitNumber?: number; sitStart?: boolean
    heightStats?: { categories: string[]; percentages: number[] }
    gradeVotes?:  { categories: string[]; percentages: number[] }
    consensusGrade?: string
    url?: string
}
interface AreaData {
    name: string; slug: string; dryScore: number; condScore: number
    center?: [number, number]
    dbIds?: number[]
    weather?: { temp: number; code: number; wind: number; windDir: string; humidity: number }
    boulders: Boulder[]
}

function resolveSlug(fallback: string): string {
    try {
        const p = new URLSearchParams(window.location.search)
        const q = p.get("area") || p.get("slug") || p.get("name")
        if (q) return q
        const parts = window.location.pathname.split("/").filter(Boolean)
        if (parts.length) return parts[parts.length - 1]
    } catch {}
    return fallback
}

const GCOL: Record<string, string> = {
    "3":"#E8E8ED","3a":"#E8E8ED","3b":"#E8E8ED","3c":"#E8E8ED",
    "4":"#E8E8ED","4a":"#E8E8ED","4b":"#FFD60A","4c":"#FFD60A",
    "5a":"#FFD60A","5b":"#FFD60A","5c":"#FFD60A",
    "6a":"#FF9F0A","6a+":"#FF9F0A","6b":"#FF9F0A","6b+":"#FF9F0A","6c":"#FF9F0A","6c+":"#0A84FF",
    "7a":"#0A84FF","7a+":"#0A84FF","7b":"#0A84FF","7b+":"#0A84FF","7c":"#0A84FF",
    "7c+":"#FF453A","8a":"#FF453A","8a+":"#FF453A","8b":"#FF453A","8b+":"#FF453A",
    "8c":"#BF5AF2","8c+":"#BF5AF2","9a":"#BF5AF2",
}
const GRADE_ORDER = ["3","3a","3b","3c","4","4a","4b","4c",
    "5a","5b","5c","6a","6a+","6b","6b+","6c","6c+",
    "7a","7a+","7b","7b+","7c","7c+","8a","8a+","8b","8b+","8c","8c+","9a"]
const GRADE_GROUPS = ["alle","3–5","6a–6c+","7a–7c+","8a+"] as const

function gradeColor(g: string) { return GCOL[g] || "#E8E8ED" }
function scoreColor(s: number) {
    if (s >= 75) return GREEN; if (s >= 50) return "#34C759"
    if (s >= 35) return "#FFD60A"; if (s >= 15) return "#FF9F0A"
    return "#FF453A"
}
function wmoIcon(c = 0) {
    if (c === 0) return "☀️"; if (c <= 2) return "⛅"; if (c <= 3) return "☁️"
    if (c <= 48) return "🌫"; if (c <= 67) return "🌧"; if (c <= 82) return "🌦"
    return "⛈️"
}
function inGroup(grade: string, group: string): boolean {
    if (group === "alle") return true
    const i = GRADE_ORDER.indexOf(grade)
    if (group === "3–5")    return i >= 0  && i <= 10
    if (group === "6a–6c+") return i >= 11 && i <= 16
    if (group === "7a–7c+") return i >= 17 && i <= 22
    if (group === "8a+")    return i >= 23
    return true
}

// ── Leaflet ───────────────────────────────────────────────────────────────────
let _leafletReady: Promise<any> | null = null
function loadLeaflet(): Promise<any> {
    if (_leafletReady) return _leafletReady
    _leafletReady = new Promise(resolve => {
        if ((window as any).L) { resolve((window as any).L); return }
        if (!document.querySelector("[data-leaflet-css]")) {
            const l = document.createElement("link")
            l.rel = "stylesheet"; l.setAttribute("data-leaflet-css","1")
            l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            document.head.appendChild(l)
        }
        const s = document.createElement("script")
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        s.onload = () => resolve((window as any).L)
        document.head.appendChild(s)
    })
    return _leafletReady
}

// ── Area Map mit Circuit-Overlay ──────────────────────────────────────────────
function AreaMap({
    boulders, center, circuits, flyRef
}: {
    boulders: Boulder[]
    center: [number, number]
    circuits: any | null
    flyRef?: React.MutableRefObject<((lat: number, lng: number) => void) | null>
}) {
    const divRef          = useRef<HTMLDivElement>(null)
    const mapRef          = useRef<any>(null)
    const circuitLayerRef = useRef<any>(null)
    // Store pending circuits (may arrive before map is ready)
    const pendingCircRef  = useRef<any>(null)

    // Helper: apply circuit GeoJSON to map
    function applyCircuitsToMap(L: any, map: any, geo: any) {
        if (circuitLayerRef.current) {
            map.removeLayer(circuitLayerRef.current)
            circuitLayerRef.current = null
        }
        if (!geo?.features?.length) return
        const layer = L.geoJSON(geo, {
            style: (feature: any) => ({
                color:   CIRCUIT_COLORS[feature.properties.color] || "#8E8E93",
                weight:  3.5,
                opacity: 0.90,
                lineJoin:  "round",
                lineCap:   "round",
            }),
        })
        // Circuits rendered below boulder markers (pane order)
        layer.addTo(map)
        circuitLayerRef.current = layer
        // Bring boulder pane on top
        if (map.getPane("markerPane")) map.getPane("markerPane").style.zIndex = 700
    }

    // Init map + boulder markers
    useEffect(() => {
        let alive = true
        loadLeaflet().then(L => {
            if (!alive || !divRef.current || mapRef.current) return
            const map = L.map(divRef.current, {
                zoomControl: true, scrollWheelZoom: false, tap: false,
            }).setView(center, 14)
            mapRef.current = map
            if (flyRef) flyRef.current = (lat, lng) => map.flyTo([lat, lng], 17, { duration: 0.8 })

            L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
                attribution: "© CartoDB © OSM", maxZoom: 19, subdomains: "abcd",
            }).addTo(map)

            // Boulder markers
            boulders.forEach(b => {
                if (b.lat == null || b.lng == null) return
                const sc = scoreColor(b.dryScore ?? 0)
                const cc = b.circuitColor ? CIRCUIT_COLORS[b.circuitColor] : null
                const border = cc ? `3px solid ${cc}` : `2px solid rgba(0,0,0,0.4)`
                const num  = b.circuitNumber ?? ""
                const icon = L.divIcon({
                    className: "", iconSize: [28, 28], iconAnchor: [14, 14],
                    html: `<div style="width:28px;height:28px;border-radius:50%;background:${sc};
                        border:${border};box-shadow:0 0 8px ${sc}55;
                        display:flex;align-items:center;justify-content:center;
                        font-size:${(b.grade ?? "").length > 2 ? 7 : 8}px;font-weight:800;color:#000;
                        font-family:-apple-system,sans-serif;cursor:pointer;
                        position:relative">
                        ${b.grade ?? "?"}
                        ${num ? `<span style="position:absolute;top:-5px;right:-5px;
                            background:${cc||"#888"};color:#000;border-radius:6px;
                            font-size:6px;font-weight:900;padding:1px 3px;
                            line-height:1.2;min-width:10px;text-align:center">${num}</span>` : ""}
                    </div>`,
                })
                L.marker([b.lat, b.lng], { icon })
                    .bindPopup(`<div style="font-family:-apple-system,sans-serif;min-width:130px">
                        <div style="font-weight:700;font-size:13px;margin-bottom:6px">${b.name}</div>
                        <div style="display:flex;gap:6px;align-items:center">
                            <span style="background:${gradeColor(b.grade ?? "")};color:#000;
                                padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800">${b.grade ?? "?"}</span>
                            <span style="color:${sc};font-weight:700;font-size:12px">${b.dryScore ?? 0}%</span>
                            ${cc ? `<span style="background:${cc};color:#000;padding:2px 6px;border-radius:5px;font-size:9px;font-weight:800">${b.circuitColor} ${num}</span>` : ""}
                        </div>
                        ${b.style ? `<div style="font-size:10px;color:#999;margin-top:4px">${b.style}</div>` : ""}
                    </div>`, { maxWidth: 200 })
                    .addTo(map)
            })

            // Apply circuits if already loaded
            if (pendingCircRef.current) {
                applyCircuitsToMap(L, map, pendingCircRef.current)
            }
        })
        return () => { alive = false; if (flyRef) flyRef.current = null; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
    }, [])

    // React to circuits data changes
    useEffect(() => {
        pendingCircRef.current = circuits
        if (!circuits || !mapRef.current) return
        loadLeaflet().then(L => {
            if (!mapRef.current) return
            applyCircuitsToMap(L, mapRef.current, circuits)
        })
    }, [circuits])

    return <div ref={divRef} style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />
}

// ── Circuit Badge ─────────────────────────────────────────────────────────────
function CircuitBadge({ color, number }: { color: string; number?: number }) {
    const c = CIRCUIT_COLORS[color] || "#8E8E93"
    return (
        <div style={{
            display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
            background: `${c}22`, border: `1px solid ${c}55`,
            borderRadius: 6, padding: "2px 6px",
        }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
            {number != null && (
                <span style={{ fontSize: 9, fontWeight: 800, color: c, fontFamily: FONT, lineHeight: 1 }}>
                    {number}
                </span>
            )}
        </div>
    )
}

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, label, size = 56 }: { score: number; label: string; size?: number }) {
    const c = scoreColor(score), r = (size - 8) / 2
    const circ = 2 * Math.PI * r, dash = (score / 100) * circ
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <div style={{ position: "relative", width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={4} />
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={4}
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 4px ${c}88)` }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 13, fontWeight: 800, color: c, fontFamily: FONT }}>
                    {score}
                </div>
            </div>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", fontFamily: FONT,
                textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</div>
        </div>
    )
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number }) {
    const c = scoreColor(value)
    return (
        <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: c, fontFamily: FONT }}>{value}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.10)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${value}%`, height: "100%", background: c, borderRadius: 2,
                    boxShadow: `0 0 6px ${c}88`, transition: "width .4s ease" }} />
            </div>
        </div>
    )
}

// ── Mini Boulder Card ─────────────────────────────────────────────────────────
function MiniBoulderCard({ b }: { b: Boulder }) {
    const [h, setH] = useState(false)
    const gc = gradeColor(b.grade ?? "")
    const sc = scoreColor(b.dryScore ?? 0)
    return (
        <div onTouchStart={() => setH(true)} onTouchEnd={() => setTimeout(() => setH(false), 120)}
            style={{
                width: 82, flexShrink: 0, borderRadius: 12,
                background: h ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)",
                padding: "10px 8px", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 6, cursor: "pointer",
                transition: "background .12s", boxSizing: "border-box",
            }}>
            <div style={{ position: "relative", width: 34, height: 34, borderRadius: 9, background: gc,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 10px ${gc}55` }}>
                <span style={{ fontSize: (b.grade ?? "").length > 2 ? 7 : 9, fontWeight: 800, color: "#000", fontFamily: FONT }}>
                    {b.grade ?? "?"}
                </span>
                {b.circuitColor && b.circuitNumber != null && (
                    <div style={{ position: "absolute", top: -5, right: -5,
                        background: CIRCUIT_COLORS[b.circuitColor] || "#888",
                        color: "#000", borderRadius: 5, fontSize: 7, fontWeight: 900,
                        padding: "1px 3px", lineHeight: "1.2" }}>
                        {b.circuitNumber}
                    </div>
                )}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#fff", fontFamily: FONT,
                textAlign: "center", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", width: "100%" }}>
                {b.name}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: sc, fontFamily: FONT }}>{b.dryScore}%</div>
        </div>
    )
}

// ── Grade Distribution Chart ──────────────────────────────────────────────────
function GradeChart({ boulders }: { boulders: Boulder[] }) {
    const groups = [
        { label: "3–5",    color: "#E8E8ED", count: boulders.filter(b => inGroup(b.grade, "3–5")).length },
        { label: "6a–6c+", color: "#FF9F0A", count: boulders.filter(b => inGroup(b.grade, "6a–6c+")).length },
        { label: "7a–7c+", color: "#0A84FF", count: boulders.filter(b => inGroup(b.grade, "7a–7c+")).length },
        { label: "8a+",    color: "#BF5AF2", count: boulders.filter(b => inGroup(b.grade, "8a+")).length },
    ]
    const max = Math.max(...groups.map(g => g.count), 1)
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "10px 16px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {groups.map(g => (
                <div key={g.label} style={{ flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: g.count > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                        fontFamily: FONT }}>{g.count}</span>
                    <div style={{ width: "100%", height: 28, display: "flex", alignItems: "flex-end",
                        borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
                        <div style={{
                            width: "100%", height: `${Math.round((g.count / max) * 100)}%`,
                            background: g.count > 0 ? g.color : "transparent",
                            opacity: g.count > 0 ? 0.75 : 0,
                            borderRadius: 4, minHeight: g.count > 0 ? 3 : 0,
                            transition: "height .4s ease",
                        }} />
                    </div>
                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", fontFamily: FONT,
                        whiteSpace: "nowrap" }}>{g.label}</span>
                </div>
            ))}
        </div>
    )
}

// ── Desktop Boulder Row ───────────────────────────────────────────────────────
function BoulderRow({ b, borderColor = "rgba(255,255,255,0.07)", onBoulderClick, userHeight, vote }: { b: Boulder; borderColor?: string; onBoulderClick?: (b: Boulder) => void; userHeight: number | null; vote: BoulderVoteState }) {
    const [h, setH] = useState(false)
    const gc = gradeColor(b.grade ?? "")
    const sc = scoreColor(b.dryScore ?? 0)
    const cc = scoreColor(b.condScore ?? 0)
    const matchStatus = getMatchStatus(b, userHeight)
    return (
        <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{ display: "flex", flexDirection: "column", padding: "10px 16px",
                borderBottom: `1px solid ${borderColor}`,
                background: h ? "rgba(255,255,255,0.05)" : "transparent",
                cursor: "pointer", transition: "background .12s",
                boxSizing: "border-box", width: "100%" }}>
            <div onClick={() => onBoulderClick?.(b)}
                style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ position: "relative", width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: gc,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 0 10px ${gc}44` }}>
                    <span style={{ fontSize: (b.grade ?? "").length > 2 ? 7 : 10, fontWeight: 800, color: "#000", fontFamily: FONT }}>
                        {b.grade ?? "?"}
                    </span>
                    {b.circuitColor && b.circuitNumber != null && (
                        <div style={{ position: "absolute", top: -6, right: -6,
                            background: CIRCUIT_COLORS[b.circuitColor] || "#888",
                            color: "#000", borderRadius: 5, fontSize: 7, fontWeight: 900,
                            padding: "1px 3px", lineHeight: "1.2", border: "1px solid rgba(0,0,0,0.2)" }}>
                            {b.circuitNumber}
                        </div>
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: FONT,
                        letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
                        {userHeight && <MatchDot status={matchStatus} />}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                        {b.style && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: FONT }}>{b.style}</div>}
                        {b.circuitColor && <CircuitBadge color={b.circuitColor} number={b.circuitNumber} />}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: "center", minWidth: 28 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: sc, fontFamily: FONT, lineHeight: 1 }}>{b.dryScore ?? 0}</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", fontFamily: FONT, textTransform: "uppercase", marginTop: 2 }}>Dry</div>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 28 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: cc, fontFamily: FONT, lineHeight: 1 }}>{b.condScore ?? 0}</div>
                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", fontFamily: FONT, textTransform: "uppercase", marginTop: 2 }}>Cond</div>
                    </div>
                </div>
            </div>
            <BoulderActions boulder={b} userHeight={userHeight} initialVote={vote} />
        </div>
    )
}

// ── Match Dot (3-Zustands-Indikator) ─────────────────────────────────────────
function MatchDot({ status, size = 6 }: { status: MatchStatus; size?: number }) {
    const colors = {
        match:   "#30D158",
        nomatch: "#FF453A",
        unknown: "rgba(255,255,255,0.18)",
    }
    return (
        <div title={status === "match" ? "Passt zu deiner Größe"
                  : status === "nomatch" ? "Passt nicht"
                  : "Größe unbekannt"}
            style={{ width: size, height: size, borderRadius: "50%",
                background: colors[status], flexShrink: 0,
                boxShadow: status === "match" ? `0 0 4px ${colors.match}88` : "none" }} />
    )
}

// ── Boulder Actions (Trocken/Nass + Größe Passt/Nicht) ───────────────────────
function BoulderActions({
    boulder, userHeight, initialVote,
}: {
    boulder: Boulder
    userHeight: number | null
    initialVote: BoulderVoteState
}) {
    const [vote, setVote] = useState<BoulderVoteState>(initialVote)

    async function submit(kind: "condition" | "size", status: "dry" | "wet" | "yes" | "no") {
        if ((vote as any)[kind]) return  // schon abgegeben
        setVote(prev => ({ ...prev, [kind]: status }))  // optimistisch
        saveBoulderVote(boulder.id!, kind, status)
        try {
            const body: any = {
                secret: VERIFY_TOKEN,
                boulderId: boulder.id,
                kind, status,
                userId: getOrCreateUserId(),
            }
            if (kind === "size" && userHeight) body.height = userHeight
            await fetch(`${WORKER}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
        } catch { /* optimistisches UI bleibt */ }
    }

    const Pill = ({ label, active, accentRgb, onTap }: {
        label: string; active: boolean; accentRgb: string; onTap: () => void
    }) => (
        <div
            onClick={onTap}
            onTouchStart={() => {}}
            style={{
                padding: "3px 8px", borderRadius: 6,
                fontSize: 9, fontWeight: 600, fontFamily: FONT,
                background: active ? `rgba(${accentRgb},0.18)` : "rgba(255,255,255,0.04)",
                border: `1px solid rgba(${accentRgb},${active ? 0.40 : 0.08})`,
                color: active ? `rgb(${accentRgb})` : "rgba(255,255,255,0.32)",
                cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                transition: "all .2s ease",
                opacity: 1,
                pointerEvents: active ? "none" : "auto",
                WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}>
            {label}
        </div>
    )

    // Pair-Wrapper: wenn ein Knopf des Pairs aktiv → ganzes Pair greyen
    function Pair({ kind, options }: {
        kind: "condition" | "size"
        options: Array<{ status: "dry"|"wet"|"yes"|"no"; label: string; accentRgb: string }>
    }) {
        const chosen = (vote as any)[kind] as string | undefined
        const greyed = !!chosen
        return (
            <div style={{
                display: "flex", gap: 3, flexShrink: 0,
                opacity: greyed ? 0.55 : 1,
                transition: "opacity .25s ease",
            }}>
                {options.map(o => {
                    const isChosen = chosen === o.status
                    return (
                        <Pill
                            key={o.status}
                            label={isChosen ? `✓ ${o.label}` : o.label}
                            active={isChosen}
                            accentRgb={o.accentRgb}
                            onTap={() => submit(kind, o.status as any)}
                        />
                    )
                })}
            </div>
        )
    }

    // Größen-Buttons nur wenn User-Größe gesetzt UND boulder hat ID
    const showSize = userHeight && boulder.id != null
    if (!boulder.id) return null

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <Pair kind="condition" options={[
                { status: "dry", label: "Trocken", accentRgb: "48,209,88" },
                { status: "wet", label: "Nass",    accentRgb: "10,132,255" },
            ]} />
            {showSize && (
                <Pair kind="size" options={[
                    { status: "yes", label: "Passt",       accentRgb: "48,209,88" },
                    { status: "no",  label: "Passt nicht", accentRgb: "255,255,255" },
                ]} />
            )}
        </div>
    )
}

// ── Mobile Boulder Row (mit Grade-Akzent-Linie) ───────────────────────────────
function MobileBoulderRow({ b, borderColor = "rgba(255,255,255,0.07)", onBoulderClick, userHeight, vote }: { b: Boulder; borderColor?: string; onBoulderClick?: (b: Boulder) => void; userHeight: number | null; vote: BoulderVoteState }) {
    const [h, setH] = useState(false)
    const gc = gradeColor(b.grade ?? "")
    const sc = scoreColor(b.dryScore ?? 0)
    const cc = scoreColor(b.condScore ?? 0)
    const matchStatus = getMatchStatus(b, userHeight)
    return (
        <div
            style={{ display: "flex", flexDirection: "column",
                borderBottom: `1px solid ${borderColor}`,
                background: h ? "rgba(255,255,255,0.05)" : "transparent",
                transition: "background .1s",
                boxSizing: "border-box", width: "100%",
                borderLeft: `3px solid ${gc}`,
                paddingBottom: 6,
            }}>
        <div
            onTouchStart={() => setH(true)}
            onTouchEnd={() => { setTimeout(() => setH(false), 120); onBoulderClick?.(b) }}
            onTouchCancel={() => setH(false)}
            style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <div style={{ position: "relative", width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: gc,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "10px 12px 10px 13px",
                boxShadow: `0 0 12px ${gc}55` }}>
                <span style={{ fontSize: (b.grade ?? "").length > 2 ? 8 : 11, fontWeight: 800, color: "#000", fontFamily: FONT }}>
                    {b.grade ?? "?"}
                </span>
                {b.circuitColor && b.circuitNumber != null && (
                    <div style={{ position: "absolute", top: -6, right: -6,
                        background: CIRCUIT_COLORS[b.circuitColor] || "#888",
                        color: "#000", borderRadius: 6, fontSize: 8, fontWeight: 900,
                        padding: "1px 4px", lineHeight: "1.2", border: "1px solid rgba(0,0,0,0.15)" }}>
                        {b.circuitNumber}
                    </div>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: FONT,
                    letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.name}
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 2, alignItems: "center" }}>
                    {b.style && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontFamily: FONT }}>{b.style}</div>}
                    {b.circuitColor && <CircuitBadge color={b.circuitColor} number={b.circuitNumber} />}
                </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexShrink: 0, paddingRight: 16 }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: sc, fontFamily: FONT, lineHeight: 1 }}>{b.dryScore ?? 0}</div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: FONT, textTransform: "uppercase", marginTop: 2, letterSpacing: "0.06em" }}>Dry</div>
                </div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: cc, fontFamily: FONT, lineHeight: 1 }}>{b.condScore ?? 0}</div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: FONT, textTransform: "uppercase", marginTop: 2, letterSpacing: "0.06em" }}>Cond</div>
                </div>
            </div>
        </div>
    )
}

function Chip({ icon, label, accent = false }: { icon: string; label: string; accent?: boolean }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            background: accent ? "rgba(100,210,255,0.10)" : "rgba(255,255,255,0.07)",
            border: `1px solid ${accent ? "rgba(100,210,255,0.22)" : "rgba(255,255,255,0.10)"}`,
            borderRadius: 8, padding: "4px 9px" }}>
            <span style={{ fontSize: 11 }}>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: FONT,
                color: accent ? "#64D2FF" : "rgba(255,255,255,0.75)" }}>{label}</span>
        </div>
    )
}

// ── Community Verify + Gamification ──────────────────────────────────────────
function getOrCreateUserId(): string {
    try {
        const stored = localStorage.getItem("hset_uid")
        if (stored) return stored
        const id = crypto.randomUUID()
        localStorage.setItem("hset_uid", id)
        return id
    } catch { return "anon" }
}

// ── User-Höhe (cm) — wird einmalig gesetzt, im localStorage gespeichert ────
function loadUserHeight(): number | null {
    try {
        const raw = localStorage.getItem("hset_h")
        const n = raw ? parseInt(raw, 10) : NaN
        return Number.isFinite(n) && n >= 100 && n <= 230 ? n : null
    } catch { return null }
}
function saveUserHeight(cm: number) {
    try { localStorage.setItem("hset_h", String(cm)) } catch {}
}

// Match-Status für einen Boulder: passt / passt nicht / unbekannt
type MatchStatus = "match" | "nomatch" | "unknown"
function getMatchStatus(b: Boulder, userH: number | null): MatchStatus {
    if (!userH || !b.heightStats?.categories?.length) return "unknown"
    const idx = b.heightStats.categories.findIndex(c => {
        const m = c.match(/^(\d+)\.\.(\d+)$/)
        return m && userH >= parseInt(m[1], 10) && userH <= parseInt(m[2], 10)
    })
    if (idx < 0) return "unknown"
    return (b.heightStats.percentages?.[idx] || 0) > 0 ? "match" : "nomatch"
}

// localStorage-State für Boulder-Klicks (greyed-out persistiert über Refresh)
interface BoulderVoteState { condition?: "dry" | "wet"; size?: "yes" | "no" }
function loadBoulderVotes(): Record<number, BoulderVoteState> {
    try {
        const raw = localStorage.getItem("hset_bv")
        return raw ? JSON.parse(raw) : {}
    } catch { return {} }
}
function saveBoulderVote(id: number, kind: "condition" | "size", status: "dry" | "wet" | "yes" | "no") {
    try {
        const all = loadBoulderVotes()
        if (!all[id]) all[id] = {}
        ;(all[id] as any)[kind] = status
        localStorage.setItem("hset_bv", JSON.stringify(all))
    } catch {}
}

interface AccStats { accuracy: number | null; reports: number }

function loadAccStats(): AccStats {
    try {
        const raw = localStorage.getItem("hset_acc")
        if (raw) return JSON.parse(raw)
    } catch {}
    return { accuracy: null, reports: 0 }
}

function saveAccStats(accuracy: number | null, reports: number) {
    try { localStorage.setItem("hset_acc", JSON.stringify({ accuracy, reports })) } catch {}
}

type StatusLevel = "none" | "rookie" | "insider" | "top"
function getStatusLevel(stats: AccStats): StatusLevel {
    const { reports, accuracy } = stats
    if (reports >= 25 && (accuracy ?? 0) >= 75) return "top"
    if (reports >= 10 && (accuracy ?? 0) >= 60) return "insider"
    if (reports >= 5) return "rookie"
    return "none"
}

const STATUS_META: Record<StatusLevel, { label: string; color: string } | null> = {
    none:    null,
    rookie:  { label: "Rookie",      color: "rgba(255,255,255,0.50)" },
    insider: { label: "Insider",     color: "#FFD60A" },
    top:     { label: "Top Melder ⭐", color: "#30D158" },
}

function StatusBadge({ stats }: { stats: AccStats }) {
    const level = getStatusLevel(stats)
    const meta  = STATUS_META[level]
    if (!meta) return null
    return (
        <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: `${meta.color}18`,
            border: `1px solid ${meta.color}40`,
            borderRadius: 7, padding: "2px 8px",
            fontSize: 9, fontWeight: 700, color: meta.color,
            fontFamily: FONT, letterSpacing: "0.04em", flexShrink: 0,
        }}>
            🎯 {meta.label}
            {stats.accuracy !== null && (
                <span style={{ opacity: 0.7 }}>· {stats.accuracy}%</span>
            )}
        </div>
    )
}

type VerifyPhase = "idle" | "submitting" | "done" | "duplicate"
interface VerifyResult { dryPct: number; wetPct: number; total: number; nextAvailableTs?: number; lastStatus?: "dry" | "wet" }

function VerifyBar({ areaKey, compact = false }: { areaKey: string; compact?: boolean }) {
    const [phase,    setPhase]    = useState<VerifyPhase>("idle")
    const [result,   setResult]   = useState<VerifyResult | null>(null)
    const [choice,   setChoice]   = useState<"dry" | "wet" | null>(null)
    const [accStats, setAccStats] = useState<AccStats>(() => loadAccStats())

    async function submit(status: "dry" | "wet") {
        if (phase !== "idle") return
        setChoice(status)
        setPhase("submitting")
        try {
            const res = await fetch(`${WORKER}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secret: VERIFY_TOKEN, areaKey, status, userId: getOrCreateUserId() }),
            })
            const json = await res.json()
            if (json.ok && json.duplicate) {
                setResult({ dryPct: json.dryPct, wetPct: json.wetPct, total: json.total, nextAvailableTs: json.nextAvailableTs, lastStatus: json.lastStatus })
                setChoice(json.lastStatus ?? status)
                setPhase("duplicate")
            } else if (json.ok) {
                const updated: AccStats = { accuracy: json.userAccuracy, reports: json.userReports }
                saveAccStats(updated.accuracy, updated.reports)
                setAccStats(updated)
                setResult({ dryPct: json.dryPct, wetPct: json.wetPct, total: json.total })
                setPhase("done")
            } else {
                setPhase("idle")
            }
        } catch {
            setPhase("idle")
        }
    }

    // Status bestimmt Glow-Intensität des gewählten Buttons — kein sichtbares Label
    const level = getStatusLevel(accStats)
    const glowMult = level === "top" ? 1.4 : level === "insider" ? 1.1 : 0.8

    const btnBase: React.CSSProperties = {
        flex: 1, height: compact ? 36 : 44, borderRadius: 11, border: "none",
        cursor: "pointer", fontFamily: FONT, fontSize: compact ? 12 : 13, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .18s", WebkitTapHighlightColor: "transparent",
        letterSpacing: "-0.01em", boxSizing: "border-box",
    } as React.CSSProperties

    // ── idle / submitting ────────────────────────────────────────────────────
    if (phase === "idle" || phase === "submitting") return (
        <div style={{ display: "flex", gap: 7 }}>
            <button
                disabled={phase === "submitting"}
                onTouchStart={() => {}}
                onClick={() => submit("dry")}
                style={{
                    ...btnBase,
                    background: phase === "submitting" && choice === "dry"
                        ? "rgba(48,209,88,0.22)" : "rgba(48,209,88,0.10)",
                    border: `1px solid rgba(48,209,88,${phase === "submitting" && choice === "dry" ? "0.55" : "0.22"})`,
                    color: phase === "submitting" && choice === "wet" ? "rgba(48,209,88,0.25)" : "#30D158",
                }}>
                Trocken
            </button>
            <button
                disabled={phase === "submitting"}
                onTouchStart={() => {}}
                onClick={() => submit("wet")}
                style={{
                    ...btnBase,
                    background: phase === "submitting" && choice === "wet"
                        ? "rgba(10,132,255,0.22)" : "rgba(10,132,255,0.10)",
                    border: `1px solid rgba(10,132,255,${phase === "submitting" && choice === "wet" ? "0.55" : "0.22"})`,
                    color: phase === "submitting" && choice === "dry" ? "rgba(10,132,255,0.25)" : "#0A84FF",
                }}>
                Nass
            </button>
        </div>
    )

    // ── duplicate ────────────────────────────────────────────────────────────
    if (phase === "duplicate") {
        const hoursLeft = result?.nextAvailableTs
            ? Math.ceil((result.nextAvailableTs - Date.now()) / 3_600_000)
            : null
        const accentColor = choice === "dry" ? "#30D158" : "#0A84FF"
        const accentRgb   = choice === "dry" ? "48,209,88" : "10,132,255"
        const dryW = result?.dryPct ?? 0
        const wetW = result?.wetPct ?? 0
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: accentColor }} />
                        <div style={{ position: "absolute", inset: -3, borderRadius: "50%",
                            border: `1.5px solid ${accentColor}`, opacity: 0.35,
                            animation: "hset-ping 2s ease-out infinite" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: accentColor, fontFamily: FONT }}>
                        Heute gemeldet
                    </span>
                    {hoursLeft !== null && (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: FONT, marginLeft: "auto" }}>
                            +{hoursLeft}h
                        </span>
                    )}
                </div>
                <div style={{ height: compact ? 5 : 7, borderRadius: 4, overflow: "hidden",
                    display: "flex", background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ width: `${dryW}%`, background: "#30D158",
                        boxShadow: `0 0 8px rgba(${accentRgb},0.35)`, transition: "width .5s ease" }} />
                    <div style={{ width: `${wetW}%`, background: "#0A84FF",
                        transition: "width .5s ease" }} />
                </div>
                <style>{`@keyframes hset-ping{0%{transform:scale(1);opacity:.4}80%{transform:scale(2.4);opacity:0}100%{opacity:0}}`}</style>
            </div>
        )
    }

    // ── done ─────────────────────────────────────────────────────────────────
    const dryW = result ? result.dryPct : 0
    const wetW = result ? result.wetPct : 0
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 6 }}>
            {/* Buttons — chosen leuchtet (Intensität = Status-Level), anderer fast unsichtbar */}
            <div style={{ display: "flex", gap: 7 }}>
                {(["dry", "wet"] as const).map(s => {
                    const isChosen  = choice === s
                    const accentRgb = s === "dry" ? "48,209,88" : "10,132,255"
                    const accent    = s === "dry" ? "#30D158" : "#0A84FF"
                    const glow      = isChosen ? glowMult : 0
                    return (
                        <div key={s} style={{
                            flex: 1, height: compact ? 36 : 44, borderRadius: 11,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: FONT, fontSize: compact ? 12 : 13, fontWeight: isChosen ? 700 : 500,
                            background: isChosen ? `rgba(${accentRgb},${0.12 * glowMult})` : "rgba(255,255,255,0.03)",
                            border: `1px solid rgba(${accentRgb},${isChosen ? 0.35 * glowMult : 0.06})`,
                            color: isChosen ? accent : "rgba(255,255,255,0.16)",
                            boxShadow: isChosen ? `0 0 ${12 * glow}px rgba(${accentRgb},${0.18 * glow})` : "none",
                            transition: "all .3s ease", userSelect: "none",
                            letterSpacing: "-0.01em",
                        } as React.CSSProperties}>
                            {s === "dry" ? "Trocken" : "Nass"}
                        </div>
                    )
                })}
            </div>
            {/* Bar — keine Beschriftung */}
            <div style={{ height: compact ? 5 : 7, borderRadius: 4, overflow: "hidden",
                display: "flex", background: "rgba(255,255,255,0.07)" }}>
                <div style={{ width: `${dryW}%`, background: "#30D158",
                    boxShadow: "0 0 8px rgba(48,209,88,0.45)", transition: "width .6s ease" }} />
                <div style={{ width: `${wetW}%`, background: "#0A84FF",
                    boxShadow: "0 0 8px rgba(10,132,255,0.35)", transition: "width .6s ease" }} />
            </div>
        </div>
    )
}

interface AreaPageProps {
    previewSlug?: string
    cardBg?: string; cardHoverBg?: string; cardBorderColor?: string
    mapSplit?: number
}

export default function AreaPage({
    previewSlug     = "apremont",
    cardBg          = "rgba(255,255,255,0.04)",
    cardHoverBg     = "rgba(255,255,255,0.08)",
    cardBorderColor = "rgba(255,255,255,0.07)",
    mapSplit        = 58,
}: AreaPageProps) {
    const slug         = resolveSlug(previewSlug)
    const containerRef = useRef<HTMLDivElement>(null)
    const mapFlyRef    = useRef<((lat: number, lng: number) => void) | null>(null)

    const [mobile,   setMobile]   = useState(false)
    const [mView,    setMView]    = useState<"map" | "list">("map")
    const [data,     setData]     = useState<AreaData | null>(null)
    const [circuits, setCircuits] = useState<any | null>(null)
    const [loading,  setLoading]  = useState(true)
    const [error,    setError]    = useState<string | null>(null)
    const [grade,    setGrade]    = useState<string>("alle")
    const [sortBy,   setSort]     = useState<"grade-asc" | "grade-desc" | "dry" | "cond">("grade-asc")

    useEffect(() => {
        const el = containerRef.current; if (!el) return
        const upd = (w: number) => setMobile(w < MOBILE_BP)
        upd(el.offsetWidth)
        const ro = new ResizeObserver(e => upd(e[0]?.contentRect.width ?? el.offsetWidth))
        ro.observe(el); return () => ro.disconnect()
    }, [])

    // Fetch area data + circuits
    useEffect(() => {
        setLoading(true); setError(null); setData(null); setCircuits(null)

        fetch(`${WORKER}/area/${slug}`)
            .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
            .then((d: AreaData) => {
                setData(d)
                setLoading(false)
                // Fetch circuits if DB IDs are available
                if (d.dbIds?.length) {
                    fetch(`${WORKER}/circuits/${d.dbIds.join(",")}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(geo => { if (geo) setCircuits(geo) })
                        .catch(() => {}) // circuit overlay is optional
                }
            })
            .catch(() => { setError("Gebiet nicht gefunden"); setLoading(false) })
    }, [slug])

    const rootStyle: React.CSSProperties = {
        width: "100%", height: "100%", background: BG, fontFamily: FONT,
        color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden",
    }

    if (loading) return (
        <div ref={containerRef} style={rootStyle}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 32 }}>🧗</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: FONT }}>Lade {slug}…</div>
            </div>
        </div>
    )
    if (error || !data) return (
        <div ref={containerRef} style={rootStyle}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 32 }}>⚠️</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontFamily: FONT }}>{error ?? "Kein Gebiet"}</div>
                <a href="/gebiete" style={{ marginTop: 6, fontSize: 12, color: GREEN, fontFamily: FONT, textDecoration: "none" }}>← Alle Gebiete</a>
            </div>
        </div>
    )

    const w      = data.weather
    const center: [number, number] = data.center ?? [48.404, 2.509]

    function handleBoulderClick(b: Boulder) {
        if (b.lat == null || b.lng == null) return
        setMView("map")
        // flyTo runs after view switch — map needs to be mounted first
        setTimeout(() => mapFlyRef.current?.(b.lat!, b.lng!), 50)
    }

    const boulders = [...data.boulders]
        .filter(b => inGroup(b.grade ?? "", grade))
        .sort((a, b) => {
            if (sortBy === "grade-asc")  return GRADE_ORDER.indexOf(a.grade ?? "") - GRADE_ORDER.indexOf(b.grade ?? "")
            if (sortBy === "grade-desc") return GRADE_ORDER.indexOf(b.grade ?? "") - GRADE_ORDER.indexOf(a.grade ?? "")
            if (sortBy === "cond")       return (b.condScore ?? 0) - (a.condScore ?? 0)
            return (b.dryScore ?? 0) - (a.dryScore ?? 0)
        })

    const peekBoulders = [...data.boulders]
        .sort((a, b) => (b.dryScore ?? 0) - (a.dryScore ?? 0))
        .slice(0, 8)

    // Circuit legend (unique colors in this area)
    const circuitColors = circuits
        ? [...new Set<string>(circuits.features?.map((f: any) => f.properties.color) ?? [])]
        : []

    // ── Circuit Legend ────────────────────────────────────────────────────────
    const CircuitLegend = circuitColors.length > 0 ? (
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            {circuitColors.map(c => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 3,
                    background: `${CIRCUIT_COLORS[c] || "#888"}18`,
                    border: `1px solid ${CIRCUIT_COLORS[c] || "#888"}44`,
                    borderRadius: 6, padding: "2px 7px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%",
                        background: CIRCUIT_COLORS[c] || "#888", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: CIRCUIT_COLORS[c] || "#888",
                        fontFamily: FONT, textTransform: "capitalize" }}>{c}</span>
                </div>
            ))}
        </div>
    ) : null

    // ── Desktop Filter-Bar ────────────────────────────────────────────────────
    const desktopFilterBar = (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
            padding: "0 0 14px", flexShrink: 0 }}>
            {GRADE_GROUPS.map(g => (
                <button key={g} onClick={() => setGrade(g)} style={{
                    padding: "4px 10px", borderRadius: 7, border: "none", flexShrink: 0,
                    cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 600,
                    background: grade === g ? "rgba(48,209,88,0.18)" : "rgba(255,255,255,0.06)",
                    color: grade === g ? GREEN : "rgba(255,255,255,0.38)", transition: "all .14s",
                }}>{g}</button>
            ))}
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.10)", margin: "0 2px" }} />
            {([{ key: "grade-asc" as const, label: "Leicht→Schwer" }, { key: "grade-desc" as const, label: "Schwer→Leicht" },
               { key: "dry" as const, label: "Trocken" }, { key: "cond" as const, label: "Bedingt" }]).map(s => (
                <button key={s.key} onClick={() => setSort(s.key)} style={{
                    padding: "4px 10px", borderRadius: 7, border: "none", flexShrink: 0,
                    cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 600,
                    background: sortBy === s.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                    color: sortBy === s.key ? "#fff" : "rgba(255,255,255,0.30)", transition: "all .14s",
                }}>{s.label}</button>
            ))}
            <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.25)",
                fontFamily: FONT, whiteSpace: "nowrap" }}>
                {boulders.length} / {data.boulders.length} Boulder
            </div>
        </div>
    )

    // ═══════════════════════════════════════════════════════════════════════
    // DESKTOP
    // ═══════════════════════════════════════════════════════════════════════
    if (!mobile) return (
        <div ref={containerRef} style={rootStyle}>
            <div style={{ padding: "18px 24px 0", flexShrink: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
                    color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
                    <a href="/" style={{ color: "inherit", textDecoration: "none" }}>Highset</a>
                    {" · "}<a href="/gebiete" style={{ color: "inherit", textDecoration: "none" }}>Gebiete</a>
                    {" · "}{data.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                    <h1 style={{ margin: 0, fontSize: "clamp(22px,3.5vw,38px)", fontWeight: 800,
                        letterSpacing: "-0.035em", color: "#fff", lineHeight: 1, fontFamily: FONT }}>
                        {data.name}
                    </h1>
                    <ScoreRing score={data.dryScore}  label="Trocken" />
                    <ScoreRing score={data.condScore} label="Bedingt" />
                    {w && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Chip icon={wmoIcon(w.code)} label={`${Math.round(w.temp)}°C`} />
                            <Chip icon="💧" label={`${w.humidity}%`} accent={w.humidity > 80} />
                            <Chip icon="💨" label={`${w.windDir} ${w.wind} km/h`} />
                        </div>
                    )}
                </div>
                {/* Circuit Legend */}
                {CircuitLegend && (
                    <div style={{ marginBottom: 10 }}>{CircuitLegend}</div>
                )}
                {/* Community Verify */}
                <div style={{ maxWidth: 320, marginBottom: 12 }}>
                    <VerifyBar areaKey={data.slug} compact />
                </div>
                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${GREEN} 30%,#34C759 70%,transparent)`,
                    opacity: .3, marginBottom: 14 }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "row",
                overflow: "hidden", padding: "0 24px 20px" }}>
                <div style={{ flex: `0 0 ${mapSplit}%`, position: "relative", borderRadius: 14,
                    overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginRight: 14 }}>
                    <AreaMap boulders={data.boulders} center={center} circuits={circuits} flyRef={mapFlyRef} />
                    <div style={{ position: "absolute", bottom: 10, right: 10, zIndex: 1000,
                        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
                        border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "4px 9px",
                        fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: FONT, pointerEvents: "none" }}>
                        + / − zum Zoomen
                    </div>
                </div>
                <div style={{ flex: `0 0 ${100 - mapSplit}%`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {desktopFilterBar}
                    <div style={{ flex: 1, overflowY: "auto", borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                        {boulders.length === 0
                            ? <div style={{ padding: "40px 20px", textAlign: "center",
                                color: "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: FONT }}>
                                Keine Boulder für diesen Filter
                              </div>
                            : boulders.map((b, i) => <BoulderRow key={i} b={b} borderColor="rgba(255,255,255,0.06)" onBoulderClick={handleBoulderClick} />)
                        }
                        <div style={{ height: 20 }} />
                    </div>
                </div>
            </div>
        </div>
    )

    // ═══════════════════════════════════════════════════════════════════════
    // MOBILE — iOS-Style
    // ═══════════════════════════════════════════════════════════════════════
    return (
        <div ref={containerRef} style={rootStyle}>

            {/* ── Header ── */}
            <div style={{ flexShrink: 0, padding: "10px 16px 0", background: BG }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
                    color: "rgba(255,255,255,0.22)", marginBottom: 6 }}>
                    <a href="/" style={{ color: "inherit", textDecoration: "none" }}>Highset</a>
                    {" · "}
                    <a href="/gebiete" style={{ color: "inherit", textDecoration: "none" }}>Gebiete</a>
                    {" · "}{data.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 21, fontWeight: 800,
                        letterSpacing: "-0.03em", color: "#fff", lineHeight: 1.1, fontFamily: FONT,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {data.name}
                    </h1>
                    <ScoreRing score={data.dryScore}  label="Trocken" size={48} />
                    <ScoreRing score={data.condScore} label="Bedingt"  size={48} />
                </div>
                {w && (
                    <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 6,
                        scrollbarWidth: "none" } as React.CSSProperties}>
                        <Chip icon={wmoIcon(w.code)} label={`${Math.round(w.temp)}°C`} />
                        <Chip icon="💧" label={`${w.humidity}%`} accent={w.humidity > 80} />
                        <Chip icon="💨" label={`${w.windDir} ${w.wind}km/h`} />
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontFamily: FONT,
                            alignSelf: "center", marginLeft: 4, flexShrink: 0 }}>
                            {data.boulders.length} Boulder
                        </div>
                    </div>
                )}
                {/* Circuit Legend Mobile */}
                {circuitColors.length > 0 && (
                    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8,
                        scrollbarWidth: "none" } as React.CSSProperties}>
                        {circuitColors.map(c => (
                            <div key={c} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0,
                                background: `${CIRCUIT_COLORS[c] || "#888"}18`,
                                border: `1px solid ${CIRCUIT_COLORS[c] || "#888"}44`,
                                borderRadius: 6, padding: "2px 7px" }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%",
                                    background: CIRCUIT_COLORS[c] || "#888" }} />
                                <span style={{ fontSize: 10, color: CIRCUIT_COLORS[c] || "#888",
                                    fontWeight: 600, fontFamily: FONT, textTransform: "capitalize" }}>{c}</span>
                            </div>
                        ))}
                    </div>
                )}
                {/* Accent Line */}
                <div style={{ height: 1.5, background: `linear-gradient(90deg,${GREEN},#34C759 60%,transparent)`,
                    opacity: .5 }} />
            </div>

            {/* ── Content ── */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

                {/* KARTE + Peek Card */}
                {mView === "map" && (
                    <div style={{ position: "absolute", inset: 0 }}>
                        <AreaMap boulders={data.boulders} center={center} circuits={circuits} flyRef={mapFlyRef} />

                        {/* Peek Card */}
                        <div style={{
                            position: "absolute", bottom: 12, left: 12, right: 12, zIndex: 1000,
                            background: "rgba(12,12,12,0.94)",
                            backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                            border: "1px solid rgba(255,255,255,0.11)",
                            borderRadius: 20,
                            boxShadow: "0 8px 40px rgba(0,0,0,0.80)",
                        } as React.CSSProperties}>
                            <div style={{ width: 36, height: 4, borderRadius: 2,
                                background: "rgba(255,255,255,0.18)", margin: "10px auto 12px" }} />
                            <div style={{ display: "flex", gap: 12, padding: "0 16px 10px" }}>
                                <ScoreBar label="Trocken" value={data.dryScore} />
                                <ScoreBar label="Bedingt"  value={data.condScore} />
                            </div>
                            <div style={{ padding: "0 16px 12px" }}>
                                <VerifyBar areaKey={data.slug} compact />
                            </div>
                            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 10 }} />
                            <div style={{ display: "flex", justifyContent: "space-between",
                                alignItems: "center", padding: "0 16px 6px" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                                    color: "rgba(255,255,255,0.35)", textTransform: "uppercase", fontFamily: FONT }}>
                                    Top Boulder
                                </span>
                                <button onClick={() => setMView("list")}
                                    style={{ background: "none", border: "none", cursor: "pointer",
                                        fontSize: 11, color: GREEN, fontFamily: FONT, fontWeight: 600,
                                        padding: 0, WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
                                    Alle {data.boulders.length} →
                                </button>
                            </div>
                            <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 16px 16px",
                                scrollbarWidth: "none" } as React.CSSProperties}>
                                {peekBoulders.map((b, i) => <MiniBoulderCard key={i} b={b} />)}
                            </div>
                        </div>
                    </div>
                )}

                {/* LISTE */}
                {mView === "list" && (
                    <div style={{ position: "absolute", inset: 0, display: "flex",
                        flexDirection: "column", overflow: "hidden" }}>
                        <GradeChart boulders={data.boulders} />
                        <div style={{ flexShrink: 0, padding: "8px 16px 6px", background: BG,
                            borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 6,
                                scrollbarWidth: "none" } as React.CSSProperties}>
                                {GRADE_GROUPS.map(g => (
                                    <button key={g} onClick={() => setGrade(g)} style={{
                                        padding: "5px 12px", borderRadius: 8, border: "none", flexShrink: 0,
                                        cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 600,
                                        background: grade === g ? "rgba(48,209,88,0.20)" : "rgba(255,255,255,0.07)",
                                        color: grade === g ? GREEN : "rgba(255,255,255,0.42)",
                                        WebkitTapHighlightColor: "transparent",
                                    } as React.CSSProperties}>{g}</button>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 4, overflowX: "auto",
                                scrollbarWidth: "none" } as React.CSSProperties}>
                                {([
                                    { key: "grade-asc"  as const, label: "↑ Leicht–Schwer" },
                                    { key: "grade-desc" as const, label: "↓ Schwer–Leicht" },
                                    { key: "dry"        as const, label: "Trocken" },
                                    { key: "cond"       as const, label: "Bedingt" },
                                ]).map(s => (
                                    <button key={s.key} onClick={() => setSort(s.key)} style={{
                                        padding: "4px 11px", borderRadius: 8, border: "none", flexShrink: 0,
                                        cursor: "pointer", fontFamily: FONT, fontSize: 10, fontWeight: 600,
                                        background: sortBy === s.key ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.05)",
                                        color: sortBy === s.key ? "#fff" : "rgba(255,255,255,0.30)",
                                        WebkitTapHighlightColor: "transparent",
                                    } as React.CSSProperties}>{s.label}</button>
                                ))}
                                <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.22)",
                                    fontFamily: FONT, alignSelf: "center", flexShrink: 0, whiteSpace: "nowrap" }}>
                                    {boulders.length}/{data.boulders.length}
                                </span>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: "auto",
                            WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                            {boulders.length === 0
                                ? <div style={{ padding: "40px 20px", textAlign: "center",
                                    color: "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: FONT }}>
                                    Keine Boulder für diesen Filter
                                  </div>
                                : boulders.map((b, i) => (
                                    <MobileBoulderRow key={i} b={b} borderColor={cardBorderColor} onBoulderClick={handleBoulderClick} />
                                ))
                            }
                            <div style={{ height: 20 }} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── iOS Bottom Tab Bar ── */}
            <div style={{ flexShrink: 0, height: 62, display: "flex",
                background: "rgba(12,12,12,0.97)",
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
            } as React.CSSProperties}>
                {([
                    { key: "map"  as const, label: "Karte",   icon: "🗺" },
                    { key: "list" as const, label: "Boulder",  icon: "☰", count: data.boulders.length },
                ]).map(tab => {
                    const active = mView === tab.key
                    return (
                        <button key={tab.key} onClick={() => setMView(tab.key)}
                            style={{ flex: 1, height: "100%", border: "none", background: "none",
                                cursor: "pointer", display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center", gap: 3, position: "relative",
                                WebkitTapHighlightColor: "transparent",
                            } as React.CSSProperties}>
                            <span style={{ fontSize: 21, lineHeight: 1 }}>{tab.icon}</span>
                            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: FONT,
                                color: active ? GREEN : "rgba(255,255,255,0.32)", transition: "color .15s" }}>
                                {tab.label}
                            </span>
                            {"count" in tab && (tab as any).count > 0 && (
                                <div style={{ position: "absolute", top: 6, right: "calc(50% - 14px)",
                                    background: active ? GREEN : "rgba(255,255,255,0.20)",
                                    borderRadius: 10, minWidth: 16, height: 16,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    padding: "0 4px", boxSizing: "border-box" }}>
                                    <span style={{ fontSize: 9, fontWeight: 800,
                                        color: active ? "#000" : "rgba(255,255,255,0.7)", fontFamily: FONT }}>
                                        {(tab as any).count > 99 ? "99+" : (tab as any).count}
                                    </span>
                                </div>
                            )}
                            {active && (
                                <div style={{ position: "absolute", bottom: 5, width: 4, height: 4,
                                    borderRadius: "50%", background: GREEN,
                                    boxShadow: `0 0 6px ${GREEN}` }} />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

addPropertyControls(AreaPage, {
    previewSlug: {
        type: ControlType.String, title: "Area Slug (Canvas)", defaultValue: "apremont",
        description: "Nur im Canvas. Live liest die URL: /gebiete?area=apremont",
    },
    mapSplit: {
        type: ControlType.Number, title: "Karte Breite % (Desktop)",
        defaultValue: 58, min: 40, max: 75, step: 1,
    },
    cardBg:          { type: ControlType.Color, title: "Listen BG",        defaultValue: "rgba(255,255,255,0.04)" },
    cardHoverBg:     { type: ControlType.Color, title: "Listen Hover",     defaultValue: "rgba(255,255,255,0.08)" },
    cardBorderColor: { type: ControlType.Color, title: "Listen Trennlinie", defaultValue: "rgba(255,255,255,0.07)" },
})
