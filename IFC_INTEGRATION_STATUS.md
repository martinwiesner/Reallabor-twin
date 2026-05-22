# IFC Viewer Integration — Status Report

## Status: ✅ Working

3D IFC model panel renders next to the EnergyFlow diagram in the Live view. Tiles stream into the scene and all geometry loads at full detail. Uses `@thatopen/components` v3.4.6 (which delegates IFC parsing to `web-ifc` v0.0.77 WASM and tile rendering to `@thatopen/fragments` v3.4.5).

---

## Problems Solved (chronological)

### 1. Multiple Three.js instances + `uuid` crash
- **Symptom:** `THREE.WARNING: Multiple instances of Three.js being imported` → `Cannot read properties of undefined (reading 'uuid')`
- **Cause:** Dynamic `import()` inside `useEffect` bypassed Vite's module deduplication. Core classes (`SimpleScene`, `SimpleCamera`, etc.) were also imported from the wrong package (`@thatopen/components-front` instead of `@thatopen/components`).
- **Fix:** Static top-level `import * as OBC from "@thatopen/components"`. Added `three` to `resolve.dedupe` and `optimizeDeps.exclude`.

### 2. "You need to initialize fragments first"
- **Cause:** In v3, `FragmentsManager.init(workerUrl)` must be called before any `IfcLoader` operation.
- **Fix:** `await fragments.init('/reallabor-twin/fragments-worker.mjs')` before `ifcLoader.setup()`.

### 3. ThatOpen watermark in bottom-left corner
- **Cause:** `SimpleRenderer` injects a `[data-thatopen-logo]` div into the container automatically.
- **Fix:** `container.querySelector('[data-thatopen-logo]')?.remove()` after `components.init()`.

### 4. Vite doubled the base path on the IIFE script tag
- **Symptom:** `<script src="/reallabor-twin/web-ifc-iife.js">` became `/reallabor-twin/reallabor-twin/web-ifc-iife.js` (404).
- **Cause:** Vite automatically prepends the `base` config to `<script src>` paths in `index.html`. Writing the full path caused it to be prepended twice.
- **Fix:** `<script src="/web-ifc-iife.js">` — Vite prepends the base, producing the correct `/reallabor-twin/web-ifc-iife.js`.

### 5. App crash: shim reading `undefined.IfcAPI`
- **Cause:** Shim had `const w = globalThis.WebIFC;`. If the IIFE failed to load, `w` was `undefined` and `w.IfcAPI` crashed the React module graph.
- **Fix:** `const w = globalThis.WebIFC ?? {}` — missing IIFE just gives undefined exports instead of crashing.

### 6. `WebAssembly.instantiate(): Import #0 "a"` — the real root cause
This was the persistent blocker. The earlier theory (Vite's ESM transform breaking the emscripten import object) was **wrong**.

- **Actual cause:** `@thatopen/components` 3.4.6 has `autoSetWasm: true` as its default `IfcLoader` setting. In `setup()`, `autoSetWasm()` runs and **overwrites the `wasm.path` we explicitly passed** with `https://unpkg.com/web-ifc@0.0.66/`. The v0.0.66 WASM uses minified `"a"` imports, but the v0.0.77 IIFE we load locally provides `{env, wasi_snapshot_preview1}` imports → mismatch → `Import #0 "a": module is not an object or function`.
- **How we found it:** Patched `globalThis.fetch` to log every `.wasm` request. Console showed `[wasm-fetch] https://unpkg.com/web-ifc@0.0.66/web-ifc.wasm bytes= 1188286` — wrong URL, wrong version.
- **Fix:** Pass `autoSetWasm: false` to `IfcLoader.setup()`:
  ```js
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { path: '/reallabor-twin/', absolute: true },
  });
  ```
  The IIFE+shim+`forceSingleThread = true` is still useful (prevents the MT factory from being selected under `crossOriginIsolated` without `SharedArrayBuffer`), but the version mismatch was the actual blocker.

### 7. `Fragments: Unsupported input type`
- **Cause:** `ifcLoader.load(buffer)` was called with only the buffer. The signature is `load(bytes, autoCoordinate, modelId, options)`. With `modelId` undefined, the fragments worker's `getModelCode → CRC.generate([undefined]) → compute(undefined)` throws because the CRC has no `undefined` handler.
- **Fix:** `ifcLoader.load(new Uint8Array(buffer), true, 'building')` — pass a non-empty model id.

### 8. `THREE.Object3D.add: object not an instance of THREE.Object3D. _FragmentsModel {…}`
- **Cause:** `ifcLoader.load()` returns a `FragmentsModel` wrapper, not a `THREE.Object3D`. The actual scene node is at `model.object`.
- **Fix:** `world.scene.three.add(model.object)`, not `add(model)`.

### 9. `camera-controls: fitTo() cannot be used with an empty box`
- **Cause:** Tile streaming is asynchronous; immediately after `load()`, the model's geometry isn't in the scene yet and `fitToBox` on the empty object computes an empty `Box3`.
- **Fix:** Use `model.box` (stored bbox from `_setup`) and guard against empty:
  ```js
  const box = model.box;
  if (!box.isEmpty()) world.camera.controls.fitToBox(box, true);
  ```

### 10. Model renders only partially
- **Cause:** Fragments uses tile streaming with LOD. Without a camera bound and per-frame updates, only tiles touched by camera events load — frustum changes between events leave gaps.
- **Fix:** Bind camera, set graphics quality to max, and drive updates from the renderer's per-frame hook:
  ```js
  model.useCamera(world.camera.three);
  model.graphicsQuality = 1;
  world.renderer.onBeforeUpdate.add(() => fragments.core.update());
  await fragments.core.update(true);
  ```

---

## Final File State

| File | Purpose |
|---|---|
| `vite.config.js` | `web-ifc` aliased to shim; OBC packages + `three` excluded from `optimizeDeps`; `three` in `resolve.dedupe`. |
| `index.html` | Classic `<script src="/web-ifc-iife.js">` (sets `globalThis.WebIFC`) before the module script. |
| `src/web-ifc-shim.js` | Re-exports all web-ifc symbols from `globalThis.WebIFC`. Subclasses `IfcAPI.Init` to force `forceSingleThread = true`. |
| `src/App.jsx` | `IFCViewer` component with the full v3 init sequence (see `ifc-loader` skill, section 5). |
| `public/web-ifc-iife.js` | v0.0.77, ≈ 6 MB. |
| `public/web-ifc.wasm` | v0.0.77 single-threaded, ≈ 1.30 MB. |
| `public/web-ifc-mt.wasm` | v0.0.77 multi-threaded, ≈ 1.31 MB (kept as fallback, not currently used). |
| `public/fragments-worker.mjs` | @thatopen/fragments 3.4.5 worker. |
| `public/models/building.ifc` | 4.8 MB source IFC file. |

---

## Key Settings Cheatsheet

```js
// vite.config.js
optimizeDeps: { exclude: ['@thatopen/components', '@thatopen/components-front', 'three'] },
resolve: {
  dedupe: ['react', 'react-dom', 'three'],
  alias: { 'web-ifc': resolve(__dirname, './src/web-ifc-shim.js') },
},

// IFCViewer load sequence (the parts that are easy to get wrong)
await ifcLoader.setup({
  autoSetWasm: false,                                 // 🔑 prevents unpkg override
  wasm: { path: '/reallabor-twin/', absolute: true },
});
const model = await ifcLoader.load(new Uint8Array(buffer), true, 'building');  // 🔑 modelId
world.scene.three.add(model.object);                   // 🔑 .object, not model
model.useCamera(world.camera.three);                   // 🔑 LOD camera binding
model.graphicsQuality = 1;
world.renderer.onBeforeUpdate.add(() => fragments.core.update());  // per-frame tiles
```

For everything else — Phase 2 interactivity (floor isolation, sensor highlighting, parameter→material overrides, MCP commands, click navigation) — see the `ifc-loader` skill.
