import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import * as OBC from "@thatopen/components";
import * as THREE from "three";

// CI palette tokens — kept as JS constants so we can pass them to SVG/Recharts attributes
// where CSS variables wouldn't resolve. Mirrors src/theme.css.
const CI = {
  coreBlue:      "#164194",
  brightHorizon: "#3973B9",
  icyBreeze:     "#A2D3F3",
  softSky:       "#D4E8F7",
  pulseRed:      "#EA5738",
  cloudGray:     "#E3E3E3",
  urbanAsh:      "#878787",
  deepVoid:      "#000000",
};

// SVG viewBox 0 0 500 250, outer rect x=5 y=5 w=490 h=240, strokeWidth=8 → inner edge ≈ 9/491/9/241
const EXT_SIDES = [
  { id: "nord", label: "Nord", x1: 9,   y1: 9,   x2: 491, y2: 9,   axis: "h", inward: 1  },
  { id: "sued", label: "Süd",  x1: 9,   y1: 241, x2: 491, y2: 241, axis: "h", inward: -1 },
  { id: "west", label: "West", x1: 9,   y1: 9,   x2: 9,   y2: 241, axis: "v", inward: 1  },
  { id: "ost",  label: "Ost",  x1: 491, y1: 9,   x2: 491, y2: 241, axis: "v", inward: -1 },
];
const INIT_EXT_WALLS = Object.fromEntries(EXT_SIDES.map(s => [s.id, { typeId: "aw1", bufferDepth: 0 }]));

// Floor palette — a top-down blue Verlauf (Core Blue → Soft Sky) with Urban Ash + Deep Void
// at the lower levels. Reads as sun-on-roof → ground.
const FLOORS = [
  { id: "dach", name: "Dach · PV",  color: CI.coreBlue,      short: "D" },
  { id: "4og",  name: "4. OG",       color: CI.brightHorizon, short: "4" },
  { id: "3og",  name: "3. OG",       color: CI.icyBreeze,     short: "3" },
  { id: "2og",  name: "2. OG",       color: CI.softSky,       short: "2" },
  { id: "1og",  name: "1. OG",       color: CI.urbanAsh,      short: "1" },
  { id: "eg",   name: "EG",          color: CI.deepVoid,      short: "E" },
];

const DEFAULT_WALL_TYPES = [
  { id: "aw1", name: "Außenwand (Bestand)", isExterior: true, color: CI.coreBlue,
    layers: [
      { name: "Kalkzementputz", thickness: 15, density: 1800, gwp: 0.14, voc: 5, lambda: 0.87 },
      { name: "Holzfaserdämmung", thickness: 200, density: 160, gwp: -0.80, voc: 2, lambda: 0.04 },
      { name: "Recycling-Ziegel", thickness: 240, density: 1900, gwp: 0.156, voc: 0, lambda: 0.68 },
      { name: "Lehmputz", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 },
    ],
  },
  { id: "iw1", name: "Innenwand (Lehm-Ständer)", isExterior: false, color: CI.urbanAsh,
    layers: [
      { name: "Lehmputz", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 },
      { name: "Holzständer + Dämmung", thickness: 100, density: 80, gwp: 0.08, voc: 1, lambda: 0.045 },
      { name: "Lehmputz", thickness: 15, density: 1600, gwp: 0.02, voc: 0, lambda: 0.91 },
    ],
  },
  { id: "aw2", name: "Außenwand (Holzrahmen-Zellulose)", isExterior: true, color: CI.brightHorizon,
    layers: [
      { name: "Holzfaser-Putzträgerplatte", thickness: 60, density: 180, gwp: -1.20, voc: 2, lambda: 0.042 },
      { name: "Holzständer + Zellulose", thickness: 240, density: 55, gwp: -1.40, voc: 1, lambda: 0.040 },
      { name: "OSB/3 (Aussteifung & Dampfbremse)", thickness: 15, density: 620, gwp: -0.95, voc: 8, lambda: 0.13 },
      { name: "Installationsebene + Mineralwolle", thickness: 60, density: 30, gwp: 1.16, voc: 3, lambda: 0.035 },
      { name: "Gipsfaserplatte", thickness: 15, density: 1180, gwp: 0.12, voc: 1, lambda: 0.32 },
    ],
  },
  { id: "aw3", name: "Außenwand (Stahlbeton + WDVS-EPS)", isExterior: true, color: CI.pulseRed,
    layers: [
      { name: "Silikatputz (mineralisch)", thickness: 8, density: 1700, gwp: 0.20, voc: 4, lambda: 0.87 },
      { name: "EPS-Hartschaum 035", thickness: 160, density: 20, gwp: 2.65, voc: 10, lambda: 0.035 },
      { name: "Stahlbeton C25/30", thickness: 200, density: 2400, gwp: 0.137, voc: 0, lambda: 2.30 },
      { name: "Gipsputz", thickness: 15, density: 1200, gwp: 0.13, voc: 2, lambda: 0.51 },
    ],
  },
  { id: "iw2", name: "Innenwand (Kalksandstein KS-12)", isExterior: false, color: CI.cloudGray,
    layers: [
      { name: "Gipsputz", thickness: 10, density: 1200, gwp: 0.13, voc: 2, lambda: 0.51 },
      { name: "Kalksandstein RDK 1.8", thickness: 175, density: 1800, gwp: 0.158, voc: 0, lambda: 0.99 },
      { name: "Gipsputz", thickness: 10, density: 1200, gwp: 0.13, voc: 2, lambda: 0.51 },
    ],
  },
  { id: "iw3", name: "Innenwand (GK-Metallständer F90)", isExterior: false, color: CI.icyBreeze,
    layers: [
      { name: "Gipskartonplatte (2× 12,5 mm)", thickness: 25, density: 900, gwp: 0.29, voc: 2, lambda: 0.21 },
      { name: "CW-Profil + Mineralwolle", thickness: 75, density: 18, gwp: 1.16, voc: 3, lambda: 0.035 },
      { name: "Gipskartonplatte (2× 12,5 mm)", thickness: 25, density: 900, gwp: 0.29, voc: 2, lambda: 0.21 },
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

function IFCViewer({ height = 280 }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const components = new OBC.Components();

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    world.scene.setup();
    world.scene.three.background = new THREE.Color('#FFFFFF');
    const dir = new THREE.DirectionalLight('#FFFFFF', 1.1);
    dir.position.set(5, 10, 5);
    world.scene.three.add(dir);

    components.init();

    // Remove the ThatOpen branding watermark
    container.querySelector('[data-thatopen-logo]')?.remove();

    async function load() {
      // v3: FragmentsManager must be initialized before IfcLoader
      const fragments = components.get(OBC.FragmentsManager);
      await fragments.init('/reallabor-twin/fragments-worker.mjs');

      const ifcLoader = components.get(OBC.IfcLoader);
      // autoSetWasm:false → use our local public/web-ifc*.wasm instead of
      // OBC's default unpkg fetch, which pulls a version-mismatched binary.
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: { path: '/reallabor-twin/', absolute: true },
      });

      const resp = await fetch('/reallabor-twin/models/building.ifc');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      // load(bytes, autoCoordinate, modelId, options) — modelId is required;
      // omitting it makes the fragments worker throw "Unsupported input type".
      const model = await ifcLoader.load(new Uint8Array(buffer), true, 'building');
      // FragmentsModel is a wrapper; the actual THREE.Object3D is model.object
      world.scene.three.add(model.object);

      // Bind LOD/culling to the camera and crank quality so all tiles load.
      model.useCamera(world.camera.three);
      model.graphicsQuality = 1;

      // Drive tile updates every frame so streaming keeps up with camera motion.
      world.renderer.onBeforeUpdate.add(() => fragments.core.update());
      await fragments.core.update(true);

      // model.box reads the stored bbox; use it for fitToBox once non-empty.
      const box = model.box;
      if (!box.isEmpty()) {
        world.camera.controls.fitToBox(box, true);
      }
      setLoading(false);
    }

    load().catch(err => { setError(err.message); setLoading(false); });

    return () => { components.dispose(); };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{ width: '100%', height, background: '#FFFFFF', borderRadius: 4, overflow: 'hidden' }} />
      {(loading || error) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: error ? '#EA5738' : '#878787', fontSize: 11, fontFamily: 'inherit', letterSpacing: 1,
          pointerEvents: 'none' }}>
          {error ? `FEHLER: ${error}` : 'IFC-DATEI WIRD GELADEN …'}
        </div>
      )}
    </div>
  );
}

// Top-down floor-plan view using @thatopen/components Views.createFromIfcStoreys.
// Spike: renders whatever the library defaults give us (ortho cam + clipping plane
// per IfcBuildingStorey). Phase B will add ClipEdges + Hider + Highlighter.
function IFCPlanView({ height = 360, selectedFloorId }) {
  const containerRef = useRef(null);
  const stateRef = useRef({ components: null, views: null, storeyViews: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [storeyIds, setStoreyIds] = useState([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const components = new OBC.Components();

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    world.scene.setup();
    world.scene.three.background = new THREE.Color('#0E0E10');
    const dir = new THREE.DirectionalLight('#D4E8F7', 0.9);
    dir.position.set(5, 10, 5);
    world.scene.three.add(dir);

    components.init();
    container.querySelector('[data-thatopen-logo]')?.remove();

    let disposed = false;
    async function load() {
      const fragments = components.get(OBC.FragmentsManager);
      await fragments.init('/reallabor-twin/fragments-worker.mjs');

      const ifcLoader = components.get(OBC.IfcLoader);
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: { path: '/reallabor-twin/', absolute: true },
      });

      const resp = await fetch('/reallabor-twin/models/building.ifc');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      const model = await ifcLoader.load(new Uint8Array(buffer), true, 'planview');
      if (disposed) return;

      world.scene.three.add(model.object);
      model.useCamera(world.camera.three);
      model.graphicsQuality = 1;
      world.renderer.onBeforeUpdate.add(() => fragments.core.update());
      await fragments.core.update(true);

      const views = components.get(OBC.Views);
      views.world = world;
      const created = await views.createFromIfcStoreys();
      console.log('[IFCPlanView] createFromIfcStoreys →', created.map(v => v.id));

      stateRef.current = { components, views, storeyViews: created };
      setStoreyIds(created.map(v => v.id));
      setLoading(false);
    }

    load().catch(err => {
      console.error('[IFCPlanView]', err);
      setError(err.message);
      setLoading(false);
    });

    return () => { disposed = true; components.dispose(); };
  }, []);

  // Open the storey view that best matches selectedFloorId (e.g. '1og').
  useEffect(() => {
    const { views, storeyViews } = stateRef.current;
    if (!views || !storeyViews?.length || !selectedFloorId) return;
    const want = selectedFloorId.toLowerCase();
    const match =
      storeyViews.find(v => v.id.toLowerCase().includes(want)) ??
      storeyViews.find(v => v.id.toLowerCase().includes(want.replace('og', ''))) ??
      storeyViews[0];
    views.close();
    views.open(match.id);
  }, [selectedFloorId, storeyIds]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{ width: '100%', height, background: '#0E0E10', borderRadius: 4, overflow: 'hidden' }} />
      {(loading || error) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: error ? '#EA5738' : '#878787', fontSize: 11, fontFamily: 'inherit', letterSpacing: 1,
          pointerEvents: 'none' }}>
          {error ? `FEHLER: ${error}` : 'IFC-PLANANSICHT WIRD GELADEN …'}
        </div>
      )}
      {!loading && !error && storeyIds.length > 0 && (
        <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, color: '#878787',
          background: 'rgba(0,0,0,.55)', padding: '2px 6px', borderRadius: 2,
          fontFamily: 'inherit', letterSpacing: 0.5, pointerEvents: 'none' }}>
          {storeyIds.length} Geschoss{storeyIds.length === 1 ? '' : 'e'} · IFC
        </div>
      )}
    </div>
  );
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

/* ═══ BRAND MARK ═══ */
// 4-circle Signet per Handbuch page 4: hexagonal close-pack — two circles touching
// horizontally on top, two touching horizontally on bottom, bottom pair shifted right
// by half a diameter so the cleft (negative space) sits in the lower-left.
const Signet = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-label="RZZ Signet" role="img">
    <circle cx="15" cy="23" r="11" fill={color} />
    <circle cx="37" cy="23" r="11" fill={color} />
    <circle cx="26" cy="42" r="11" fill={color} />
    <circle cx="48" cy="42" r="11" fill={color} />
  </svg>
);

const ThemeToggle = ({ theme, setTheme }) => (
  <button
    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    title={theme === "light" ? "Dunkelmodus" : "Hellmodus"}
    style={{ background: "transparent", border: "1px solid var(--rzz-border)", borderRadius: 4, padding: "3px 7px", color: "var(--rzz-text)", cursor: "pointer", fontSize: 11, lineHeight: 1, fontFamily: "inherit" }}>
    {theme === "light" ? "☾" : "☀"}
  </button>
);

/* ═══ COMPONENTS ═══ */
const Gauge = ({ value, max, label, unit, color, warn }) => {
  const pct = Math.min(100, (value / max) * 100);
  const bad = warn && value > warn;
  return (
    <div style={{ textAlign: "center", minWidth: 56 }}>
      <div style={{ position: "relative", width: 46, height: 46, margin: "0 auto" }}>
        <svg viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--rzz-border)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={bad ? CI.pulseRed : color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: bad ? CI.pulseRed : "var(--rzz-text)" }}>{value}</div>
      </div>
      <div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginTop: 2, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 8, color: "var(--rzz-text-mute)" }}>{unit}</div>
    </div>
  );
};

const Box = ({ children, style }) => <div style={{ background: "var(--rzz-surface)", borderRadius: 8, padding: 10, border: "1px solid var(--rzz-border)", ...style }}>{children}</div>;
const Lbl = ({ children, style }) => <div style={{ fontSize: 10, color: "var(--rzz-text-dim)", marginBottom: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", ...style }}>{children}</div>;

/* ═══ FLOOR PLANS ═══ */
function EGPlan({ tick }) {
  const c = CI.coreBlue;
  return (
    <svg viewBox="0 0 500 250" style={{ width: "100%", background: "var(--rzz-surface-inset)" }}>
      <rect x="5" y="5" width="490" height="240" fill="none" stroke={c} strokeWidth="8" />
      <rect x="120" y="8" width="80" height="100" fill="none" stroke={c} strokeWidth="5" />
      {[30,40,50,60,70].map(y=><line key={y} x1="135" y1={y} x2="175" y2={y} stroke={c+"44"} strokeWidth=".8"/>)}
      <rect x="155" y="72" width="20" height="20" fill="none" stroke={c} strokeWidth="2" />
      <path d="M120 45 A20 20 0 0 1 100 65" fill="none" stroke={c+"44"} strokeWidth="1"/>
      {[50,90,220,270,320,370,420].map((x,i)=><rect key={i} x={x} y="2" width="30" height="6" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[50,120,190,260,330,400,460].map((x,i)=><rect key={`b${i}`} x={x} y="242" width="30" height="6" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[40,100,160].map((y,i)=><rect key={`l${i}`} x="2" y={y} width="6" height="25" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[40,100,160].map((y,i)=><rect key={`r${i}`} x="492" y={y} width="6" height="25" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[160,250,340,430].flatMap(x=>[80,150,220].map(y=><rect key={`${x}${y}`} x={x-4} y={y-4} width="8" height="8" fill={c} opacity=".5"/>))}
      <circle cx="300" cy="130" r="4" fill={CI.brightHorizon} opacity={.5+.5*Math.sin(tick*.3)}><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/></circle>
      <text x="300" y="200" textAnchor="middle" fill={c} opacity=".35" fontSize="12" style={{ fontFamily: "'Geist Variable', sans-serif", fontWeight: 600 }}>GEB. 42 · FOYER / AUSSTELLUNG</text>
    </svg>
  );
}

function OGPlan({ tick, wallStates, wallTypes, onWallClick, floor, selectedWallId, extWalls, selectedExtSide, onExtSideClick }) {
  const c = floor.color;
  return (
    <svg viewBox="0 0 500 250" style={{ width: "100%", background: "var(--rzz-surface-inset)" }}>
      {EXT_SIDES.map(s => {
        const ew = extWalls[s.id];
        const wt = wallTypes.find(t => t.id === ew.typeId) || wallTypes.find(t => t.isExterior);
        const col = wt ? wt.color : c;
        const isSel = selectedExtSide === s.id;
        const bd = ew.bufferDepth;
        const bufRect = bd > 0 ? (s.axis === "h"
          ? { x: 9, y: s.inward > 0 ? 9 : 241 - bd, w: 482, h: bd }
          : { x: s.inward > 0 ? 9 : 491 - bd, y: 9, w: bd, h: 232 }) : null;
        const bufLine = bd > 0 ? (s.axis === "h"
          ? { x1: 9, y1: s.inward > 0 ? 9 + bd : 241 - bd, x2: 491, y2: s.inward > 0 ? 9 + bd : 241 - bd }
          : { x1: s.inward > 0 ? 9 + bd : 491 - bd, y1: 9, x2: s.inward > 0 ? 9 + bd : 491 - bd, y2: 241 }) : null;
        return (
          <g key={s.id} onClick={() => onExtSideClick(s.id)} style={{ cursor: "pointer" }}>
            {bufRect && <rect x={bufRect.x} y={bufRect.y} width={bufRect.w} height={bufRect.h} fill={col} opacity=".10" />}
            {bufLine && <line x1={bufLine.x1} y1={bufLine.y1} x2={bufLine.x2} y2={bufLine.y2} stroke={col} strokeWidth="2" strokeDasharray="6 3" opacity=".7" />}
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={isSel ? CI.pulseRed : col} strokeWidth={isSel ? 12 : 8} />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth="18" />
          </g>
        );
      })}
      <rect x="120" y="8" width="80" height="120" fill="none" stroke={c} strokeWidth="5" />
      {[25,35,45,55,65,75].map((y,i)=><line key={i} x1="135" y1={y} x2="175" y2={y} stroke={c+"44"} strokeWidth=".8"/>)}
      <rect x="155" y="85" width="20" height="20" fill="none" stroke={c} strokeWidth="2" />
      <path d="M120 60 A15 15 0 0 1 105 75" fill="none" stroke={c+"44"} strokeWidth="1"/>
      <path d="M120 90 A15 15 0 0 0 105 75" fill="none" stroke={c+"44"} strokeWidth="1"/>
      {[15,45,75,215,255,295,335,375,415,455].map((x,i)=><rect key={i} x={x} y="2" width="22" height="6" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[15,55,95,135,175,215,255,295,335,375,415,455].map((x,i)=><rect key={`b${i}`} x={x} y="242" width="22" height="6" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[15,60,140,185].map((y,i)=><rect key={`l${i}`} x="2" y={y} width="6" height="20" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {[15,60,140,185].map((y,i)=><rect key={`r${i}`} x="492" y={y} width="6" height="20" fill={CI.softSky} stroke={CI.icyBreeze} strokeWidth=".5" rx="1"/>)}
      {OG_WALLS_INIT.map(w => {
        const ws = wallStates[w.id]; if (!ws) return null;
        let x1 = w.x1+5, y1 = w.y1, x2 = w.x2+5, y2 = w.y2;
        const bn = extWalls.nord.bufferDepth, bs = extWalls.sued.bufferDepth, bw = extWalls.west.bufferDepth, bo = extWalls.ost.bufferDepth;
        if (bn > 0) { if (y1 <= 10) y1 = 9 + bn; if (y2 <= 10) y2 = 9 + bn; }
        if (bs > 0) { if (y1 >= 230) y1 = 241 - bs; if (y2 >= 230) y2 = 241 - bs; }
        if (bw > 0) { if (x1 <= 9) x1 = 9 + bw; if (x2 <= 9) x2 = 9 + bw; }
        if (bo > 0) { if (x1 >= 490) x1 = 491 - bo; if (x2 >= 490) x2 = 491 - bo; }
        if (Math.abs(x2 - x1) < 2 && Math.abs(y2 - y1) < 2) return null;
        const on = ws.active, wt = wallTypes.find(t => t.id === ws.typeId), col = wt ? wt.color : c, isSel = selectedWallId === w.id;
        const showHighlight = isSel && on;
        const strokeCol = showHighlight ? CI.pulseRed : (on ? col : col+"33");
        return (<g key={w.id} onClick={() => onWallClick(w.id)} style={{ cursor: "pointer" }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={on?(showHighlight?5:3):1} strokeDasharray={on?"none":"5 4"}/>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="14"/>
        </g>);
      })}
      <circle cx="300" cy="70" r="3" fill={CI.brightHorizon} opacity={.5+.5*Math.sin(tick*.3)}><animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite"/></circle>
    </svg>
  );
}

function RoofPlan({ pvDachOn, onTogglePvDach, pvFreiraumOn, onTogglePvFreiraum, tick }) {
  const sh = .3 + .7 * Math.max(0, Math.sin(((tick * .5) % 24 - 6) / 12 * Math.PI));
  return (
    <svg viewBox="0 0 500 340" style={{ width: "100%", background: "var(--rzz-surface-inset)" }}>
      {/* Dach PV — Core Blue → Icy Breeze, blue-on-blue per Verlauf */}
      <defs>
        <linearGradient id="pvDachGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={CI.coreBlue} />
          <stop offset="100%" stopColor={CI.icyBreeze} />
        </linearGradient>
        <linearGradient id="pvFreiGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={CI.brightHorizon} />
          <stop offset="100%" stopColor={CI.softSky} />
        </linearGradient>
      </defs>
      <text x="250" y="16" textAnchor="middle" fill={CI.coreBlue} fontSize="10" fontWeight="700" style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: 1 }}>GEB. 42 · DACH</text>
      <rect x="5" y="22" width="490" height="130" fill="none" stroke={CI.coreBlue} strokeWidth="3" strokeDasharray={pvDachOn ? "none" : "6 4"} rx="4" />
      <rect x="440" y="26" width="50" height="18" rx="3" fill={pvDachOn ? CI.coreBlue : "transparent"} stroke={pvDachOn ? CI.coreBlue : CI.urbanAsh} strokeWidth="1" cursor="pointer" onClick={onTogglePvDach} />
      <text x="465" y="38" textAnchor="middle" fill={pvDachOn ? "#FFFFFF" : CI.urbanAsh} fontSize="8" fontWeight="700" style={{ cursor: "pointer", pointerEvents: "none", fontFamily: "'Geist Variable', sans-serif" }}>{pvDachOn ? "AN" : "AUS"}</text>
      {pvDachOn && Array.from({ length: 3 }, (_, r) => Array.from({ length: 12 }, (_, cc) => {
        const x = 15 + cc * 39, y = 28 + r * 38;
        return <rect key={`d${r}${cc}`} x={x} y={y} width="36" height="35" rx="1" fill="url(#pvDachGrad)" opacity={sh * .85} stroke={CI.coreBlue} strokeWidth=".5" />;
      })).flat()}
      {!pvDachOn && <text x="230" y="90" textAnchor="middle" fill={CI.urbanAsh} fontSize="11" style={{ fontFamily: "'Geist Variable', sans-serif" }}>PV Dach deaktiviert</text>}

      {/* Freiraum PV */}
      <text x="250" y="175" textAnchor="middle" fill={CI.brightHorizon} fontSize="10" fontWeight="700" style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: 1 }}>FREIRAUM · PV-FELD</text>
      <rect x="5" y="182" width="490" height="150" fill="none" stroke={CI.brightHorizon} strokeWidth="3" strokeDasharray={pvFreiraumOn ? "none" : "6 4"} rx="4" />
      <rect x="440" y="186" width="50" height="18" rx="3" fill={pvFreiraumOn ? CI.brightHorizon : "transparent"} stroke={pvFreiraumOn ? CI.brightHorizon : CI.urbanAsh} strokeWidth="1" cursor="pointer" onClick={onTogglePvFreiraum} />
      <text x="465" y="198" textAnchor="middle" fill={pvFreiraumOn ? "#FFFFFF" : CI.urbanAsh} fontSize="8" fontWeight="700" style={{ pointerEvents: "none", fontFamily: "'Geist Variable', sans-serif" }}>{pvFreiraumOn ? "AN" : "AUS"}</text>
      {pvFreiraumOn && Array.from({ length: 4 }, (_, r) => Array.from({ length: 12 }, (_, cc) => {
        const x = 15 + cc * 39, y = 190 + r * 34;
        return <rect key={`f${r}${cc}`} x={x} y={y} width="36" height="31" rx="1" fill="url(#pvFreiGrad)" opacity={sh * .85} stroke={CI.brightHorizon} strokeWidth=".5" />;
      })).flat()}
      {!pvFreiraumOn && <text x="230" y="260" textAnchor="middle" fill={CI.urbanAsh} fontSize="11" style={{ fontFamily: "'Geist Variable', sans-serif" }}>PV Freiraum deaktiviert</text>}
    </svg>
  );
}

function WallSectionVis({ wt }) {
  const total = wt.layers.reduce((s, l) => s + l.thickness, 0);
  // Material-honest neutrals (plaster / insulation / brick / clay) — desaturated so the brand colors stay distinct.
  const cols = ["#E3E3E3","#D4E8F7","#A2D3F3","#FFFFFF","#878787","#3973B9","#B4B4B4","#164194"];
  return (
    <div style={{ display: "flex", height: 72, borderRadius: 4, overflow: "hidden", border: "1px solid var(--rzz-border)" }}>
      {wt.layers.map((l, i) => (
        <div key={i} style={{ width: `${(l.thickness / total) * 100}%`, background: cols[i % cols.length], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 7, color: CI.deepVoid, fontWeight: 700, borderRight: i < wt.layers.length - 1 ? `1px solid ${CI.urbanAsh}33` : "none", minWidth: 6 }}>
          <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 7, maxHeight: 55, overflow: "hidden" }}>{l.name}</span>
          <span className="rzz-mono">{l.thickness}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ HERMANN LIVE VIEW — pastel dashboard per HermannSuggestion.jpg ═══ */
const H = {
  bg:        "#F7F6F2",
  card:      "#FFFFFF",
  border:    "#EAE8E0",
  borderSoft:"#F0EEE6",
  text:      "#1F2937",
  textDim:   "#6B7280",
  textMute:  "#A8ABB0",
  tintCream: "#FBF1D9",
  tintCreamD:"#F7E7BF",
  tintBlue:  "#E9EFF7",
  tintBlueD: "#D8E2F1",
  tintGreen: "#E9F0E8",
  tintGreenD:"#D6E3D4",
  tintGray:  "#F2F1ED",
  blue:      "#4F7BC4",
  blueDark:  "#345893",
  green:     "#7AAA82",
  greenDark: "#5C8C66",
  amber:     "#D9A642",
  amberDark: "#B7841F",
};

const IconPV = ({ size = 22, color = H.blueDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="13" rx="1.5"/>
    <line x1="3" y1="9.3" x2="21" y2="9.3"/>
    <line x1="3" y1="13.6" x2="21" y2="13.6"/>
    <line x1="9" y1="5" x2="9" y2="18"/>
    <line x1="15" y1="5" x2="15" y2="18"/>
    <line x1="8" y1="20" x2="16" y2="20"/>
  </svg>
);
const IconSun = ({ size = 22, color = H.blueDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4"/>
  </svg>
);
const IconBattery = ({ size = 22, color = H.greenDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="16" height="10" rx="1.5"/>
    <line x1="21" y1="10" x2="21" y2="14"/>
    <line x1="11" y1="10" x2="11" y2="14"/>
    <line x1="9" y1="12" x2="13" y2="12"/>
  </svg>
);
const IconThermo = ({ size = 22, color = H.blueDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4.5a2 2 0 0 0-4 0v10.2a4 4 0 1 0 4 0Z"/>
    <circle cx="12" cy="17" r="1.4" fill={color}/>
  </svg>
);
const IconFan = ({ size = 22, color = H.greenDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="1.8"/>
    <path d="M12 4.5c2 0 3 1.5 3 3 0 1.7-1.3 3.5-3 4.5-1.7-1-3-2.8-3-4.5 0-1.5 1-3 3-3Z"/>
    <path d="M19.5 12c0 2-1.5 3-3 3-1.7 0-3.5-1.3-4.5-3 1-1.7 2.8-3 4.5-3 1.5 0 3 1 3 3Z"/>
    <path d="M12 19.5c-2 0-3-1.5-3-3 0-1.7 1.3-3.5 3-4.5 1.7 1 3 2.8 3 4.5 0 1.5-1 3-3 3Z"/>
    <path d="M4.5 12c0-2 1.5-3 3-3 1.7 0 3.5 1.3 4.5 3-1 1.7-2.8 3-4.5 3-1.5 0-3-1-3-3Z"/>
  </svg>
);
const IconDrop = ({ size = 22, color = H.greenDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 7 10c-1.5 2-1.5 5 0 7s4 2.5 5 2.5 3.5-.5 5-2.5 1.5-5 0-7L12 3Z"/>
  </svg>
);
const IconCloud = ({ size = 22, color = H.blueDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 6 19h11.5Z"/>
  </svg>
);
const IconWaves = ({ size = 22, color = H.amberDark }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>
    <path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>
  </svg>
);
const IconPlug = ({ size = 22, color = H.textMute }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="6" width="14" height="13" rx="2"/>
    <line x1="9" y1="3" x2="9" y2="6"/>
    <line x1="15" y1="3" x2="15" y2="6"/>
    <line x1="11" y1="13" x2="13" y2="13"/>
  </svg>
);

function hArc(cx, cy, r, startDeg, endDeg) {
  const polar = (deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const s = polar(startDeg), e = polar(endDeg);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

const HermannGauge = ({ value, max, label, unit, color, bg, Icon }) => {
  const num = Number(value);
  const pct = Math.min(100, Math.max(0, (num / Math.max(max, 1)) * 100));
  const startDeg = 135, sweep = 270;
  const trackPath = hArc(40, 40, 30, startDeg, startDeg + sweep);
  const fillPath = pct > 0 ? hArc(40, 40, 30, startDeg, startDeg + (sweep * pct / 100)) : null;
  return (
    <div style={{ background: bg, borderRadius: 14, padding: "16px 14px 14px", border: `1px solid ${H.borderSoft}`, display: "flex", flexDirection: "column", alignItems: "stretch", minWidth: 0, position: "relative" }}>
      <div style={{ position: "absolute", top: 14, left: 14 }}><Icon size={30} color={color} /></div>
      <div style={{ width: 96, height: 96, margin: "4px auto 6px", position: "relative" }}>
        <svg width="96" height="96" viewBox="0 0 80 80">
          <path d={trackPath} stroke="#E3E0D6" strokeWidth="5.5" strokeLinecap="round" fill="none" />
          {fillPath && <path d={fillPath} stroke={color} strokeWidth="5.5" strokeLinecap="round" fill="none" style={{ transition: "d 0.8s" }} />}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: H.text, letterSpacing: -0.3 }}>{value}</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: H.text, fontWeight: 500, marginTop: 2 }}>{label}</div>
      <div style={{ textAlign: "center", fontSize: 11, color: H.textDim, marginTop: 1 }}>{unit}</div>
    </div>
  );
};

/* Pastel boxes inside the energy-flow card */
const HSrcCard = ({ Icon, label, value }) => (
  <div style={{ background: H.tintBlue, borderRadius: 12, padding: "10px 14px", border: `1px solid ${H.borderSoft}`, display: "flex", alignItems: "center", gap: 12 }}>
    <Icon size={26} color={H.blueDark} />
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
      <span style={{ fontSize: 12, color: H.textDim, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, color: H.text, fontWeight: 700, marginTop: 2 }}>{value}</span>
    </div>
  </div>
);

const HBigCard = ({ label, value, unit, tint, valueColor, labelColor }) => (
  <div style={{ background: tint, borderRadius: 12, padding: "14px 12px", border: `1px solid ${H.borderSoft}`, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 96 }}>
    <div style={{ fontSize: 13, color: labelColor || H.textDim, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 34, fontWeight: 700, color: valueColor || H.text, letterSpacing: -0.5, lineHeight: 1.05, marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 12, color: H.textDim, marginTop: 2 }}>{unit}</div>
  </div>
);

const HSocCard = ({ label, value, unit, soc, socColor }) => (
  <div style={{ background: H.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${H.borderSoft}`, textAlign: "center" }}>
    <div style={{ fontSize: 12, color: H.textDim, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 19, color: H.text, fontWeight: 700, marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: 11, color: H.textDim }}>{unit}</div>
    <div style={{ height: 4, background: "#E5E3DC", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, soc))}%`, height: "100%", background: socColor, borderRadius: 2, transition: "width .8s" }} />
    </div>
  </div>
);

function HermannEnergyFlow({ d, p, autarky }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "175px 1fr 1fr 1fr", gap: 16, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
        <HSrcCard Icon={IconPV} label="PV Dach" value={`${d.pvDach} kW`} />
        <HSrcCard Icon={IconSun} label="PV Freiraum" value={`${d.pvFrei} kW`} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <HBigCard label="Geb. 42" value={d.con42} unit="kW" tint={H.tintGreen} />
        <HSocCard label="El. Speicher" value={`${d.elStored}/${p.batteryEl}`} unit="kWh" soc={d.elSOC} socColor={H.textMute} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <HBigCard label="Geb. 52/53" value={d.con52} unit="kW" tint={H.tintBlue} />
        <HSocCard label="Th. Speicher" value={`${d.thStored}/${p.batteryTh}`} unit="kWh" soc={d.thSOC} socColor={H.blue} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <HBigCard label="Netzbezug" value={d.grid} unit="kW" tint={H.tintCream} valueColor={H.amberDark} labelColor={H.amberDark} />
        <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
          <div style={{ fontSize: 10, color: H.textDim, letterSpacing: 1.8, fontWeight: 600 }}>AUTARKIE</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: H.greenDark, marginTop: 4, letterSpacing: -0.5 }}>{autarky.toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}

const HCard = ({ children, style }) => (
  <div style={{ background: H.card, borderRadius: 14, padding: 18, border: `1px solid ${H.border}`, ...style }}>{children}</div>
);
const HTitle = ({ children, style }) => (
  <div style={{ fontSize: 11, color: H.textDim, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, ...style }}>{children}</div>
);

/* ═══ ENERGY FLOW ═══
   Sankey-style left → right: sources (left) → consumers (middle) → grid (right),
   with storages directly below their associated building. Pulse Red is reserved
   for the alert state on Netzbezug (grid draw > 50% of consumption) and the
   Autarkie KPI (< 50%). Everything else is brand blue or Urban Ash neutral.
*/
function EnergyFlow({ d, p, tick, pvDachOn, pvFreiraumOn }) {
  const pu = Math.sin(tick * .3) * .5 + .5;
  const autarky = d.conTotal > 0 ? Math.min(100, ((1 - d.grid / d.conTotal) * 100)) : 100;
  const gridAlert = d.grid > Math.max(2, 0.5 * d.conTotal);
  const autAlert = autarky < 50;

  // Geometry — 520×160 viewBox, three columns
  const SRC_X = 8, SRC_W = 88;             // sources column
  const CON_X1 = 160, CON_X2 = 268, CON_W = 88; // consumer columns
  const STO_W = 88;
  const GRID_X = 408, GRID_W = 104;         // grid column
  const ROW1_Y = 4,  ROW1_H = 28;           // PV Dach + Geb.42/52 + Netz
  const ROW2_Y = 38, ROW2_H = 28;           // PV Freir.
  const ROW3_Y = 78, ROW3_H = 34;           // Storages

  return (
    <svg viewBox="0 0 520 160" preserveAspectRatio="xMidYMid meet"
         style={{ width: "100%", maxWidth: 720, display: "block", margin: "0 auto" }}>
      {/* ─── SOURCES (col A) ─── */}
      <rect x={SRC_X} y={ROW1_Y} width={SRC_W} height={ROW1_H} rx="4"
            fill={pvDachOn ? CI.coreBlue : "transparent"}
            stroke={pvDachOn ? CI.coreBlue : CI.urbanAsh} strokeWidth="1"
            opacity={pvDachOn ? .9 + pu * .1 : .5} />
      <text x={SRC_X + SRC_W/2} y={ROW1_Y + 12} textAnchor="middle"
            fill={pvDachOn ? "#FFFFFF" : CI.urbanAsh} fontSize="8" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>PV Dach</text>
      <text x={SRC_X + SRC_W/2} y={ROW1_Y + 24} textAnchor="middle"
            fill={pvDachOn ? "#FFFFFF" : CI.urbanAsh} fontSize="11" fontWeight="800" className="rzz-mono">{d.pvDach} kW</text>

      <rect x={SRC_X} y={ROW2_Y} width={SRC_W} height={ROW2_H} rx="4"
            fill={pvFreiraumOn ? CI.brightHorizon : "transparent"}
            stroke={pvFreiraumOn ? CI.brightHorizon : CI.urbanAsh} strokeWidth="1"
            opacity={pvFreiraumOn ? .9 + pu * .1 : .5} />
      <text x={SRC_X + SRC_W/2} y={ROW2_Y + 12} textAnchor="middle"
            fill={pvFreiraumOn ? "#FFFFFF" : CI.urbanAsh} fontSize="8" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>PV Freiraum</text>
      <text x={SRC_X + SRC_W/2} y={ROW2_Y + 24} textAnchor="middle"
            fill={pvFreiraumOn ? "#FFFFFF" : CI.urbanAsh} fontSize="11" fontWeight="800" className="rzz-mono">{d.pvFrei} kW</text>

      {/* ─── CONSUMERS (col B) ─── */}
      {/* Geb. 42 — peer of Geb. 52/53, same fill */}
      <rect x={CON_X1} y={ROW1_Y} width={CON_W} height={ROW1_H + ROW2_H + (ROW2_Y - ROW1_Y - ROW1_H)} rx="4"
            fill={CI.icyBreeze} stroke={CI.brightHorizon} strokeWidth="1" />
      <text x={CON_X1 + CON_W/2} y={ROW1_Y + 14} textAnchor="middle"
            fill={CI.deepVoid} fontSize="9" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>Geb. 42</text>
      <text x={CON_X1 + CON_W/2} y={ROW1_Y + 38} textAnchor="middle"
            fill={CI.coreBlue} fontSize="14" fontWeight="800" className="rzz-mono">{d.con42}</text>
      <text x={CON_X1 + CON_W/2} y={ROW1_Y + 54} textAnchor="middle"
            fill={CI.urbanAsh} fontSize="8" className="rzz-mono">kW</text>

      {/* Geb. 52/53 — peer of Geb. 42, same fill */}
      <rect x={CON_X2} y={ROW1_Y} width={CON_W} height={ROW1_H + ROW2_H + (ROW2_Y - ROW1_Y - ROW1_H)} rx="4"
            fill={CI.icyBreeze} stroke={CI.brightHorizon} strokeWidth="1" />
      <text x={CON_X2 + CON_W/2} y={ROW1_Y + 14} textAnchor="middle"
            fill={CI.deepVoid} fontSize="9" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>Geb. 52/53</text>
      <text x={CON_X2 + CON_W/2} y={ROW1_Y + 38} textAnchor="middle"
            fill={CI.coreBlue} fontSize="14" fontWeight="800" className="rzz-mono">{d.con52}</text>
      <text x={CON_X2 + CON_W/2} y={ROW1_Y + 54} textAnchor="middle"
            fill={CI.urbanAsh} fontSize="8" className="rzz-mono">kW</text>

      {/* ─── STORAGES (col B, row 3) ─── */}
      <rect x={CON_X1} y={ROW3_Y} width={STO_W} height={ROW3_H} rx="4"
            fill={CI.softSky} stroke={CI.urbanAsh} strokeWidth="1" />
      <text x={CON_X1 + STO_W/2} y={ROW3_Y + 11} textAnchor="middle"
            fill={CI.deepVoid} fontSize="8" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>El. Speicher</text>
      <text x={CON_X1 + STO_W/2} y={ROW3_Y + 24} textAnchor="middle"
            fill={CI.deepVoid} fontSize="10" fontWeight="800" className="rzz-mono">{d.elStored}/{p.batteryEl}</text>
      <rect x={CON_X1 + 4} y={ROW3_Y + 28} width={STO_W - 8} height="3" rx="1.5" fill={CI.urbanAsh} opacity=".3"/>
      <rect x={CON_X1 + 4} y={ROW3_Y + 28} width={Math.max(0, d.elSOC * (STO_W - 8) / 100)} height="3" rx="1.5"
            fill={d.elSOC > 20 ? CI.coreBlue : CI.pulseRed}/>

      <rect x={CON_X2} y={ROW3_Y} width={STO_W} height={ROW3_H} rx="4"
            fill={CI.softSky} stroke={CI.urbanAsh} strokeWidth="1" />
      <text x={CON_X2 + STO_W/2} y={ROW3_Y + 11} textAnchor="middle"
            fill={CI.deepVoid} fontSize="8" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>Th. Speicher</text>
      <text x={CON_X2 + STO_W/2} y={ROW3_Y + 24} textAnchor="middle"
            fill={CI.deepVoid} fontSize="10" fontWeight="800" className="rzz-mono">{d.thStored}/{p.batteryTh}</text>
      <rect x={CON_X2 + 4} y={ROW3_Y + 28} width={STO_W - 8} height="3" rx="1.5" fill={CI.urbanAsh} opacity=".3"/>
      <rect x={CON_X2 + 4} y={ROW3_Y + 28} width={Math.max(0, d.thSOC * (STO_W - 8) / 100)} height="3" rx="1.5"
            fill={d.thSOC > 20 ? CI.coreBlue : CI.pulseRed}/>

      {/* ─── GRID (col C) ─── */}
      <rect x={GRID_X} y={ROW1_Y} width={GRID_W} height={ROW1_H + ROW2_H + (ROW2_Y - ROW1_Y - ROW1_H)} rx="4"
            fill="var(--rzz-surface-2)"
            stroke={gridAlert ? CI.pulseRed : CI.urbanAsh} strokeWidth={gridAlert ? 1.5 : 1} />
      <text x={GRID_X + GRID_W/2} y={ROW1_Y + 14} textAnchor="middle"
            fill={gridAlert ? CI.pulseRed : "var(--rzz-text-dim)"} fontSize="9" fontWeight="700"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: .5 }}>Netzbezug</text>
      <text x={GRID_X + GRID_W/2} y={ROW1_Y + 38} textAnchor="middle"
            fill={gridAlert ? CI.pulseRed : "var(--rzz-text)"} fontSize="14" fontWeight="800" className="rzz-mono">{d.grid}</text>
      <text x={GRID_X + GRID_W/2} y={ROW1_Y + 54} textAnchor="middle"
            fill={CI.urbanAsh} fontSize="8" className="rzz-mono">kW</text>

      {/* ─── AUTARKIE KPI (col C, lower) ─── */}
      <text x={GRID_X + GRID_W/2} y={ROW3_Y + 4} textAnchor="middle"
            fill={CI.urbanAsh} fontSize="8" fontWeight="600"
            style={{ fontFamily: "'Geist Variable', sans-serif", letterSpacing: 1.5 }}>AUTARKIE</text>
      <text x={GRID_X + GRID_W/2} y={ROW3_Y + 28} textAnchor="middle"
            fill={autAlert ? CI.pulseRed : CI.coreBlue} fontSize="22" fontWeight="800" className="rzz-mono">{autarky.toFixed(0)}%</text>

      {/* ─── FLOW LINES ─── */}
      {/* PV Dach → Geb. 42 (right-down to consumer-left-edge midpoint at y=33) */}
      {d.pvDach > .3 && (
        <line x1={SRC_X + SRC_W} y1={ROW1_Y + ROW1_H/2} x2={CON_X1} y2={ROW1_Y + (ROW2_Y + ROW2_H - ROW1_Y) / 2}
              stroke={CI.coreBlue} strokeWidth={1.5 + d.pvDach / 8} strokeDasharray="4 3" opacity={.6 + pu * .3}>
          <animate attributeName="stroke-dashoffset" from="14" to="0" dur=".7s" repeatCount="indefinite"/>
        </line>
      )}
      {/* PV Freir. → Geb. 42 (right-up) */}
      {d.pvFrei > .3 && (
        <line x1={SRC_X + SRC_W} y1={ROW2_Y + ROW2_H/2} x2={CON_X1} y2={ROW1_Y + (ROW2_Y + ROW2_H - ROW1_Y) / 2}
              stroke={CI.brightHorizon} strokeWidth={1.5 + d.pvFrei / 8} strokeDasharray="4 3" opacity={.6 + pu * .3}>
          <animate attributeName="stroke-dashoffset" from="14" to="0" dur=".8s" repeatCount="indefinite"/>
        </line>
      )}
      {/* Geb. 42 → Geb. 52/53 (right, between consumer columns) */}
      <line x1={CON_X1 + CON_W} y1={ROW1_Y + (ROW2_Y + ROW2_H - ROW1_Y) / 2}
            x2={CON_X2} y2={ROW1_Y + (ROW2_Y + ROW2_H - ROW1_Y) / 2}
            stroke={CI.urbanAsh} strokeWidth="1.5" strokeDasharray="4 3" opacity={.5 + pu * .3}>
        <animate attributeName="stroke-dashoffset" from="14" to="0" dur=".9s" repeatCount="indefinite"/>
      </line>
      {/* Geb. 52/53 → Netzbezug — middle of Netzbezug's left side */}
      <line x1={CON_X2 + CON_W} y1={ROW1_Y + (ROW2_Y + ROW2_H - ROW1_Y) / 2}
            x2={GRID_X} y2={ROW1_Y + (ROW2_Y + ROW2_H - ROW1_Y) / 2}
            stroke={gridAlert ? CI.pulseRed : CI.urbanAsh}
            strokeWidth={gridAlert ? (1.5 + d.grid / 6) : 1.5}
            strokeDasharray="4 3" opacity={.5 + pu * .4}>
        <animate attributeName="stroke-dashoffset" from={gridAlert ? "0" : "14"} to={gridAlert ? "14" : "0"} dur=".6s" repeatCount="indefinite"/>
      </line>
      {/* Geb. 42 ↕ El. Speicher (vertical bidirectional) */}
      {d.elSOC > 5 && (
        <line x1={CON_X1 + CON_W/2} y1={ROW2_Y + ROW2_H + (ROW2_Y - ROW1_Y - ROW1_H) / 2 + ROW1_H/2 + 4}
              x2={CON_X1 + CON_W/2} y2={ROW3_Y}
              stroke={CI.brightHorizon} strokeWidth="1.2" strokeDasharray="3 3" opacity={.5 + pu * .3}>
          <animate attributeName="stroke-dashoffset" from="10" to="0" dur="1s" repeatCount="indefinite"/>
        </line>
      )}
      {/* Geb. 52/53 ↕ Th. Speicher (vertical bidirectional) */}
      {d.thSOC > 5 && (
        <line x1={CON_X2 + CON_W/2} y1={ROW2_Y + ROW2_H + (ROW2_Y - ROW1_Y - ROW1_H) / 2 + ROW1_H/2 + 4}
              x2={CON_X2 + CON_W/2} y2={ROW3_Y}
              stroke={CI.brightHorizon} strokeWidth="1.2" strokeDasharray="3 3" opacity={.5 + pu * .3}>
          <animate attributeName="stroke-dashoffset" from="10" to="0" dur="1s" repeatCount="indefinite"/>
        </line>
      )}
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
  const [newTypeColor, setNewTypeColor] = useState(CI.brightHorizon);
  const [newTypeIsExterior, setNewTypeIsExterior] = useState(false);
  const [theme, setTheme] = useState(() => (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("rzz-theme", theme); } catch { /* noop */ }
  }, [theme]);

  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1500); return () => clearInterval(iv); }, []);
  useEffect(() => { setHist(h => [...h.slice(-30), { ...genEnergy(tick, params, pvDachOn, pvFreiraumOn), t: tick }]); }, [tick, params, pvDachOn, pvFreiraumOn]);

  // MCP control channel — receives design commands from the meeting assistant
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5175');
    ws.onmessage = (e) => {
      try {
        const cmd = JSON.parse(e.data);
        if (cmd.action === 'toggle_walls' && Array.isArray(cmd.wallIds)) {
          const active = typeof cmd.active === 'boolean' ? cmd.active : false;
          setWallStates(prev => {
            const next = { ...prev };
            cmd.wallIds.forEach(id => { if (next[id]) next[id] = { ...next[id], active }; });
            return next;
          });
          ws.send(JSON.stringify({ type: 'ack', action: 'toggle_walls', ok: true }));
        } else if (cmd.action === 'set_floor' && typeof cmd.floor === 'string') {
          setSel(cmd.floor);
          ws.send(JSON.stringify({ type: 'ack', action: 'set_floor', ok: true }));
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => {};
    return () => { try { ws.close(); } catch { /* noop */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const SIDE_AREAS = { nord: 25*3.2*5, sued: 25*3.2*5, ost: 12*3.2*5, west: 12*3.2*5 };
  const selSideData = selectedExtSide ? extWalls[selectedExtSide] : null;
  const selSideWT = selSideData ? (wallTypes.find(t => t.id === selSideData.typeId) || wallTypes.find(t => t.isExterior)) : null;
  const selSideCalc = selSideWT ? calcWallType(selSideWT) : null;
  let extGWP = 0;
  EXT_SIDES.forEach(s => { const wt = wallTypes.find(t => t.id === extWalls[s.id].typeId) || wallTypes.find(t => t.isExterior); if (wt) extGWP += calcWallType(wt).totalGWP * SIDE_AREAS[s.id]; });
  const nordWT = wallTypes.find(t => t.id === extWalls.nord.typeId) || wallTypes.find(t => t.isExterior);
  const extCalc = nordWT ? calcWallType(nordWT) : { uValue: 0, totalGWP: 0 };
  const extArea = Object.values(SIDE_AREAS).reduce((a, b) => a + b, 0);
  const extWT = nordWT || { name: "–", color: CI.coreBlue };
  let intGWP = 0;
  Object.entries(wallStates).forEach(([, ws]) => { if (!ws.active) return; const wt = wallTypes.find(t => t.id === ws.typeId); if (wt) intGWP += calcWallType(wt).totalGWP * 3.5 * 3.2 * 4; });
  const totalGWP = extGWP + intGWP;

  const sensors = {
    temp: (21 + ns(tick * 0.1, 0.2, 1.5)).toFixed(1),
    humidity: (48 + ns(tick * 0.1 + 10, 0.15, 8) - params.ventilation * 0.02).toFixed(0),
    co2: Math.max(400, (620 + ns(tick * 0.1 + 20, 0.12, 150) - params.ventilation * 0.5)).toFixed(0),
    voc: Math.max(30, (150 + ns(tick * 0.1 + 30, 0.08, 30) - params.ventilation * 0.15)).toFixed(0),
  };

  const okColor = "var(--rzz-primary)"; // brand-blue replaces traffic-light green (CI: no Extra Grün in UI)
  const warnColor = CI.pulseRed;

  return (
    <div style={{ background: "var(--rzz-bg)", color: "var(--rzz-text)", minHeight: "100vh", fontFamily: "'Geist Variable', system-ui, sans-serif", fontSize: 12 }}>
      <div style={{ background: "var(--rzz-surface-2)", borderBottom: "1px solid var(--rzz-border)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Signet size={32} color="var(--rzz-primary)" />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, fontWeight: 800, letterSpacing: 0.5, fontSize: 13, color: "var(--rzz-text)" }}>
            <span>REALLABOR</span>
            <span style={{ paddingLeft: "1.6em" }}>ZEKIWA</span>
            <span style={{ paddingLeft: "3.2em" }}>ZEITZ</span>
          </div>
          <span style={{ width: 1, height: 28, background: "var(--rzz-border-strong)", margin: "0 6px" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--rzz-text)", textTransform: "uppercase" }}>Digitaler Zwilling</span>
            <span style={{ fontSize: 10, color: "var(--rzz-text-dim)" }}>Geb. 42 + 52/53</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--rzz-text-dim)", letterSpacing: 1, textTransform: "uppercase" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cur.grid > 1 ? CI.pulseRed : CI.coreBlue }} />
            <span>{cur.grid > 1 ? "Netzbezug" : "Live"}</span>
          </div>
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--rzz-border)" }}>
            {["live","codesign","material"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", border: "none", borderBottom: view === v ? `2px solid var(--rzz-primary)` : "2px solid transparent", marginBottom: -1, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1.2, background: "transparent", color: view === v ? "var(--rzz-text)" : "var(--rzz-text-dim)" }}>{v === "codesign" ? "Co-Design" : v === "live" ? "Live" : "Material"}</button>
            ))}
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>

      <div style={{ padding: view === "live" ? 18 : 10, maxWidth: view === "live" ? 1400 : 1100, margin: "0 auto", background: view === "live" ? H.bg : "transparent", minHeight: view === "live" ? "calc(100vh - 56px)" : "auto" }}>

        {/* ═══ LIVE — Hermann design ═══ */}
        {view === "live" && (() => {
          const autarky = cur.conTotal > 0 ? Math.min(100, ((1 - cur.grid / cur.conTotal) * 100)) : 100;
          const paramMeta = {
            pvDach:      { Icon: IconPV,     tone: "blue"  },
            pvFreiraum:  { Icon: IconSun,    tone: "blue"  },
            batteryEl:   { Icon: IconBattery,tone: "green" },
            batteryTh:   { Icon: IconThermo, tone: "blue"  },
            ventilation: { Icon: IconFan,    tone: "green" },
          };
          const sensorCards = [
            { value: sensors.temp,     max: 40,                    label: "Temp",        unit: "°C",     color: H.amber,     bg: H.tintCream, Icon: IconThermo },
            { value: sensors.humidity, max: 100,                   label: "Feuchte",     unit: "%rH",    color: H.green,     bg: H.tintGreen, Icon: IconDrop },
            { value: sensors.co2,      max: 1500,                  label: "CO₂",         unit: "ppm",    color: H.blue,      bg: H.card,      Icon: IconCloud },
            { value: sensors.voc,      max: 500,                   label: "VOC",         unit: "µg/m³",  color: H.amberDark, bg: H.tintCream, Icon: IconWaves },
            { value: cur.thStored,     max: params.batteryTh || 1, label: "Th. Speicher",unit: "kWh",    color: H.blue,      bg: H.tintBlue,  Icon: IconThermo },
            { value: cur.elStored,     max: params.batteryEl || 1, label: "El. Speicher",unit: "kWh",    color: H.textMute,  bg: H.card,      Icon: IconPlug },
          ];
          return (
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 18 }}>

            <HCard>
              <HTitle>Energiefluss · Geb. 42 + 52/53</HTitle>
              <HermannEnergyFlow d={cur} p={params} autarky={autarky} />
            </HCard>

            <HCard style={{ display: "flex", flexDirection: "column", padding: 18, overflow: "hidden" }}>
              <HTitle>3D · Geb. 42 / 52-53</HTitle>
              <div style={{ flex: 1, minHeight: 300, borderRadius: 10, overflow: "hidden" }}>
                <IFCViewer height={300} />
              </div>
            </HCard>

            <HCard>
              <HTitle>Energieverlauf</HTitle>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={hist} margin={{ top: 8, right: 10, left: -10, bottom: 4 }}>
                  <CartesianGrid stroke="#EFEDE6" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: H.textDim, fontSize: 11 }} interval="preserveStartEnd" stroke="#EFEDE6" tickLine={false} axisLine={{ stroke: "#EFEDE6" }} />
                  <YAxis tick={{ fill: H.textDim, fontSize: 11 }} width={34} stroke="#EFEDE6" tickLine={false} axisLine={false} domain={[0, 24]} ticks={[0,6,12,18,24]} />
                  <Tooltip contentStyle={{ background: H.card, border: `1px solid ${H.border}`, borderRadius: 8, fontSize: 11, color: H.text, fontFamily: "'Geist Variable', sans-serif" }} />
                  <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: H.textDim, paddingBottom: 6 }} />
                  <Line type="monotone" dataKey="conTotal" stroke={H.blue} strokeWidth={2.2} dot={false} name="Gesamtverbrauch (kW)" />
                  <Line type="monotone" dataKey="pvTotal"  stroke={H.green} strokeWidth={2.2} dot={false} name="PV-Erzeugung (kW)" />
                </LineChart>
              </ResponsiveContainer>
            </HCard>

            <HCard>
              <HTitle>Parameter</HTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {WHAT_IF.map(w => {
                  const m = paramMeta[w.id] || { Icon: IconPV, tone: "blue" };
                  const Icon = m.Icon;
                  return (
                    <div key={w.id} style={{ display: "grid", gridTemplateColumns: "32px 130px 1fr 80px", alignItems: "center", gap: 14 }}>
                      <div style={{ background: H.tintGray, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={18} color={m.tone === "green" ? H.greenDark : H.blueDark} />
                      </div>
                      <span style={{ fontSize: 13, color: H.text }}>{w.label}</span>
                      <input type="range" min={w.min} max={w.max} step={w.step} value={params[w.id]} onChange={e => sp(w.id, e.target.value)} className={`hermann-slider${m.tone === "green" ? " green" : ""}`} />
                      <span style={{ fontSize: 13, color: H.text, fontWeight: 600, textAlign: "right" }}>{params[w.id]} <span style={{ color: H.textDim, fontWeight: 400 }}>{w.unit}</span></span>
                    </div>
                  );
                })}
              </div>
            </HCard>

            <HCard style={{ gridColumn: "1/-1", padding: "16px 18px" }}>
              <HTitle>Sensoren + Speicher · Geb. 42</HTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
                {sensorCards.map((s, i) => <HermannGauge key={i} {...s} />)}
              </div>
            </HCard>

          </div>);
        })()}

        {/* ═══ CO-DESIGN ═══ */}
        {view === "codesign" && <div style={{ display: "grid", gridTemplateColumns: "1fr 250px", gap: 10 }}>
          <div style={{ gridColumn: "1/-1", display: "flex", gap: 2 }}>
            {FLOORS.map(f => (<button key={f.id} onClick={() => { setSel(f.id); setSelectedWallId(null); }} style={{ padding: "5px 12px", borderRadius: "4px 4px 0 0", border: "1px solid var(--rzz-border)", borderBottom: "none", background: sel === f.id ? "var(--rzz-surface)" : "transparent", color: sel === f.id ? "var(--rzz-text)" : "var(--rzz-text-dim)", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: sel === f.id ? 700 : 500, borderTop: sel === f.id ? `2px solid ${f.color}` : "1px solid var(--rzz-border)" }}>{f.short}</button>))}
          </div>

          <Box>
            <div style={{ fontSize: 12, color: "var(--rzz-text)", marginBottom: 6, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: fl.color, borderRadius: 2 }} />{fl.name}
            </div>
            {sel === "eg" && <EGPlan tick={tick} />}
            {sel === "dach" && <RoofPlan pvDachOn={pvDachOn} onTogglePvDach={() => setPvDachOn(p => !p)} pvFreiraumOn={pvFreiraumOn} onTogglePvFreiraum={() => setPvFreiraumOn(p => !p)} tick={tick} />}
            {!["eg", "dach"].includes(sel) && <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>SVG · Stil (Mock)</div>
                  <OGPlan tick={tick} wallStates={wallStates} wallTypes={wallTypes} onWallClick={onWallClick} floor={fl} selectedWallId={selectedWallId} extWalls={extWalls} selectedExtSide={selectedExtSide} onExtSideClick={onExtSideClick} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>IFC · Views.createFromIfcStoreys (Spike)</div>
                  <IFCPlanView height={250} selectedFloorId={sel} />
                </div>
              </div>
              <div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginTop: 5 }}>Klick = auswählen · Doppelklick = ein/aus · {aw}/{OG_WALLS_INIT.length} aktiv</div>
              <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>{wallTypes.filter(t => !t.isExterior).map(t => (<span key={t.id} style={{ fontSize: 9, color: "var(--rzz-text-dim)", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 3, background: t.color, borderRadius: 1 }} />{t.name}</span>))}</div>
            </>}
          </Box>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Box style={{ maxHeight: 320, overflowY: "auto" }}>
              <Lbl>Wände / PV</Lbl>
              {sel === "dach" ? <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <button onClick={() => setPvDachOn(p => !p)} style={{ width: "100%", padding: "7px", borderRadius: 4, border: `1px solid ${pvDachOn ? CI.coreBlue : "var(--rzz-border)"}`, background: pvDachOn ? CI.coreBlue : "transparent", color: pvDachOn ? "#FFFFFF" : "var(--rzz-text-dim)", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600 }}>PV Dach {pvDachOn ? `aktiv · ${params.pvDach} kWp` : "aus"}</button>
                <button onClick={() => setPvFreiraumOn(p => !p)} style={{ width: "100%", padding: "7px", borderRadius: 4, border: `1px solid ${pvFreiraumOn ? CI.brightHorizon : "var(--rzz-border)"}`, background: pvFreiraumOn ? CI.brightHorizon : "transparent", color: pvFreiraumOn ? "#FFFFFF" : "var(--rzz-text-dim)", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600 }}>PV Freiraum {pvFreiraumOn ? `aktiv · ${params.pvFreiraum} kWp` : "aus"}</button>
              </div> : sel === "eg" ? <div style={{ fontSize: 10, color: "var(--rzz-text-dim)" }}>EG: Offener Grundriss</div> : <>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  <button onClick={() => setWallStates(ws => { const n = { ...ws }; OG_WALLS_INIT.forEach(w => n[w.id] = { ...n[w.id], active: true }); return n; })} style={{ flex: 1, padding: "4px", borderRadius: 3, border: "1px solid var(--rzz-border)", background: "transparent", color: "var(--rzz-text-dim)", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>Alle</button>
                  <button onClick={() => setWallStates(ws => { const n = { ...ws }; OG_WALLS_INIT.forEach(w => n[w.id] = { ...n[w.id], active: false }); return n; })} style={{ flex: 1, padding: "4px", borderRadius: 3, border: "1px solid var(--rzz-border)", background: "transparent", color: "var(--rzz-text-dim)", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>Offen</button>
                </div>
                {OG_WALLS_INIT.map(w => { const ws = wallStates[w.id], on = ws?.active, wt = wallTypes.find(t => t.id === ws?.typeId), isSel = selectedWallId === w.id;
                  return (<div key={w.id} style={{ marginBottom: 3, borderRadius: 4, border: `1px solid ${isSel ? CI.pulseRed : "var(--rzz-border)"}`, background: isSel ? "var(--rzz-surface-2)" : "transparent", padding: "4px 6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setSelectedWallId(isSel ? null : w.id)}>
                      <span style={{ fontSize: 10, color: on ? "var(--rzz-text)" : "var(--rzz-text-mute)", display: "flex", alignItems: "center", gap: 4 }}>{wt && <span style={{ width: 10, height: 3, background: wt.color, borderRadius: 1 }} />}{w.label}</span>
                      <button onClick={e => { e.stopPropagation(); toggleWall(w.id); }} style={{ fontSize: 9, fontWeight: 700, color: on ? CI.coreBlue : CI.pulseRed, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 }}>{on ? "EIN" : "AUS"}</button>
                    </div>
                    {isSel && on && <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--rzz-border)" }}>
                      <div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 3 }}>Wandtyp:</div>
                      {wallTypes.filter(t => !t.isExterior).map(t => (<button key={t.id} onClick={() => assignType(w.id, t.id)} style={{ display: "block", width: "100%", padding: "3px 6px", marginBottom: 2, borderRadius: 3, fontSize: 9, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `1px solid ${ws.typeId === t.id ? t.color : "var(--rzz-border)"}`, background: ws.typeId === t.id ? t.color : "transparent", color: ws.typeId === t.id ? "#FFFFFF" : "var(--rzz-text-dim)" }}><span style={{ width: 8, height: 3, background: ws.typeId === t.id ? "#FFFFFF" : t.color, borderRadius: 1, display: "inline-block", marginRight: 4 }} />{t.name}</button>))}
                    </div>}
                  </div>);
                })}
              </>}
            </Box>
            {selectedExtSide && selSideWT && (() => {
              const sideMeta = EXT_SIDES.find(s => s.id === selectedExtSide);
              const ew = extWalls[selectedExtSide];
              const sc = selSideCalc;
              return <Box>
                <Lbl style={{ color: CI.pulseRed }}>Aussenwand · {sideMeta.label}</Lbl>
                {wallTypes.filter(t => t.isExterior).map(t => (
                  <button key={t.id} onClick={() => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], typeId: t.id } }))} style={{ display: "block", width: "100%", padding: "3px 6px", marginBottom: 2, borderRadius: 3, fontSize: 9, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `1px solid ${ew.typeId === t.id ? t.color : "var(--rzz-border)"}`, background: ew.typeId === t.id ? t.color : "transparent", color: ew.typeId === t.id ? "#FFFFFF" : "var(--rzz-text-dim)" }}>
                    <span style={{ width: 8, height: 3, background: ew.typeId === t.id ? "#FFFFFF" : t.color, borderRadius: 1, display: "inline-block", marginRight: 4 }} />{t.name}
                  </button>
                ))}
                {sc && <><WallSectionVis wt={selSideWT} />
                  <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>U: <span className="rzz-mono" style={{ color: "var(--rzz-text)" }}>{sc.uValue.toFixed(3)}</span></div>
                    <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>GWP: <span className="rzz-mono" style={{ color: sc.totalGWP < 0 ? CI.coreBlue : CI.pulseRed }}>{sc.totalGWP.toFixed(2)}</span></div>
                  </div></>}
                <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--rzz-border)" }}>
                  <div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 4, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Pufferzone</div>
                  {ew.bufferDepth === 0
                    ? <button onClick={() => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], bufferDepth: 30 } }))} style={{ width: "100%", padding: "5px", borderRadius: 3, border: "2px dashed var(--rzz-border-strong)", background: "transparent", color: "var(--rzz-text-dim)", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>+ Pufferzone anlegen</button>
                    : <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span className="rzz-mono" style={{ fontSize: 9, color: "var(--rzz-text)" }}>{(ew.bufferDepth * 0.05).toFixed(1)} m Tiefe</span>
                          <button onClick={() => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], bufferDepth: 0 } }))} style={{ fontSize: 10, background: "none", border: "none", color: CI.pulseRed, cursor: "pointer" }}>× entfernen</button>
                        </div>
                        <input type="range" min="10" max="80" step="5" value={ew.bufferDepth} onChange={e => setExtWalls(ew2 => ({ ...ew2, [selectedExtSide]: { ...ew2[selectedExtSide], bufferDepth: +e.target.value } }))} style={{ width: "100%" }} />
                      </div>
                  }
                </div>
              </Box>;
            })()}
            {selectedWallId && wallStates[selectedWallId]?.active && (() => { const ws = wallStates[selectedWallId], wt = wallTypes.find(t => t.id === ws.typeId); if (!wt) return null; const c = calcWallType(wt);
              return <Box><Lbl style={{ color: CI.pulseRed }}>{wt.name}</Lbl><WallSectionVis wt={wt} /><div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>Dicke: <span className="rzz-mono" style={{ color: "var(--rzz-text)" }}>{c.totalThickness} mm</span></div>
                <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>U: <span className="rzz-mono" style={{ color: "var(--rzz-text)" }}>{c.uValue.toFixed(3)}</span></div>
                <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>GWP: <span className="rzz-mono" style={{ color: c.totalGWP < 0 ? CI.coreBlue : CI.pulseRed }}>{c.totalGWP.toFixed(2)}</span></div>
                <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>VOC: <span className="rzz-mono" style={{ color: "var(--rzz-text)" }}>{c.totalVOC}</span></div>
              </div></Box>;
            })()}
          </div>

          <Box style={{ gridColumn: "1/-1" }}><Lbl>Auswertung · Geb. 42</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6 }}>
              {[
                { l: "GWP gesamt", v: `${(totalGWP/1000).toFixed(1)} t`, c: CI.coreBlue },
                { l: "GWP/(m²·a)", v: `${(totalGWP/1500/50).toFixed(3)}`, c: CI.coreBlue },
                { l: "U-Wert Außen", v: `${extCalc.uValue.toFixed(3)}`, c: extCalc.uValue < .2 ? okColor : warnColor },
                { l: "Therm. Komfort", v: `${sensors.temp}°C`, c: parseFloat(sensors.temp) >= 20 && parseFloat(sensors.temp) <= 26 ? okColor : warnColor },
                { l: "VOC", v: `${sensors.voc} µg/m³`, c: parseFloat(sensors.voc) < 200 ? okColor : warnColor },
                { l: "Feuchte", v: `${sensors.humidity}%`, c: parseFloat(sensors.humidity) < 65 ? okColor : warnColor },
                { l: "CO₂ Raum", v: `${sensors.co2} ppm`, c: parseFloat(sensors.co2) < 1000 ? okColor : warnColor },
                { l: "Th. Speicher", v: `${cur.thStored} kWh`, c: CI.brightHorizon },
                { l: "El. Speicher", v: `${cur.elStored} kWh`, c: CI.brightHorizon },
                { l: "PV Dach", v: pvDachOn ? `${params.pvDach} kWp` : "–", c: pvDachOn ? CI.coreBlue : CI.urbanAsh },
                { l: "PV Freiraum", v: pvFreiraumOn ? `${params.pvFreiraum} kWp` : "–", c: pvFreiraumOn ? CI.brightHorizon : CI.urbanAsh },
                { l: "Innenwände", v: `${aw}/${OG_WALLS_INIT.length}`, c: CI.urbanAsh },
              ].map((k, i) => (<div key={i} style={{ background: "var(--rzz-surface-2)", borderRadius: 5, padding: 7, border: "1px solid var(--rzz-border)", textAlign: "center" }}><div style={{ fontSize: 8, color: "var(--rzz-text-dim)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{k.l}</div><div className="rzz-mono" style={{ fontSize: 14, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div></div>))}
            </div>
          </Box>
          <Box style={{ gridColumn: "1/-1" }}><Lbl>Sensoren + Speicher</Lbl>
            <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 6 }}>
              <Gauge value={sensors.temp} max={40} label="Temp" unit="°C" color={CI.coreBlue} warn={28} />
              <Gauge value={sensors.humidity} max={100} label="Feuchte" unit="%rH" color={CI.brightHorizon} warn={70} />
              <Gauge value={sensors.co2} max={1500} label="CO₂" unit="ppm" color={CI.coreBlue} warn={1000} />
              <Gauge value={sensors.voc} max={500} label="VOC" unit="µg/m³" color={CI.brightHorizon} warn={300} />
              <Gauge value={cur.thStored} max={params.batteryTh || 1} label="Th. Speicher" unit="kWh" color={CI.coreBlue} />
              <Gauge value={cur.elStored} max={params.batteryEl || 1} label="El. Speicher" unit="kWh" color={CI.brightHorizon} />
            </div>
          </Box>
        </div>}

        {/* ═══ MATERIAL ═══ */}
        {view === "material" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Box style={{ gridColumn: "1/-1" }}><Lbl>Wandaufbau-Katalog</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {wallTypes.map(wt => { const c = calcWallType(wt); return (
                <div key={wt.id} style={{ background: "var(--rzz-surface-2)", borderRadius: 6, padding: 11, border: "1px solid var(--rzz-border)", borderLeft: `3px solid ${wt.color}` }}>
                  <div style={{ fontSize: 12, color: "var(--rzz-text)", fontWeight: 700, marginBottom: 6, display: "flex", justifyContent: "space-between" }}><span>{wt.name}</span><span style={{ fontSize: 9, color: "var(--rzz-text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>{wt.isExterior ? "Außen" : "Innen"}</span></div>
                  <WallSectionVis wt={wt} />
                  <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>Dicke<br /><span className="rzz-mono" style={{ color: "var(--rzz-text)", fontSize: 12, fontWeight: 700 }}>{c.totalThickness} mm</span></div>
                    <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>U-Wert<br /><span className="rzz-mono" style={{ color: CI.coreBlue, fontSize: 12, fontWeight: 700 }}>{c.uValue.toFixed(3)}</span></div>
                    <div style={{ fontSize: 9, color: "var(--rzz-text-dim)" }}>GWP<br /><span className="rzz-mono" style={{ color: c.totalGWP < 0 ? CI.coreBlue : CI.pulseRed, fontSize: 12, fontWeight: 700 }}>{c.totalGWP.toFixed(2)}</span></div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 7 }}>
                    <thead><tr>{["Schicht","mm","ρ","GWP","VOC","λ"].map((h,i) => <th key={i} style={{ fontSize: 8, color: "var(--rzz-text-dim)", textAlign: i === 0 ? "left" : "right", padding: "3px 3px", borderBottom: "1px solid var(--rzz-border)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>)}</tr></thead>
                    <tbody>{wt.layers.map((l, li) => (<tr key={li}><td style={{ fontSize: 9, color: "var(--rzz-text)", padding: "2px 3px" }}>{l.name}</td><td className="rzz-mono" style={{ fontSize: 9, color: "var(--rzz-text)", textAlign: "right", padding: "2px 3px" }}>{l.thickness}</td><td className="rzz-mono" style={{ fontSize: 9, color: "var(--rzz-text-dim)", textAlign: "right", padding: "2px 3px" }}>{l.density}</td><td className="rzz-mono" style={{ fontSize: 9, color: l.gwp < 0 ? CI.coreBlue : CI.pulseRed, textAlign: "right", padding: "2px 3px" }}>{l.gwp}</td><td className="rzz-mono" style={{ fontSize: 9, color: "var(--rzz-text-dim)", textAlign: "right", padding: "2px 3px" }}>{l.voc}</td><td className="rzz-mono" style={{ fontSize: 9, color: "var(--rzz-text-dim)", textAlign: "right", padding: "2px 3px" }}>{l.lambda}</td></tr>))}</tbody>
                  </table>
                </div>
              );})}
            </div>
          </Box>

          <Box style={{ gridColumn: "1/-1" }}>
            {!showNewType ? <button onClick={() => setShowNewType(true)} style={{ padding: "10px 16px", borderRadius: 5, border: "2px dashed var(--rzz-border-strong)", background: "transparent", color: "var(--rzz-text-dim)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, width: "100%" }}>+ Neuen Wandaufbau erstellen</button> : <div>
              <Lbl>Neuer Wandaufbau</Lbl>
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div><div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 3, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Name</div><input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="z.B. Leichtbauwand" style={{ fontSize: 11, padding: "5px 9px", border: "1px solid var(--rzz-border-strong)", borderRadius: 4, background: "var(--rzz-bg)", color: "var(--rzz-text)", width: 200, fontFamily: "inherit" }} /></div>
                <div><div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 3, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Farbe</div><input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)} style={{ width: 34, height: 30, border: "1px solid var(--rzz-border-strong)", borderRadius: 4, background: "var(--rzz-bg)", cursor: "pointer" }} /></div>
                <div><div style={{ fontSize: 9, color: "var(--rzz-text-dim)", marginBottom: 3, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Typ</div><button onClick={() => setNewTypeIsExterior(v => !v)} style={{ padding: "5px 11px", borderRadius: 4, border: `1px solid ${newTypeIsExterior ? CI.coreBlue : "var(--rzz-border-strong)"}`, background: newTypeIsExterior ? CI.coreBlue : "transparent", color: newTypeIsExterior ? "#FFFFFF" : "var(--rzz-text-dim)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{newTypeIsExterior ? "Außenwand" : "Innenwand"}</button></div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                <thead><tr>{["Schicht","mm","kg/m³","GWP","VOC","λ",""].map((h,i) => <th key={i} style={{ fontSize: 9, color: "var(--rzz-text-dim)", textAlign: i === 0 ? "left" : "right", padding: "4px 3px", borderBottom: "1px solid var(--rzz-border-strong)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>)}</tr></thead>
                <tbody>{newTypeLayers.map((l, li) => (<tr key={li}>
                  {[{ k: "name", w: 110, type: "text" },{ k: "thickness", w: 45 },{ k: "density", w: 55 },{ k: "gwp", w: 45, step: .01 },{ k: "voc", w: 35 },{ k: "lambda", w: 45, step: .001 }].map(({ k, w, type, step }) => (
                    <td key={k} style={{ padding: "2px 2px" }}><input type={type || "number"} value={l[k]} step={step} onChange={e => updateNewLayer(li, k, e.target.value)} style={{ width: w, fontSize: 10, padding: "4px 5px", border: "1px solid var(--rzz-border)", borderRadius: 3, background: "var(--rzz-bg)", color: "var(--rzz-text)", fontFamily: type === "text" ? "inherit" : "'Geist Mono Variable', monospace", textAlign: type === "text" ? "left" : "right" }} /></td>
                  ))}
                  <td style={{ padding: "2px" }}>{newTypeLayers.length > 1 && <button onClick={() => setNewTypeLayers(ls => ls.filter((_, i) => i !== li))} style={{ fontSize: 11, background: "none", border: "none", color: CI.pulseRed, cursor: "pointer" }}>×</button>}</td>
                </tr>))}</tbody>
              </table>
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={() => setNewTypeLayers(ls => [...ls, { name: `Schicht ${ls.length + 1}`, thickness: 15, density: 1000, gwp: 0.1, voc: 0, lambda: 0.5 }])} style={{ padding: "5px 11px", borderRadius: 3, border: "1px solid var(--rzz-border-strong)", background: "transparent", color: "var(--rzz-text-dim)", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>+ Schicht</button>
                <button onClick={addNewWallType} disabled={!newTypeName.trim()} style={{ padding: "5px 16px", borderRadius: 3, border: "none", background: newTypeName.trim() ? CI.coreBlue : "var(--rzz-border-strong)", color: "#FFFFFF", fontSize: 11, fontWeight: 700, cursor: newTypeName.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Erstellen</button>
                <button onClick={() => setShowNewType(false)} style={{ padding: "5px 11px", borderRadius: 3, border: "1px solid var(--rzz-border-strong)", background: "transparent", color: "var(--rzz-text-dim)", fontSize: 10, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>Abbrechen</button>
              </div>
            </div>}
          </Box>

          <Box style={{ gridColumn: "1/-1", padding: 0, overflow: "hidden" }}>
            <div style={{ fontSize: 11, color: "var(--rzz-text-dim)", padding: "9px 12px", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", borderBottom: "1px solid var(--rzz-border)", display: "flex", justifyContent: "space-between" }}><span>Ökobilanz · GWP</span><span style={{ color: "var(--rzz-text-mute)", fontWeight: 500, letterSpacing: 0.5 }}>BNB 1.1.1</span></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead><tr style={{ background: "var(--rzz-surface-inset)" }}>{["Bauteil","Wandtyp","Fläche m²","GWP/m²","GWP ges. kg CO₂"].map((h,i) => <th key={i} style={{ padding: "5px 7px", textAlign: i < 2 ? "left" : "right", color: "var(--rzz-text-dim)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>)}</tr></thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--rzz-border)" }}>
                  <td style={{ padding: "4px 7px", color: "var(--rzz-text)", fontWeight: 600 }}>Außenwand</td>
                  <td style={{ padding: "4px 7px", color: "var(--rzz-text)", fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 3, background: extWT.color, borderRadius: 1 }} />{extWT.name}</td>
                  <td className="rzz-mono" style={{ padding: "4px 7px", textAlign: "right", color: "var(--rzz-text-dim)" }}>{extArea.toFixed(0)}</td>
                  <td className="rzz-mono" style={{ padding: "4px 7px", textAlign: "right", color: extCalc.totalGWP < 0 ? CI.coreBlue : CI.pulseRed }}>{extCalc.totalGWP.toFixed(2)}</td>
                  <td className="rzz-mono" style={{ padding: "4px 7px", textAlign: "right", fontWeight: 700, color: "var(--rzz-text)" }}>{(extCalc.totalGWP * extArea).toFixed(0)}</td>
                </tr>
                {wallTypes.filter(t => !t.isExterior).map(wt => { const ww = Object.entries(wallStates).filter(([, ws]) => ws.active && ws.typeId === wt.id); if (!ww.length) return null; const c = calcWallType(wt), area = ww.length * 3.5 * 3.2 * 4;
                  return <tr key={wt.id} style={{ borderBottom: "1px solid var(--rzz-border)" }}>
                    <td style={{ padding: "4px 7px", color: "var(--rzz-text-dim)" }}>Innenwand ({ww.length}×)</td>
                    <td style={{ padding: "4px 7px", color: "var(--rzz-text)", fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 3, background: wt.color, borderRadius: 1 }} />{wt.name}</td>
                    <td className="rzz-mono" style={{ padding: "4px 7px", textAlign: "right", color: "var(--rzz-text-dim)" }}>{area.toFixed(0)}</td>
                    <td className="rzz-mono" style={{ padding: "4px 7px", textAlign: "right", color: c.totalGWP < 0 ? CI.coreBlue : CI.pulseRed }}>{c.totalGWP.toFixed(2)}</td>
                    <td className="rzz-mono" style={{ padding: "4px 7px", textAlign: "right", fontWeight: 700, color: "var(--rzz-text)" }}>{(c.totalGWP * area).toFixed(0)}</td>
                  </tr>;
                })}
                <tr style={{ borderTop: `2px solid ${CI.coreBlue}`, background: "var(--rzz-surface-inset)" }}>
                  <td colSpan="4" style={{ padding: "6px 7px", fontWeight: 700, color: "var(--rzz-text)", letterSpacing: 1, textTransform: "uppercase", fontSize: 10 }}>∑ Gesamt</td>
                  <td className="rzz-mono" style={{ padding: "6px 7px", textAlign: "right", fontWeight: 800, fontSize: 14, color: CI.coreBlue }}>{totalGWP.toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
          </Box>
        </div>}
      </div>
    </div>
  );
}
