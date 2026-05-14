// --- Framer Code Component: Bleau Bot v17.7 ---
// v17.7: Community Reporting — VerifyBar (area Trocken/Nass) + BoulderActions (boulder Trocken/Nass/Passt/Passt-nicht)
// v17.6: Fix Größe-Sort — pass sortMode to AreaCard, sort problems by sizeScore when active
import { addPropertyControls, ControlType } from "framer"
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"

const WORKER       = "https://highset.faymonvillejulius.workers.dev"
const VERIFY_TOKEN = "highset-public-v1"

const HEIGHT_RANGES = [
    { label:"150–154",mid:152 },{ label:"155–159",mid:157 },{ label:"160–164",mid:162 },
    { label:"165–169",mid:167 },{ label:"170–174",mid:172 },{ label:"175–179",mid:177 },
    { label:"180–184",mid:182 },{ label:"185–189",mid:187 },{ label:"190–194",mid:192 },
    { label:"195–199",mid:197 },{ label:"200–204",mid:202 },
]
const GRADES = [
    "3a","3b","3c","4","4a","4b","4c",
    "5a","5b","5c",
    "6a","6a+","6b","6b+","6c","6c+",
    "7a","7a+","7b","7b+","7c","7c+",
    "8a","8a+","8b","8b+","8c","8c+","9a",
]
const GO = {}
GRADES.forEach((g, i) => { GO[g] = i })

const GCOL = {
    "3a":"w","3b":"w","3c":"w","4":"w","4a":"w","4b":"y","4c":"y",
    "5a":"y","5b":"y","5c":"y","6a":"o","6a+":"o","6b":"o","6b+":"o",
    "6c":"o","6c+":"b","7a":"b","7a+":"b","7b":"b","7b+":"b","7c":"b",
    "7c+":"r","8a":"r","8a+":"r","8b":"r","8b+":"r","8c":"k","8c+":"k","9a":"k",
}
const GCSS = {
    w:"#F2F2F7", y:"#FFD60A", o:"#FF9F0A", b:"#0A84FF", r:"#FF453A", k:"#BF5AF2",
}

const STYLES = [
    { id:"slab",     label:"Slab"   },
    { id:"wall",     label:"Wall"   },
    { id:"overhang", label:"Überh." },
    { id:"traverse", label:"Trav."  },
    { id:"roof",     label:"Roof"   },
]
const STEEP_META = {
    slab:     { label:"Slab",     icon:"↗", hint:"Reibung" },
    wall:     { label:"Wall",     icon:"▐", hint:"Kraft & Technik" },
    overhang: { label:"Überhang", icon:"↩", hint:"Zug & Power" },
    traverse: { label:"Traverse", icon:"↔", hint:"Koordination" },
    roof:     { label:"Roof",     icon:"↓", hint:"Überkopf" },
    other:    { label:"Gemischt", icon:"◈", hint:"Verschiedene Stile" },
}
const STYLE_META = {
    Slab:     { label:"Slab",    col:"#30D158" },
    Wall:     { label:"Wall",    col:"#8E8E93" },
    Crack:    { label:"Crack",   col:"#FFD60A" },
    Overhang: { label:"Overhang",col:"#0A84FF" },
    Roof:     { label:"Roof",    col:"#BF5AF2" },
    Traverse: { label:"Traverse",col:"#FF9F0A" },
    Arete:    { label:"Arête",   col:"#FF6B35" },
    Prow:     { label:"Prow",    col:"#FF453A" },
    Pillar:   { label:"Pillar",  col:"#64D2FF" },
    Dyno:     { label:"Dyno",    col:"#FF2D55" },
}
const WIND_META = {
    N: { q:"gut",      c:"#64D2FF", desc:"kalt & trocknend" },
    NE:{ q:"sehr gut", c:"#30D158", desc:"kontinental trocken" },
    E: { q:"sehr gut", c:"#30D158", desc:"trocken" },
    SE:{ q:"gut",      c:"#34C759", desc:"warm & trocken" },
    S: { q:"okay",     c:"#FFD60A", desc:"warm, leicht feucht" },
    SW:{ q:"schlecht", c:"#FF6B35", desc:"atlantisch feucht" },
    W: { q:"schlecht", c:"#FF453A", desc:"feucht" },
    NW:{ q:"mäßig",    c:"#8E8E93", desc:"kühl, mäßig trocken" },
}
const IC_EMOJI = ["☀️","⛅","☁️","🌧️","🌫️","❄️","⛈️","🌙"]

// ── Utilities ─────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
    const h = (hex || "#888888").replace("#", "")
    if (h.length < 6) return `rgba(136,136,136,${alpha})`
    const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}
function gradeCol(g) { return GCSS[GCOL[g] || "w"] || GCSS.w }
function gir(g, mn, mx) { const i = GO[g]; if (i===undefined) return false; return i>=GO[mn]&&i<=GO[mx] }
function fd(km) { return km < 1 ? Math.round(km*1000)+" m" : km.toFixed(1)+" km" }
function hav(a,b,c,e) {
    const R=6371,dL=(c-a)*Math.PI/180,dN=(e-b)*Math.PI/180,
        x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)**2
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))
}
function scoreColor(s) {
    if (s >= 75) return "#30D158"
    if (s >= 50) return "#34C759"
    if (s >= 35) return "#FFD60A"
    if (s >= 15) return "#FF9F0A"
    return "#FF453A"
}
function getSizeMatch(sizes, mid) {
    if (!sizes || !sizes.length || !mid) return null
    const h = Number(mid)
    for (const b of sizes) { if (h>=b.min && h<=b.max) return b.percent }
    for (const b of sizes) {
        if (h>=b.min-5 && h<b.min) return Math.round(b.percent*0.4)
        if (h>b.max && h<=b.max+5) return Math.round(b.percent*0.4)
    }
    return 0
}

const FONT_MAP = {
    system:        "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Segoe UI',sans-serif",
    inter:         "'Inter',sans-serif",
    geist:         "'Geist',sans-serif",
    "space-grotesk":"'Space Grotesk',sans-serif",
    "dm-sans":     "'DM Sans',sans-serif",
    syne:          "'Syne',sans-serif",
}
const GOOGLE_FONTS = {
    inter:          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
    geist:          "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap",
    "space-grotesk":"https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
    "dm-sans":      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap",
    syne:           "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap",
}

// ── CSS Animations ────────────────────────────────────────────────────────────
function Styles({ fontKey }) {
    const gfUrl = GOOGLE_FONTS[fontKey]
    return (
        <style>{`
            ${gfUrl ? `@import url('${gfUrl}');` : ""}
            @keyframes fadeUp    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
            @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
            @keyframes float     { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-4px)} }
            @keyframes pulse     { 0%,100%{opacity:0.5} 50%{opacity:1} }
            @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
            @keyframes dotBounce { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
            @keyframes wRain     { 0%{opacity:0;transform:translateY(-3px)} 45%{opacity:1} 100%{opacity:0;transform:translateY(10px)} }
            @keyframes wSunSpin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes hset-ping { 0%{transform:scale(1);opacity:.4} 80%{transform:scale(2.4);opacity:0} 100%{opacity:0} }
            .bleau-area-card   { animation: fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both }
            .bleau-boulder-card{ animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both }
            .bleau-logo-float  { animation: float 3.5s ease-in-out infinite }
            .bleau-expand-icon { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1) }
            .bleau-pill:hover  { opacity: 0.82 !important }
            .bleau-card-link:hover { opacity: 0.75 !important; transform: scale(0.985) !important }
        `}</style>
    )
}

// ── Animated Weather Icon ─────────────────────────────────────────────────────
function WeatherIcon({ type, size = 36 }) {
    const s = size
    const sunColor = "#FFD60A"
    const cloudColor = "#8E8E93"
    const rainColor = "#64D2FF"
    const labelMap = {
        sunny: "Sonnig", "partly-cloudy": "Teils bewölkt", cloudy: "Bewölkt",
        drizzle: "Nieselregen", rainy: "Regen",
    }
    const ariaLabel = labelMap[type] || "Wetter"
    if (type === "sunny") return (
        <svg width={s} height={s} viewBox="0 0 36 36" fill="none"
            role="img" aria-label={ariaLabel}
            style={{ overflow:"visible", display:"block" }}>
            <g style={{ transformOrigin:"18px 18px", animation:"wSunSpin 9s linear infinite" }}>
                {[0,45,90,135,180,225,270,315].map((deg,i) => (
                    <line key={i} x1="18" y1="3.5" x2="18" y2="8"
                        transform={`rotate(${deg} 18 18)`}
                        stroke={sunColor} strokeWidth="2.5" strokeLinecap="round" />
                ))}
            </g>
            <circle cx="18" cy="18" r="7.5" fill={sunColor} />
        </svg>
    )
    if (type === "partly-cloudy") return (
        <svg width={s} height={s} viewBox="0 0 36 36" fill="none"
            role="img" aria-label={ariaLabel}
            style={{ overflow:"visible", display:"block" }}>
            <g style={{ transformOrigin:"12px 13px", animation:"wSunSpin 9s linear infinite" }}>
                {[0,60,120,180,240,300].map((deg,i) => (
                    <line key={i} x1="12" y1="5" x2="12" y2="8.5"
                        transform={`rotate(${deg} 12 13)`}
                        stroke={sunColor} strokeWidth="2" strokeLinecap="round" />
                ))}
            </g>
            <circle cx="12" cy="13" r="5" fill={sunColor} />
            <g style={{ animation:"float 3.5s ease-in-out infinite" }}>
                <ellipse cx="22" cy="23" rx="9.5" ry="5.5" fill={cloudColor} />
                <ellipse cx="15" cy="23" rx="5.5" ry="4.5" fill={cloudColor} />
                <ellipse cx="22" cy="18.5" rx="7.5" ry="6" fill={cloudColor} />
            </g>
        </svg>
    )
    if (type === "cloudy") return (
        <svg width={s} height={s} viewBox="0 0 36 36" fill="none"
            role="img" aria-label={ariaLabel}
            style={{ display:"block" }}>
            <g style={{ animation:"float 3.5s ease-in-out infinite" }}>
                <ellipse cx="19" cy="22" rx="12" ry="7" fill={cloudColor} />
                <ellipse cx="12" cy="22" rx="7" ry="5.5" fill={cloudColor} />
                <ellipse cx="19" cy="16" rx="9" ry="7" fill={cloudColor} />
                <ellipse cx="13" cy="18" rx="6" ry="5" fill={cloudColor} />
            </g>
        </svg>
    )
    if (type === "drizzle") return (
        <svg width={s} height={s} viewBox="0 0 36 36" fill="none"
            role="img" aria-label={ariaLabel}
            style={{ overflow:"visible", display:"block" }}>
            <g style={{ animation:"float 3s ease-in-out infinite" }}>
                <ellipse cx="19" cy="16" rx="12" ry="7" fill={rainColor} opacity="0.65" />
                <ellipse cx="12" cy="16" rx="7" ry="5.5" fill={rainColor} opacity="0.65" />
                <ellipse cx="19" cy="11" rx="9" ry="6.5" fill={rainColor} opacity="0.65" />
            </g>
            {[11,19,27].map((x,i) => (
                <line key={i} x1={x} y1="26" x2={x-2} y2="33"
                    stroke={rainColor} strokeWidth="2" strokeLinecap="round"
                    style={{ animation:`wRain 1.3s ease-in infinite`, animationDelay:`${i*0.43}s` }} />
            ))}
        </svg>
    )
    if (type === "rainy") return (
        <svg width={s} height={s} viewBox="0 0 36 36" fill="none"
            role="img" aria-label={ariaLabel}
            style={{ overflow:"visible", display:"block" }}>
            <g style={{ animation:"float 2.5s ease-in-out infinite" }}>
                <ellipse cx="19" cy="14" rx="12" ry="7" fill={rainColor} opacity="0.75" />
                <ellipse cx="12" cy="14" rx="7" ry="5.5" fill={rainColor} opacity="0.75" />
                <ellipse cx="19" cy="9" rx="9" ry="6.5" fill={rainColor} opacity="0.75" />
            </g>
            {[10,17,24,31].map((x,i) => (
                <line key={i} x1={x} y1="23" x2={x-3} y2="33"
                    stroke={rainColor} strokeWidth="2.2" strokeLinecap="round"
                    style={{ animation:`wRain 0.95s ease-in infinite`, animationDelay:`${i*0.24}s` }} />
            ))}
        </svg>
    )
    return <span style={{ fontSize:28 }} aria-label="Wetter" role="img">🌤</span>
}

// ── Score Ring (Apple Watch style) ────────────────────────────────────────────
function ScoreRing({ score, label, size = 52 }) {
    const [on, setOn] = useState(false)
    useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t) }, [score])
    const R = (size - 7) / 2
    const circ = 2 * Math.PI * R
    const color = scoreColor(score)
    const offset = circ * (1 - (on ? Math.max(score, score===0?0:2) : 0) / 100)
    return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}
            aria-label={`${label}: ${score} von 100`}>
            <div style={{ position:"relative", width:size, height:size }}>
                <svg width={size} height={size} style={{ display:"block" }} aria-hidden="true">
                    <circle cx={size/2} cy={size/2} r={R}
                        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4.5} />
                    <circle cx={size/2} cy={size/2} r={R}
                        fill="none" stroke={color} strokeWidth={4.5}
                        strokeDasharray={`${circ} ${circ}`}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${size/2} ${size/2})`}
                        style={{
                            transition: on ? "stroke-dashoffset 1.1s cubic-bezier(0.34,1.56,0.64,1)" : "none",
                            filter: score > 40 ? `drop-shadow(0 0 5px ${color}55)` : "none",
                        }} />
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:size>44?14:11, fontWeight:700, color:"#fff",
                        fontFamily:"-apple-system,'SF Pro Display',sans-serif", letterSpacing:"-0.02em" }}
                        aria-hidden="true">
                        {score}
                    </span>
                </div>
            </div>
            <span style={{ fontSize:7.5, fontWeight:600, color:"rgba(255,255,255,0.28)",
                fontFamily:"-apple-system,'SF Pro Text',sans-serif",
                textTransform:"uppercase", letterSpacing:"0.12em" }}
                aria-hidden="true">
                {label}
            </span>
        </div>
    )
}

// ── Drying Forecast Sparkline ─────────────────────────────────────────────────
function SparkLine({ trajectory, conditions, dryAt }) {
    const W = 220, CH = 34, IH = 15, LH = 10
    const TH = CH + IH + LH
    if (!trajectory || trajectory.length < 2) return null
    const N = trajectory.length
    const xOf = i => (i / (N-1)) * W
    const yOf = p => CH - (p/100) * CH
    const pts = trajectory.map((p,i) => `${xOf(i).toFixed(1)},${yOf(p).toFixed(1)}`).join(" ")
    const dryIdx = trajectory.findIndex(p => p >= 100)
    const bands = (conditions||[]).map((c,i) => ({
        x:  i===0 ? 0 : (xOf(i-1)+xOf(i))/2,
        x2: i===N-1 ? W : (xOf(i)+xOf(i+1))/2,
        night: c.ic===7,
    }))
    const iconSteps = [0,4,8,12,16,20,24].filter(i=>i<N)
    const midIdx = Math.floor(N/2)
    const fmtHr = h => h!=null ? `${String(h).padStart(2,"0")}:00` : ""
    return (
        <div style={{ marginTop:8 }}
            aria-label="Trocknungsverlauf der nächsten 72 Stunden" role="img">
            <svg width="100%" viewBox={`0 0 ${W} ${TH}`} style={{ display:"block", overflow:"visible" }}
                aria-hidden="true">
                <defs>
                    <linearGradient id="dryFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="rgba(52,199,89,0.22)" />
                        <stop offset="100%" stopColor="rgba(52,199,89,0)" />
                    </linearGradient>
                    <linearGradient id="dryCurve" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"  stopColor="#FF9F0A" />
                        <stop offset="55%" stopColor="#30D158" />
                        <stop offset="100%" stopColor="#34C759" />
                    </linearGradient>
                </defs>
                {bands.map((b,i) => b.night && (
                    <rect key={i} x={b.x} y={0} width={Math.max(0,b.x2-b.x)} height={CH}
                        fill="rgba(0,0,40,0.25)" />
                ))}
                <line x1={0} y1={CH*0.5} x2={W} y2={CH*0.5}
                    stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} strokeDasharray="3,4" />
                <line x1={0} y1={0} x2={W} y2={0}
                    stroke="rgba(52,199,89,0.18)" strokeWidth={0.5} strokeDasharray="4,3" />
                <polygon points={`0,${CH} ${pts} ${W},${CH}`} fill="url(#dryFill)" />
                <polyline points={pts} fill="none" stroke="url(#dryCurve)" strokeWidth={2}
                    strokeLinejoin="round" strokeLinecap="round" />
                {dryIdx >= 0 && (
                    <line x1={xOf(dryIdx)} y1={0} x2={xOf(dryIdx)} y2={CH}
                        stroke="rgba(52,199,89,0.6)" strokeWidth={1} strokeDasharray="2,2" />
                )}
                {iconSteps.map(i => (
                    <text key={i} x={xOf(i)} y={CH+IH-1} fontSize={11} textAnchor="middle"
                        style={{ userSelect:"none" }}>
                        {IC_EMOJI[conditions?.[i]?.ic ?? 2]}
                    </text>
                ))}
                <text x={1} y={TH} fontSize={6.5} fill="rgba(255,255,255,0.22)"
                    fontFamily="-apple-system,sans-serif">jetzt</text>
                {conditions?.[midIdx]?.hr != null && (
                    <text x={W/2} y={TH} fontSize={6.5} textAnchor="middle"
                        fill="rgba(255,255,255,0.22)" fontFamily="-apple-system,sans-serif">
                        {fmtHr(conditions[midIdx].hr)}
                    </text>
                )}
                <text x={W-1} y={TH} fontSize={6.5} textAnchor="end"
                    fill="rgba(255,255,255,0.22)" fontFamily="-apple-system,sans-serif">
                    {conditions?.[N-1]?.hr != null ? fmtHr(conditions[N-1].hr) : "+72h"}
                </text>
            </svg>
        </div>
    )
}

// ── Bleau Logo ────────────────────────────────────────────────────────────────
function BleauLogo({ size=80, spinning=false }) {
    const cx=size*0.5, cy=size*0.68, r=size*0.3
    const rays=[
        {a:195,l:0.52,w:2.0},{a:210,l:0.60,w:2.3},{a:225,l:0.72,w:2.6},
        {a:240,l:0.82,w:2.8},{a:255,l:0.88,w:2.8},{a:270,l:1.0,w:3.0},
        {a:285,l:0.88,w:2.8},{a:300,l:0.82,w:2.8},{a:315,l:0.72,w:2.6},
        {a:330,l:0.60,w:2.3},{a:345,l:0.52,w:2.0},
    ]
    const rG=r+size*0.05, rM=r+size*0.2
    return (
        <svg width={size} height={size*0.82} viewBox={`0 0 ${size} ${size*0.82}`}
            role="img" aria-label="HIGHSET Logo"
            style={{ overflow:"visible", display:"block" }}>
            <title>HIGHSET Logo</title>
            <g style={spinning ? { animation:"spin 5s linear infinite", transformOrigin:`${cx}px ${cy}px` } : {}}>
                {rays.map((rd,i) => {
                    const rad=rd.a*Math.PI/180
                    return <line key={i}
                        x1={cx+rG*Math.cos(rad)} y1={cy+rG*Math.sin(rad)}
                        x2={cx+(rG+(rM-rG)*rd.l)*Math.cos(rad)} y2={cy+(rG+(rM-rG)*rd.l)*Math.sin(rad)}
                        stroke="white" strokeWidth={rd.w} strokeLinecap="round"
                        opacity={rd.a===270?1:0.75} />
                })}
            </g>
            <path d={`M ${cx-r},${cy} A ${r},${r} 0 0,1 ${cx+r},${cy} Z`} fill="white" />
            <path d={`M ${cx-r},${cy} L ${cx-r*0.62},${cy-r*0.18} L ${cx-r*0.05},${cy-r*0.68}
                L ${cx+r*0.22},${cy-r*0.32} L ${cx+r*0.52},${cy-r*0.48} L ${cx+r},${cy} Z`}
                fill="#0c0c14" />
        </svg>
    )
}

// ── Score-based boulder status (fallback if no aiDesc) ───────────────────────
function boulderStatusDesc(p) {
    const ds = p.dryScore || 0
    const cs = p.condScore || 0
    const steep = p.steepness || ""
    const isOverhang = steep === "overhang" || steep === "roof"
    if (ds === 0 && cs === 0) {
        if (isOverhang) return "Komplett nass — Überhang bleibt bedingt kletterbar."
        return "Fels nass — aktuell nicht kletterbar."
    }
    if (ds === 0) return isOverhang ? "Nass, aber Überhang schützt den Griff." : "Fels nass, Grip stark reduziert."
    if (ds === 100 && cs >= 80) return "Optimal trocken, beste Bedingungen."
    if (ds === 100) return `Trocken — Grip ${cs < 50 ? "durch Feuchte eingeschränkt" : "gut"}.`
    if (ds >= 70) return `Trocknet gut (${ds}%), Bedingungen ${cs >= 60 ? "solide" : "noch eingeschränkt"}.`
    if (ds >= 30) return `Trocknet noch — ${isOverhang ? "Überhang hält sich" : "Fels braucht Zeit"} (${ds}%).`
    return `Kaum kletterbar — Fels zu feucht (${ds}%).`
}

// ── Top Boulder Card ──────────────────────────────────────────────────────────
function TopBoulderCard({ p, areaName, rank, userHeightMid, delay, accent = "#C8956C" }) {
    const gc   = gradeCol(p.grade || "")
    const sm   = STEEP_META[p.steepness] || STEEP_META["other"]
    const rsm  = STYLE_META[p.style] || null
    const ss   = userHeightMid && p.sizes?.length ? getSizeMatch(p.sizes, userHeightMid) : (p.sizeScore ?? null)
    const isTop = rank === 1

    const overallScore = Math.round((p.dryScore + p.condScore) / 2)
    const sc = scoreColor(overallScore)

    const gmapsUrl = p.lat && p.lon ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}` : null

    return (
        <article className="bleau-boulder-card" aria-label={`Boulder: ${p.name}, ${p.grade}, ${areaName}`}
            style={{ animationDelay: `${delay}ms`,
            background: isTop
                ? `linear-gradient(135deg, ${hexToRgba(accent,0.12)} 0%, rgba(10,132,255,0.07) 100%)`
                : "rgba(255,255,255,0.05)",
            border: isTop ? `1px solid ${hexToRgba(accent,0.28)}` : "1px solid rgba(255,255,255,0.08)",
            borderRadius:18, padding:"16px 16px 14px", display:"flex", flexDirection:"column", gap:10,
            minWidth: isTop ? 0 : 0, flex:"1 1 0" }}>

            {/* Rank + Grade */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%",
                        background: isTop ? hexToRgba(accent,0.2) : "rgba(255,255,255,0.07)",
                        border: isTop ? `1px solid ${hexToRgba(accent,0.4)}` : "1px solid rgba(255,255,255,0.10)",
                        display:"flex", alignItems:"center", justifyContent:"center" }}
                        aria-label={`Rang ${rank}`}>
                        <span style={{ fontSize:9, fontWeight:700, color: isTop ? accent : "rgba(255,255,255,0.4)",
                            fontFamily:"-apple-system,sans-serif" }} aria-hidden="true">
                            {rank}
                        </span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:gc, flexShrink:0 }} aria-hidden="true" />
                        <span style={{ fontSize:13, fontWeight:700, color:gc,
                            fontFamily:"-apple-system,'SF Pro Display',sans-serif", letterSpacing:"-0.01em" }}>
                            {p.grade}
                        </span>
                    </div>
                </div>
                <div style={{ background:`${sc}18`, border:`1px solid ${sc}40`,
                    borderRadius:20, padding:"2px 10px" }}
                    aria-label={`Gesamtscore: ${overallScore}`}>
                    <span style={{ fontSize:12, fontWeight:700, color:sc,
                        fontFamily:"-apple-system,sans-serif", letterSpacing:"-0.02em" }} aria-hidden="true">
                        {overallScore}
                    </span>
                </div>
            </div>

            {/* Name + Area + AI desc */}
            <div>
                <a href={p.url || `https://bleau.info/?q=${encodeURIComponent(p.name)}`}
                    target="_blank" rel="noopener noreferrer"
                    aria-label={`${p.name} auf bleau.info ansehen`}
                    style={{ display:"block", fontSize:14, fontWeight:600, color:"#fff",
                        textDecoration:"none", lineHeight:1.3, letterSpacing:"-0.01em",
                        fontFamily:"-apple-system,'SF Pro Display',sans-serif",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {p.name}
                </a>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.30)", marginTop:2,
                    fontFamily:"-apple-system,'SF Pro Text',sans-serif" }}>
                    {areaName}
                </div>
                <div style={{ fontSize:10, marginTop:5, lineHeight:1.55,
                    fontFamily:"-apple-system,'SF Pro Text',sans-serif", fontStyle:"italic",
                    color: (typeof p.aiDesc === 'string' && p.aiDesc)
                        ? "rgba(255,255,255,0.52)" : "rgba(255,255,255,0.30)" }}>
                    {(typeof p.aiDesc === 'string' && p.aiDesc) || boulderStatusDesc(p)}
                </div>
            </div>

            {/* DRY / COND bars */}
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {[{lbl:"DRY",s:p.dryScore},{lbl:"COND",s:p.condScore}].map(b => (
                    <div key={b.lbl} style={{ display:"flex", alignItems:"center", gap:7 }}
                        aria-label={`${b.lbl === "DRY" ? "Trockenheit" : "Bedingungen"}: ${b.s} von 100`}>
                        <span style={{ fontSize:8, color:"rgba(255,255,255,0.22)", width:30,
                            fontFamily:"-apple-system,sans-serif", textTransform:"uppercase", letterSpacing:"0.08em" }}
                            aria-hidden="true">
                            {b.lbl}
                        </span>
                        <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}
                            aria-hidden="true">
                            <div style={{ height:"100%", borderRadius:2, width:`${b.s}%`,
                                background:scoreColor(b.s), transition:"width 1s cubic-bezier(0.34,1.56,0.64,1)" }} />
                        </div>
                        <span style={{ fontSize:10, fontWeight:600, color:scoreColor(b.s),
                            width:22, textAlign:"right", fontFamily:"-apple-system,sans-serif" }} aria-hidden="true">
                            {b.s}
                        </span>
                    </div>
                ))}
            </div>

            {/* Tags */}
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                <span style={{ fontSize:9, color:"rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.06)",
                    padding:"2px 8px", borderRadius:20, fontFamily:"-apple-system,sans-serif" }}>
                    {sm.icon} {sm.label}
                </span>
                {rsm && rsm.label.toLowerCase() !== sm.label.toLowerCase() && (
                    <span style={{ fontSize:9, color:rsm.col, background:`${rsm.col}18`,
                        padding:"2px 8px", borderRadius:20, fontFamily:"-apple-system,sans-serif" }}>
                        {rsm.label}
                    </span>
                )}
                {ss != null && ss >= 25 && (
                    <span style={{ fontSize:9, color:accent, background:hexToRgba(accent,0.12),
                        padding:"2px 8px", borderRadius:20, fontFamily:"-apple-system,sans-serif" }}
                        aria-label={`Größenpassung: ${Math.round(ss)}%`}>
                        ↕ {Math.round(ss)}%
                    </span>
                )}
                {gmapsUrl && (
                    <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                        aria-label={`Navigation zu ${p.name} öffnen`}
                        style={{ fontSize:9, color:"rgba(255,255,255,0.30)", background:"rgba(255,255,255,0.06)",
                            padding:"2px 8px", borderRadius:20, textDecoration:"none",
                            fontFamily:"-apple-system,sans-serif" }}>
                        📍 GPS
                    </a>
                )}
            </div>
        </article>
    )
}

// ── Gamification / Community Verify ──────────────────────────────────────────
function getOrCreateUserId() {
    try {
        const stored = localStorage.getItem("hset_uid")
        if (stored) return stored
        const id = crypto.randomUUID()
        localStorage.setItem("hset_uid", id)
        return id
    } catch { return "anon" }
}
function loadBoulderVotes() {
    try { const raw = localStorage.getItem("hset_bv"); return raw ? JSON.parse(raw) : {} }
    catch { return {} }
}
function saveBoulderVote(id, kind, status) {
    try {
        const all = loadBoulderVotes()
        if (!all[id]) all[id] = {}
        all[id][kind] = status
        localStorage.setItem("hset_bv", JSON.stringify(all))
    } catch {}
}
function loadAccStats() {
    try { const raw = localStorage.getItem("hset_acc"); return raw ? JSON.parse(raw) : { accuracy: null, reports: 0 } }
    catch { return { accuracy: null, reports: 0 } }
}
function saveAccStats(accuracy, reports) {
    try { localStorage.setItem("hset_acc", JSON.stringify({ accuracy, reports })) } catch {}
}
function getStatusLevel(stats) {
    const { reports, accuracy } = stats
    if (reports >= 25 && (accuracy ?? 0) >= 75) return "top"
    if (reports >= 10 && (accuracy ?? 0) >= 60) return "insider"
    if (reports >= 5) return "rookie"
    return "none"
}
const STATUS_META = {
    none:    null,
    rookie:  { label: "Rookie",        color: "rgba(255,255,255,0.50)" },
    insider: { label: "Insider",       color: "#FFD60A" },
    top:     { label: "Top Melder ⭐", color: "#30D158" },
}
function StatusBadge({ stats }) {
    const level = getStatusLevel(stats)
    const meta  = STATUS_META[level]
    if (!meta) return null
    return (
        <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
            borderRadius: 7, padding: "2px 8px",
            fontSize: 9, fontWeight: 700, color: meta.color,
            fontFamily: "-apple-system,sans-serif", letterSpacing: "0.04em", flexShrink: 0,
        }}>
            🎯 {meta.label}
            {stats.accuracy !== null && <span style={{ opacity: 0.7 }}>· {stats.accuracy}%</span>}
        </div>
    )
}

function VerifyBar({ areaKey }) {
    const [phase,    setPhase]    = useState("idle")
    const [result,   setResult]   = useState(null)
    const [choice,   setChoice]   = useState(null)
    const [accStats, setAccStats] = useState(() => loadAccStats())

    async function submit(status) {
        if (phase !== "idle") return
        setChoice(status); setPhase("submitting")
        try {
            const res = await fetch(`${WORKER}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secret: VERIFY_TOKEN, areaKey, status, userId: getOrCreateUserId() }),
            })
            const json = await res.json()
            if (json.ok && json.duplicate) {
                setResult({ dryPct: json.dryPct, wetPct: json.wetPct, total: json.total,
                    nextAvailableTs: json.nextAvailableTs, lastStatus: json.lastStatus })
                setChoice(json.lastStatus ?? status); setPhase("duplicate")
            } else if (json.ok) {
                const updated = { accuracy: json.userAccuracy, reports: json.userReports }
                saveAccStats(updated.accuracy, updated.reports); setAccStats(updated)
                setResult({ dryPct: json.dryPct, wetPct: json.wetPct, total: json.total })
                setPhase("done")
            } else { setPhase("idle") }
        } catch { setPhase("idle") }
    }

    const level = getStatusLevel(accStats)
    const glowMult = level === "top" ? 1.4 : level === "insider" ? 1.1 : 0.8
    const btnBase = {
        flex: 1, height: 36, borderRadius: 11, border: "none", cursor: "pointer",
        fontFamily: "-apple-system,sans-serif", fontSize: 12, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .18s", WebkitTapHighlightColor: "transparent",
        letterSpacing: "-0.01em", boxSizing: "border-box",
    }

    if (phase === "idle" || phase === "submitting") return (
        <div style={{ display: "flex", gap: 7 }}>
            <button disabled={phase === "submitting"} onTouchStart={() => {}}
                onClick={() => submit("dry")}
                style={{ ...btnBase,
                    background: phase === "submitting" && choice === "dry" ? "rgba(48,209,88,0.22)" : "rgba(48,209,88,0.10)",
                    border: `1px solid rgba(48,209,88,${phase === "submitting" && choice === "dry" ? "0.55" : "0.22"})`,
                    color: phase === "submitting" && choice === "wet" ? "rgba(48,209,88,0.25)" : "#30D158",
                }}>Trocken</button>
            <button disabled={phase === "submitting"} onTouchStart={() => {}}
                onClick={() => submit("wet")}
                style={{ ...btnBase,
                    background: phase === "submitting" && choice === "wet" ? "rgba(10,132,255,0.22)" : "rgba(10,132,255,0.10)",
                    border: `1px solid rgba(10,132,255,${phase === "submitting" && choice === "wet" ? "0.55" : "0.22"})`,
                    color: phase === "submitting" && choice === "dry" ? "rgba(10,132,255,0.25)" : "#0A84FF",
                }}>Nass</button>
        </div>
    )

    if (phase === "duplicate") {
        const hoursLeft = result?.nextAvailableTs
            ? Math.ceil((result.nextAvailableTs - Date.now()) / 3_600_000) : null
        const accentColor = choice === "dry" ? "#30D158" : "#0A84FF"
        const accentRgb   = choice === "dry" ? "48,209,88" : "10,132,255"
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: accentColor }} />
                        <div style={{ position: "absolute", inset: -3, borderRadius: "50%",
                            border: `1.5px solid ${accentColor}`, opacity: 0.35,
                            animation: "hset-ping 2s ease-out infinite" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: accentColor, fontFamily: "-apple-system,sans-serif" }}>Heute gemeldet</span>
                    {hoursLeft !== null && (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "-apple-system,sans-serif", marginLeft: "auto" }}>+{hoursLeft}h</span>
                    )}
                </div>
                <div style={{ height: 5, borderRadius: 4, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.07)" }}>
                    <div style={{ width: `${result?.dryPct ?? 0}%`, background: "#30D158", boxShadow: `0 0 8px rgba(${accentRgb},0.35)`, transition: "width .5s ease" }} />
                    <div style={{ width: `${result?.wetPct ?? 0}%`, background: "#0A84FF", transition: "width .5s ease" }} />
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", gap: 7 }}>
                {["dry", "wet"].map(s => {
                    const isChosen  = choice === s
                    const accentRgb = s === "dry" ? "48,209,88" : "10,132,255"
                    const accent    = s === "dry" ? "#30D158" : "#0A84FF"
                    const glow      = isChosen ? glowMult : 0
                    return (
                        <div key={s} style={{
                            flex: 1, height: 36, borderRadius: 11,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "-apple-system,sans-serif", fontSize: 12, fontWeight: isChosen ? 700 : 500,
                            background: isChosen ? `rgba(${accentRgb},${0.12 * glowMult})` : "rgba(255,255,255,0.03)",
                            border: `1px solid rgba(${accentRgb},${isChosen ? 0.35 * glowMult : 0.06})`,
                            color: isChosen ? accent : "rgba(255,255,255,0.16)",
                            boxShadow: isChosen ? `0 0 ${12 * glow}px rgba(${accentRgb},${0.18 * glow})` : "none",
                            transition: "all .3s ease", userSelect: "none", letterSpacing: "-0.01em",
                        }}>{s === "dry" ? "Trocken" : "Nass"}</div>
                    )
                })}
            </div>
            <div style={{ height: 5, borderRadius: 4, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.07)" }}>
                <div style={{ width: `${result ? result.dryPct : 0}%`, background: "#30D158", boxShadow: "0 0 8px rgba(48,209,88,0.45)", transition: "width .6s ease" }} />
                <div style={{ width: `${result ? result.wetPct : 0}%`, background: "#0A84FF", boxShadow: "0 0 8px rgba(10,132,255,0.35)", transition: "width .6s ease" }} />
            </div>
        </div>
    )
}

function BoulderActions({ p, userHeightMid }) {
    const [vote, setVote] = useState(() => {
        const all = loadBoulderVotes()
        return p.id ? (all[p.id] || {}) : {}
    })

    async function submit(kind, status) {
        if (vote[kind]) return
        setVote(prev => ({ ...prev, [kind]: status }))
        if (p.id) saveBoulderVote(p.id, kind, status)
        try {
            const body: any = { secret: VERIFY_TOKEN, boulderId: p.id, kind, status, userId: getOrCreateUserId() }
            if (kind === "size" && userHeightMid) body.height = userHeightMid
            await fetch(`${WORKER}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
        } catch {}
    }

    function Pill({ label, active, accentRgb, onTap }) {
        return (
            <div onClick={onTap} onTouchStart={() => {}}
                style={{
                    padding: "3px 8px", borderRadius: 6,
                    fontSize: 9, fontWeight: 600, fontFamily: "-apple-system,sans-serif",
                    background: active ? `rgba(${accentRgb},0.18)` : "rgba(255,255,255,0.04)",
                    border: `1px solid rgba(${accentRgb},${active ? 0.40 : 0.08})`,
                    color: active ? `rgb(${accentRgb})` : "rgba(255,255,255,0.32)",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    transition: "all .2s ease",
                    pointerEvents: active ? "none" : "auto",
                    WebkitTapHighlightColor: "transparent",
                }}>{label}</div>
        )
    }

    function Pair({ kind, options }) {
        const chosen = vote[kind]
        return (
            <div style={{ display: "flex", gap: 3, flexShrink: 0, opacity: chosen ? 0.55 : 1, transition: "opacity .25s ease" }}>
                {options.map(o => (
                    <Pill key={o.status}
                        label={o.status === chosen ? `✓ ${o.label}` : o.label}
                        active={o.status === chosen}
                        accentRgb={o.accentRgb}
                        onTap={() => submit(kind, o.status)} />
                ))}
            </div>
        )
    }

    if (!p.id) return null
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <Pair kind="condition" options={[
                { status: "dry", label: "Trocken", accentRgb: "48,209,88" },
                { status: "wet", label: "Nass",    accentRgb: "10,132,255" },
            ]} />
            {userHeightMid && p.id != null && (
                <Pair kind="size" options={[
                    { status: "yes", label: "Passt",       accentRgb: "48,209,88" },
                    { status: "no",  label: "Passt nicht", accentRgb: "255,255,255" },
                ]} />
            )}
        </div>
    )
}

// ── Boulder Row (inside area) ─────────────────────────────────────────────────
function BoulderRow({ p, userHeightMid }) {
    const gc  = gradeCol(p.grade || "")
    const sm  = STEEP_META[p.steepness] || STEEP_META["other"]
    const rsm = STYLE_META[p.style] || null
    const ss  = userHeightMid && p.sizes?.length ? getSizeMatch(p.sizes, userHeightMid) : (p.sizeScore ?? null)
    const matchTier = !p.sizes?.length ? null : ss===null ? null
        : ss>=60?"good" : ss>=25?"ok" : ss>0?"low" : "none"
    const mc = { good:{c:"#30D158"}, ok:{c:"#FFD60A"}, low:{c:"#FF9F0A"}, none:{c:"rgba(180,180,180,0.35)"} }
    const gmapsUrl = p.lat && p.lon ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}` : null

    return (
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"12px 0",
            borderTop:"1px solid rgba(255,255,255,0.055)" }}
            role="listitem">
            {/* Grade */}
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, paddingTop:1 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:gc }} aria-hidden="true" />
                <span style={{ fontSize:13, fontWeight:700, color:gc, minWidth:28,
                    fontFamily:"-apple-system,'SF Pro Display',sans-serif", letterSpacing:"-0.01em" }}>
                    {p.grade}
                </span>
            </div>
            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
                <a href={p.url || `https://bleau.info/?q=${encodeURIComponent(p.name)}`}
                    target="_blank" rel="noopener noreferrer"
                    aria-label={`${p.name}, ${p.grade}, auf bleau.info ansehen`}
                    style={{ display:"block", fontSize:13, fontWeight:500, color:"#fff",
                        textDecoration:"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        fontFamily:"-apple-system,'SF Pro Text',sans-serif" }}>
                    {p.name}
                </a>
                {((typeof p.aiDesc === 'string' && p.aiDesc && p.dryScore > 0) || p.description) && (
                    <div style={{ fontSize:10, marginTop:3,
                        color: (typeof p.aiDesc === 'string' && p.aiDesc && p.dryScore > 0) ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.28)",
                        fontFamily:"-apple-system,'SF Pro Text',sans-serif", lineHeight:1.5,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {(typeof p.aiDesc === 'string' && p.aiDesc && p.dryScore > 0) || p.description}
                    </div>
                )}
                {/* Tags */}
                <div style={{ display:"flex", gap:5, marginTop:5, flexWrap:"wrap" }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.30)", background:"rgba(255,255,255,0.05)",
                        padding:"1px 7px", borderRadius:20, fontFamily:"-apple-system,sans-serif" }}>
                        {sm.icon} {sm.label}
                    </span>
                    {rsm && rsm.label.toLowerCase() !== sm.label.toLowerCase() && (
                        <span style={{ fontSize:9, color:rsm.col, background:`${rsm.col}15`,
                            padding:"1px 7px", borderRadius:20, fontFamily:"-apple-system,sans-serif" }}>
                            {rsm.label}
                        </span>
                    )}
                    {matchTier && matchTier !== "none" && (
                        <span style={{ fontSize:9, color:mc[matchTier].c, background:`${mc[matchTier].c}15`,
                            padding:"1px 7px", borderRadius:20, fontFamily:"-apple-system,sans-serif", fontWeight:600 }}
                            aria-label={`Größenpassung: ${Math.round(ss)}%`}>
                            ↕ {Math.round(ss)}% passt
                        </span>
                    )}
                    {p.popularity > 0 && (
                        <span style={{ fontSize:9, color:"rgba(255,255,255,0.20)",
                            fontFamily:"-apple-system,sans-serif" }}
                            aria-label={`${p.popularity} Besteigungen`}>
                            {p.popularity}×
                        </span>
                    )}
                </div>
                <BoulderActions p={p} userHeightMid={userHeightMid} />
            </div>
            {/* Score + GPS */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    {[{l:"DRY",s:p.dryScore},{l:"COND",s:p.condScore}].map(b => (
                        <div key={b.l} style={{ display:"flex", alignItems:"center", gap:5 }}
                            aria-label={`${b.l === "DRY" ? "Trockenheit" : "Bedingungen"}: ${b.s}`}>
                            <span style={{ fontSize:7, color:"rgba(255,255,255,0.20)", width:26,
                                textAlign:"right", textTransform:"uppercase", letterSpacing:"0.08em",
                                fontFamily:"-apple-system,sans-serif" }} aria-hidden="true">{b.l}</span>
                            <div style={{ width:36, height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}
                                aria-hidden="true">
                                <div style={{ height:"100%", borderRadius:2, width:`${b.s}%`, background:scoreColor(b.s) }} />
                            </div>
                            <span style={{ fontSize:9, fontWeight:700, color:scoreColor(b.s), width:18,
                                textAlign:"right", fontFamily:"-apple-system,sans-serif" }} aria-hidden="true">{b.s}</span>
                        </div>
                    ))}
                </div>
                {gmapsUrl && (
                    <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                        aria-label={`Navigation zu ${p.name}`}
                        style={{ fontSize:9, color:"rgba(255,255,255,0.25)", background:"rgba(255,255,255,0.05)",
                            border:"1px solid rgba(255,255,255,0.08)", padding:"3px 8px", borderRadius:8,
                            textDecoration:"none", fontFamily:"-apple-system,sans-serif" }}>
                        📍 GPS
                    </a>
                )}
            </div>
        </div>
    )
}

// ── Area Card (collapsible) ───────────────────────────────────────────────────
function AreaCard({ area, minG, maxG, activeStyles, userHeightMid, userHeightRange, sortMode, index }) {
    const [open, setOpen]       = useState(false)
    const [showAll, setShowAll] = useState(false)
    const [showDry, setShowDry] = useState(false)

    const z  = area.zone || {}
    const wm = WIND_META[z.windDir] || WIND_META["N"]
    const sm = STEEP_META[area.dominant] || STEEP_META["other"]
    const dh = area.dryingHours
    const dryAtLabel = (() => {
        if (!area.dryAt) return null
        const t=new Date(area.dryAt), now=new Date()
        const hh=String(t.getHours()).padStart(2,"0"), mm=String(t.getMinutes()).padStart(2,"0")
        const isToday=t.toDateString()===now.toDateString()
        const isTomorrow=t.toDateString()===new Date(now.getTime()+86400000).toDateString()
        const days=["So","Mo","Di","Mi","Do","Fr","Sa"]
        if (isToday) return `heute ${hh}:${mm}`
        if (isTomorrow) return `morgen ${hh}:${mm}`
        return `${days[t.getDay()]} ${hh}:${mm}`
    })()

    const areaProbs = area.problems || []
    let probs = areaProbs.filter(p => {
        if (!gir(p.grade, minG, maxG)) return false
        if (activeStyles.length && !activeStyles.includes(p.steepness)) return false
        return true
    })
    if (!probs.length) probs = areaProbs.filter(p => gir(p.grade, minG, maxG))
    if (sortMode === "size")
        probs.sort((a, b) => (b.sizeScore ?? -1) - (a.sizeScore ?? -1))
    else
        probs.sort((a, b) => b.rankScore - a.rankScore)
    const top3 = probs.slice(0, 3), rest = probs.slice(3)

    const isWet = area.dryScore === 0
    const dryTimeText = area.dryScore >= 100 ? null
        : dh === null  ? "⚠ >72h"
        : dh === 0     ? "⏳ trocknet..."
        : dryAtLabel   ? `⏱ ${dryAtLabel}`
        : `⏱ ${dh}h`

    const EXP_SUN = {
        S:{l:"Süd · max. Sonne",c:"#30D158"}, SE:{l:"SO · viel Sonne",c:"#30D158"},
        SW:{l:"SW · viel Sonne",c:"#30D158"}, E:{l:"Ost · Morgensonne",c:"#FFD60A"},
        W:{l:"West · Abendsonne",c:"#FFD60A"},N:{l:"Nord · kein Sonne",c:"#64D2FF"},
        NE:{l:"NO · wenig Sonne",c:"#64D2FF"},NW:{l:"NW · wenig Sonne",c:"#64D2FF"},
    }
    const factors = []
    if (area.exposition && area.exposition !== "gemischt") {
        const es = EXP_SUN[area.exposition]; if (es) factors.push(es)
    }
    if (area.dominant==="slab") factors.push({l:"Slab · viel Wasser",c:"#FF9F0A"})
    else if (area.dominant==="overhang"||area.dominant==="roof") factors.push({l:"Überhang · kaum nass",c:"#30D158"})
    if (z.windDeg!=null && area.exposition && area.exposition!=="gemischt") {
        const expDeg={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315}[area.exposition]??null
        if (expDeg!==null) {
            const diff=Math.abs(((z.windDeg-expDeg)+360)%360), angle=Math.min(diff,360-diff)
            if (z.wind<3) factors.push({l:"Windstill",c:"rgba(255,255,255,0.28)"})
            else if (angle<45) factors.push({l:`${z.windDir} ${z.wind}km/h · direkt`,c:"#30D158"})
            else if (angle<90) factors.push({l:`${z.windDir} ${z.wind}km/h · streifend`,c:"#FFD60A"})
            else if (angle>=135) factors.push({l:`${z.windDir} ${z.wind}km/h · abgewandt`,c:"rgba(255,255,255,0.28)"})
        }
    }

    const dryPct = Math.min(100, area.dryScore)
    const dryBarColor = dryPct < 30 ? "#64D2FF" : dryPct < 70 ? "#FFD60A" : "#30D158"

    return (
        <article className="bleau-area-card"
            aria-label={`Gebiet: ${area.name}, Trockenheit ${area.dryScore}, Bedingungen ${area.condScore}`}
            style={{ animationDelay:`${index*60}ms`,
            background:"rgba(255,255,255,0.04)",
            border:`1px solid ${isWet ? "rgba(100,210,255,0.18)" : "rgba(255,255,255,0.08)"}`,
            borderRadius:20, overflow:"hidden",
            backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)" }}>

            {/* Wet banner */}
            {isWet && (
                <div style={{ padding:"7px 18px", background:"rgba(100,210,255,0.07)",
                    borderBottom:"1px solid rgba(100,210,255,0.12)",
                    display:"flex", alignItems:"center", gap:6 }}
                    role="status" aria-label="Fels aktuell nass">
                    <span style={{ fontSize:9, color:"#64D2FF", letterSpacing:"0.08em",
                        textTransform:"uppercase", fontFamily:"-apple-system,sans-serif", fontWeight:600 }}>
                        Fels nass
                    </span>
                    {dryTimeText && (
                        <span style={{ fontSize:9, color:"rgba(255,200,60,0.85)",
                            fontFamily:"-apple-system,sans-serif", marginLeft:"auto" }}>
                            {dryTimeText}
                        </span>
                    )}
                </div>
            )}

            {/* Header */}
            <div style={{ padding:"16px 18px 12px",
                display:"flex", alignItems:"center", gap:14 }}>

                {/* Score rings */}
                <div style={{ display:"flex", gap:12, flexShrink:0 }}>
                    <ScoreRing score={area.dryScore}  label="DRY"  size={50} />
                    <ScoreRing score={area.condScore} label="COND" size={50} />
                </div>

                {/* Name + meta */}
                <div style={{ flex:1, minWidth:0 }}>
                    <h2 style={{ fontSize:16, fontWeight:700, color:"#fff", lineHeight:1.2,
                        fontFamily:"-apple-system,'SF Pro Display',sans-serif",
                        letterSpacing:"-0.02em", marginBottom:3, margin:"0 0 3px 0" }}>
                        {area.name}
                    </h2>
                    {area.parent && (
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.30)", marginBottom:5,
                            fontFamily:"-apple-system,sans-serif" }}>
                            {area.parent}
                        </div>
                    )}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 9px",
                            borderRadius:20, background:`${wm.c}15`, border:`1px solid ${wm.c}30` }}
                            aria-label={`Wind: ${z.windDir} ${z.wind} km/h, ${wm.desc}`}>
                            <span style={{ fontSize:10, color:wm.c, fontFamily:"-apple-system,sans-serif", fontWeight:600 }}>
                                {z.windDir} {z.wind}km/h
                            </span>
                        </div>
                        <div style={{ padding:"3px 9px", borderRadius:20,
                            background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}
                            aria-label={`Luftfeuchtigkeit: ${z.humidity}%`}>
                            <span style={{ fontSize:10, fontFamily:"-apple-system,sans-serif",
                                color: z.humidity>80?"#64D2FF":z.humidity>65?"#FFD60A":"#30D158", fontWeight:600 }}>
                                {z.humidity}% Luftfeuchte
                            </span>
                        </div>
                        <div style={{ padding:"3px 9px", borderRadius:20,
                            background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}
                            aria-label={`Temperatur: ${z.temp}°C`}>
                            <span style={{ fontSize:10, color:"rgba(255,255,255,0.60)",
                                fontFamily:"-apple-system,sans-serif", fontWeight:500 }}>
                                {z.temp}°C
                            </span>
                        </div>
                        {!isWet && dryTimeText && (
                            <span style={{ fontSize:10, color:"#FFD60A",
                                fontFamily:"-apple-system,sans-serif", fontWeight:600 }}>
                                {dryTimeText}
                            </span>
                        )}
                        {!isWet && z.hoursDry > 0 && (
                            <span style={{ fontSize:10,
                                color: z.hoursDry>=24?"#30D158":z.hoursDry>=6?"#FFD60A":"rgba(255,255,255,0.40)",
                                fontFamily:"-apple-system,sans-serif" }}>
                                Seit {z.hoursDry}h trocken
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Always-visible body ─────────────────────────────────── */}
            <div style={{ padding:"0 18px 16px" }}>

                {/* AI description */}
                {typeof area.aiDesc === 'string' && area.aiDesc && (
                    <p style={{ fontSize:12, color:"rgba(255,255,255,0.52)", lineHeight:1.65,
                        fontFamily:"-apple-system,'SF Pro Text',sans-serif",
                        marginBottom:12, margin:"0 0 12px 0" }}>
                        {area.aiDesc}
                    </p>
                )}

                {/* Drying progress */}
                {area.dryScore < 100 && (
                    <div style={{ marginBottom:12 }}>
                        <button
                            onClick={() => setShowDry(s => !s)}
                            onTouchStart={() => setShowDry(s => !s)}
                            aria-expanded={showDry}
                            aria-label={`Trocknungsverlauf für ${area.name} ${showDry ? "ausblenden" : "anzeigen"}`}
                            style={{ width:"100%", display:"flex", alignItems:"center",
                                justifyContent:"space-between",
                                background:"none", border:"none", padding:"0 0 6px 0",
                                cursor:"pointer", userSelect:"none",
                                WebkitTapHighlightColor:"transparent" }}>
                            <span style={{ fontSize:9, color: showDry ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)",
                                textTransform:"uppercase", letterSpacing:"0.12em",
                                fontFamily:"-apple-system,sans-serif", fontWeight:600 }}>
                                Trocknungsverlauf
                            </span>
                            <span style={{ fontSize:10, fontWeight:600,
                                color: dh===null?"#FF453A":"#FFD60A",
                                fontFamily:"-apple-system,sans-serif",
                                display:"flex", alignItems:"center", gap:5 }}>
                                {dh===null?"⚠ >72h":dh===0?"⏳ trocknet...":dryAtLabel?`⏱ ${dryAtLabel}`:`⏱ ${dh}h`}
                                <span aria-hidden="true" style={{ fontSize:10, color:"rgba(255,255,255,0.20)",
                                    display:"inline-block",
                                    transform: showDry ? "rotate(180deg)" : "rotate(0deg)",
                                    transition:"transform 0.22s" }}>⌄</span>
                            </span>
                        </button>
                        <div style={{ maxHeight: showDry ? "600px" : "0", overflow:"hidden",
                            transition:"max-height 0.35s cubic-bezier(0.4,0,0.2,1)" }}
                            aria-hidden={!showDry}>
                            <div style={{ paddingTop:2 }}>
                                <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:10, overflow:"hidden" }}
                                    aria-hidden="true">
                                    <div style={{ height:"100%", borderRadius:10,
                                        width:`${Math.max(dryPct, dryPct===0?1:0)}%`,
                                        background:`linear-gradient(90deg, ${dryBarColor}88, ${dryBarColor})`,
                                        transition:"width 1s cubic-bezier(0.34,1.56,0.64,1)",
                                        boxShadow: dryPct>30?`0 0 8px ${dryBarColor}44`:undefined }} />
                                </div>
                                <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }} aria-hidden="true">
                                    <span style={{ fontSize:8, color:"rgba(255,255,255,0.13)", fontFamily:"-apple-system,sans-serif" }}>Nass</span>
                                    {dh!=null && dh>0 && dryAtLabel && (
                                        <span style={{ fontSize:8, color:"rgba(255,255,255,0.13)", fontFamily:"-apple-system,sans-serif" }}>{dryAtLabel}</span>
                                    )}
                                    <span style={{ fontSize:8, color:"rgba(255,255,255,0.13)", fontFamily:"-apple-system,sans-serif" }}>Trocken</span>
                                </div>
                                {area.dryTrajectory?.length >= 4 && (
                                    <SparkLine trajectory={area.dryTrajectory}
                                        conditions={area.dryConditions} dryAt={area.dryAt} />
                                )}
                                {factors.length > 0 && (
                                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8 }}>
                                        {factors.map((f,i) => (
                                            <span key={i} style={{ fontSize:9, color:f.c,
                                                background:`${f.c}12`, border:`1px solid ${f.c}25`,
                                                padding:"2px 9px", borderRadius:20,
                                                fontFamily:"-apple-system,sans-serif" }}>
                                                {f.l}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Links */}
                <nav aria-label={`Links für ${area.name}`} style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }}>
                    {area.lat != null && (
                        <a href={`http://maps.google.com/maps?daddr=${area.lat},${area.lon}`}
                            target="_blank" rel="noopener noreferrer"
                            aria-label={`Navigation zu ${area.name} in Google Maps öffnen`}
                            style={{ fontSize:10, color:"rgba(255,255,255,0.40)",
                                background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                                padding:"5px 13px", borderRadius:10, textDecoration:"none",
                                fontFamily:"-apple-system,sans-serif", fontWeight:500 }}>
                            📍 Navigation
                        </a>
                    )}
                    <a href={area.bleauUrl || `https://bleau.info/?q=${encodeURIComponent(area.name)}`}
                        target="_blank" rel="noopener noreferrer"
                        aria-label={`${area.name} auf bleau.info ansehen`}
                        style={{ fontSize:10, color:"rgba(255,255,255,0.40)",
                            background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                            padding:"5px 13px", borderRadius:10, textDecoration:"none",
                            fontFamily:"-apple-system,sans-serif", fontWeight:500 }}>
                        🧗 bleau.info
                    </a>
                </nav>

                {/* Community Verify */}
                <div style={{ marginBottom: 12 }}>
                    <VerifyBar areaKey={area.key || area.name} />
                </div>

                {/* ── Boulder toggle button ── */}
                {probs.length > 0 && (
                    <button onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        aria-label={`${probs.length} Boulder in ${area.name} ${open ? "ausblenden" : "anzeigen"}`}
                        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                            background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
                            borderRadius:12, padding:"9px 14px", cursor:"pointer", userSelect:"none" }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.45)",
                            fontFamily:"-apple-system,sans-serif", fontWeight:500,
                            letterSpacing:"0.02em" }}>
                            🧗 {probs.length} Boulder {minG}–{maxG}
                            {userHeightRange && <span style={{ color:"rgba(255,255,255,0.22)", marginLeft:6 }}>· ↕ {userHeightRange}</span>}
                        </span>
                        <span className="bleau-expand-icon" aria-hidden="true" style={{
                            transform: open ? "rotate(180deg)" : "rotate(0deg)",
                            color:"rgba(255,255,255,0.25)", fontSize:12,
                            display:"inline-block" }}>
                            ⌄
                        </span>
                    </button>
                )}

                {/* ── Expandable boulder list ── */}
                <div style={{ maxHeight: open ? "1400px" : "0", overflow:"hidden",
                    transition:"max-height 0.45s cubic-bezier(0.4,0,0.2,1)" }}
                    aria-hidden={!open}>
                    <div style={{ paddingTop:4 }} role="list">
                        {probs.length === 0 ? (
                            <div style={{ fontSize:12, color:"rgba(255,255,255,0.18)",
                                padding:"8px 0", fontFamily:"-apple-system,sans-serif" }}>
                                Kein Problem in diesem Gradbereich.
                            </div>
                        ) : (
                            <>
                                {top3.map((p,i) => <BoulderRow key={i} p={p} userHeightMid={userHeightMid} />)}
                                {showAll && rest.map((p,i) => <BoulderRow key={i+3} p={p} userHeightMid={userHeightMid} />)}
                                {rest.length > 0 && (
                                    <button onClick={e => { e.stopPropagation(); setShowAll(v=>!v) }}
                                        aria-expanded={showAll}
                                        aria-label={showAll ? "Weniger Boulder anzeigen" : `${rest.length} weitere Boulder anzeigen`}
                                        style={{ width:"100%", background:"transparent", border:"none",
                                            color:"rgba(255,255,255,0.25)", fontSize:11, padding:"12px 0 4px",
                                            cursor:"pointer", fontFamily:"-apple-system,sans-serif",
                                            letterSpacing:"0.04em" }}>
                                        {showAll ? "↑ Weniger" : `+ ${rest.length} weitere`}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

            </div>
        </article>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BleauConditionsChecker(props) {
    const containerRef = useRef(null)
    const [width, setWidth]         = useState(390)
    const wide = width >= 680

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const obs = new ResizeObserver(e => setWidth(e[0].contentRect.width))
        obs.observe(el); setWidth(el.offsetWidth)
        return () => obs.disconnect()
    }, [])

    const [minG, setMinG]           = useState(props.defaultMinGrade  || "6c")
    const [maxG, setMaxG]           = useState(props.defaultMaxGrade  || "8a+")
    const [heightRange, setHRange]  = useState(HEIGHT_RANGES.find(h=>h.mid===props.defaultHeight)||HEIGHT_RANGES[6])
    const [activeStyles, setAS]     = useState([])
    const [sortMode, setSortMode]   = useState("score")
    const [loading, setLoading]     = useState(false)
    const [loadTxt, setLoadTxt]     = useState("Laden...")
    const [weather, setWeather]     = useState(null)
    const [allAreas, setAllAreas]   = useState([])
    const [filtered, setFiltered]   = useState([])
    const [hasResults, setHasR]     = useState(false)
    const [alert, setAlert]         = useState("")
    const [userLat, setUserLat]     = useState(null)
    const [userLon, setUserLon]     = useState(null)
    const [geoOn, setGeoOn]         = useState(false)
    const [query, setQuery]         = useState("")
    const [sugs, setSugs]           = useState([])
    const [sugsOpen, setSugsOpen]   = useState(false)
    const [selItem, setSelItem]     = useState(null)
    const [resultSearch, setRS]     = useState("")
    const [showTop3, setShowTop3]   = useState(false)
    const searchTimer = useRef(null)
    const refreshTimer = useRef(null)

    const top5 = useMemo(() =>
        allAreas.flatMap(a => (a.problems||[]).map(p => ({...p, areaName:a.name})))
            .filter(p => gir(p.grade, minG, maxG))
            .filter(p => !activeStyles.length || activeStyles.includes(p.steepness))
            .sort((a,b) => b.rankScore - a.rankScore)
            .filter(p => p.rankScore > 0)
            .slice(0, 3),
        [allAreas, minG, maxG, activeStyles]
    )

    useEffect(() => {
        if (query.length < 2) { setSugs([]); setSugsOpen(false); return }
        clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(async () => {
            try {
                const [ra, rp] = await Promise.all([
                    fetch(`${WORKER}?search=${encodeURIComponent(query)}&type=a`).then(r=>r.json()),
                    fetch(`${WORKER}?search=${encodeURIComponent(query)}&type=p`).then(r=>r.json()),
                ])
                const items = [
                    ...(ra||[]).slice(0,4).map(e=>({...e,_t:"area"})),
                    ...(rp||[]).slice(0,4).map(e=>({...e,_t:"boulder"})),
                ]
                setSugs(items); setSugsOpen(items.length>0)
            } catch { setSugs([]) }
        }, 200)
    }, [query])

    function requestGeo() {
        if (!navigator.geolocation) return
        if (geoOn) { setUserLat(null); setUserLon(null); setGeoOn(false); return }
        navigator.geolocation.getCurrentPosition(
            p => { setUserLat(p.coords.latitude); setUserLon(p.coords.longitude); setGeoOn(true) },
            () => {}, { timeout:10000, maximumAge:60000 }
        )
    }

    const applyFilter = useCallback((areas, w, sMode, uLat, uLon, si, mn, mx, aS) => {
        let result = areas
        if (si?.type==="boulder") result = areas.filter(a => a.name===si.areaName||a.key===si.areaName)
        else if (si?.type==="area") result = areas.filter(a => a.name===si.name||a.key===si.name)
        else result = areas.filter(a => {
            if (aS.length && !aS.some(st=>a.dominant===st)) return false
            return (a.problems||[]).some(p=>gir(p.grade,mn,mx))
        })
        if (uLat!==null) result = result.map(a=>({...a,dist:a.lat!=null?hav(uLat,uLon,a.lat,a.lon):null}))
        if (sMode==="dist"&&uLat!==null)
            result = [...result].sort((a,b)=>(a.dist??Infinity)-(b.dist??Infinity))
        else if (sMode==="size") {
            const ps = arr => arr?.length ? arr.reduce((s,p)=>s+(p.sizeScore??50),0)/arr.length : 50
            result = [...result].sort((a,b)=>{
                const sd = ps(b.problems) - ps(a.problems)
                if (sd !== 0) return sd
                if (b.dryScore !== a.dryScore) return b.dryScore - a.dryScore
                return b.condScore - a.condScore
            })
        } else
            result = [...result].sort((a,b)=>{
                if (b.dryScore !== a.dryScore) return b.dryScore - a.dryScore
                return b.condScore - a.condScore
            })
        setFiltered(result)
        if (w.isRaining)          setAlert("Regnet gerade — Fels nass.")
        else if (w.rain6>5)       setAlert("Starker Regen letzte 6h — Trocknen abwarten.")
        else if (w.rain6>1)       setAlert("Frischer Regen — Waldgebiete trocknen langsamer.")
        else if (w.humidity>85)   setAlert(`Luftfeuchte ${w.humidity}% — Grip stark reduziert.`)
        else if (w.humidity>75)   setAlert(`Luftfeuchte ${w.humidity}% — Grip reduziert.`)
        else                      setAlert("")
    }, [])

    async function fetchConditions(silent=false) {
        if (!silent) { setLoading(true); setHasR(false); setLoadTxt("Wetterdaten...") }
        try {
            const res = await fetch(`${WORKER}?h=${heightRange.mid}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            if (!silent) setLoadTxt("Sektoren bewerten...")
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            if (!data.areas?.length) throw new Error("Keine Daten")
            const w = data.weather || {}
            setAllAreas(data.areas); setWeather(w)
            applyFilter(data.areas, w, sortMode, userLat, userLon, selItem, minG, maxG, activeStyles)
            if (!silent) setRS("")
            setLoading(false); setHasR(true)
        } catch (e) {
            setLoading(false)
            if (!silent) setAlert(e.message || "Verbindungsfehler")
        }
    }

    async function run() {
        setSugsOpen(false)
        clearInterval(refreshTimer.current)
        refreshTimer.current = setInterval(() => fetchConditions(true), 20*60*1000)
        await fetchConditions(false)
    }
    useEffect(() => () => clearInterval(refreshTimer.current), [])

    useEffect(() => {
        if (!allAreas.length || !weather) return
        applyFilter(allAreas, weather, sortMode, userLat, userLon, selItem, minG, maxG, activeStyles)
    }, [sortMode, minG, maxG, activeStyles, applyFilter, allAreas, weather, userLat, userLon, selItem])

    const searchFiltered = resultSearch
        ? filtered.filter(a => a.name.toLowerCase().includes(resultSearch.toLowerCase()))
        : filtered
    const PAD    = wide ? 28 : 16
    const fontKey = props.fontFamily || "system"
    const FONT   = FONT_MAP[fontKey] || FONT_MAP.system
    const ACCENT    = props.accentColor  || "#C8956C"
    const BG        = props.bgColor      || "#0d0d0d"
    const CTA_TEXT  = props.ctaTextColor || "#000000"

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) return (
        <div ref={containerRef} style={{ fontFamily:FONT, background:BG, width:"100%", height:"100%",
            minHeight:props.minHeight||"600px", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:28, borderRadius:props.borderRadius||0 }}
            aria-live="polite" aria-label={loadTxt} role="status">
            <Styles fontKey={fontKey} />
            <div className="bleau-logo-float" aria-hidden="true"><BleauLogo size={wide?100:80} spinning={true} /></div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase",
                    color:"rgba(255,255,255,0.22)", fontFamily:FONT }}>{loadTxt}</span>
                <div style={{ display:"flex", gap:5 }} aria-hidden="true">
                    {[0,1,2].map(i => (
                        <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:ACCENT,
                            animation:`dotBounce 1.4s ease-in-out ${i*0.16}s infinite` }} />
                    ))}
                </div>
            </div>
        </div>
    )

    // ── Start screen ──────────────────────────────────────────────────────────
    if (!hasResults) return (
        <div ref={containerRef} style={{ fontFamily:FONT, background:BG, width:"100%", height:"100%",
            minHeight:props.minHeight||"600px", display:"flex", flexDirection:"column",
            borderRadius:props.borderRadius||0, overflow:"hidden" }}>
            <Styles fontKey={fontKey} />
            <main style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", padding:PAD, gap:36 }}>
                {/* Logo */}
                <div className="bleau-logo-float" aria-hidden="true"><BleauLogo size={wide?110:90} /></div>
                <div style={{ textAlign:"center" }}>
                    <h1 style={{ fontSize:wide?30:24, fontWeight:800, color:"#fff",
                        letterSpacing:"-0.03em", marginBottom:8, margin:"0 0 8px 0" }}>
                        HIGHSET
                    </h1>
                    <p style={{ fontSize:14, color:"rgba(255,255,255,0.35)", letterSpacing:"0.05em", margin:0 }}>
                        Fontainebleau Bedingungen
                    </p>
                </div>

                {/* Alert */}
                {alert && (
                    <div role="alert"
                        style={{ background:"rgba(255,200,60,0.08)", border:"1px solid rgba(255,200,60,0.20)",
                        borderRadius:14, padding:"11px 18px", maxWidth:340, textAlign:"center",
                        fontSize:13, color:"rgba(255,200,60,0.85)", lineHeight:1.5 }}>
                        {alert}
                    </div>
                )}

                {/* Controls */}
                <div style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:380 }}>
                    {/* Height */}
                    <div>
                        <label htmlFor="hs-height-select" style={{ fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase",
                            color:"rgba(255,255,255,0.22)", marginBottom:8, display:"block", fontFamily:FONT }}>
                            Körpergröße
                        </label>
                        <select id="hs-height-select" value={heightRange.mid}
                            onChange={e => setHRange(HEIGHT_RANGES.find(h=>h.mid===+e.target.value)||HEIGHT_RANGES[6])}
                            style={{ width:"100%", padding:"11px 14px", background:"rgba(255,255,255,0.05)",
                                border:"1px solid rgba(255,255,255,0.10)", borderRadius:12,
                                color:"#fff", fontSize:14, fontFamily:FONT, outline:"none",
                                WebkitAppearance:"none", cursor:"pointer" }}>
                            {HEIGHT_RANGES.map(h => <option key={h.mid} value={h.mid}>{h.label} cm</option>)}
                        </select>
                    </div>
                    {/* Grade range */}
                    <div style={{ display:"flex", gap:10 }}>
                        {[{lbl:"Von",val:minG,set:setMinG,id:"hs-grade-min"},{lbl:"Bis",val:maxG,set:setMaxG,id:"hs-grade-max"}].map(({lbl,val,set,id}) => (
                            <div key={lbl} style={{ flex:1 }}>
                                <label htmlFor={id} style={{ fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase",
                                    color:"rgba(255,255,255,0.22)", marginBottom:8, display:"block" }}>{lbl}</label>
                                <select id={id} value={val} onChange={e=>set(e.target.value)}
                                    style={{ width:"100%", padding:"11px 14px", background:"rgba(255,255,255,0.05)",
                                        border:"1px solid rgba(255,255,255,0.10)", borderRadius:12,
                                        color:"#fff", fontSize:14, fontFamily:FONT, outline:"none",
                                        WebkitAppearance:"none", cursor:"pointer" }}>
                                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                    {/* Styles */}
                    <div role="group" aria-label="Klettersti filtern">
                        <div style={{ fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase",
                            color:"rgba(255,255,255,0.22)", marginBottom:8 }}>Stil (optional)</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {STYLES.map(s => {
                                const on = activeStyles.includes(s.id)
                                return (
                                    <button key={s.id} className="bleau-pill"
                                        onClick={() => setAS(prev => on ? prev.filter(x=>x!==s.id) : [...prev,s.id])}
                                        aria-pressed={on}
                                        aria-label={`Stil ${s.label} ${on ? "entfernen" : "auswählen"}`}
                                        style={{ padding:"7px 14px", borderRadius:20, border:"none", cursor:"pointer",
                                            fontSize:12, fontFamily:FONT, fontWeight:500,
                                            background: on ? ACCENT : "rgba(255,255,255,0.07)",
                                            color: on ? "#000" : "rgba(255,255,255,0.55)",
                                            transition:"all 0.2s" }}>
                                        {s.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    {/* Search */}
                    <div style={{ position:"relative" }}>
                        <label htmlFor="hs-search" style={{ position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0,0,0,0)" }}>
                            Gebiet oder Boulder suchen
                        </label>
                        <input id="hs-search" value={query}
                            onChange={e=>{setQuery(e.target.value);if(!e.target.value)setSelItem(null)}}
                            placeholder="Gebiet oder Boulder suchen..."
                            aria-label="Gebiet oder Boulder suchen"
                            aria-autocomplete="list"
                            aria-expanded={sugsOpen}
                            style={{ width:"100%", padding:"11px 14px", background:"rgba(255,255,255,0.05)",
                                border:"1px solid rgba(255,255,255,0.10)", borderRadius:12,
                                color:"#fff", fontSize:14, fontFamily:FONT, outline:"none",
                                boxSizing:"border-box", caretColor:ACCENT }} />
                        {sugsOpen && sugs.length > 0 && (
                            <div role="listbox" aria-label="Suchvorschläge"
                                style={{ position:"absolute", top:"calc(100% + 6px)", left:0, right:0, zIndex:10,
                                background:"rgba(20,20,30,0.95)", border:"1px solid rgba(255,255,255,0.10)",
                                borderRadius:14, overflow:"hidden", backdropFilter:"blur(20px)" }}>
                                {sugs.map((s,i) => (
                                    <div key={i} role="option" aria-selected={false}
                                        onClick={()=>{setQuery(s.l);setSelItem({type:s._t,name:s.l,areaName:s.a||null,grade:s.g||null});setSugsOpen(false)}}
                                        style={{ padding:"11px 16px", cursor:"pointer", fontSize:13,
                                            color:"rgba(255,255,255,0.75)", borderBottom:"1px solid rgba(255,255,255,0.06)",
                                            fontFamily:FONT }}
                                        onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                        <span style={{ fontSize:9, color:"rgba(255,255,255,0.30)", marginRight:8,
                                            textTransform:"uppercase" }}>{s._t==="area"?"Gebiet":"Boulder"}</span>
                                        {s.l}{s.g&&<span style={{color:"#FFD60A",marginLeft:6}}>{s.g}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Location */}
                    <button onClick={requestGeo}
                        aria-pressed={geoOn}
                        aria-label={geoOn ? "Standort deaktivieren" : "Standort für Sortierung nach Nähe nutzen"}
                        style={{ padding:"8px 16px", borderRadius:20, border:"1px solid rgba(255,255,255,0.10)",
                            background: geoOn ? hexToRgba(ACCENT,0.12) : "rgba(255,255,255,0.04)",
                            color: geoOn ? ACCENT : "rgba(255,255,255,0.35)",
                            fontSize:12, fontFamily:FONT, cursor:"pointer", letterSpacing:"0.02em" }}>
                        {geoOn?"📍 Standort aktiv":"📍 Standort nutzen"}
                    </button>
                </div>

                {/* CTA Button */}
                <div style={{ position:"relative", display:"inline-flex", justifyContent:"center", alignSelf:"center" }}>
                    <div style={{ position:"absolute", inset:"-12px", borderRadius:62,
                        background:ACCENT, filter:"blur(24px)", opacity:0.40, zIndex:0, pointerEvents:"none" }}
                        aria-hidden="true" />
                    <button onClick={run}
                        style={{ position:"relative", zIndex:1,
                            padding:"16px 48px", borderRadius:50, border:"none",
                            background:ACCENT,
                            color:CTA_TEXT, fontSize:16, fontWeight:700, fontFamily:FONT,
                            cursor:"pointer", letterSpacing:"-0.01em",
                            transition:"transform 0.18s, filter 0.18s" }}
                        onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.035)";e.currentTarget.style.filter="brightness(1.12)"}}
                        onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.filter="brightness(1)"}}>
                        Bedingungen laden
                    </button>
                </div>
            </main>
        </div>
    )

    // ── Results ───────────────────────────────────────────────────────────────
    const wIcon     = weather ? (weather.isRaining ? "🌧" : weather.rain6 > 1 ? "🌦" : weather.humidity > 85 ? "🌫" : weather.humidity > 70 ? "⛅" : "☀️") : null
    const wIconType = weather ? (weather.isRaining ? "rainy" : weather.rain6 > 1 ? "drizzle" : weather.humidity > 85 ? "cloudy" : weather.humidity > 70 ? "partly-cloudy" : "sunny") : null
    const condLabel = weather ? (weather.isRaining ? "Regen" : weather.rain6 > 3 ? "Frischer Regen" : weather.humidity > 85 ? "Sehr feucht" : weather.humidity > 70 ? "Feucht" : "Gute Bedingungen") : null
    const condColor = weather ? (weather.isRaining ? "#64D2FF" : weather.rain6 > 1 ? "#FFD60A" : weather.humidity > 85 ? "#FF9F0A" : "#30D158") : "#30D158"
    const wBarWm    = weather ? (WIND_META[weather.windDir] || WIND_META["N"]) : null
    const humColor  = weather ? (weather.humidity > 85 ? "#64D2FF" : weather.humidity > 70 ? "#FFD60A" : "rgba(255,255,255,0.70)") : "rgba(255,255,255,0.70)"
    const humBg     = weather ? (weather.humidity > 85 ? "rgba(100,210,255,0.08)" : weather.humidity > 70 ? "rgba(255,214,10,0.08)" : "rgba(255,255,255,0.05)") : "rgba(255,255,255,0.05)"
    const humBorder = weather ? (weather.humidity > 85 ? "rgba(100,210,255,0.20)" : weather.humidity > 70 ? "rgba(255,214,10,0.18)" : "rgba(255,255,255,0.07)") : "rgba(255,255,255,0.07)"

    return (
        <div ref={containerRef} style={{ fontFamily:FONT, background:BG, width:"100%",
            minHeight:props.minHeight||"600px", borderRadius:props.borderRadius||0,
            overflowX:"hidden" }}>
            <Styles fontKey={fontKey} />
            <main style={{ padding:`20px ${PAD}px`, paddingBottom:40, maxWidth:900, margin:"0 auto" }}
                aria-label="HIGHSET Bedingungen Fontainebleau">

                {/* Header */}
                <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    marginBottom:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <BleauLogo size={38} />
                        <span style={{ fontSize:18, fontWeight:800, color:"#fff",
                            letterSpacing:"-0.03em", lineHeight:1 }}>HIGHSET</span>
                    </div>
                    <button onClick={()=>{ setHasR(false); setAllAreas([]); setFiltered([]); clearInterval(refreshTimer.current) }}
                        aria-label="Zurück zur Startseite"
                        style={{ padding:"6px 14px", borderRadius:20, border:"1px solid rgba(255,255,255,0.09)",
                            background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.35)",
                            fontSize:11, fontFamily:FONT, cursor:"pointer" }}>
                        ← Neu
                    </button>
                </header>

                {/* Weather Bar */}
                {weather && (
                    <section aria-label={`Aktuelles Wetter Fontainebleau: ${condLabel}, ${weather.temp}°C, ${weather.humidity}% Luftfeuchtigkeit`}
                        style={{ borderRadius:18, marginBottom:24, overflow:"hidden",
                        border:`1px solid ${condColor}28`,
                        background:`linear-gradient(135deg, ${condColor}0e 0%, rgba(255,255,255,0.02) 70%)` }}>
                        <div style={{ height:2, background:`linear-gradient(90deg, ${condColor}cc 0%, ${condColor}00 100%)` }} aria-hidden="true" />
                        <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:0 }}>

                            <div style={{ display:"flex", alignItems:"center", gap:10,
                                paddingRight:16, marginRight:16, flexShrink:0,
                                borderRight:"1px solid rgba(255,255,255,0.07)" }}>
                                <WeatherIcon type={wIconType} size={36} />
                                <div>
                                    <div style={{ fontSize:12, fontWeight:700, color:condColor,
                                        fontFamily:FONT, letterSpacing:"0.01em", lineHeight:1.2 }}>
                                        {condLabel}
                                    </div>
                                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)",
                                        fontFamily:FONT, textTransform:"uppercase",
                                        letterSpacing:"0.10em", marginTop:2 }}>
                                        Fontainebleau
                                    </div>
                                </div>
                            </div>

                            <div style={{ display:"flex", gap:7, flexWrap:"wrap", flex:1, alignItems:"center" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:5,
                                    background:"rgba(255,255,255,0.05)", borderRadius:9,
                                    padding:"5px 10px", border:"1px solid rgba(255,255,255,0.07)" }}>
                                    <span style={{ fontSize:11 }} aria-hidden="true">🌡</span>
                                    <span style={{ fontSize:12, fontWeight:600, fontFamily:FONT,
                                        color:"rgba(255,255,255,0.82)" }}>
                                        {weather.temp}°C
                                    </span>
                                </div>

                                <div style={{ display:"flex", alignItems:"center", gap:5,
                                    background:humBg, borderRadius:9, padding:"5px 10px",
                                    border:`1px solid ${humBorder}` }}>
                                    <span style={{ fontSize:11 }} aria-hidden="true">💧</span>
                                    <span style={{ fontSize:12, fontWeight:600, fontFamily:FONT, color:humColor }}>
                                        {weather.humidity}%
                                    </span>
                                </div>

                                <div style={{ display:"flex", alignItems:"center", gap:5,
                                    background:`${wBarWm.c}10`, borderRadius:9, padding:"5px 10px",
                                    border:`1px solid ${wBarWm.c}28` }}>
                                    <span style={{ fontSize:10, fontWeight:700, color:wBarWm.c, fontFamily:FONT }}>
                                        {weather.windDir}
                                    </span>
                                    <span style={{ fontSize:12, fontWeight:600, color:wBarWm.c, fontFamily:FONT }}>
                                        {weather.wind} km/h
                                    </span>
                                    <span style={{ fontSize:9, color:`${wBarWm.c}99`, fontFamily:FONT }}>
                                        · {wBarWm.q}
                                    </span>
                                </div>

                                {weather.rain6 > 0.2 && (
                                    <div style={{ display:"flex", alignItems:"center", gap:5,
                                        background:"rgba(100,210,255,0.08)", borderRadius:9, padding:"5px 10px",
                                        border:"1px solid rgba(100,210,255,0.22)" }}>
                                        <span style={{ fontSize:11 }} aria-hidden="true">🌧</span>
                                        <span style={{ fontSize:12, fontWeight:600, color:"#64D2FF", fontFamily:FONT }}>
                                            {weather.rain6}mm / 6h
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* Alert banner */}
                {alert && (
                    <div role="alert"
                        style={{ background:"rgba(255,200,60,0.07)", border:"1px solid rgba(255,200,60,0.18)",
                        borderRadius:14, padding:"11px 18px", marginBottom:22,
                        fontSize:12, color:"rgba(255,200,60,0.85)", lineHeight:1.5 }}>
                        ⚠ {alert}
                    </div>
                )}

                {/* ── TOP 3 BOULDERS ── */}
                {top5.length > 0 && (
                    <section aria-label="Heute empfohlene Boulder" style={{ marginBottom:36 }}>
                        <button onClick={() => setShowTop3(s => !s)}
                            aria-expanded={showTop3}
                            aria-label={`${showTop3 ? "Empfohlene Boulder ausblenden" : "Heute empfohlene Boulder anzeigen"}`}
                            style={{ width:"100%", display:"flex", alignItems:"center",
                                justifyContent:"space-between",
                                background: showTop3 ? "rgba(48,209,88,0.08)" : "rgba(255,255,255,0.04)",
                                border: showTop3 ? "1px solid rgba(48,209,88,0.22)" : "1px solid rgba(255,255,255,0.08)",
                                borderRadius:12, padding:"10px 16px", cursor:"pointer",
                                userSelect:"none", WebkitTapHighlightColor:"transparent",
                                marginBottom: showTop3 ? 12 : 0 }}>
                            <span style={{ fontSize:11, fontWeight:600,
                                color: showTop3 ? "#30D158" : "rgba(255,255,255,0.45)",
                                fontFamily:"-apple-system,sans-serif", letterSpacing:"0.04em" }}>
                                ✦ Heute empfohlen · {top5.length} Boulder
                            </span>
                            <span aria-hidden="true" style={{ fontSize:12,
                                color: showTop3 ? "#30D158" : "rgba(255,255,255,0.25)",
                                display:"inline-block",
                                transform: showTop3 ? "rotate(180deg)" : "rotate(0deg)",
                                transition:"transform 0.25s" }}>
                                ⌄
                            </span>
                        </button>
                        <div style={{ maxHeight: showTop3 ? "2000px" : "0", overflow:"hidden",
                            transition:"max-height 0.4s cubic-bezier(0.4,0,0.2,1)" }}
                            aria-hidden={!showTop3}>
                            <div style={{ display:"grid",
                                gridTemplateColumns: wide ? "repeat(3, 1fr)" : "1fr",
                                gap:10 }}>
                                {top5.map((p,i) => (
                                    <TopBoulderCard key={i} p={p} areaName={p.areaName} rank={i+1}
                                        userHeightMid={heightRange.mid} delay={i*60} accent={ACCENT} />
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {/* ── AREA FILTER BAR ── */}
                <nav aria-label="Gebiete filtern und sortieren"
                    style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
                    <div style={{ position:"relative", flex:1, minWidth:140 }}>
                        <label htmlFor="hs-result-search" style={{ position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0,0,0,0)" }}>
                            Gebiet filtern
                        </label>
                        <input id="hs-result-search" value={resultSearch} onChange={e=>setRS(e.target.value)}
                            placeholder="🔍  Gebiet filtern..."
                            aria-label="Gebiet filtern"
                            style={{ width:"100%", padding:"8px 14px", background:"rgba(255,255,255,0.04)",
                                border:"1px solid rgba(255,255,255,0.09)", borderRadius:10,
                                color:"#fff", fontSize:12, fontFamily:FONT, outline:"none",
                                boxSizing:"border-box", caretColor:ACCENT }} />
                    </div>
                    {[{k:"score",l:"Beste"},{k:"size",l:"Größe ↕"},{k:"dist",l:"Nähe"}].map(s => (
                        <button key={s.k} onClick={()=>setSortMode(s.k)}
                            aria-pressed={sortMode===s.k}
                            aria-label={`Sortieren nach ${s.k === "score" ? "besten Bedingungen" : s.k === "size" ? "Größenpassung" : "Nähe zum Standort"}`}
                            style={{ padding:"8px 14px", borderRadius:10, border:"none", cursor:"pointer",
                                fontSize:12, fontFamily:FONT, fontWeight:500,
                                background: sortMode===s.k ? hexToRgba(ACCENT,0.15) : "rgba(255,255,255,0.04)",
                                color: sortMode===s.k ? ACCENT : "rgba(255,255,255,0.35)",
                                border: sortMode===s.k ? `1px solid ${hexToRgba(ACCENT,0.25)}` : "1px solid rgba(255,255,255,0.07)" }}>
                            {s.l}
                        </button>
                    ))}
                    <button onClick={requestGeo}
                        aria-pressed={geoOn}
                        aria-label={geoOn ? "Standort deaktivieren" : "Standort aktivieren für Sortierung nach Nähe"}
                        style={{ padding:"8px 12px", borderRadius:10,
                            background: geoOn ? hexToRgba(ACCENT,0.12) : "rgba(255,255,255,0.04)",
                            border: geoOn ? `1px solid ${hexToRgba(ACCENT,0.25)}` : "1px solid rgba(255,255,255,0.07)",
                            color: geoOn ? ACCENT : "rgba(255,255,255,0.30)",
                            fontSize:12, fontFamily:FONT, cursor:"pointer" }}
                        title="Standort für Sortierung nach Nähe nutzen">
                        📍
                    </button>
                </nav>

                {/* ── AREA LIST ── */}
                <section aria-label={`${searchFiltered.length} Gebiete`}
                    style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {searchFiltered.map((area, i) => (
                        <AreaCard key={area.key||i} area={area}
                            minG={minG} maxG={maxG} activeStyles={activeStyles}
                            userHeightMid={heightRange.mid}
                            userHeightRange={heightRange.label}
                            sortMode={sortMode}
                            index={i} />
                    ))}
                    {searchFiltered.length === 0 && (
                        <div style={{ textAlign:"center", padding:"40px 20px",
                            color:"rgba(255,255,255,0.20)", fontSize:14, fontFamily:FONT }}
                            role="status">
                            Kein Gebiet gefunden.
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}

addPropertyControls(BleauConditionsChecker, {
    defaultMinGrade: { type:ControlType.Enum, title:"Min Grade", defaultValue:"6c", options:GRADES },
    defaultMaxGrade: { type:ControlType.Enum, title:"Max Grade", defaultValue:"8a+", options:GRADES },
    defaultHeight:   { type:ControlType.Enum, title:"Höhe (cm)", defaultValue:182,
        options:HEIGHT_RANGES.map(h=>h.mid), optionTitles:HEIGHT_RANGES.map(h=>h.label+" cm") },
    fontFamily:      { type:ControlType.Enum, title:"Schrift", defaultValue:"system",
        options:["system","inter","geist","space-grotesk","dm-sans","syne"],
        optionTitles:["SF Pro (System)","Inter","Geist","Space Grotesk","DM Sans","Syne"] },
    accentColor:     { type:ControlType.Color, title:"Accent Farbe",  defaultValue:"#C8956C" },
    ctaTextColor:    { type:ControlType.Color, title:"Button Text",   defaultValue:"#000000" },
    bgColor:         { type:ControlType.Color, title:"Hintergrund",   defaultValue:"#0d0d0d" },
    borderRadius:    { type:ControlType.Number, title:"Border Radius", defaultValue:0, min:0, max:40 },
    minHeight:       { type:ControlType.String, title:"Min Height", defaultValue:"600px" },
})
