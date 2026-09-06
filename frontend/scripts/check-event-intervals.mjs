import assert from 'node:assert/strict'
import { fromArrayBuffer } from 'geotiff'

const base = process.argv[2] || 'http://localhost:5174/api'
const durations = [15, 30, 60, 90, 120, 180]
async function request(path, options) {
  const response = await fetch(base + path, options)
  assert.equal(response.status, 200, `${path}: ${response.status}`)
  return response
}
const events = await (await request('/flood/events')).json()
for (const event of ['2015-06-19', '2017-08-29', '2020-09-23']) {
  assert.ok(events.includes(event))
  const manifest = await (await request(`/flood/windows/${event}`)).json()
  assert.deepEqual(manifest.windows.map(window => window.minutes), durations)
  const means = []
  for (const minutes of durations) {
    const query = `?window_minutes=${minutes}`
    const summary = await (await request(`/flood/summary/${event}${query}`)).json()
    assert.equal(summary.event_date, event)
    assert.ok(summary.fsi_min >= 0 && summary.fsi_max <= 1)
    means.push(summary.fsi_mean)
    const image = await (await fromArrayBuffer(await (await request(`/flood/raster/${event}${query}`)).arrayBuffer())).getImage()
    const values = await image.readRasters({samples:[0],interleave:true})
    const index = Array.from(values).findIndex(value => value > 0.25 && value < 0.75)
    assert.ok(index >= 0)
    const [west,south,east,north] = image.getBoundingBox()
    const lon = west + ((index % image.getWidth()) + 0.5) / image.getWidth() * (east-west)
    const lat = north - (Math.floor(index / image.getWidth()) + 0.5) / image.getHeight() * (north-south)
    const point = await (await request(`/flood/point/${event}${query}&lon=${lon}&lat=${lat}`)).json()
    assert.ok(Math.abs(point.fsi - values[index]) < 1e-6)
    if (minutes === 15 || minutes === 180) {
      const route = await (await request('/route', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_date:event,window_minutes:minutes,origin_lon:72.85,origin_lat:19.11,dest_lon:72.86,dest_lat:19.2})})).json()
      assert.equal(route.event_date,event)
      for (const result of [route.normal_route,route.flood_aware_route]) {
        assert.ok(result.length_m > 0 && result.coordinates.length > 1)
        assert.ok(result.max_risk >= 0 && result.max_risk <= 1)
      }
    }
  }
  assert.ok(new Set(means).size > 1, 'Intervals must use different observed rainfall')
  console.log(`PASS: ${event}: six rasters, summaries and pixel samples; 15/180-minute routes.`)
}
assert.equal((await fetch(base+'/flood/summary/2017-08-29?window_minutes=17')).status,422)
assert.equal((await fetch(base+'/flood/raster/1900-01-01?window_minutes=15')).status,404)
console.log('PASS: unsupported duration and missing event are rejected.')
