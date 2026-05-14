// AreaNavBar.tsx — HIGHSET Navigation v18
// Fix: Border-Farbe hardcoded (wie Glow) — nicht mehr prop-abhängig
// Props searchIdleBorder/searchActiveBorder bleiben für Kompatibilität, werden aber nicht mehr für Pill/Mobile genutzt
import { addPropertyControls, ControlType } from "framer"
import React, { useState, useEffect, useRef } from "react"

const WORKER    = "https://highset.faymonvillejulius.workers.dev"
const LOGO      = "https://framerusercontent.com/images/Duyqdc8xaGGuRroaE5uDuPq5XVE.png"
const FONT      = `-apple-system, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", sans-serif`
const AREA_BASE = "/gebiete"
const ACCENT    = "#C8956C"
const DROPDOWN_BG = "#0c0c0c"
const MOBILE_BP   = 900

// Hardcoded Amber-Werte — unabhängig von Props
const PILL_BORDER_IDLE   = "rgba(200,149,108,0.28)"
const PILL_BORDER_ACTIVE = "rgba(200,149,108,0.68)"
const PILL_GLOW_IDLE     = "0 0 16px rgba(200,149,108,0.10), inset 0 1px 0 rgba(255,255,255,0.04)"
const PILL_GLOW_ACTIVE   = "0 0 24px rgba(200,149,108,0.22), 0 0 50px rgba(200,149,108,0.08), inset 0 1px 0 rgba(255,255,255,0.07)"
const PILL_BG_IDLE       = "rgba(20,16,12,0.92)"
const PILL_BG_ACTIVE     = "rgba(28,22,16,0.96)"

interface LinkItem  { label: string; href: string }
interface Area      { name: string; slug: string; type?: string; parent?: string; dryScore: number; condScore: number; rankScore: number }
interface LinkStyle { color: string; hoverColor: string; fontSize: number; fontWeight: number }

function areaUrl(a: Area): string {
    return `${AREA_BASE}?area=${a.slug || a.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`
}
function scoreColor(s: number) {
    if (s >= 75) return "#5AAD78"; if (s >= 50) return "#78BB82"
    if (s >= 35) return "#C8A020"; if (s >= 15) return "#C87030"
    return "#B84040"
}

function Chev({ open, color = "currentColor", size = 10 }: { open: boolean; color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition:"transform .2s", transform: open ? "rotate(180deg)" : "none", display:"block", flexShrink:0 }}>
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    )
}

function FixedPanel({ children, anchorRef, wide = false }: {
    children: React.ReactNode
    anchorRef: React.RefObject<HTMLDivElement>
    wide?: boolean
}) {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
    useEffect(() => {
        const el = anchorRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        setPos({ top: r.bottom + 10, left: r.left })
    }, [])
    if (!pos) return null
    return (
        <div style={{
            position:"fixed", top: pos.top, left: pos.left,
            background: DROPDOWN_BG,
            border:"1px solid rgba(255,255,255,0.10)",
            borderRadius:16, overflow:"hidden",
            boxShadow:"0 24px 60px rgba(0,0,0,0.95), 0 4px 20px rgba(0,0,0,0.8)",
            zIndex:2000, minWidth: wide ? 320 : 210,
        } as React.CSSProperties}>
            {children}
        </div>
    )
}

function PanelRow({ href, label, last = false, ls }: { href: string; label: string; last?: boolean; ls: LinkStyle }) {
    const [h, setH] = useState(false)
    return (
        <a href={href} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"11px 18px",
                borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.055)",
                textDecoration:"none",
                background: h ? "rgba(255,255,255,0.06)" : "transparent",
                color: h ? ls.hoverColor : ls.color,
                fontSize: ls.fontSize, fontFamily:FONT, fontWeight: ls.fontWeight,
                letterSpacing:"-0.01em", transition:"background .12s, color .12s",
            }}>
            {label}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ opacity:.25 }}><polyline points="9 18 15 12 9 6"/></svg>
        </a>
    )
}

function NavDrop({ label, open, onClick, children, ls }: {
    label: string; open: boolean; onClick: () => void; children?: React.ReactNode; ls: LinkStyle
}) {
    const [h, setH] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    return (
        <div ref={ref} style={{ position:"relative" }}>
            <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
                style={{
                    display:"flex", alignItems:"center", gap:5, background:"none", border:"none",
                    cursor:"pointer", padding:"6px 2px", fontFamily:FONT,
                    fontSize: ls.fontSize, fontWeight: ls.fontWeight,
                    letterSpacing:"-0.01em", whiteSpace:"nowrap",
                    color: open || h ? ls.hoverColor : ls.color, transition:"color .15s",
                }}>
                {label} <Chev open={open} />
            </button>
            {open && children}
        </div>
    )
}

function NavLink({ href, label, ls }: { href: string; label: string; ls: LinkStyle }) {
    const [h, setH] = useState(false)
    return (
        <a href={href} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{
                fontFamily:FONT, fontSize: ls.fontSize, fontWeight: ls.fontWeight,
                letterSpacing:"-0.01em", textDecoration:"none", whiteSpace:"nowrap",
                color: h ? ls.hoverColor : ls.color, transition:"color .15s",
            }}>
            {label}
        </a>
    )
}

function AreaRow({ a, last = false }: { a: Area; last?: boolean }) {
    const [active, setActive] = useState(false)
    const c = scoreColor(a.dryScore)
    return (
        <a href={areaUrl(a)}
            onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)}
            style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"10px 16px",
                borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.045)",
                textDecoration:"none",
                background: active ? "rgba(200,149,108,0.07)" : "transparent",
                transition:"background .12s",
                boxSizing:"border-box", width:"100%",
            }}>
            <div style={{
                width:38, height:38, borderRadius:10, flexShrink:0,
                background: `${c}16`, border: `1px solid ${c}38`,
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow: active ? `0 0 10px ${c}25` : "none",
                transition:"box-shadow .12s",
            }}>
                <span style={{ fontSize:13, fontWeight:800, color:c, fontFamily:FONT, lineHeight:1 }}>
                    {a.dryScore}
                </span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
                <span style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.88)",
                    fontSize:13, fontFamily:FONT, fontWeight:500,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block",
                    letterSpacing:"-0.01em", transition:"color .12s",
                }}>
                    {a.name}
                </span>
                {a.parent && (
                    <span style={{
                        fontSize:10, color:"rgba(255,255,255,0.28)",
                        fontFamily:FONT, display:"block", marginTop:2,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    }}>
                        {a.parent}
                    </span>
                )}
            </div>
            <div style={{ width:36, flexShrink:0 }}>
                <div style={{ height:3, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ width:`${a.dryScore}%`, height:"100%", background:c, borderRadius:2, boxShadow:`0 0 4px ${c}70` }} />
                </div>
            </div>
        </a>
    )
}

export function GlassCTA({ href, label, fullWidth = false }: { href: string; label: string; fullWidth?: boolean }) {
    const [h, setH] = useState(false)
    return (
        <a href={href} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{
                display: fullWidth ? "block" : "inline-block", textAlign: fullWidth ? "center" : "left",
                textDecoration:"none", padding:"10px 20px", borderRadius:22,
                whiteSpace:"nowrap", fontFamily:FONT, fontSize:13, fontWeight:700,
                letterSpacing:"-0.01em", transition:"all .2s ease",
                background: h ? "rgba(200,149,108,0.92)" : "rgba(200,149,108,0.14)",
                backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
                border: h ? "1.5px solid rgba(200,149,108,0.90)" : "1.5px solid rgba(200,149,108,0.55)",
                color: h ? "#fff" : ACCENT,
                boxShadow: h
                    ? "0 0 28px rgba(200,149,108,0.40), inset 0 1px 0 rgba(255,255,255,0.20)"
                    : "0 0 14px rgba(200,149,108,0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
            } as React.CSSProperties}>{label}</a>
    )
}

function BleauDropdown({ links, areas, loading, ls, anchorRef }: {
    links: LinkItem[]; areas: Area[]; loading: boolean; ls: LinkStyle
    anchorRef: React.RefObject<HTMLDivElement>
}) {
    const [q, setQ]     = useState("")
    const inputRef      = useRef<HTMLInputElement>(null)
    const filtered      = areas.filter(a => a.name.toLowerCase().includes(q.toLowerCase()))
    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60) }, [])
    return (
        <FixedPanel anchorRef={anchorRef} wide>
            {links.map((l, i) => <PanelRow key={i} href={l.href} label={l.label} ls={ls} />)}
            <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"2px 0" }} />
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px",
                borderBottom:"1px solid rgba(255,255,255,0.06)", background:"rgba(255,255,255,0.02)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke={`${ACCENT}99`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                    placeholder={loading ? "Lädt…" : "Gebiet suchen…"}
                    style={{ flex:1, background:"none", border:"none", outline:"none",
                        color:"#fff", fontSize:13, fontFamily:FONT, letterSpacing:"-0.01em" }} />
                {q.length > 0 && (
                    <button onClick={() => setQ("")} style={{
                        background:"rgba(255,255,255,0.08)", border:"none", borderRadius:"50%",
                        width:18, height:18, cursor:"pointer", color:"rgba(255,255,255,0.5)",
                        fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                    }}>×</button>
                )}
            </div>
            {(filtered.length > 0 || q) && (
                <div style={{ padding:"7px 16px 5px", fontSize:9, fontWeight:700, letterSpacing:"0.12em",
                    color:"rgba(255,255,255,0.25)", textTransform:"uppercase", fontFamily:FONT }}>
                    {q ? `${filtered.length} Treffer` : `${filtered.length} Gebiete`}
                </div>
            )}
            <div style={{ maxHeight:260, overflowY:"auto" }}>
                {filtered.length === 0
                    ? <div style={{ padding:"14px 16px", color:"rgba(255,255,255,0.25)", fontSize:13, fontFamily:FONT, textAlign:"center" }}>
                        {loading ? "Lädt…" : "Kein Gebiet gefunden"}
                      </div>
                    : filtered.map((a, i) => <AreaRow key={a.name} a={a} last={i === filtered.length - 1} />)
                }
            </div>
        </FixedPanel>
    )
}

function ServicesDropdown({ links, ls, anchorRef }: {
    links: LinkItem[]; ls: LinkStyle; anchorRef: React.RefObject<HTMLDivElement>
}) {
    return (
        <FixedPanel anchorRef={anchorRef}>
            {links.map((l, i) => (
                <PanelRow key={i} href={l.href} label={l.label} ls={ls} last={i === links.length - 1} />
            ))}
        </FixedPanel>
    )
}

// ── Desktop Suchleiste ────────────────────────────────────────────────────────
// Border + Glow + BG alle hardcoded — Props können Instanz-Altlasten haben
function CenterSearch({ areas, loading }: { areas: Area[]; loading: boolean }) {
    const [open,    setOpen]  = useState(false)
    const [q,       setQ]     = useState("")
    const [focused, setFoc]   = useState(false)
    const ref      = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const filtered = areas.filter(a => a.name.toLowerCase().includes(q.toLowerCase()))
    const active   = open || focused

    const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
    useEffect(() => {
        if (open && ref.current) {
            const r = ref.current.getBoundingClientRect()
            setDropPos({ top: r.bottom + 8, left: r.left + r.width / 2, width: 320 })
        }
    }, [open])

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false); setQ(""); setFoc(false)
            }
        }
        document.addEventListener("mousedown", h)
        return () => document.removeEventListener("mousedown", h)
    }, [])

    return (
        <div ref={ref} style={{ position:"relative", justifySelf:"center" }}>

            {/* Such-Pill — alle Farben hardcoded, kein backdrop-filter */}
            <div onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 40) }}
                style={{
                    display:"flex", alignItems:"center", gap:9,
                    height:36, padding:"0 14px 0 12px", borderRadius:22,
                    cursor:"text", boxSizing:"border-box",
                    background: active ? PILL_BG_ACTIVE : PILL_BG_IDLE,
                    border: active ? `1.5px solid ${PILL_BORDER_ACTIVE}` : `1.5px solid ${PILL_BORDER_IDLE}`,
                    boxShadow: active ? PILL_GLOW_ACTIVE : PILL_GLOW_IDLE,
                    transition:"border-color .2s ease, box-shadow .2s ease, background .2s ease",
                    isolation:"isolate",
                } as React.CSSProperties}>

                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke={active ? ACCENT : `${ACCENT}70`}
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink:0, transition:"stroke .2s" }}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>

                <input ref={inputRef} value={q}
                    onChange={e => { setQ(e.target.value); setOpen(true) }}
                    onFocus={() => { setFoc(true); setOpen(true) }}
                    onBlur={() => setFoc(false)}
                    placeholder={loading ? "Lädt…" : "Gebiet suchen…"}
                    style={{
                        width:150, background:"none", border:"none", outline:"none",
                        color:"#fff", fontSize:13, fontFamily:FONT, letterSpacing:"-0.01em",
                    }} />

                {q.length > 0
                    ? <button onClick={e => { e.stopPropagation(); setQ("") }} style={{
                        background:"rgba(255,255,255,0.10)", border:"none", borderRadius:"50%",
                        width:18, height:18, cursor:"pointer", color:"rgba(255,255,255,0.55)",
                        fontSize:12, display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, lineHeight:1,
                      }}>×</button>
                    : <Chev open={open} color={active ? ACCENT : `${ACCENT}70`} />
                }
            </div>

            {/* Dropdown */}
            {open && dropPos && (
                <div style={{
                    position:"fixed",
                    top: dropPos.top, left: dropPos.left,
                    transform:"translateX(-50%)",
                    background: DROPDOWN_BG,
                    border:`1px solid rgba(200,149,108,0.22)`,
                    borderRadius:16, overflow:"hidden",
                    boxShadow:`0 24px 60px rgba(0,0,0,0.95), 0 0 0 1px rgba(200,149,108,0.06), 0 4px 20px rgba(0,0,0,0.8)`,
                    zIndex:2000, width: dropPos.width,
                } as React.CSSProperties}>

                    <div style={{
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"10px 16px 8px",
                        borderBottom:"1px solid rgba(255,255,255,0.06)",
                    }}>
                        <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.14em",
                            color:"rgba(255,255,255,0.30)", textTransform:"uppercase", fontFamily:FONT }}>
                            {q ? `${filtered.length} Treffer` : `${areas.length} Gebiete`}
                        </span>
                        {q.length === 0 && (
                            <span style={{ fontSize:9, color:`${ACCENT}99`, fontFamily:FONT, fontWeight:600, letterSpacing:"0.06em" }}>
                                Fontainebleau
                            </span>
                        )}
                    </div>

                    <div style={{ maxHeight:340, overflowY:"auto" }}>
                        {filtered.length === 0
                            ? <div style={{ padding:"20px 16px", color:"rgba(255,255,255,0.25)", fontSize:13, fontFamily:FONT, textAlign:"center" }}>
                                {loading ? "Lädt Gebiete…" : "Kein Gebiet gefunden"}
                              </div>
                            : filtered.map((a, i) => (
                                <AreaRow key={a.name + i} a={a} last={i === filtered.length - 1} />
                            ))
                        }
                    </div>

                    {filtered.length > 6 && (
                        <a href={AREA_BASE} style={{
                            display:"block", padding:"10px 16px", textAlign:"center",
                            textDecoration:"none", color:ACCENT,
                            fontSize:12, fontFamily:FONT, fontWeight:600,
                            borderTop:"1px solid rgba(255,255,255,0.06)",
                            background:"rgba(200,149,108,0.04)",
                            transition:"background .12s", letterSpacing:"-0.01em",
                        }}>
                            Alle {areas.length} Gebiete →
                        </a>
                    )}
                </div>
            )}
        </div>
    )
}

function Ham({ open, onClick }: { open: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            background:"none", border:"none", cursor:"pointer",
            width:40, height:40, display:"flex", flexDirection:"column", gap:5,
            alignItems:"center", justifyContent:"center", flexShrink:0, padding:0,
        }}>
            <span style={{ display:"block", width:22, height:2.5, background:"#fff", borderRadius:2,
                transition:"transform .25s", transform: open ? "translateY(7.5px) rotate(45deg)" : "none" }} />
            <span style={{ display:"block", width:22, height:2.5, background:"#fff", borderRadius:2,
                transition:"opacity .2s", opacity: open ? 0 : 1 }} />
            <span style={{ display:"block", width:22, height:2.5, background:"#fff", borderRadius:2,
                transition:"transform .25s", transform: open ? "translateY(-7.5px) rotate(-45deg)" : "none" }} />
        </button>
    )
}

function MobileLink({ href, label, ls }: { href: string; label: string; ls: LinkStyle }) {
    const [pressed, setPressed] = useState(false)
    return (
        <a href={href}
            onTouchStart={() => setPressed(true)}
            onTouchEnd={() => setTimeout(() => setPressed(false), 120)}
            onTouchCancel={() => setPressed(false)}
            style={{
                display:"flex", alignItems:"center", height:52, padding:"0 4px",
                borderBottom:"1px solid rgba(255,255,255,0.06)", textDecoration:"none",
                background: pressed ? "rgba(255,255,255,0.04)" : "transparent",
                color: ls.color, fontSize: Math.max(ls.fontSize + 4, 19),
                fontFamily:FONT, fontWeight: ls.fontWeight, letterSpacing:"-0.02em",
                boxSizing:"border-box", width:"100%",
            }}>{label}</a>
    )
}

function MobileOverlay({ open, bleauLinks, serviceLinks, extraLinks, areas, loading, ls }: {
    open: boolean; bleauLinks: LinkItem[]; serviceLinks: LinkItem[]; extraLinks: LinkItem[]
    areas: Area[]; loading: boolean; ls: LinkStyle
}) {
    const [q, setQ]           = useState("")
    const [focused, setFoc]   = useState(false)
    const [listOpen, setList] = useState(false)
    const inputRef            = useRef<HTMLInputElement>(null)
    const filtered            = areas.filter(a => a.name.toLowerCase().includes(q.toLowerCase()))
    if (!open) return null

    const handleInput = (val: string) => { setQ(val); if (val.length > 0 && !listOpen) setList(true) }

    const navSections = [
        { title:"Bleau",    links: bleauLinks },
        { title:"Services", links: serviceLinks },
        { title:"",         links: extraLinks },
    ]

    return (
        <div style={{
            position:"fixed", top:60, left:0, right:0, bottom:0,
            background:"rgba(10,10,10,0.99)", overflowY:"auto", overflowX:"hidden",
            zIndex:999, boxSizing:"border-box", padding:"18px 16px 60px",
        }}>
            {/* Such-Block — alle Farben hardcoded */}
            <div style={{
                background: focused ? PILL_BG_ACTIVE : PILL_BG_IDLE,
                border: `1.5px solid ${focused ? PILL_BORDER_ACTIVE : PILL_BORDER_IDLE}`,
                borderRadius:16, padding:"12px 14px", marginBottom:10,
                boxShadow: focused ? PILL_GLOW_ACTIVE : PILL_GLOW_IDLE,
                transition:"border-color .22s, box-shadow .22s, background .22s",
                cursor:"text", boxSizing:"border-box", width:"100%", isolation:"isolate",
            } as React.CSSProperties} onClick={() => inputRef.current?.focus()}>
                <div style={{
                    fontSize:9, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase",
                    fontFamily:FONT, marginBottom:8, transition:"color .2s",
                    color: focused ? ACCENT : `${ACCENT}70`,
                }}>Gebiet suchen</div>
                <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke={focused ? ACCENT : `${ACCENT}66`}
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input ref={inputRef} value={q} onChange={e => handleInput(e.target.value)}
                        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
                        placeholder={loading ? "Lädt Gebiete…" : "z.B. Apremont, Bas Cuvier…"}
                        style={{ flex:1, background:"none", border:"none", outline:"none",
                            color:"#fff", fontSize:16, fontFamily:FONT, fontWeight:500, letterSpacing:"-0.01em" }} />
                    {q.length > 0 && (
                        <button onClick={() => setQ("")} style={{
                            background:"rgba(255,255,255,0.09)", border:"none", borderRadius:"50%",
                            width:22, height:22, cursor:"pointer", color:"rgba(255,255,255,0.6)", fontSize:14,
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                        }}>×</button>
                    )}
                </div>
            </div>

            <button onTouchEnd={() => setList(o => !o)} onClick={() => setList(o => !o)}
                style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    width:"100%", background:"none", border:"none", cursor:"pointer",
                    padding:"10px 2px", boxSizing:"border-box",
                    borderBottom:"1px solid rgba(255,255,255,0.06)",
                }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.10em",
                        color:"rgba(255,255,255,0.30)", fontFamily:FONT, textTransform:"uppercase" }}>Gebiete</span>
                    <span style={{ fontSize:11, color:ACCENT, fontFamily:FONT, fontWeight:700,
                        background:`rgba(200,149,108,0.12)`, padding:"1px 7px", borderRadius:6 }}>
                        {q ? `${filtered.length} Treffer` : `${areas.length}`}
                    </span>
                </div>
                <Chev open={listOpen} color={ACCENT} size={12} />
            </button>

            {listOpen && (
                <div style={{
                    borderRadius:14, overflow:"hidden",
                    border:`1px solid rgba(200,149,108,0.16)`,
                    background:"rgba(255,255,255,0.015)",
                    marginBottom:4, marginTop:6, width:"100%", boxSizing:"border-box",
                }}>
                    {filtered.length === 0
                        ? <div style={{ padding:"16px 16px", color:"rgba(255,255,255,0.25)", fontSize:14, fontFamily:FONT, textAlign:"center" }}>
                            {loading ? "Lädt Gebiete…" : "Kein Gebiet gefunden"}
                          </div>
                        : filtered.slice(0, 30).map((a, i) => (
                            <AreaRow key={a.name + i} a={a} last={i === Math.min(filtered.length, 30) - 1} />
                        ))
                    }
                    {filtered.length > 30 && (
                        <a href={AREA_BASE} style={{
                            display:"block", padding:"13px 16px", textAlign:"center",
                            textDecoration:"none", color:ACCENT, fontSize:13, fontFamily:FONT, fontWeight:600,
                            borderTop:"1px solid rgba(255,255,255,0.05)",
                            background:"rgba(200,149,108,0.04)",
                        }}>
                            Alle {filtered.length} anzeigen →
                        </a>
                    )}
                </div>
            )}

            <div style={{ height: listOpen ? 16 : 8 }} />

            {navSections.map((sec, si) => (
                <div key={si} style={{ marginTop: si === 0 ? 4 : 20 }}>
                    {sec.title && (
                        <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.10em",
                            color:"rgba(255,255,255,0.22)", fontFamily:FONT,
                            textTransform:"uppercase", marginBottom:6 }}>{sec.title}</div>
                    )}
                    {sec.links.map(l => <MobileLink key={l.href} href={l.href} label={l.label} ls={ls} />)}
                </div>
            ))}
        </div>
    )
}

interface Props {
    bleauLinks: LinkItem[]; serviceLinks: LinkItem[]; extraLinks: LinkItem[]
    accentVisible: boolean; accentColor: string
    navBg: string; navBlur: number; navBorderColor: string; navShadow: string
    linkColor: string; linkHoverColor: string; linkFontSize: number; linkFontWeight: number
    logoImgSize: number; logoTextSize: number; logoTextWeight: number
}

export default function AreaNavBar({
    bleauLinks   = [{ label:"Bleau Bot", href:"/bleau-bot" }, { label:"Guides", href:"/guides" }, { label:"Rules", href:"/rules" }],
    serviceLinks = [{ label:"Commercial", href:"/commercial" }, { label:"Competition", href:"/comp" }, { label:"Workshop", href:"/workshop" }],
    extraLinks   = [{ label:"About Us", href:"/about-us" }, { label:"Impressum", href:"/impressum/datenschutz" }],
    accentVisible  = true, accentColor = "#ffffff",
    navBg = "rgba(11,11,11,0.92)", navBlur = 24,
    navBorderColor = "rgba(255,255,255,0.07)", navShadow = "none",
    linkColor = "rgba(255,255,255,0.65)", linkHoverColor = "#ffffff",
    linkFontSize = 14, linkFontWeight = 500,
    logoImgSize    = 22,
    logoTextSize   = 16,
    logoTextWeight = 700,
}: Props) {
    const [areas,     setAreas]     = useState<Area[]>([])
    const [loading,   setLoading]   = useState(false)
    const [bleauOpen, setBleauOpen] = useState(false)
    const [svcOpen,   setSvcOpen]   = useState(false)
    const [mobOpen,   setMobOpen]   = useState(false)
    const [isMobile,  setIsMobile]  = useState(false)

    const navRef   = useRef<HTMLDivElement>(null)
    const bleauRef = useRef<HTMLDivElement>(null)
    const svcRef   = useRef<HTMLDivElement>(null)

    const ls: LinkStyle = { color:linkColor, hoverColor:linkHoverColor, fontSize:linkFontSize, fontWeight:linkFontWeight }

    useEffect(() => {
        setLoading(true)
        fetch(`${WORKER}/areas`).then(r => r.json()).then((list: Area[]) => setAreas(list))
            .catch(() => {}).finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        const el = navRef.current
        if (!el) return
        const update = (w: number) => setIsMobile(w < MOBILE_BP)
        update(el.offsetWidth)
        const ro = new ResizeObserver(entries => { update(entries[0]?.contentRect.width ?? el.offsetWidth) })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (bleauRef.current && !bleauRef.current.contains(e.target as Node)) setBleauOpen(false)
            if (svcRef.current   && !svcRef.current.contains(e.target as Node))   setSvcOpen(false)
        }
        document.addEventListener("mousedown", h)
        return () => document.removeEventListener("mousedown", h)
    }, [])

    const accentGrad = `linear-gradient(90deg, transparent, ${accentColor} 30%, ${accentColor} 70%, transparent)`

    const logoEl = (
        <a href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none", flexShrink:0 }}>
            <img src={LOGO} alt="" style={{ height: logoImgSize, width:"auto", objectFit:"contain", opacity:.92 }} />
            <span style={{
                fontSize: logoTextSize, fontWeight: logoTextWeight,
                letterSpacing:"-0.03em", color:"#fff", fontFamily:FONT, lineHeight:1,
            }}>HIGHSET</span>
        </a>
    )

    return (
        <>
            <div ref={navRef} style={{ position:"fixed", top:0, left:0, right:0, height:60,
                zIndex:1000, fontFamily:FONT, overflow:"visible" }}>
                <div style={{
                    position:"absolute", inset:0, background: navBg,
                    backdropFilter: navBlur > 0 ? `blur(${navBlur}px)` : "none",
                    WebkitBackdropFilter: navBlur > 0 ? `blur(${navBlur}px)` : "none",
                    borderBottom:`1px solid ${navBorderColor}`, boxShadow: navShadow,
                }} />
                {accentVisible && (
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
                        background: accentGrad, opacity:.85, pointerEvents:"none" }} />
                )}

                {!isMobile && (
                    <div style={{
                        position:"relative", zIndex:1, width:"100%", height:"100%",
                        boxSizing:"border-box", padding:"0 clamp(16px,4vw,48px)",
                        display:"grid", gridTemplateColumns:"1fr auto 1fr",
                        alignItems:"center", overflow:"visible",
                    }}>
                        {logoEl}
                        <CenterSearch areas={areas} loading={loading} />
                        <div style={{ display:"flex", justifyContent:"flex-end", overflow:"visible" }}>
                            <nav style={{ display:"flex", alignItems:"center", gap:22, flexShrink:0, overflow:"visible" }}>
                                <div ref={bleauRef}>
                                    <NavDrop label="Bleau" open={bleauOpen} ls={ls}
                                        onClick={() => { setBleauOpen(o => !o); setSvcOpen(false) }}>
                                        <BleauDropdown links={bleauLinks} areas={areas} loading={loading} ls={ls} anchorRef={bleauRef} />
                                    </NavDrop>
                                </div>
                                <div ref={svcRef}>
                                    <NavDrop label="Services" open={svcOpen} ls={ls}
                                        onClick={() => { setSvcOpen(o => !o); setBleauOpen(false) }}>
                                        <ServicesDropdown links={serviceLinks} ls={ls} anchorRef={svcRef} />
                                    </NavDrop>
                                </div>
                                {extraLinks.map((l, i) => <NavLink key={i} href={l.href} label={l.label} ls={ls} />)}
                            </nav>
                        </div>
                    </div>
                )}

                {isMobile && (
                    <div style={{
                        position:"relative", zIndex:1, width:"100%", height:"100%",
                        boxSizing:"border-box", padding:"0 16px",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap:12, overflow:"visible",
                    }}>
                        {logoEl}
                        <Ham open={mobOpen} onClick={() => setMobOpen(o => !o)} />
                    </div>
                )}
            </div>

            {isMobile && (
                <MobileOverlay open={mobOpen}
                    bleauLinks={bleauLinks} serviceLinks={serviceLinks} extraLinks={extraLinks}
                    areas={areas} loading={loading} ls={ls}
                />
            )}
            <div style={{ width:"100%", height:60 }} />
        </>
    )
}

const linkControl: any = {
    type: ControlType.Object,
    controls: {
        label: { type: ControlType.String, title:"Label",    defaultValue:"Link" },
        href:  { type: ControlType.String, title:"URL/Pfad", defaultValue:"/" },
    },
}

addPropertyControls(AreaNavBar, {
    bleauLinks:  { type: ControlType.Array, title:"Bleau Menü",    control: linkControl,
        defaultValue:[{ label:"Bleau Bot", href:"/bleau-bot" }, { label:"Guides", href:"/guides" }, { label:"Rules", href:"/rules" }] },
    serviceLinks:{ type: ControlType.Array, title:"Services Menü", control: linkControl,
        defaultValue:[{ label:"Commercial", href:"/commercial" }, { label:"Competition", href:"/comp" }, { label:"Workshop", href:"/workshop" }] },
    extraLinks:  { type: ControlType.Array, title:"Weitere Links", control: linkControl,
        defaultValue:[{ label:"About Us", href:"/about-us" }, { label:"Impressum", href:"/impressum/datenschutz" }] },
    logoImgSize:    { type: ControlType.Number, title:"Logo Bild Größe (px)",  defaultValue:22, min:10, max:60, step:1 },
    logoTextSize:   { type: ControlType.Number, title:"Logo Text Größe (px)",  defaultValue:16, min:8,  max:40, step:1 },
    logoTextWeight: { type: ControlType.Number, title:"Logo Text Gewicht",     defaultValue:700, min:100, max:900, step:100 },
    accentVisible:  { type: ControlType.Boolean, title:"Accent Line",    defaultValue:true },
    accentColor:    { type: ControlType.Color,   title:"Accent Farbe",   defaultValue:"#ffffff" },
    navBg:          { type: ControlType.Color,   title:"Nav Hintergrund",defaultValue:"rgba(11,11,11,0.92)" },
    navBlur:        { type: ControlType.Number,  title:"Nav Blur (px)",  defaultValue:24, min:0, max:60, step:1 },
    navBorderColor: { type: ControlType.Color,   title:"Nav Border",     defaultValue:"rgba(255,255,255,0.07)" },
    navShadow:      { type: ControlType.String,  title:"Nav Shadow",     defaultValue:"none" },
    linkColor:      { type: ControlType.Color,   title:"Link Farbe",     defaultValue:"rgba(255,255,255,0.65)" },
    linkHoverColor: { type: ControlType.Color,   title:"Link Hover",     defaultValue:"#ffffff" },
    linkFontSize:   { type: ControlType.Number,  title:"Link Größe (px)",defaultValue:14, min:10, max:24, step:1 },
    linkFontWeight: { type: ControlType.Number,  title:"Link Gewicht",   defaultValue:500, min:100, max:900, step:100 },
})

