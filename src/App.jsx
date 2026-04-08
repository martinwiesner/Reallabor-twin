import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// SVG viewBox 0 0 500 250, outer rect x=5 y=5 w=490 h=240, strokeWidth=8 → inner edge ≈ 9/491/9/241
// 1 SVG unit ≈ 5 cm (building ~25m × ~12m)
const EXT_SIDES = [
  { id: "nord", label: "Nord", x1: 9,   y1: 9,   x2: 491, y2: 9,   axis: "h", inward: 1  },
  { id: "sued", label: "Süd",  x1: 9,   y1: 241, x2: 491, y2: 241, axis: "h", inward: -1 },
  { id: "west", label: "West", x1: 9,   y1: 9,   x2: 9,   y2: 241, axis: "v", inward: 1  },
  { id: "ost",  label: "Ost",  x1: 491, y1: 9,   x2: 491, y2: 241, axis: "v", inward: -1 },
];
const INIT_EXT_WALLS = Object.fromEntries(EXT_SIDES.map(s => [s.id, { typeId: "aw1", bufferDepth: 0 }]));

const FLOORS = [
  { id: "dach", name: "Dach · PV", color: "#22d3ee", short: "D" },
  { id: "4og", name: "4. OG", color: "#c084fc", short: "4" },
  { id: "3og", name: "3. OG", color: "#a78bfa", short: "3" },
  { id: "2og", name: "2. OG", color: "#818cf8", short: "2" },
  { id: "1og", name: "1. OG", color: "#34d399", short: "1" },
  { id: "eg", name: "EG", color: "#fbbf24", short: "E" },
];

const DEFAULT_WALL_TYPES = [
  { id: "aw1", name: "Außenwand (Bestand)", isExterior: true, color: "#f59e0b",
    layers: [
      { name: "Kalkzementputz", thickness: 15, density: 1800, gwp: 0.14, voc: 5, lambda: 0.87 },
      { name: "Holzfaserdämmung", thickness: 200, density: 160, gwp: -0.80, voc: 2, lambda: 0.04 },
      { name: "Recycling-Ziegel", thickness: 240, density: 1900, gwp: 0.156, voc: 0, lambda: 0.68 },
      { name: "Lehmputz", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 },
    ],
  },
  { id: "iw1", name: "Innenwand (Lehm-Ständer)", isExterior: false, color: "#a78bfa",
    layers: [
      { name: "Lehmputz", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 },
      { name: "Holzständer + Dämmung", thickness: 100, density: 80, gwp: 0.08, voc: 1, lambda: 0.045 },
      { name: "Lehmputz", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 },
    ],
  },
];

const OG_WALLS_INIT = [
  { id: "hw1", x1: 0, y1: 128, x2: 95, y2: 128, label: "Flurwand N-W", type: "iw1" },
  { id: "hw2", x1: 140, y1: 128, x2: 480, y2: 128, label: "Flurwand N-O", type: "iw1" },
  { id: "vn1", x1: 95, y1: 10, x2: 95, y2: 128, label: "Trennwand N1", type: "iw1" },
  { id: "vn2", x1: 190, y1: 10, x2: 190, y2: 128, label: "Trennwand N2", type: "iw1" },
  { id: "vn3", x1: 250, y1: 10, x2: 250, y2: 128, label: "Trennwand N3", type: "iw1" },
  { id: "vn4", x1: 310, y1: 10, x2: 310, y2: 128, label: "Trennwand N4", type: "iw1" },
  { id: "vn5", x1: 370, y1: 10, x2: 370, y2: 128, label: "Trennwand N5", type: "iw1" },
  { id: "vn6", x1: 430, y1: 10, x2: 430, y2: 128, label: "Trennwand N6", type: "iw1" },
  { id: "vs1", x1: 60, y1: 128, x2: 60, y2: 230, label: "Trennwand S1", type: "iw1" },
  { id: "vs2", x1: 140, y1: 128, x2: 140, y2: 230, label: "Trennwand S2", type: "iw1" },
  { id: "vs3", x1: 210, y1: 128, x2: 210, y2: 230, label: "Trennwand S3", type: "iw1" },
  { id: "vs4", x1: 280, y1: 128, x2: 280, y2: 230, label: "Trennwand S4", type: "iw1" },
  { id: "vs5", x1: 350, y1: 128, x2: 350, y2: 230, label: "Trennwand S5", type: "iw1" },
  { id: "vs6", x1: 420, y1: 128, x2: 420, y2: 230, label: "Trennwand S6", type: "iw1" },
];

const WHAT_IF = [
  { id: "pvDach", label: "PV Dach", unit: "kWp", min: 0, max: 60, step: 5, default: 25 },
  { id: "pvFreiraum", label: "PV Freiraum", unit: "kWp", min: 0, max: 80, step: 5, default: 20 },
  { id: "batteryEl", label: "Elektr. Speicher", unit: "kWh", min: 0, max: 200, step: 10, default: 50 },
  { id: "batteryTh", label: "Therm. Speicher", unit: "kWh", min: 0, max: 500, step: 25, default: 200 },
  { id: "ventilation", label: "Lüftungsrate", unit: "m³/h", min: 50, max: 500, step: 25, default: 200 },
];

const ns = (t, f = 1, a = 1) => a * Math.sin(t * f) + a * 0.3 * Math.sin(t * f * 2.7 + 1.3);

function calcWallType(wt) {
  const totalThickness = wt.layers.reduce((s, l) => s + l.thickness, 0);
  const rVal = wt.layers.reduce((s, l) => s + (l.thickness / 1000) / l.lambda, 0);
  const uValue = 1 / (0.13 + rVal + 0.04);
  const totalGWP = wt.layers.reduce((s, l) => s + (l.thickness / 1000) * l.density * l.gwp, 0);
  const totalVOC = wt.layers.reduce((s, l) => s + l.voc, 0);
  return { totalThickness, uValue, totalGWP, totalVOC };
}

function genEnergy(tick, p, pvDachOn, pvFreiraumOn) {
  const h = (tick * 0.5) % 24;
  const sun = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
  const pvDachKw = pvDachOn ? Math.max(0, sun * (p.pvDach / 30) * 10 + ns(tick, 0.3, 0.6)) : 0;
  const pvFreiKw = pvFreiraumOn ? Math.max(0, sun * (p.pvFreiraum / 30) * 12 + ns(tick, 0.25, 0.7)) : 0;
  const pvTotal = pvDachKw + pvFreiKw;

  const con42 = Math.max(0, 3 + 1.5 * Math.sin((h - 14) / 24 * Math.PI * 2) + ns(tick, 0.12, 0.8));
  const con52 = Math.max(0, 12 + 6 * Math.sin((h - 13) / 24 * Math.PI * 2) + ns(tick, 0.09, 2));
  const conTotal = con42 + con52;

  const elMax = p.batteryEl > 0 ? p.batteryEl : 1;
  const elStored = Math.min(p.batteryEl, Math.max(0, p.batteryEl * 0.4 + (pvTotal - conTotal) * 3 + ns(tick, 0.04, p.batteryEl * 0.08)));
  const elSOC = (elStored / elMax) * 100;

  const thMax = p.batteryTh > 0 ? p.batteryTh : 1;
  const thStored = Math.min(p.batteryTh, Math.max(0, p.batteryTh * 0.5 + pvTotal * 1.5 - con42 * 2 + ns(tick, 0.03, p.batteryTh * 0.06)));
  const thSOC = (thStored / thMax) * 100;

  const grid = Math.max(0, conTotal - pvTotal - elStored * 0.05 - thStored * 0.02);

  return {
    label: `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`,
    pvDach: +pvDachKw.toFixed(1), pvFrei: +pvFreiKw.toFixed(1), pvTotal: +pvTotal.toFixed(1),
    con42: +con42.toFixed(1), con52: +con52.toFixed(1), conTotal: +conTotal.toFixed(1),
    elStored: +elStored.toFixed(1), elSOC: +elSOC.toFixed(0),
    thStored: +thStored.toFixed(1), thSOC: +thSOC.toFixed(0),
    grid: +grid.toFixed(1),
  };
}

/* ═══ COMPONENTS ═══ */
const Gauge = ({ value, max, label, unit, color, warn }) => {
  const pct = Math.min(100, (value / max) * 100);
  const bad = warn && value > warn;
  return (
    <div style={{ textAlign: "center", minWidth: 56 }}>
      <div style={{ position: "relative", width: 46, height: 46, margin: "0 auto" }}>
        <svg viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={bad ? "#ef4444" : color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: bad ? "#ef4444" : "#e2e8f0" }}>{value}</div>
      </div>
      <div style={{ fontSize: 7, color: "#94a3b8", marginTop: 1 }}>{label}</div>
      <div style={{ fontSize: 6, color: "#64748b" }}>{unit}</div>
    </div>
  );
};

const Box = ({ children, style }) => <div style={{ background: "#0f172a", borderRadius: 8, padding: 10, border: "1px solid #1e293b", ...style }}>{children}</div>;
const Lbl = ({ children, style }) => <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, fontWeight: 600, letterSpacing: 1, ...style }}>{children}</div>;

/* ═══ FLOOR PLANS ═══ */
function EGPlan({ tick }) {
  return (
    <svg viewBox="0 0 500 250" style={{ width: "100%", background: "#080e1a" }}>
      <rect x="5" y="5" width="490" height="240" fill="none" stroke="#fbbf24" strokeWidth="8" />
      <rect x="120" y="8" width="80" height="100" fill="none" stroke="#fbbf24" strokeWidth="5" />
      {[30,40,50,60,70].map(y=><line key={y} x1="135" y1={y} x2="175" y2={y} stroke="#fbbf2444" strokeWidth=".8"/>)}
      <rect x="155" y="72" width="20" height="20" fill="none" stroke="#fbbf24" strokeWidth="2" />
      <path d="M120 45 A20 20 0 0 1 100 65" fill="none" stroke="#fbbf2444" strokeWidth="1"/>
      {[50,90,220,270,320,370,420].map((x,i)=><rect key={i} x={x} y="2" width="30" height="6" fill="#22d3ee22" stroke="#22d3ee44" strokeWidth=".5" rx="1"/>)}
      {[50,120,190,260,330,400,460].map((x,i)=><rect key={`b${i}`} x={x} y="242" width="30" height="6" fill="#22d3ee22" stroke="#22d3ee44" strokeWidth=".5" rx="1"/>)}
      {[40,100,160].map((y,i)=><rect key={`l${i}`} x="2" y={y} width="6" height="25" fill="#22d3ee22" stroke="#22d3ee44" strokeWidth=".5" rx="1"/>)}
      {[40,100,160].map((y,i)=><rect key={`r${i}`} x="492" y={y} width="6" height="25" fill="#22d3ee22" stroke="#22d3ee44" strokeWidth=".5" rx="1"/>)}
      {[160,250,340,430].flatMap(x=>[80,150,220].map(y=><rect key={`${x}${y}`} x={x-4} y={y-4} width="8" height="8" fill="#fbbf24" opacity=".6"/>))}
      <circle cx="300" cy="130" r="4" fill="#22c55e" opacity={.5+.5*Math.sin(tick*.3)}><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/></circle>
      <text x="300" y="200" textAnchor="middle" fill="#fbbf2433" fontSize="12">GEB. 42 · FOYER / AUSSTELLUNG</text>
    </svg>
  );
}

function OGPlan({ tick, wallStates, wallTypes, onWallClick, floor, selectedWallId, extWalls, selectedExtSide, onExtSideClick }) {
  const c = floor.color;
  return (
    <svg viewBox="0 0 500 250" style={{ width: "100%", background: "#080e1a" }}>
      {/* 4 individually clickable exterior wall sides */}
      {EXT_SIDES.map(s => {
        const ew = extWalls[s.id];
        const wt = wallTypes.find(t => t.id === ew.typeId) || wallTypes.find(t => t.isExterior);
        const col = wt ? wt.color : c;
        const isSel = selectedExtSide === s.id;
        const bd = ew.bufferDepth;
        // buffer zone rect
        const bufRect = bd > 0 ? (s.axis === "h"
          ? { x: 9, y: s.inward > 0 ? 9 : 241 - bd, w: 482, h: bd }
          : { x: s.inward > 0 ? 9 : 491 - bd, y: 9, w: bd, h: 232 }) : null;
        // inner buffer wall line
        const bufLine = bd > 0 ? (s.axis === "h"
          ? { x1: 9, y1: s.inward > 0 ? 9 + bd : 241 - bd, x2: 491, y2: s.inward > 0 ? 9 + bd : 241 - bd }
          : { x1: s.inward > 0 ? 9 + bd : 491 - bd, y1: 9, x2: s.inward > 0 ? 9 + bd : 491 - bd, y2: 241 }) : null;
        return (
          <g key={s.id} onClick={() => onExtSideClick(s.id)} style={{ cursor: "pointer" }}>
            {bufRect && <rect x={bufRect.x} y={bufRect.y} width={bufRect.w} height={bufRect.h} fill={col} opacity=".08" />}
            {bufLine && <line x1={bufLine.x1} y1={bufLine.y1} x2={bufLine.x2} y2={bufLine.y2} stroke={col} strokeWidth="2" strokeDasharray="6 3" opacity=".7" />}
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col} strokeWidth={isSel ? 12 : 8} />
            {isSel && <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fff" strokeWidth="12" opacity=".15" />}
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth="18" />
          </g>
        );
      })}
      <rect x="120" y="8" width="80" height="120" fill="none" stroke={c} strokeWidth="5" />
      {[25,35,45,55,65,75].map((y,i)=><line key={i} x1="135" y1={y} x2="175" y2={y} stroke={c+"44"} strokeWidth=".8"/>)}
      <rect x="155" y="85" width="20" height="20" fill="none" stroke={c} strokeWidth="2" />
      <path d="M120 60 A15 15 0 0 1 105 75" fill="none" stroke={c+"44"} strokeWidth="1"/>
      <path d="M120 90 A15 15 0 0 0 105 75" fill="none" stroke={c+"44"} strokeWidth="1"/>
      {[15,45,75,215,255,295,335,375,415,455].map((x,i)=><rect key={i} x={x} y="2" width="22" height="6" fill="#22d3ee18" stroke="#22d3ee33" strokeWidth=".5" rx="1"/>)}
      {[15,55,95,135,175,215,255,295,335,375,415,455].map((x,i)=><rect key={`b${i}`} x={x} y="242" width="22" height="6" fill="#22d3ee18" stroke="#22d3ee33" strokeWidth=".5" rx="1"/>)}
      {[15,60,140,185].map((y,i)=><rect key={`l${i}`} x="2" y={y} width="6" height="20" fill="#22d3ee18" stroke="#22d3ee33" strokeWidth=".5" rx="1"/>)}
      {[15,60,140,185].map((y,i)=><rect key={`r${i}`} x="492" y={y} width="6" height="20" fill="#22d3ee18" stroke="#22d3ee33" strokeWidth=".5" rx="1"/>)}
      {OG_WALLS_INIT.map(w => {
        const ws = wallStates[w.id]; if (!ws) return null;
        // apply buffer offsets to wall endpoints
        let x1 = w.x1+5, y1 = w.y1, x2 = w.x2+5, y2 = w.y2;
        const bn = extWalls.nord.bufferDepth, bs = extWalls.sued.bufferDepth, bw = extWalls.west.bufferDepth, bo = extWalls.ost.bufferDepth;
        if (bn > 0) { if (y1 <= 10) y1 = 9 + bn; if (y2 <= 10) y2 = 9 + bn; }
        if (bs > 0) { if (y1 >= 230) y1 = 241 - bs; if (y2 >= 230) y2 = 241 - bs; }
        if (bw > 0) { if (x1 <= 9) x1 = 9 + bw; if (x2 <= 9) x2 = 9 + bw; }
        if (bo > 0) { if (x1 >= 490) x1 = 491 - bo; if (x2 >= 490) x2 = 491 - bo; }
        if (Math.abs(x2 - x1) < 2 && Math.abs(y2 - y1) < 2) return null; // wall fully consumed by buffer
        const on = ws.active, wt = wallTypes.find(t => t.id === ws.typeId), col = wt ? wt.color : c, isSel = selectedWallId === w.id;
        return (<g key={w.id} onClick={() => onWallClick(w.id)} style={{ cursor: "pointer" }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? col : col+"18"} strokeWidth={on?(isSel?5:3):1} strokeDasharray={on?"none":"5 4"}/>
          {isSel && on && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="7" opacity=".15"/>}
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="14"/>
        </g>);
      })}
      <circle cx="300" cy="70" r="3" fill="#22c55e" opacity={.5+.5*Math.sin(tick*.3)}><animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite"/></circle>
    </svg>
  );
}

function RoofPlan({ pvDachOn, onTogglePvDach, pvFreiraumOn, onTogglePvFreiraum, tick }) {
  const sh = .3 + .7 * Math.max(0, Math.sin(((tick * .5) % 24 - 6) / 12 * Math.PI));
  return (
    <svg viewBox="0 0 500 340" style={{ width: "100%", background: "#080e1a" }}>
      {/* Dach PV */}
      <text x="250" y="16" textAnchor="middle" fill="#22d3ee88" fontSize="9" fontWeight="600">GEB. 42 · DACH</text>
      <rect x="5" y="22" width="490" height="130" fill="none" stroke="#22d3ee" strokeWidth="3" strokeDasharray={pvDachOn ? "none" : "6 4"} rx="4" />
      <rect x="440" y="26" width="50" height="18" rx="3" fill={pvDachOn ? "#0e7490" : "#1e293b"} stroke={pvDachOn ? "#22d3ee" : "#334155"} strokeWidth="1" cursor="pointer" onClick={onTogglePvDach} />
      <text x="465" y="38" textAnchor="middle" fill={pvDachOn ? "#22d3ee" : "#475569"} fontSize="7" fontWeight="700" style={{ cursor: "pointer", pointerEvents: "none" }}>{pvDachOn ? "AN" : "AUS"}</text>
      {pvDachOn && Array.from({ length: 3 }, (_, r) => Array.from({ length: 12 }, (_, cc) => {
        const x = 15 + cc * 39, y = 28 + r * 38;
        return <rect key={`d${r}${cc}`} x={x} y={y} width="36" height="35" rx="1" fill="#0e7490" opacity={sh * .45} stroke="#22d3ee44" strokeWidth=".5" />;
      })).flat()}
      {!pvDachOn && <text x="230" y="90" textAnchor="middle" fill="#334155" fontSize="10">PV Dach deaktiviert</text>}

      {/* Freiraum PV */}
      <text x="250" y="175" textAnchor="middle" fill="#34d39988" fontSize="9" fontWeight="600">FREIRAUM · PV-FELD</text>
      <rect x="5" y="182" width="490" height="150" fill="none" stroke="#34d399" strokeWidth="3" strokeDasharray={pvFreiraumOn ? "none" : "6 4"} rx="4" />
      <rect x="440" y="186" width="50" height="18" rx="3" fill={pvFreiraumOn ? "#065f46" : "#1e293b"} stroke={pvFreiraumOn ? "#34d399" : "#334155"} strokeWidth="1" cursor="pointer" onClick={onTogglePvFreiraum} />
      <text x="465" y="198" textAnchor="middle" fill={pvFreiraumOn ? "#34d399" : "#475569"} fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>{pvFreiraumOn ? "AN" : "AUS"}</text>
      {pvFreiraumOn && Array.from({ length: 4 }, (_, r) => Array.from({ length: 12 }, (_, cc) => {
        const x = 15 + cc * 39, y = 190 + r * 34;
        return <rect key={`f${r}${cc}`} x={x} y={y} width="36" height="31" rx="1" fill="#065f46" opacity={sh * .4} stroke="#34d39944" strokeWidth=".5" />;
      })).flat()}
      {!pvFreiraumOn && <text x="230" y="260" textAnchor="middle" fill="#334155" fontSize="10">PV Freiraum deaktiviert</text>}
    </svg>
  );
}

function WallSectionVis({ wt }) {
  const total = wt.layers.reduce((s, l) => s + l.thickness, 0);
  const cols = ["#9ca3af","#fde68a","#dc8850","#e5e7eb","#a8845a","#86a873","#b0a898","#c4b5fd"];
  return (
    <div style={{ display: "flex", height: 72, borderRadius: 4, overflow: "hidden", border: "1px solid #334155" }}>
      {wt.layers.map((l, i) => (
        <div key={i} style={{ width: `${(l.thickness / total) * 100}%`, background: cols[i % cols.length], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 6, color: "#0f172a", fontWeight: 700, borderRight: i < wt.layers.length - 1 ? "1px solid #0f172a" : "none", minWidth: 6 }}>
          <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 6, maxHeight: 55, overflow: "hidden" }}>{l.name}</span>
          <span>{l.thickness}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ ENERGY FLOW (two buildings, two PV, two storages) ═══ */
function EnergyFlow({ d, p, tick, pvDachOn, pvFreiraumOn }) {
  const pu = Math.sin(tick * .3) * .5 + .5;
  return (
    <svg viewBox="0 0 520 220" style={{ width: "100%" }}>
      {/* PV Dach */}
      <rect x="80" y="2" width="90" height="28" rx="4" fill={pvDachOn ? "#0e7490" : "#1e293b"} opacity={pvDachOn ? .7+pu*.3 : .5} />
      <text x="125" y="13" textAnchor="middle" fill={pvDachOn?"#22d3ee":"#475569"} fontSize="7" fontWeight="700">☀️ PV Dach</text>
      <text x="125" y="25" textAnchor="middle" fill={pvDachOn?"#67e8f9":"#334155"} fontSize="9" fontWeight="800">{d.pvDach} kW</text>
      {/* PV Freiraum */}
      <rect x="190" y="2" width="90" height="28" rx="4" fill={pvFreiraumOn ? "#065f46" : "#1e293b"} opacity={pvFreiraumOn ? .7+pu*.3 : .5} />
      <text x="235" y="13" textAnchor="middle" fill={pvFreiraumOn?"#34d399":"#475569"} fontSize="7" fontWeight="700">☀️ PV Freiraum</text>
      <text x="235" y="25" textAnchor="middle" fill={pvFreiraumOn?"#6ee7b7":"#334155"} fontSize="9" fontWeight="800">{d.pvFrei} kW</text>

      {/* Flows from PV down */}
      {d.pvDach > .3 && <line x1="125" y1="31" x2="175" y2="60" stroke="#22d3ee" strokeWidth={1+d.pvDach/8} strokeDasharray="4 3" opacity={.4+pu*.5}><animate attributeName="stroke-dashoffset" from="14" to="0" dur=".7s" repeatCount="indefinite"/></line>}
      {d.pvFrei > .3 && <line x1="235" y1="31" x2="195" y2="60" stroke="#34d399" strokeWidth={1+d.pvFrei/8} strokeDasharray="4 3" opacity={.4+pu*.5}><animate attributeName="stroke-dashoffset" from="14" to="0" dur=".8s" repeatCount="indefinite"/></line>}

      {/* Geb 42 */}
      <rect x="135" y="58" width="100" height="36" rx="5" fill="#064e3b" />
      <text x="185" y="72" textAnchor="middle" fill="#34d399" fontSize="7" fontWeight="700">🏢 Geb. 42</text>
      <text x="185" y="86" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="800">{d.con42} kW</text>

      {/* Geb 52/53 */}
      <rect x="340" y="58" width="110" height="36" rx="5" fill="#1c1917" />
      <text x="395" y="72" textAnchor="middle" fill="#fb923c" fontSize="7" fontWeight="700">🏭 Geb. 52/53</text>
      <text x="395" y="86" textAnchor="middle" fill="#fdba74" fontSize="10" fontWeight="800">{d.con52} kW</text>

      {/* Flow Geb42 → Geb52 */}
      <line x1="237" y1="76" x2="338" y2="76" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" opacity={.3+pu*.4}><animate attributeName="stroke-dashoffset" from="14" to="0" dur=".9s" repeatCount="indefinite"/></line>
      <text x="288" y="72" textAnchor="middle" fill="#f59e0b55" fontSize="6">Versorgung →</text>

      {/* El. Speicher */}
      <rect x="8" y="115" width="100" height="44" rx="5" fill="#1e1b4b" />
      <text x="58" y="130" textAnchor="middle" fill="#a78bfa" fontSize="7" fontWeight="700">🔋 El. Speicher</text>
      <text x="58" y="146" textAnchor="middle" fill="#c4b5fd" fontSize="9" fontWeight="800">{d.elStored} / {p.batteryEl} kWh</text>
      <rect x="12" y="153" width="92" height="3" rx="1.5" fill="#1e293b"/><rect x="12" y="153" width={Math.max(0,d.elSOC*.92)} height="3" rx="1.5" fill={d.elSOC>20?"#a78bfa":"#ef4444"}/>

      {/* Th. Speicher */}
      <rect x="130" y="115" width="110" height="44" rx="5" fill="#7c2d12" />
      <text x="185" y="130" textAnchor="middle" fill="#fb923c" fontSize="7" fontWeight="700">♨️ Therm. Speicher</text>
      <text x="185" y="146" textAnchor="middle" fill="#fdba74" fontSize="9" fontWeight="800">{d.thStored} / {p.batteryTh} kWh</text>
      <rect x="134" y="153" width="102" height="3" rx="1.5" fill="#1e293b"/><rect x="134" y="153" width={Math.max(0,d.thSOC*1.02)} height="3" rx="1.5" fill={d.thSOC>20?"#fb923c":"#ef4444"}/>

      {/* Netz */}
      <rect x="350" y="115" width="100" height="44" rx="5" fill="#4c1d1d" />
      <text x="400" y="130" textAnchor="middle" fill="#f87171" fontSize="7" fontWeight="700">⚡ Netz</text>
      <text x="400" y="146" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="800">{d.grid} kW</text>

      {/* Flow lines to storages */}
      {d.elSOC > 10 && <line x1="110" y1="135" x2="133" y2="76" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="3 3" opacity={.3+pu*.3}><animate attributeName="stroke-dashoffset" from="10" to="0" dur="1s" repeatCount="indefinite"/></line>}
      {d.grid > .5 && <line x1="348" y1="135" x2="345" y2="96" stroke="#f87171" strokeWidth={1+d.grid/6} strokeDasharray="4 3" opacity={.3+pu*.5}><animate attributeName="stroke-dashoffset" from="0" to="14" dur=".5s" repeatCount="indefinite"/></line>}

      {/* Autarkie */}
      <text x="280" y="180" textAnchor="middle" fill="#475569" fontSize="7">Autarkiegrad Gesamt</text>
      <text x="280" y="200" textAnchor="middle" fill="#22d3ee" fontSize="18" fontWeight="800">{d.conTotal > 0 ? Math.min(100, ((1 - d.grid / d.conTotal) * 100)).toFixed(0) : 0}%</text>

      {/* Labels */}
      <text x="58" y="175" textAnchor="middle" fill="#a78bfa55" fontSize="6">Geb. 42 · UG</text>
      <text x="185" y="175" textAnchor="middle" fill="#fb923c55" fontSize="6">Geb. 42 · UG</text>
    </svg>
  );
}

/* ═══ MAIN ═══ */
export default function App() {
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState("1og");
  const [params, setParams] = useState(Object.fromEntries(WHAT_IF.map(w => [w.id, w.default])));
  const [hist, setHist] = useState([]);
  const [view, setView] = useState("codesign");
  const [pvDachOn, setPvDachOn] = useState(true);
  const [pvFreiraumOn, setPvFreiraumOn] = useState(true);
  const [wallTypes, setWallTypes] = useState(DEFAULT_WALL_TYPES);
  const [wallStates, setWallStates] = useState(Object.fromEntries(OG_WALLS_INIT.map(w => [w.id, { active: true, typeId: w.type }])));
  const [selectedWallId, setSelectedWallId] = useState(null);
  const [extWalls, setExtWalls] = useState(INIT_EXT_WALLS);
  const [selectedExtSide, setSelectedExtSide] = useState(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeLayers, setNewTypeLayers] = useState([{ name: "Schicht 1", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 }]);
  const [newTypeColor, setNewTypeColor] = useState("#34d399");
  const [newTypeIsExterior, setNewTypeIsExterior] = useState(false);

  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1500); return () => clearInterval(iv); }, []);
  useEffect(() => { setHist(h => [...h.slice(-30), { ...genEnergy(tick, params, pvDachOn, pvFreiraumOn), t: tick }]); }, [tick, params, pvDachOn, pvFreiraumOn]);

  const cur = hist[hist.length - 1] || { pvDach:0,pvFrei:0,pvTotal:0,con42:0,con52:0,conTotal:0,elStored:0,elSOC:0,thStored:0,thSOC:0,grid:0,label:"–" };
  const fl = FLOORS.find(f => f.id === sel);
  const sp = (id, v) => setParams(p => ({ ...p, [id]: parseFloat(v) }));
  const aw = Object.values(wallStates).filter(v => v.active).length;

  const onWallClick = wid => { setSelectedExtSide(null); if (selectedWallId === wid) { setWallStates(ws => ({ ...ws, [wid]: { ...ws[wid], active: !ws[wid].active } })); } else setSelectedWallId(wid); };
  const onExtSideClick = sid => { setSelectedWallId(null); setSelectedExtSide(s => s === sid ? null : sid); };
  const assignType = (wid, tid) => setWallStates(ws => ({ ...ws, [wid]: { ...ws[wid], typeId: tid } }));
  const toggleWall = wid => setWallStates(ws => ({ ...ws, [wid]: { ...ws[wid], active: !ws[wid].active } }));

  const addNewWallType = () => {
    if (!newTypeName.trim()) return;
    setWallTypes(wts => [...wts, { id: "wt_" + Date.now(), name: newTypeName.trim(), isExterior: newTypeIsExterior, color: newTypeColor, layers: newTypeLayers.map(l => ({ ...l })) }]);
    setShowNewType(false); setNewTypeName(""); setNewTypeIsExterior(false); setNewTypeLayers([{ name: "Schicht 1", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 }]);
  };
  const updateNewLayer = (idx, key, val) => setNewTypeLayers(ls => ls.map((l, i) => i === idx ? { ...l, [key]: typeof l[key] === "number" ? parseFloat(val) || 0 : val } : l));

  // per-side areas (m²): Nord/Süd = 25m × 5 floors × 3.2m, Ost/West = 12m × 5 × 3.2m
  const SIDE_AREAS = { nord: 25*3.2*5, sued: 25*3.2*5, ost: 12*3.2*5, west: 12*3.2*5 };
  const selSideData = selectedExtSide ? extWalls[selectedExtSide] : null;
  const selSideWT = selSideData ? (wallTypes.find(t => t.id === selSideData.typeId) || wallTypes.find(t => t.isExterior)) : null;
  const selSideCalc = selSideWT ? calcWallType(selSideWT) : null;
  let extGWP = 0;
  EXT_SIDES.forEach(s => { const wt = wallTypes.find(t => t.id === extWalls[s.id].typeId) || wallTypes.find(t => t.isExterior); if (wt) extGWP += calcWallType(wt).totalGWP * SIDE_AREAS[s.id]; });
  // keep extCalc for Auswertung U-value (use nord as reference)
  const nordWT = wallTypes.find(t => t.id === extWalls.nord.typeId) || wallTypes.find(t => t.isExterior);
  const extCalc = nordWT ? calcWallType(nordWT) : { uValue: 0, totalGWP: 0 };
  let intGWP = 0;
  Object.entries(wallStates).forEach(([_, ws]) => { if (!ws.active) return; const wt = wallTypes.find(t => t.id === ws.typeId); if (wt) intGWP += calcWallType(wt).totalGWP * 3.5 * 3.2 * 4; });
  const totalGWP = extGWP + intGWP;

  const sensors = {
    temp: (21 + ns(tick * 0.1, 0.2, 1.5)).toFixed(1),
    humidity: (48 + ns(tick * 0.1 + 10, 0.15, 8) - params.ventilation * 0.02).toFixed(0),
    co2: Math.max(400, (620 + ns(tick * 0.1 + 20, 0.12, 150) - params.ventilation * 0.5)).toFixed(0),
    voc: Math.max(30, (150 + ns(tick * 0.1 + 30, 0.08, 30) - params.ventilation * 0.15)).toFixed(0),
  };

  return (
    <div style={{ background: "#020617", color: "#e2e8f0", minHeight: "100vh", fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11 }}>
      <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#22d3ee" }}>REALLABOR</span>
          <span style={{ fontSize: 11, color: "#475569" }}>DIGITALER ZWILLING · GEB. 42 + 52/53</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {["live","codesign","material"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid", fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1, background: view === v ? "#22d3ee" : "transparent", color: view === v ? "#020617" : "#475569", borderColor: view === v ? "#22d3ee" : "#1e293b" }}>{v === "codesign" ? "Co-Design" : v}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 8, maxWidth: 1100, margin: "0 auto" }}>

        {/* ═══ LIVE ═══ */}
        {view === "live" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Box style={{ gridColumn: "1/-1" }}><Lbl>ENERGIEFLUSS · GEB. 42 + 52/53</Lbl><EnergyFlow d={cur} p={params} tick={tick} pvDachOn={pvDachOn} pvFreiraumOn={pvFreiraumOn} /></Box>
          <Box><Lbl>ENERGIEVERLAUF</Lbl>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={hist}>
                <defs>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={.4}/><stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={.3}/><stop offset="100%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "#1e293b", fontSize: 7 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#1e293b", fontSize: 7 }} width={22} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 8, color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="pvTotal" stroke="#22d3ee" fill="url(#gP)" name="PV ges." strokeWidth={1.5} />
                <Area type="monotone" dataKey="conTotal" stroke="#f87171" fill="url(#gC)" name="Verbr. ges." strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
          <Box><Lbl>PARAMETER</Lbl>
            {WHAT_IF.map(w => (<div key={w.id} style={{ marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}><span style={{ color: "#94a3b8" }}>{w.label}</span><span style={{ color: "#22d3ee", fontWeight: 700 }}>{params[w.id]} {w.unit}</span></div>
              <input type="range" min={w.min} max={w.max} step={w.step} value={params[w.id]} onChange={e => sp(w.id, e.target.value)} style={{ width: "100%", accentColor: "#22d3ee", height: 3 }} />
            </div>))}
          </Box>
          <Box style={{ gridColumn: "1/-1" }}><Lbl>SENSOREN + SPEICHER · GEB. 42</Lbl>
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 4 }}>
              <Gauge value={sensors.temp} max={40} label="Temp" unit="°C" color="#f59e0b" warn={28} />
              <Gauge value={sensors.humidity} max={100} label="Feuchte" unit="%rH" color="#3b82f6" warn={70} />
              <Gauge value={sensors.co2} max={1500} label="CO₂" unit="ppm" color="#22c55e" warn={1000} />
              <Gauge value={sensors.voc} max={500} label="VOC" unit="µg/m³" color="#a78bfa" warn={300} />
              <Gauge value={cur.thStored} max={params.batteryTh || 1} label="Th. Speicher" unit="kWh" color="#fb923c" />
              <Gauge value={cur.elStored} max={params.batteryEl || 1} label="El. Speicher" unit="kWh" color="#a78bfa" />
            </div>
          </Box>
        </div>}

        {/* ═══ CO-DESIGN ═══ */}
        {view === "codesign" && <div style={{ display: "grid", gridTemplateColumns: "1fr 250px", gap: 8 }}>
          <div style={{ gridColumn: "1/-1", display: "flex", gap: 2 }}>
            {FLOORS.map(f => (<button key={f.id} onClick={() => { setSel(f.id); setSelectedWallId(null); }} style={{ padding: "4px 10px", borderRadius: "4px 4px 0 0", border: "1px solid", borderBottom: "none", background: sel === f.id ? f.color + "20" : "#0f172a", color: sel === f.id ? f.color : "#334155", borderColor: sel === f.id ? f.color + "55" : "#1e293b", fontSize: 8, cursor: "pointer", fontFamily: "inherit", fontWeight: sel === f.id ? 700 : 400 }}>{f.short}</button>))}
          </div>

          <Box style={{ borderColor: fl.color + "33" }}>
            <div style={{ fontSize: 11, color: fl.color, marginBottom: 4, fontWeight: 600 }}>{fl.name}</div>
            {sel === "eg" && <EGPlan tick={tick} />}
            {sel === "dach" && <RoofPlan pvDachOn={pvDachOn} onTogglePvDach={() => setPvDachOn(p => !p)} pvFreiraumOn={pvFreiraumOn} onTogglePvFreiraum={() => setPvFreiraumOn(p => !p)} tick={tick} />}
            {!["eg", "dach"].includes(sel) && <>
              <OGPlan tick={tick} wallStates={wallStates} wallTypes={wallTypes} onWallClick={onWallClick} floor={fl} selectedWallId={selectedWallId} extWalls={extWalls} selectedExtSide={selectedExtSide} onExtSideClick={onExtSideClick} />
              <div style={{ fontSize: 7, color: "#334155", marginTop: 4 }}>Klick = auswählen · Doppelklick = ein/aus · {aw}/{OG_WALLS_INIT.length} aktiv</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>{wallTypes.filter(t => !t.isExterior).map(t => (<span key={t.id} style={{ fontSize: 7, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 10, height: 3, background: t.color, borderRadius: 1 }} />{t.name}</span>))}</div>
            </>}
          </Box>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Box style={{ maxHeight: 300, overflowY: "auto" }}>
              <Lbl>WÄNDE / PV</Lbl>
              {sel === "dach" ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button onClick={() => setPvDachOn(p => !p)} style={{ width: "100%", padding: "6px", borderRadius: 4, border: `1px solid ${pvDachOn ? "#22d3ee" : "#334155"}`, background: pvDachOn ? "#22d3ee15" : "transparent", color: pvDachOn ? "#22d3ee" : "#475569", cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 600 }}>☀️ PV Dach {pvDachOn ? `aktiv · ${params.pvDach}kWp` : "aus"}</button>
                <button onClick={() => setPvFreiraumOn(p => !p)} style={{ width: "100%", padding: "6px", borderRadius: 4, border: `1px solid ${pvFreiraumOn ? "#34d399" : "#334155"}`, background: pvFreiraumOn ? "#34d39915" : "transparent", color: pvFreiraumOn ? "#34d399" : "#475569", cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 600 }}>☀️ PV Freiraum {pvFreiraumOn ? `aktiv · ${params.pvFreiraum}kWp` : "aus"}</button>
              </div> : sel === "eg" ? <div style={{ fontSize: 8, color: "#475569" }}>EG: Offener Grundriss</div> : <>
                <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
                  <button onClick={() => setWallStates(ws => { const n = { ...ws }; OG_WALLS_INIT.forEach(w => n[w.id] = { ...n[w.id], active: true }); return n; })} style={{ flex: 1, padding: "3px", borderRadius: 3, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 7, cursor: "pointer", fontFamily: "inherit" }}>Alle</button>
                  <button onClick={() => setWallStates(ws => { const n = { ...ws }; OG_WALLS_INIT.forEach(w => n[w.id] = { ...n[w.id], active: false }); return n; })} style={{ flex: 1, padding: "3px", borderRadius: 3, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 7, cursor: "pointer", fontFamily: "inherit" }}>Open</button>
                </div>
                {OG_WALLS_INIT.map(w => { const ws = wallStates[w.id], on = ws?.active, wt = wallTypes.find(t => t.id === ws?.typeId), isSel = selectedWallId === w.id;
                  return (<div key={w.id} style={{ marginBottom: 2, borderRadius: 4, border: `1px solid ${isSel ? fl.color : on ? (wt?.color || fl.color) + "44" : "#1e293b22"}`, background: isSel ? fl.color + "15" : "transparent", padding: "3px 5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setSelectedWallId(isSel ? null : w.id)}>
                      <span style={{ fontSize: 8, color: on ? (wt?.color || fl.color) : "#334155", display: "flex", alignItems: "center", gap: 3 }}>{wt && <span style={{ width: 7, height: 3, background: wt.color, borderRadius: 1 }} />}{w.label}</span>
                      <button onClick={e => { e.stopPropagation(); toggleWall(w.id); }} style={{ fontSize: 7, fontWeight: 700, color: on ? "#22c55e" : "#ef4444", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{on ? "EIN" : "AUS"}</button>
                    </div>
                    {isSel && on && <div style={{ marginTop: 3, paddingTop: 3, borderTop: "1px solid #1e293b" }}>
                      <div style={{ fontSize: 7, color: "#475569", marginBottom: 2 }}>Wandtyp:</div>
                      {wallTypes.filter(t => !t.isExterior).map(t => (<button key={t.id} onClick={() => assignType(w.id, t.id)} style={{ display: "block", width: "100%", padding: "2px 5px", marginBottom: 1, borderRadius: 3, fontSize: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `1px solid ${ws.typeId === t.id ? t.color : "#1e293b"}`, background: ws.typeId === t.id ? t.color + "20" : "transparent", color: ws.typeId === t.id ? t.color : "#475569" }}><span style={{ width: 6, height: 3, background: t.color, borderRadius: 1, display: "inline-block", marginRight: 3 }} />{t.name}</button>))}
                    </div>}
                  </div>);
                })}
              </>}
            </Box>
            {selectedExtSide && selSideWT && (() => {
              const sideMeta = EXT_SIDES.find(s => s.id === selectedExtSide);
              const ew = extWalls[selectedExtSide];
              const sc = selSideCalc;
              return <Box style={{ borderColor: selSideWT.color + "55" }}>
                <Lbl style={{ color: selSideWT.color }}>AUSSENWAND · {sideMeta.label.toUpperCase()}</Lbl>
                {wallTypes.filter(t => t.isExterior).map(t => (
                  <button key={t.id} onClick={() => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], typeId: t.id } }))} style={{ display: "block", width: "100%", padding: "2px 5px", marginBottom: 1, borderRadius: 3, fontSize: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `1px solid ${ew.typeId === t.id ? t.color : "#1e293b"}`, background: ew.typeId === t.id ? t.color + "20" : "transparent", color: ew.typeId === t.id ? t.color : "#475569" }}>
                    <span style={{ width: 6, height: 3, background: t.color, borderRadius: 1, display: "inline-block", marginRight: 3 }} />{t.name}
                  </button>
                ))}
                {sc && <><WallSectionVis wt={selSideWT} />
                  <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                    <div style={{ fontSize: 7, color: "#475569" }}>U: <span style={{ color: "#22d3ee" }}>{sc.uValue.toFixed(3)}</span></div>
                    <div style={{ fontSize: 7, color: "#475569" }}>GWP: <span style={{ color: sc.totalGWP < 0 ? "#22c55e" : "#f59e0b" }}>{sc.totalGWP.toFixed(2)}</span></div>
                  </div></>}
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1e293b" }}>
                  <div style={{ fontSize: 7, color: "#475569", marginBottom: 3 }}>PUFFERZONE</div>
                  {ew.bufferDepth === 0
                    ? <button onClick={() => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], bufferDepth: 30 } }))} style={{ width: "100%", padding: "4px", borderRadius: 3, border: "2px dashed #334155", background: "transparent", color: "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>+ Pufferzone anlegen</button>
                    : <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontSize: 7, color: selSideWT.color }}>{(ew.bufferDepth * 0.05).toFixed(1)} m Tiefe</span>
                          <button onClick={() => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], bufferDepth: 0 } }))} style={{ fontSize: 8, background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>× entfernen</button>
                        </div>
                        <input type="range" min="10" max="80" step="5" value={ew.bufferDepth} onChange={e => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], bufferDepth: +e.target.value } }))} style={{ width: "100%" }} />
                      </div>
                  }
                </div>
              </Box>;
            })()}
            {selectedWallId && wallStates[selectedWallId]?.active && (() => { const ws = wallStates[selectedWallId], wt = wallTypes.find(t => t.id === ws.typeId); if (!wt) return null; const c = calcWallType(wt);
              return <Box><Lbl style={{ color: wt.color }}>{wt.name}</Lbl><WallSectionVis wt={wt} /><div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                <div style={{ fontSize: 7, color: "#475569" }}>Dicke: <span style={{ color: "#e2e8f0" }}>{c.totalThickness}mm</span></div>
                <div style={{ fontSize: 7, color: "#475569" }}>U: <span style={{ color: "#22d3ee" }}>{c.uValue.toFixed(3)}</span></div>
                <div style={{ fontSize: 7, color: "#475569" }}>GWP: <span style={{ color: c.totalGWP < 0 ? "#22c55e" : "#f59e0b" }}>{c.totalGWP.toFixed(2)}</span></div>
                <div style={{ fontSize: 7, color: "#475569" }}>VOC: <span style={{ color: "#a78bfa" }}>{c.totalVOC}</span></div>
              </div></Box>;
            })()}
          </div>

          <Box style={{ gridColumn: "1/-1" }}><Lbl>AUSWERTUNG · GEB. 42</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 5 }}>
              {[
                { l: "GWP gesamt", v: `${(totalGWP/1000).toFixed(1)} t`, c: "#22d3ee" },
                { l: "GWP/(m²·a)", v: `${(totalGWP/1500/50).toFixed(3)}`, c: "#22d3ee" },
                { l: "U-Wert Außen", v: `${extCalc.uValue.toFixed(3)}`, c: extCalc.uValue < .2 ? "#22c55e" : "#f59e0b" },
                { l: "Therm. Komfort", v: `${sensors.temp}°C`, c: parseFloat(sensors.temp) >= 20 && parseFloat(sensors.temp) <= 26 ? "#22c55e" : "#ef4444" },
                { l: "VOC", v: `${sensors.voc} µg/m³`, c: parseFloat(sensors.voc) < 200 ? "#22c55e" : "#ef4444" },
                { l: "Feuchte", v: `${sensors.humidity}%`, c: parseFloat(sensors.humidity) < 65 ? "#22c55e" : "#f59e0b" },
                { l: "CO₂ Raum", v: `${sensors.co2} ppm`, c: parseFloat(sensors.co2) < 1000 ? "#22c55e" : "#ef4444" },
                { l: "Th. Speicher", v: `${cur.thStored} kWh`, c: "#fb923c" },
                { l: "El. Speicher", v: `${cur.elStored} kWh`, c: "#a78bfa" },
                { l: "PV Dach", v: pvDachOn ? `${params.pvDach}kWp` : "–", c: pvDachOn ? "#22d3ee" : "#475569" },
                { l: "PV Freiraum", v: pvFreiraumOn ? `${params.pvFreiraum}kWp` : "–", c: pvFreiraumOn ? "#34d399" : "#475569" },
                { l: "Innenwände", v: `${aw}/${OG_WALLS_INIT.length}`, c: "#a78bfa" },
              ].map((k, i) => (<div key={i} style={{ background: "#020617", borderRadius: 5, padding: 5, border: "1px solid #1e293b", textAlign: "center" }}><div style={{ fontSize: 6, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>{k.l}</div><div style={{ fontSize: 12, fontWeight: 800, color: k.c, marginTop: 1 }}>{k.v}</div></div>))}
            </div>
          </Box>
          <Box style={{ gridColumn: "1/-1" }}><Lbl>SENSOREN + SPEICHER</Lbl>
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 4 }}>
              <Gauge value={sensors.temp} max={40} label="Temp" unit="°C" color="#f59e0b" warn={28} />
              <Gauge value={sensors.humidity} max={100} label="Feuchte" unit="%rH" color="#3b82f6" warn={70} />
              <Gauge value={sensors.co2} max={1500} label="CO₂" unit="ppm" color="#22c55e" warn={1000} />
              <Gauge value={sensors.voc} max={500} label="VOC" unit="µg/m³" color="#a78bfa" warn={300} />
              <Gauge value={cur.thStored} max={params.batteryTh || 1} label="Th. Speicher" unit="kWh" color="#fb923c" />
              <Gauge value={cur.elStored} max={params.batteryEl || 1} label="El. Speicher" unit="kWh" color="#a78bfa" />
            </div>
          </Box>
        </div>}

        {/* ═══ MATERIAL ═══ */}
        {view === "material" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Box style={{ gridColumn: "1/-1" }}><Lbl>WANDAUFBAU-KATALOG</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
              {wallTypes.map(wt => { const c = calcWallType(wt); return (
                <div key={wt.id} style={{ background: "#020617", borderRadius: 6, padding: 10, border: `1px solid ${wt.color}33`, borderLeft: `3px solid ${wt.color}` }}>
                  <div style={{ fontSize: 10, color: wt.color, fontWeight: 700, marginBottom: 5, display: "flex", justifyContent: "space-between" }}><span>{wt.name}</span><span style={{ fontSize: 8, color: "#475569", fontWeight: 400 }}>{wt.isExterior ? "Außen" : "Innen"}</span></div>
                  <WallSectionVis wt={wt} />
                  <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
                    <div style={{ fontSize: 7, color: "#475569" }}>Dicke<br /><span style={{ color: "#e2e8f0", fontSize: 10, fontWeight: 700 }}>{c.totalThickness}mm</span></div>
                    <div style={{ fontSize: 7, color: "#475569" }}>U-Wert<br /><span style={{ color: "#22d3ee", fontSize: 10, fontWeight: 700 }}>{c.uValue.toFixed(3)}</span></div>
                    <div style={{ fontSize: 7, color: "#475569" }}>GWP<br /><span style={{ color: c.totalGWP < 0 ? "#22c55e" : "#f59e0b", fontSize: 10, fontWeight: 700 }}>{c.totalGWP.toFixed(2)}</span></div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5 }}>
                    <thead><tr>{["Schicht","mm","ρ","GWP","VOC","λ"].map((h,i) => <th key={i} style={{ fontSize: 6, color: "#334155", textAlign: i === 0 ? "left" : "right", padding: "2px 2px", borderBottom: "1px solid #1e293b" }}>{h}</th>)}</tr></thead>
                    <tbody>{wt.layers.map((l, li) => (<tr key={li}><td style={{ fontSize: 7, color: "#94a3b8", padding: "1px 2px" }}>{l.name}</td><td style={{ fontSize: 7, color: "#e2e8f0", textAlign: "right", padding: "1px 2px", fontFamily: "monospace" }}>{l.thickness}</td><td style={{ fontSize: 7, color: "#64748b", textAlign: "right", padding: "1px 2px", fontFamily: "monospace" }}>{l.density}</td><td style={{ fontSize: 7, color: l.gwp < 0 ? "#22c55e" : "#f59e0b", textAlign: "right", padding: "1px 2px", fontFamily: "monospace" }}>{l.gwp}</td><td style={{ fontSize: 7, color: "#a78bfa", textAlign: "right", padding: "1px 2px", fontFamily: "monospace" }}>{l.voc}</td><td style={{ fontSize: 7, color: "#64748b", textAlign: "right", padding: "1px 2px", fontFamily: "monospace" }}>{l.lambda}</td></tr>))}</tbody>
                  </table>
                </div>
              );})}
            </div>
          </Box>

          <Box style={{ gridColumn: "1/-1" }}>
            {!showNewType ? <button onClick={() => setShowNewType(true)} style={{ padding: "8px 16px", borderRadius: 5, border: "2px dashed #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, width: "100%" }}>+ Neuen Wandaufbau erstellen</button> : <div>
              <Lbl>NEUER WANDAUFBAU</Lbl>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div><div style={{ fontSize: 7, color: "#475569", marginBottom: 2 }}>Name</div><input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="z.B. Leichtbauwand" style={{ fontSize: 10, padding: "4px 8px", border: "1px solid #334155", borderRadius: 4, background: "#020617", color: "#e2e8f0", width: 180, fontFamily: "inherit" }} /></div>
                <div><div style={{ fontSize: 7, color: "#475569", marginBottom: 2 }}>Farbe</div><input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)} style={{ width: 32, height: 28, border: "1px solid #334155", borderRadius: 4, background: "#020617", cursor: "pointer" }} /></div>
                <div><div style={{ fontSize: 7, color: "#475569", marginBottom: 2 }}>Typ</div><button onClick={() => setNewTypeIsExterior(v => !v)} style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${newTypeIsExterior ? "#f59e0b" : "#334155"}`, background: newTypeIsExterior ? "#f59e0b20" : "transparent", color: newTypeIsExterior ? "#f59e0b" : "#64748b", fontSize: 8, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{newTypeIsExterior ? "Außenwand" : "Innenwand"}</button></div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
                <thead><tr>{["Schicht","mm","kg/m³","GWP","VOC","λ",""].map((h,i) => <th key={i} style={{ fontSize: 7, color: "#475569", textAlign: i === 0 ? "left" : "right", padding: "3px 3px", borderBottom: "1px solid #334155" }}>{h}</th>)}</tr></thead>
                <tbody>{newTypeLayers.map((l, li) => (<tr key={li}>
                  {[{ k: "name", w: 110, type: "text" },{ k: "thickness", w: 45 },{ k: "density", w: 55 },{ k: "gwp", w: 45, step: .01 },{ k: "voc", w: 35 },{ k: "lambda", w: 45, step: .001 }].map(({ k, w, type, step }) => (
                    <td key={k} style={{ padding: "2px 2px" }}><input type={type || "number"} value={l[k]} step={step} onChange={e => updateNewLayer(li, k, e.target.value)} style={{ width: w, fontSize: 9, padding: "3px 4px", border: "1px solid #334155", borderRadius: 3, background: "#020617", color: "#e2e8f0", fontFamily: "monospace", textAlign: type === "text" ? "left" : "right" }} /></td>
                  ))}
                  <td style={{ padding: "2px" }}>{newTypeLayers.length > 1 && <button onClick={() => setNewTypeLayers(ls => ls.filter((_, i) => i !== li))} style={{ fontSize: 10, background: "none", border: "none", color: "#475569", cursor: "pointer" }}>×</button>}</td>
                </tr>))}</tbody>
              </table>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setNewTypeLayers(ls => [...ls, { name: `Schicht ${ls.length + 1}`, thickness: 15, density: 1000, gwp: 0.1, voc: 0, lambda: 0.5 }])} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "inherit" }}>+ Schicht</button>
                <button onClick={addNewWallType} disabled={!newTypeName.trim()} style={{ padding: "4px 14px", borderRadius: 3, border: "none", background: newTypeName.trim() ? "#22d3ee" : "#334155", color: "#020617", fontSize: 9, fontWeight: 700, cursor: newTypeName.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Erstellen</button>
                <button onClick={() => setShowNewType(false)} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>Abbrechen</button>
              </div>
            </div>}
          </Box>

          <Box style={{ gridColumn: "1/-1", padding: 0, overflow: "hidden" }}>
            <div style={{ fontSize: 10, color: "#475569", padding: "7px 10px", fontWeight: 600, letterSpacing: 1, borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between" }}><span>ÖKOBILANZ · GWP</span><span style={{ color: "#22d3ee", fontWeight: 400 }}>BNB 1.1.1</span></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <thead><tr style={{ background: "#1e293b" }}>{["Bauteil","Wandtyp","Fläche m²","GWP/m²","GWP ges. kg CO₂"].map((h,i) => <th key={i} style={{ padding: "4px 6px", textAlign: i < 2 ? "left" : "right", color: i === 4 ? "#22d3ee" : "#64748b", fontSize: 8 }}>{h}</th>)}</tr></thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #1e293b" }}><td style={{ padding: "3px 6px", color: "#cbd5e1", fontWeight: 600 }}>Außenwand</td><td style={{ padding: "3px 6px", color: extWT.color, fontSize: 8 }}>{extWT.name}</td><td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: "#64748b" }}>{extArea.toFixed(0)}</td><td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: extCalc.totalGWP < 0 ? "#22c55e" : "#f59e0b" }}>{extCalc.totalGWP.toFixed(2)}</td><td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#22d3ee" }}>{(extCalc.totalGWP * extArea).toFixed(0)}</td></tr>
                {wallTypes.filter(t => !t.isExterior).map(wt => { const ww = Object.entries(wallStates).filter(([_, ws]) => ws.active && ws.typeId === wt.id); if (!ww.length) return null; const c = calcWallType(wt), area = ww.length * 3.5 * 3.2 * 4;
                  return <tr key={wt.id} style={{ borderBottom: "1px solid #1e293b22" }}><td style={{ padding: "3px 6px", color: "#94a3b8" }}>Innenwand ({ww.length}×)</td><td style={{ padding: "3px 6px", color: wt.color, fontSize: 8 }}>{wt.name}</td><td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: "#64748b" }}>{area.toFixed(0)}</td><td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", color: c.totalGWP < 0 ? "#22c55e" : "#f59e0b" }}>{c.totalGWP.toFixed(2)}</td><td style={{ padding: "3px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#22d3ee" }}>{(c.totalGWP * area).toFixed(0)}</td></tr>;
                })}
                <tr style={{ borderTop: "2px solid #334155", background: "#0e749010" }}><td colSpan="4" style={{ padding: "4px 6px", fontWeight: 700, color: "#94a3b8" }}>∑ Gesamt</td><td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: "#22d3ee" }}>{totalGWP.toFixed(0)}</td></tr>
              </tbody>
            </table>
          </Box>
        </div>}
      </div>
      <style>{`input[type=range]{-webkit-appearance:none;background:#1e293b;border-radius:4px;outline:none}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#22d3ee;cursor:pointer;border:2px solid #020617}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}input[type=number]::-webkit-inner-spin-button{opacity:.3}`}</style>
    </div>
  );
}
