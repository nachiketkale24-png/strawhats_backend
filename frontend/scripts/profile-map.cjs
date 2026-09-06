const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/Vansh/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core')
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/src/data/mockFlood.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('function generateMockFlood() {', 'function generateMockFlood() { window.__generations = (window.__generations || 0) + 1;') })
    })
    await page.route('**/src/hooks/useMumbaiMap.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('mapRef.current = map;', 'mapRef.current = map; window.__testMap = map;') })
    })
    await page.goto(process.argv[2] || 'http://localhost:5177')
    await page.waitForFunction(() => window.__testMap?.getLayer('flood-heatmap'), null, { timeout: 60000 })
    await page.getByRole('button', { name: '+90', exact: true }).click()
    await page.getByRole('button', { name: '3D buildings' }).click()
    await page.evaluate(() => window.__testMap.jumpTo({ center: [72.858, 19.113], zoom: 14.5, pitch: 55, bearing: -15 }))
    await page.waitForFunction(() => window.__testMap.isSourceLoaded('openfreemap') && window.__testMap.areTilesLoaded(), null, { timeout: 60000 })
    const label = process.argv[3] || 'before'
    await page.screenshot({ path: `buildings-${label}.png` })
    const diagnostics = await page.evaluate(async () => {
      const map = window.__testMap
      const layers = map.getStyle().layers
      window.__setDataCalls = 0
      for (const id of ['flood-grid', 'mumbai-roads', 'drainage-arrows']) {
        const source = map.getSource(id)
        const original = source.setData.bind(source)
        source.setData = (...args) => { window.__setDataCalls++; return original(...args) }
      }
      const eligible = layers.filter(layer => layer.layout?.visibility !== 'none' && (layer.minzoom ?? 0) <= map.getZoom() && (layer.maxzoom ?? 99) > map.getZoom())
      return {
        generationCount: window.__generations,
        layerIds: layers.map(layer => layer.id),
        eligibleLayers: eligible.map(layer => ({ id: layer.id, type: layer.type })),
        buildingFeatures: map.queryRenderedFeatures({ layers: ['mumbai-buildings-3d'] }).length,
        buildingPaint: layers.find(layer => layer.id === 'mumbai-buildings-3d').paint,
        heatmapPaint: layers.find(layer => layer.id === 'flood-heatmap').paint,
        arrowRotation: map.getLayoutProperty('drainage-arrows', 'icon-rotate'),
      }
    })
    async function profile(hideHeatmap) {
      return page.evaluate(async hidden => {
        const map = window.__testMap
        map.setLayoutProperty('flood-heatmap', 'visibility', hidden ? 'none' : 'visible')
        const frames = []
        for (const zoom of [13.2, 14.5, 13.2, 14.5]) {
          await new Promise(resolve => { map.once('moveend', resolve); map.easeTo({ zoom, duration: 1200 }) })
          await new Promise(resolve => requestAnimationFrame(resolve))
        }
        // Now both vector zooms are warm. Sample identical zoom legs.
        let collecting = true
        let previous = performance.now()
        const sample = now => { if (!collecting) return; frames.push(now - previous); previous = now; requestAnimationFrame(sample) }
        requestAnimationFrame(sample)
        for (const zoom of [13.2, 14.5, 13.2, 14.5]) {
          await new Promise(resolve => { map.once('moveend', resolve); map.easeTo({ zoom, duration: 1200 }) })
        }
        collecting = false
        frames.sort((a, b) => a - b)
        return { medianMs: frames[Math.floor(frames.length * 0.5)], p95Ms: frames[Math.floor(frames.length * 0.95)], maxMs: frames.at(-1), over50ms: frames.filter(frame => frame > 50).length, count: frames.length }
      }, hideHeatmap)
    }
    diagnostics.withHeatmap = await profile(false)
    diagnostics.withoutHeatmap = await profile(true)
    diagnostics.afterMotion = await page.evaluate(() => ({ generationCount: window.__generations, setDataCalls: window.__setDataCalls }))
    diagnostics.errors = errors
    fs.writeFileSync(`profile-${label}.json`, JSON.stringify(diagnostics, null, 2))
    console.log(JSON.stringify({ ...diagnostics, layerIds: diagnostics.layerIds, eligibleLayers: diagnostics.eligibleLayers }, null, 2))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
