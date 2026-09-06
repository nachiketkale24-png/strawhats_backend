// Uses the existing local Playwright installation; no application dependency.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/Vansh/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core')

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    const baseline = process.argv.includes('--baseline')
    if (baseline) await page.route('**/src/data/mockFlood.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('GRID_SUBDIVISIONS = 40', 'GRID_SUBDIVISIONS = 10') })
    })
    page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR', error.message) })
    page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE ERROR', message.text()) } })
    // Instrument only the dev response in this browser, never the shipped app.
    await page.route('**/src/hooks/useMumbaiMap.ts*', async route => {
      const response = await route.fetch()
      const body = (await response.text()).replace('mapRef.current = map;', 'mapRef.current = map; window.__testMap = map;')
      await route.fulfill({ response, body })
    })
    await page.goto(process.argv[2] || 'http://localhost:5173')
    await page.waitForFunction(() => !document.querySelector('[aria-label="Satellite imagery"]')?.disabled && window.__testMap?.getLayer('flood-heatmap'), null, { timeout: 60000 }).catch(async error => {
      console.log('LOAD DIAGNOSTICS', await page.locator('body').innerText())
      await page.screenshot({ path: 'map-verification.png' })
      throw error
    })
    await page.waitForFunction(() => window.__testMap.isSourceLoaded('flood-grid'))
    console.log('1/2: map ready, grid and legend visible')
    const styling = await page.evaluate(() => {
      const rainfall = document.querySelector('[aria-label="Rainfall readout"]')
      const legend = document.querySelector('[aria-label="Flood depth legend"]')
      const route = document.querySelector('[aria-label="Route picker"]')
      const panel = rainfall.firstElementChild
      return {
        leftGap: legend.getBoundingClientRect().top - rainfall.getBoundingClientRect().bottom,
        rightGap: route.getBoundingClientRect().top - route.previousElementSibling.getBoundingClientRect().bottom,
        paddings: [...document.querySelectorAll('.hud-panel')].map(element => getComputedStyle(element).padding),
        panelBackground: getComputedStyle(panel).backgroundColor,
        attributionBackground: getComputedStyle(document.querySelector('.maplibregl-ctrl-attrib')).backgroundColor,
        labelFont: getComputedStyle(document.querySelector('.hud-label')).fontFamily,
        selectedBackground: getComputedStyle(document.querySelector('button[aria-pressed="true"]')).backgroundColor,
      }
    })
    console.log('PANEL STYLING', styling)
    assert.equal(styling.leftGap, 12)
    assert.equal(styling.rightGap, 12)
    assert.ok(styling.paddings.every(padding => padding === '16px'))
    assert.equal(styling.panelBackground, styling.attributionBackground)
    assert.equal(styling.selectedBackground, 'rgb(212, 175, 55)')
    assert.equal(styling.panelBackground, 'rgba(12, 14, 26, 0.94)')
    const contrast = await page.evaluate(() => {
      const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const selected = getComputedStyle(document.querySelector('button[aria-pressed="true"]'))
      const caption = getComputedStyle(document.querySelector('.hud-label'))
      const value = getComputedStyle(document.querySelector('[aria-label="Rainfall readout"] p'))
      const panelBackground = luminance(getComputedStyle(document.querySelector('.hud-panel')).backgroundColor)
      return { selected: ratio(luminance(selected.color), luminance(selected.backgroundColor)), caption: ratio(luminance(caption.color), panelBackground), value: ratio(luminance(value.color), panelBackground) }
    })
    console.log('DARK TEXT CONTRAST', contrast)
    assert.ok(Object.values(contrast).every(ratio => ratio >= 4.5))
    assert.equal(await page.getByRole('complementary', { name: 'Flood depth legend' }).count(), 1)
    const before = await page.evaluate(async () => {
      window.__grid = window.__testMap.getSource('flood-grid')
      window.__roads = window.__testMap.getSource('mumbai-roads')
      return (await window.__grid.getData()).features.map(feature => feature.properties.depthCm)
    })
    for (const offset of [30, 60, 90, 120, 180, 0, 90]) {
      await page.getByRole('button', { name: offset === 0 ? 'Now' : `+${offset}`, exact: true }).click()
      await page.waitForFunction(async value => (await window.__testMap.getSource('flood-grid').getData()).features[0].properties.timestampOffsetMin === value, offset)
      assert.match(await page.getByRole('complementary', { name: 'Rainfall readout' }).innerText(), new RegExp(String(({ 0: 18, 30: 32, 60: 51, 90: 76, 120: 62, 180: 26 })[offset])))
    }
    const after = await page.evaluate(async () => ({
      depths: (await window.__grid.getData()).features.map(feature => feature.properties.depthCm),
      sameSources: window.__grid === window.__testMap.getSource('flood-grid') && window.__roads === window.__testMap.getSource('mumbai-roads'),
      roads: (await window.__roads.getData()).features.length,
      nodes: (await window.__testMap.getSource('drainage-nodes').getData()).features.length,
    }))
    assert.notDeepEqual(before, after.depths)
    assert.equal(after.sameSources, true)
    assert.equal(after.roads, 17)
    assert.equal(after.nodes, 11)
    console.log('3/4/5/6: all forecasts, rainfall, road depths, drainage; sources reused')
    async function clickCoordinate(lng, lat) {
      const point = await page.evaluate(([lng, lat]) => {
        const map = window.__testMap
        const rect = map.getCanvas().getBoundingClientRect()
        const pixel = map.project([lng, lat])
        return { x: rect.left + pixel.x, y: rect.top + pixel.y }
      }, [lng, lat])
      await page.mouse.click(point.x, point.y)
    }
    await page.waitForFunction(() => window.__testMap.isSourceLoaded('flood-grid'))
    const cellCenter = await page.evaluate(async () => {
      const cells = (await window.__testMap.getSource('flood-grid').getData()).features.map(feature => feature.properties)
      return cells.reduce((best, cell) => Math.hypot(cell.lng - 72.882, cell.lat - 19.0975) < Math.hypot(best.lng - 72.882, best.lat - 19.0975) ? cell : best)
    })
    await clickCoordinate(cellCenter.lng, cellCenter.lat)
    await page.locator('.inspection-content').waitFor()
    assert.match(await page.locator('.inspection-content').innerText(), /Flood depth:.*cm[\s\S]*Rainfall:[\s\S]*Elevation:[\s\S]*Imperviousness:/)
    await page.getByRole('button', { name: 'Close popup' }).click()
    await clickCoordinate(72.880, 19.072)
    await page.locator('.inspection-content').waitFor()
    assert.match(await page.locator('.inspection-content').innerText(), /Kurla[\s\S]*surcharging/)
    await page.getByRole('button', { name: 'Close popup' }).click()
    console.log('8: grid input popup and drainage popup verified')
    await clickCoordinate(72.8435, 19.087)
    await page.locator('.inspection-content').waitFor()
    assert.match(await page.locator('.inspection-content').innerText(), /Andheri → Bandra[\s\S]*Capacity utilization: 79%/)
    await page.getByRole('button', { name: 'Close popup' }).click()
    const drainage = await page.evaluate(async () => ({
      edges: (await window.__testMap.getSource('drainage-edges').getData()).features.length,
      arrows: window.__testMap.queryRenderedFeatures({ layers: ['drainage-arrows'] }).length,
      dash: window.__testMap.getPaintProperty('drainage-edges', 'line-dasharray'),
      oldFill: Boolean(window.__testMap.getLayer('flood-grid-fill')),
    }))
    assert.equal(drainage.edges, 10)
    assert.ok(drainage.arrows > 0)
    assert.equal(drainage.oldFill, false)
    assert.match(JSON.stringify(drainage.dash), /capacityUtilization/)
    console.log('DRAINAGE GRAPH', drainage)
    await page.getByRole('button', { name: 'Pick route', exact: true }).click()
    assert.match(await page.getByRole('complementary', { name: 'Route picker' }).innerText(), /Pick your start point/)
    await clickCoordinate(72.865, 19.025)
    assert.match(await page.getByRole('complementary', { name: 'Route picker' }).innerText(), /Pick your destination/)
    await clickCoordinate(72.875, 19.130)
    await page.waitForFunction(async () => (await window.__testMap.getSource('route-line').getData()).features.length === 1)
    assert.match(await page.getByRole('complementary', { name: 'Route picker' }).innerText(), /Depth-weighted:/)
    assert.doesNotMatch(await page.getByRole('complementary', { name: 'Route picker' }).innerText(), /Pick your|approximate|Synthetic|junctions/)
    const routeBefore = await page.evaluate(async () => (await window.__testMap.getSource('route-line').getData()).features[0].geometry.coordinates)
    assert.ok(routeBefore.length > 2)
    await page.getByRole('button', { name: 'Now', exact: true }).click()
    await page.waitForFunction(async () => (await window.__testMap.getSource('flood-grid').getData()).features[0].properties.timestampOffsetMin === 0)
    await clickCoordinate(72.845, 19.130)
    await page.waitForFunction(async () => (await window.__testMap.getSource('route-line').getData()).features.length === 0 && (await window.__testMap.getSource('route-points').getData()).features.length === 1)
    await clickCoordinate(72.865, 19.025)
    await page.waitForFunction(async () => (await window.__testMap.getSource('route-line').getData()).features.length === 1)
    console.log('7: route follows graph; third click resets and starts a new route')
    await page.getByRole('button', { name: 'Satellite imagery' }).click()
    await page.waitForFunction(() => window.__testMap.getLayoutProperty('satellite-imagery', 'visibility') === 'visible')
    await page.getByRole('button', { name: 'Satellite imagery' }).click()
    await page.getByRole('button', { name: '3D buildings' }).click()
    await page.waitForFunction(() => !window.__testMap.isMoving() && Math.abs(window.__testMap.getPitch() - 55) < 0.1)
    const buildings = await page.evaluate(() => {
      const map = window.__testMap
      const ids = map.getStyle().layers.map(layer => layer.id)
      return { zoom: map.getZoom(), opacity: map.getPaintProperty('mumbai-buildings-3d', 'fill-extrusion-opacity'), aboveHeat: ids.indexOf('mumbai-buildings-3d') > ids.indexOf('flood-heatmap') }
    })
    assert.ok(buildings.zoom >= 14.5)
    assert.equal(buildings.opacity, 1)
    assert.equal(buildings.aboveHeat, true)
    const zoomBefore = await page.evaluate(() => window.__testMap.getZoom())
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.waitForFunction(zoom => !window.__testMap.isMoving() && Math.abs(window.__testMap.getZoom() - zoom - 1) < 0.01, zoomBefore)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
    await page.waitForFunction(zoom => !window.__testMap.isMoving() && Math.abs(window.__testMap.getZoom() - zoom) < 0.01, zoomBefore)
    const buttonBox = await page.getByRole('button', { name: 'Zoom in', exact: true }).boundingBox()
    await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2)
    await page.mouse.down()
    await page.waitForFunction(zoom => window.__testMap.getZoom() > zoom + 0.1, zoomBefore)
    await page.mouse.up()
    await page.waitForFunction(() => !window.__testMap.isMoving())
    console.log('3D entry zoom, building ordering/opacity, zoom buttons and hold/release verified')
    await page.getByRole('button', { name: '3D buildings' }).click()
    await page.waitForFunction(() => window.__testMap.getPitch() < 0.1)
    await page.evaluate(() => window.__testMap.jumpTo({ center: [72.8777, 19.076], zoom: 11 }))
    await page.getByRole('button', { name: '+90', exact: true }).click()
    await page.waitForFunction(() => window.__testMap.isSourceLoaded('flood-grid') && window.__testMap.queryRenderedFeatures({ layers: ['flood-hotspot-hit'] }).some(feature => feature.properties.timestampOffsetMin === 90 && feature.properties.depthCm > 30))
    const performanceCheck = await page.evaluate(async () => {
      const map = window.__testMap
      const data = await map.getSource('flood-grid').getData()
      const intervals = []
      let previous = performance.now()
      map.panBy([100, 0], { duration: 1000 })
      await new Promise(resolve => {
        function sample(now) {
          intervals.push(now - previous)
          previous = now
          if (intervals.length < 90) requestAnimationFrame(sample)
          else resolve()
        }
        requestAnimationFrame(sample)
      })
      intervals.sort((a, b) => a - b)
      return { cells: data.features.length, medianFrameMs: intervals[45], p95FrameMs: intervals[85], longestFrameMs: intervals.at(-1) }
    })
    console.log('GRID PERFORMANCE', performanceCheck)
    assert.equal(performanceCheck.cells, baseline ? 100 : 1600)
    await page.screenshot({ path: 'map-verification.png' })
    await page.evaluate(() => window.__testMap.jumpTo({ center: [72.885, 19.091875], zoom: 15 }))
    await page.waitForFunction(() => window.__testMap.isSourceLoaded('flood-grid') && window.__testMap.queryRenderedFeatures({ layers: ['flood-hotspots'] }).length > 0)
    await page.screenshot({ path: 'hotspots-closeup.png' })
    console.log('Zoom 15 hotspot circles visible')
    console.log('Existing toggles verified; browser errors:', errors)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
