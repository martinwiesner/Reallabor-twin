# IFC Viewer Integration — Status Report

## What We Are Trying to Do

Add a 3D IFC model viewer panel to the Live view of the Reallabor-twin dashboard, sitting next to the EnergyFlow diagram. The viewer uses `@thatopen/components` v3.4.6 (OpenBIM standard), which internally uses `web-ifc` v0.0.77 (emscripten-compiled WASM) for IFC parsing.

---

## Problems Solved

### 1. Multiple Three.js instances + `uuid` crash
- **Symptom:** `THREE.WARNING: Multiple instances of Three.js being imported` → `Cannot read properties of undefined (reading 'uuid')`
- **Cause:** Dynamic `import()` inside `useEffect` bypassed Vite's module deduplication. Also, core classes (`SimpleScene`, `SimpleCamera` etc.) were imported from the wrong package (`@thatopen/components-front` instead of `@thatopen/components`).
- **Fix:** Changed to static top-level `import * as OBC from "@thatopen/components"`. Added `three` to `resolve.dedupe` and `optimizeDeps.exclude`.

### 2. "You need to initialize fragments first"
- **Cause:** In v3, `FragmentsManager.init(workerUrl)` must be called before any `IfcLoader` operation.
- **Fix:** Added `await fragments.init('/reallabor-twin/fragments-worker.mjs')` before `ifcLoader.setup()`.

### 3. ThatOpen watermark in bottom-left corner
- **Cause:** `SimpleRenderer` injects a `[data-thatopen-logo]` div into the container automatically.
- **Fix:** `container.querySelector('[data-thatopen-logo]')?.remove()` after `components.init()`.

### 4. Vite doubled the base path on the IIFE script tag
- **Symptom:** `<script src="/reallabor-twin/web-ifc-iife.js">` became `/reallabor-twin/reallabor-twin/web-ifc-iife.js` (404).
- **Cause:** Vite automatically prepends the `base` config to `<script src>` paths in `index.html`. Writing the full path caused it to be prepended twice.
- **Fix:** Changed to `<script src="/web-ifc-iife.js">` — Vite adds the base, producing the correct `/reallabor-twin/web-ifc-iife.js`.

### 5. App crash: shim reading `undefined.IfcAPI`
- **Cause:** The shim had `const w = globalThis.WebIFC;` — if the IIFE failed to load, `w` was `undefined` and accessing `w.IfcAPI` crashed the entire React module graph.
- **Fix:** Changed to `const w = globalThis.WebIFC ?? {}` so missing IIFE just gives undefined exports instead of crashing.

---

## The Remaining Problem

### `WebAssembly.instantiate(): Import #0 "a": module is not an object or function`

This error has been present since the beginning and none of the fixes so far have resolved it.

#### What we know (from the stack trace and source analysis):

```
instantiateAsync @ web-ifc-iife.js:4657   ← factory 2 (single-threaded)
createWasm     @ web-ifc-iife.js:4695
Init           @ web-ifc-iife.js:72671
Init           @ web-ifc-shim.js:9         ← our shim calling super
```

The `web-ifc-iife.js` file contains **two embedded emscripten factories**:

| Factory | Line | WASM file | Import format |
|---|---|---|---|
| Factory 1 (multi-threaded) | ~25 | `web-ifc-mt.wasm` | `{ a: wasmImports }` |
| Factory 2 (single-threaded) | ~4388 | `web-ifc.wasm` | `{ env: wasmImports, wasi_snapshot_preview1: wasmImports }` |

Our shim forces `forceSingleThread = true`, so Factory 2 is correctly selected.

Factory 2 provides `{ env: wasmImports }` to `WebAssembly.instantiate`.

However, the actual WASM binaries in `public/` have:
```
web-ifc.wasm:    Import #0 module = "env"   (52 imports)   ← single-threaded
web-ifc-mt.wasm: Import #0 module = "a"    (63 imports)   ← multi-threaded
```

**`web-ifc.wasm` expects `"env"` and Factory 2 provides `"env"` — they should match.**

But the error says `Import #0 "a"` — which is the multi-threaded WASM format.

#### The likely root cause

The WASM binary being actually loaded by the browser is **`web-ifc-mt.wasm`**, not `web-ifc.wasm`. This could happen because:

1. The emscripten factory inside the IIFE detects `crossOriginIsolated === true` at the time `Init()` runs (for some reason specific to this browser/macOS setup) and switches to the MT path — **even with our `forceSingleThread = true` patch**.
2. OR the `locateFile` handler is returning the wrong URL (pointing to the MT file instead of the ST file).
3. OR `web-ifc.wasm` was overwritten with the MT binary when copying files.

---

## Proposed Solutions (in order of likelihood to work)

### Option A — Add COOP/COEP headers to Vite dev server
If `crossOriginIsolated` is actually `true` in the browser, the MT factory is correctly chosen but `SharedArrayBuffer`-backed shared memory fails. COOP/COEP headers legitimize the shared memory usage, which should let the MT factory succeed.

Add to `vite.config.js`:
```js
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
},
```

Also needs a `_headers` file for GitHub Pages deployment.

### Option B — Verify WASM files are not mixed up
Check if `public/web-ifc.wasm` might actually be the MT binary (file size differs: single ~2.5 MB, MT ~3.5 MB). If they got swapped during copying, the fix is to re-copy from node_modules:
```bash
cp node_modules/web-ifc/web-ifc.wasm public/
cp node_modules/web-ifc/web-ifc-mt.wasm public/
```

### Option C — Bypass the IIFE entirely; load web-ifc from unpkg CDN
Replace the local IIFE with the CDN-hosted version which is known to work:
```html
<script src="https://unpkg.com/web-ifc@0.0.77/web-ifc-api-iife.js"></script>
```
Requires internet access but eliminates any local file corruption or version mismatch.

### Option D — Drop the IIFE approach; use a Vite `transformIndexHtml` plugin
Write a custom Vite plugin that intercepts `web-ifc-api.js` at the HTTP level, serves it without any transformation, and marks it as `type="module"`. This is more complex but would be the cleanest permanent fix.

---

## File State Summary

| File | Status |
|---|---|
| `vite.config.js` | `web-ifc` aliased to shim; OBC/three excluded from optimizeDeps |
| `index.html` | Classic script tag loads `web-ifc-iife.js` (sets `globalThis.WebIFC`) |
| `src/web-ifc-shim.js` | Re-exports all 1171 web-ifc symbols; patches `Init()` with `forceSingleThread=true` |
| `src/App.jsx` | `IFCViewer` component correct; correct init order |
| `public/web-ifc-iife.js` | Present (73617 lines) |
| `public/web-ifc.wasm` | Present |
| `public/web-ifc-mt.wasm` | Present |
| `public/fragments-worker.mjs` | Present |
| `public/models/building.ifc` | Present (4.8 MB) |
