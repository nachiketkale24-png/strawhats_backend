# Mumbai Flood Nowcast

Mumbai-only SIH frontend using Vite, React 18, TypeScript, Tailwind CSS 3,
MapLibre GL, Framer Motion, and Lucide. No API keys or backend required.

```sh
npm install
npm run dev
```

`npm run build` checks TypeScript and creates the production SPA in `dist`.
`npm run preview` serves that build locally. SPA hosting should serve `index.html`.

Map tiles require internet access: CARTO Positron, Esri World Imagery,
and OpenFreeMap buildings. Attribution remains visible in the map.
3D buildings appear above zoom 13; their height ramps up through zoom 15.
Enabling 3D zooms to at least 14.5 so the extrusions are visible immediately.
Desktop controls support tap, press-and-hold, and keyboard activation.
Small screens use native map drag/pinch. The palette is static in `src/index.css`.

This prototype uses deterministic synthetic data, not live risk predictions.
Use the six forecast buttons to update flood hotspots, rainfall, road colors, and
the selected route. Inspect a hotspot for rainfall, elevation, and imperviousness
inputs, a drainage node for status, or an edge for flow direction and capacity.

Select **Pick route**, then click start A and destination B. Points snap to the
nearest junction in the shared 17-segment approximate Mumbai road network.
A third click begins a new route. Dijkstra weights road length by mock flood
depth; the panel compares its distance with the unweighted shortest road path.
For a visible detour, try the central corridor from approximately
`72.865, 19.025` to `72.875, 19.130` at +90 minutes. This is not navigation.

Flood generation and the approximate road network live in `src/data/mockFlood.ts`.
Drainage nodes and their directed graph live in `src/data/mockDrainage.ts`.
The map and both datasets share `MUMBAI_BOUNDS` in `src/config/mumbai.ts`;
sampling spacing and node placement derive from that extent.
Shared records are in `src/types/flood.ts`. A future REST adapter can supply the
same `MockFloodData` shape; no backend calls have been added. Map layers update
existing GeoJSON sources, and routing reuses the road features used for coloring.
Additional semantic map colors are static CSS variables alongside the original palette.

Floating panels share `components/ui/Panel.tsx`, 16px padding, and 12px stack
gaps. The left stack holds rainfall and legend; the right holds map toggles and
route inspection. The UI is light-only, with blue-filled selected buttons and
white outlined inactive buttons. Panel transitions share a
180ms fade/slide and respect reduced-motion preferences.

Each forecast has 1,600 point hotspots sampled across the full extent. A blended
yellow-to-red heatmap transitions to depth-sized circles between zoom 13 and 14.
Heatmap density blends nearby values; inspect for exact depths. Roads retain
their original depth scale. Eleven drainage nodes form ten directed mock edges,
with midpoint arrows and dashed segments above 85% capacity utilization.

The heatmap uses a fixed 70px radius and stops rendering at zoom 14. Buildings
render above the heatmap with opaque blue-gray faces; road and drainage overlays
stay above them. See `map-diagnostics.md` for the zoom/3D regression investigation.

Validation (Node 22.6+):

```sh
node --experimental-strip-types scripts/check-routing.mjs
```

`scripts/verify-dashboard.cjs` clicks through the running dev server using an
existing Playwright Core installation and Chrome (no test packages are installed).
Set `PLAYWRIGHT_CORE_PATH` and `CHROME_PATH` for your local installation, then run
`node scripts/verify-dashboard.cjs http://localhost:5173`.
