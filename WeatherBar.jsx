// --- Framer Code Component: WeatherBar — v3 (HIGHSET design system) ---
import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef, useState } from "react"

const WORKER = "https://highset.faymonvillejulius.workers.dev"
const FONT   = "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Segoe UI',sans-serif"
const BG     = "#111111"

// ── Score color (matches frontend.jsx) ───────────────────────────────────────
function scoreColor(s) {
    if (s >= 75) return "#30D158"
    if (s >= 50) return "#34C759"
    if (s >= 35) return "#FFD60A"
    if (s >= 15) return "#FF9F0A"
    return "#FF453A"
}

// ── WMO helpers ───────────────────────────────────────────────────────────────
function wmoLabel(c = 0) {
    if (c === 0)   return "Sonnig"
    if (c <= 2)    return "Heiter"
    if (c <= 3)    return "Bewölkt"
    if (c <= 48)   return "Neblig"
    if (c <= 67)   return "Regen"
    if (c <= 82)   return "Schauer"
    return "Gewitter"
}
function wmoIcon(c = 0) {
    if (c === 0)   return "☀️"
    if (c <= 2)    return "⛅"
    if (c <= 3)    return "☁️"
    if (c <= 48)   return "🌫"
    if (c <= 67)   return "🌧"
    if (c <= 82)   return "🌦"
    return "⛈️"
}
function wmoType(c = 0) {
    if (c === 0)   return "sunny"
    if (c <= 2)    return "partly"
    if (c <= 3)    return "cloudy"
    if (c <= 67)   return "rain"
    return "storm"
}
function wmoCondColor(type) {
    if (type === "rain" || type === "storm") return "#64D2FF"
    if (type === "cloudy")                   return "#FF9F0A"
    return "#30D158"
}

// ── Canvas weather animations ─────────────────────────────────────────────────
const drawSunny = (ctx, w, h, t) => {
    const cx = w / 2, cy = h / 2
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70)
    g.addColorStop(0, "rgba(48,209,88,0.07)")
    g.addColorStop(1, "rgba(48,209,88,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "rgba(48,209,88,0.12)"
    ctx.lineWidth = 1.5
    ctx.lineCap = "round"
    for (let i = 0; i < 8; i++) {
        const angle = t * 0.2 + (i * Math.PI * 2) / 8
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22)
        ctx.lineTo(cx + Math.cos(angle) * 38, cy + Math.sin(angle) * 38)
        ctx.stroke()
    }
}
const drawRain = (ctx, w, h, t) => {
    ctx.strokeStyle = "rgba(100,210,255,0.15)"
    ctx.lineWidth = 1
    for (let i = 0; i < 20; i++) {
        const x = ((i * 67 + t * 30) % (w + 20)) - 10
        const y = ((i * 113 + t * 220) % (h + 20)) - 10
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - 2, y + 11)
        ctx.stroke()
    }
}
const drawCloudy = (ctx, w, h, t) => {
    const x = w / 2 + Math.sin(t * 0.35) * 12
    ctx.fillStyle = "rgba(255,255,255,0.04)"
    ctx.beginPath()
    ctx.arc(x, h / 2, 22, 0, Math.PI * 2)
    ctx.arc(x + 24, h / 2 + 2, 17, 0, Math.PI * 2)
    ctx.arc(x - 18, h / 2 + 4, 13, 0, Math.PI * 2)
    ctx.fill()
}

// ── Bleau Logo (matches frontend.jsx) ────────────────────────────────────────
function BleauLogo({ size = 44, spinning = false }) {
    const cx = size * 0.5, cy = size * 0.68, r = size * 0.3
    const rays = [
        {a:195,l:0.52,w:1.6},{a:210,l:0.62,w:1.8},{a:225,l:0.74,w:2.0},
        {a:240,l:0.84,w:2.1},{a:255,l:0.9, w:2.2},{a:270,l:1.0, w:2.3},
        {a:285,l:0.9, w:2.2},{a:300,l:0.84,w:2.1},{a:315,l:0.74,w:2.0},
        {a:330,l:0.62,w:1.8},{a:345,l:0.52,w:1.6},
    ]
    const rG = r + size * 0.05, rM = r + size * 0.2
    return (
        <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size * 0.82}`}
            style={{ overflow:"visible", display:"block", flexShrink:0 }}>
            <g style={spinning ? { animation:"ws-spin 5s linear infinite", transformOrigin:`${cx}px ${cy}px` } : {}}>
                {rays.map((rd, i) => {
                    const rad = rd.a * Math.PI / 180
                    return <line key={i}
                        x1={cx + rG * Math.cos(rad)} y1={cy + rG * Math.sin(rad)}
                        x2={cx + (rG + (rM - rG) * rd.l) * Math.cos(rad)}
                        y2={cy + (rG + (rM - rG) * rd.l) * Math.sin(rad)}
                        stroke="white" strokeWidth={rd.w} strokeLinecap="round"
                        opacity={rd.a === 270 ? 1 : 0.72} />
                })}
            </g>
            <path d={`M ${cx-r},${cy} A ${r},${r} 0 0,1 ${cx+r},${cy} Z`} fill="white" />
            <path d={`M ${cx-r},${cy} L ${cx-r*0.62},${cy-r*0.18} L ${cx-r*0.05},${cy-r*0.68}
                L ${cx+r*0.22},${cy-r*0.32} L ${cx+r*0.52},${cy-r*0.48} L ${cx+r},${cy} Z`}
                fill={BG} />
        </svg>
    )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WeatherBar({ checkerUrl = "/bleau-bot" }) {
    const containerRef = useRef(null)
    const [width, setWidth] = useState(800)
    const wide = width >= 600

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const obs = new ResizeObserver(e => setWidth(e[0].contentRect.width))
        obs.observe(el); setWidth(el.offsetWidth)
        return () => obs.disconnect()
    }, [])

    const [data, setData] = useState(null)
    const [top3, setTop3]   = useState([])
    const [error, setError] = useState(null)
    const canvasRef = useRef(null)
    const frameRef  = useRef(0)

    useEffect(() => {
        fetch(WORKER + "/widget")
            .then(r => r.json())
            .then(d => {
                setData(d)
                setTop3((d.top3 || []).map(a => ({
                    name:      a.name,
                    dryScore:  Math.min(100, a.dryScore  || 0),
                    condScore: Math.min(100, a.condScore || 0),
                    url:       a.bleauUrl || `https://bleau.info/?q=${encodeURIComponent(a.name)}`,
                })))
            })
            .catch(() => setError("Laden fehlgeschlagen"))
    }, [])

    // Canvas animation
    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs || !data) return
        const ctx = cvs.getContext("2d")
        if (!ctx) return
        const type = wmoType(data.current?.code)
        const animate = () => {
            if (cvs.width !== cvs.offsetWidth || cvs.height !== cvs.offsetHeight) {
                cvs.width = cvs.offsetWidth; cvs.height = cvs.offsetHeight
            }
            const t = performance.now() / 1000
            ctx.clearRect(0, 0, cvs.width, cvs.height)
            if (type === "sunny")      drawSunny(ctx, cvs.width, cvs.height, t)
            else if (type === "rain" || type === "storm") drawRain(ctx, cvs.width, cvs.height, t)
            else                       drawCloudy(ctx, cvs.width, cvs.height, t)
            frameRef.current = requestAnimationFrame(animate)
        }
        frameRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frameRef.current)
    }, [data])

    // ── Loading ───────────────────────────────────────────────────────────────
    if (!data) return (
        <div ref={containerRef} style={{ width:"100%", background:BG,
            border:"1px solid rgba(255,255,255,0.07)", borderRadius:16,
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:14, padding:"24px 20px", boxSizing:"border-box", fontFamily:FONT }}>
            <style>{`@keyframes ws-spin{to{transform:rotate(360deg)}}`}</style>
            <BleauLogo size={32} spinning={true} />
            <div>
                <div style={{ fontSize:12, fontWeight:600, color:"#fff" }}>
                    {error || "Wetterdaten laden…"}
                </div>
                <div style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase",
                    color:"rgba(255,255,255,0.25)", marginTop:3 }}>
                    Open-Meteo · bleau.info
                </div>
            </div>
        </div>
    )

    const c      = data.current || {}
    const type   = wmoType(c.code)
    const cc     = wmoCondColor(type)
    const icon   = wmoIcon(c.code)
    const label  = wmoLabel(c.code)
    const humColor = c.humidity > 85 ? "#64D2FF" : c.humidity > 70 ? "#FFD60A" : "rgba(255,255,255,0.65)"

    // ── Desktop (≥600px) ──────────────────────────────────────────────────────
    if (wide) return (
        <div ref={containerRef} style={{ position:"relative", width:"100%", overflow:"hidden",
            background:BG, borderRadius:16, boxSizing:"border-box", fontFamily:FONT,
            border:`1px solid ${cc}22` }}>
            <style>{`@keyframes ws-spin{to{transform:rotate(360deg)}}`}</style>

            {/* Accent line */}
            <div style={{ height:2, background:`linear-gradient(90deg, ${cc}bb 0%, ${cc}00 100%)` }} />

            {/* Canvas bg */}
            <canvas ref={canvasRef} style={{ position:"absolute", inset:0,
                width:"100%", height:"100%", pointerEvents:"none", opacity:0.5 }} />

            <div style={{ position:"relative", zIndex:2,
                display:"flex", alignItems:"stretch" }}>

                {/* Brand */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", padding:"18px 20px", gap:7,
                    flexShrink:0, minWidth:96,
                    borderRight:"1px solid rgba(255,255,255,0.06)" }}>
                    <BleauLogo size={40} spinning={type === "sunny"} />
                    <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, fontWeight:800, color:"#fff",
                            letterSpacing:"-0.02em" }}>HIGHSET</div>
                        <div style={{ fontSize:7, letterSpacing:"0.14em", textTransform:"uppercase",
                            color:"rgba(255,255,255,0.22)", marginTop:2 }}>Live</div>
                    </div>
                </div>

                {/* Current weather */}
                <div style={{ flex:"1 1 0", display:"flex", flexDirection:"column",
                    justifyContent:"center", padding:"18px 20px", gap:10,
                    borderRight:"1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize:8, letterSpacing:"0.16em", textTransform:"uppercase",
                        color:"rgba(255,255,255,0.25)" }}>Aktuell · Fontainebleau</div>

                    {/* Temp + condition */}
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:30, lineHeight:1 }}>{icon}</span>
                        <div>
                            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                                <span style={{ fontSize:26, fontWeight:800, color:"#fff",
                                    letterSpacing:"-0.04em", lineHeight:1 }}>
                                    {Math.round(c.temp || 0)}°
                                </span>
                                <span style={{ fontSize:13, fontWeight:600, color:cc,
                                    letterSpacing:"0.01em" }}>{label}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat chips */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4,
                            background:"rgba(255,255,255,0.05)", borderRadius:8,
                            padding:"4px 9px", border:"1px solid rgba(255,255,255,0.07)" }}>
                            <span style={{ fontSize:10 }}>💧</span>
                            <span style={{ fontSize:11, fontWeight:600, fontFamily:FONT, color:humColor }}>
                                {c.humidity}%
                            </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:4,
                            background:"rgba(255,255,255,0.05)", borderRadius:8,
                            padding:"4px 9px", border:"1px solid rgba(255,255,255,0.07)" }}>
                            <span style={{ fontSize:10 }}>💨</span>
                            <span style={{ fontSize:11, fontWeight:600, fontFamily:FONT,
                                color:"rgba(255,255,255,0.70)" }}>
                                {c.windDir} {c.wind} km/h
                            </span>
                        </div>
                        {c.rain6 > 0.2 && (
                            <div style={{ display:"flex", alignItems:"center", gap:4,
                                background:"rgba(100,210,255,0.08)", borderRadius:8,
                                padding:"4px 9px", border:"1px solid rgba(100,210,255,0.20)" }}>
                                <span style={{ fontSize:10 }}>🌧</span>
                                <span style={{ fontSize:11, fontWeight:600, color:"#64D2FF", fontFamily:FONT }}>
                                    {c.rain6}mm/6h
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Top 3 sectors */}
                <div style={{ width: Math.min(300, width * 0.30), display:"flex",
                    flexDirection:"column", justifyContent:"center",
                    padding:"18px 18px", gap:8,
                    borderRight:"1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize:8, letterSpacing:"0.16em", textTransform:"uppercase",
                        color:"rgba(255,255,255,0.25)", marginBottom:2 }}>Top Gebiete</div>
                    {top3.map((s, i) => {
                        const sc = scoreColor(Math.round((s.dryScore + s.condScore) / 2))
                        const isFirst = i === 0
                        return (
                            <a key={i} href={s.url} target="_blank" rel="noopener"
                                style={{ display:"flex", alignItems:"center", gap:9,
                                    textDecoration:"none", padding:"7px 10px",
                                    borderRadius:10, transition:"background 0.15s",
                                    background: isFirst ? `${sc}10` : "rgba(255,255,255,0.03)",
                                    border: isFirst ? `1px solid ${sc}28` : "1px solid rgba(255,255,255,0.06)" }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                onMouseLeave={e => e.currentTarget.style.background = isFirst ? `${sc}10` : "rgba(255,255,255,0.03)"}>
                                {/* Rank */}
                                <div style={{ width:18, height:18, borderRadius:"50%", flexShrink:0,
                                    background: isFirst ? sc : "rgba(255,255,255,0.08)",
                                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                                    <span style={{ fontSize:9, fontWeight:800,
                                        color: isFirst ? "#000" : "rgba(255,255,255,0.4)" }}>
                                        {i + 1}
                                    </span>
                                </div>
                                {/* Name */}
                                <span style={{ flex:1, fontSize:11, fontWeight:500,
                                    color:"rgba(255,255,255,0.75)", fontFamily:FONT,
                                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                    {s.name}
                                </span>
                                {/* Score */}
                                <span style={{ fontSize:13, fontWeight:700, color:sc,
                                    fontFamily:FONT, letterSpacing:"-0.02em", flexShrink:0 }}>
                                    {Math.round((s.dryScore + s.condScore) / 2)}
                                </span>
                            </a>
                        )
                    })}
                </div>

                {/* CTA */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", padding:"18px 20px", gap:8, flexShrink:0 }}>
                    <a href={checkerUrl} style={{ display:"block", padding:"11px 18px",
                        background:"linear-gradient(135deg,#30D158,#34C759)",
                        color:"#000", fontSize:12, fontWeight:700, fontFamily:FONT,
                        borderRadius:24, textDecoration:"none", whiteSpace:"nowrap",
                        letterSpacing:"-0.01em",
                        boxShadow:"0 6px 20px rgba(48,209,88,0.30)",
                        transition:"opacity 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                        onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                        Checker →
                    </a>
                    <div style={{ fontSize:8, color:"rgba(255,255,255,0.20)",
                        letterSpacing:"0.10em", textTransform:"uppercase", textAlign:"center" }}>
                        alle Gebiete
                    </div>
                </div>
            </div>
        </div>
    )

    // ── Mobile (<600px) ───────────────────────────────────────────────────────
    return (
        <div ref={containerRef} style={{ position:"relative", width:"100%", overflow:"hidden",
            background:BG, borderRadius:16, boxSizing:"border-box", fontFamily:FONT,
            border:`1px solid ${cc}22` }}>
            <style>{`@keyframes ws-spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ height:2, background:`linear-gradient(90deg, ${cc}bb 0%, ${cc}00 100%)` }} />
            <canvas ref={canvasRef} style={{ position:"absolute", inset:0,
                width:"100%", height:"100%", pointerEvents:"none", opacity:0.45 }} />
            <div style={{ position:"relative", zIndex:2 }}>

                {/* Row 1: weather + CTA */}
                <div style={{ display:"flex", alignItems:"center",
                    gap:12, padding:"16px 16px 12px" }}>
                    <span style={{ fontSize:28 }}>{icon}</span>
                    <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                            <span style={{ fontSize:22, fontWeight:800, color:"#fff",
                                letterSpacing:"-0.04em", lineHeight:1 }}>
                                {Math.round(c.temp || 0)}°
                            </span>
                            <span style={{ fontSize:12, fontWeight:600, color:cc }}>
                                {label}
                            </span>
                        </div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.38)",
                            marginTop:3, fontFamily:FONT }}>
                            💧{c.humidity}% · {c.windDir} {c.wind}km/h
                            {c.rain6 > 0.2 ? ` · 🌧${c.rain6}mm` : ""}
                        </div>
                    </div>
                    <a href={checkerUrl} style={{ padding:"9px 14px",
                        background:"linear-gradient(135deg,#30D158,#34C759)",
                        color:"#000", fontSize:11, fontWeight:700, fontFamily:FONT,
                        borderRadius:20, textDecoration:"none", flexShrink:0,
                        boxShadow:"0 4px 14px rgba(48,209,88,0.28)" }}>
                        Checker →
                    </a>
                </div>

                {/* Divider */}
                <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"0 16px" }} />

                {/* Row 2: top 3 */}
                <div style={{ display:"flex", gap:6, padding:"12px 16px 16px" }}>
                    {top3.map((s, i) => {
                        const sc = scoreColor(Math.round((s.dryScore + s.condScore) / 2))
                        return (
                            <a key={i} href={s.url} target="_blank" rel="noopener"
                                style={{ flex:1, display:"flex", flexDirection:"column",
                                    alignItems:"center", gap:4, textDecoration:"none",
                                    padding:"9px 4px",
                                    background: i === 0 ? `${sc}0e` : "rgba(255,255,255,0.03)",
                                    border: i === 0 ? `1px solid ${sc}28` : "1px solid rgba(255,255,255,0.07)",
                                    borderRadius:12 }}>
                                <div style={{ width:16, height:16, borderRadius:"50%",
                                    background: i === 0 ? sc : "rgba(255,255,255,0.08)",
                                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                                    <span style={{ fontSize:9, fontWeight:800,
                                        color: i === 0 ? "#000" : "rgba(255,255,255,0.4)" }}>
                                        {i + 1}
                                    </span>
                                </div>
                                <span style={{ fontSize:16, fontWeight:800, color:sc,
                                    fontFamily:FONT, letterSpacing:"-0.03em", lineHeight:1 }}>
                                    {Math.round((s.dryScore + s.condScore) / 2)}
                                </span>
                                <span style={{ fontSize:8, color:"rgba(255,255,255,0.38)",
                                    textAlign:"center", overflow:"hidden",
                                    textOverflow:"ellipsis", whiteSpace:"nowrap",
                                    width:"100%", letterSpacing:"0.01em", fontFamily:FONT }}>
                                    {s.name.length > 12 ? s.name.slice(0,11)+"…" : s.name}
                                </span>
                            </a>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

addPropertyControls(WeatherBar, {
    checkerUrl: { type: ControlType.String, title: "Checker URL", defaultValue: "/bleau-bot" },
})
