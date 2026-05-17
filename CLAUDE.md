# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build
npm run lint      # ESLint on all .js/.jsx files
npm run preview   # Preview production build locally
```

Vite serves with base path `/reallabor-twin/`, so the preview URL will include that path.

## Architecture

This is a **monolithic single-component React app** — all UI, state, and logic lives in `src/App.jsx` (~611 lines). There are no sub-components; `src/main.jsx` simply renders `<App />`.

### Three views (toggled by `view` state)

| View | Purpose |
|---|---|
| `"live"` | Real-time energy flow diagram, sensor gauges, what-if parameter sliders |
| `"codesign"` | Interactive SVG floor plans, wall editor, exterior wall buffer zones, material catalog |
| `"material"` | Wall assembly catalog, custom wall type creator, life-cycle assessment (GWP) |

### Key data structures (defined as constants at the top of App.jsx)

- **`FLOORS`** — 6 floor definitions (EG, 1.OG–4.OG, Dach) with color coding
- **`EXT_SIDES`** — 4 exterior wall faces (Nord/Süd/West/Ost) with SVG coordinates
- **`WHAT_IF`** — 5 simulation parameters (PV kWp, battery kWh, ventilation m³/h, etc.)
- **`DEFAULT_WALL_TYPES`** — Pre-configured wall assemblies with layer stacks (name, thickness mm, density, GWP kg CO₂/kg, VOC, λ)
- **`OG_WALLS_INIT`** — 14 interior walls for upper floors with SVG coordinates

### State management

All state is flat `useState` hooks at the top of `<App>` — no context, Redux, or external library. 18+ state variables including `tick` (animation frame counter), `params` (simulation sliders), `wallTypes`, `ogWalls`, `extWalls`, and per-floor PV toggle booleans.

### Domain logic functions (inside App.jsx)

- **`genEnergy(tick, params)`** — Generates a 24h energy profile array using sine-wave models for PV production, consumption zones, battery SoC, and grid draw. Returns autarky % and all hourly values for Recharts.
- **`calcWallType(layers)`** — Computes aggregate thermal and GWP properties from a list of material layers.

### Floor plan rendering

SVG floor plans use `viewBox="0 0 500 250"` (standard floors) or `"0 0 500 340"` (roof/Dach). Walls are `<rect>` or `<line>` elements. Click selects a wall; double-click toggles it active/inactive.

### Styling

All component styles are inline style objects (no CSS-in-JS library, no Tailwind). `src/App.css` handles global resets, CSS custom properties (`--accent`, `--border`), range input styling, and scrollbars. The app uses a dark slate theme with JetBrains Mono / Fira Code fonts.

### Language and domain

UI labels are in German (Nord/Süd/West/Ost, Außenwand, Innenwand, Wärmedämmung, etc.) — this is intentional for the target academic audience. The modeled building is a German research facility ("Reallabor"), buildings Geb. 42 and Geb. 52/53.

## Tech stack

- React 19 (JSX, no TypeScript — `.jsx` extension throughout)
- Vite 8 with `@vitejs/plugin-react` (Oxc transformer)
- Recharts for area/energy charts
- ESLint v9 flat config; uppercase/underscore-prefixed vars are exempt from the unused-vars rule
