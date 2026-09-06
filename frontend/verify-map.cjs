const { chromium } = require('C:/Users/Vansh/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core')

;(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request => console.log('REQUEST FAILED', request.url(), request.failure()))
    await page.goto(process.argv[2] || 'http://localhost:5173')
    await page.waitForFunction(() => {
      const button = document.querySelector('[aria-label="Satellite imagery"]')
      return button && !button.disabled
    }, { timeout: 45000 })
    console.log('MAP READY; loading label count:', await page.getByText('Loading Mumbai map…').count())
    await page.getByRole('button', { name: 'Satellite imagery' }).click()
    await page.getByRole('button', { name: '3D buildings' }).click()
    console.log('TOGGLES:', await page.getByRole('button', { name: 'Satellite imagery' }).getAttribute('aria-pressed'), await page.getByRole('button', { name: '3D buildings' }).getAttribute('aria-pressed'))
    await page.getByRole('button', { name: 'Satellite imagery' }).click()
    await page.getByRole('button', { name: '3D buildings' }).click()
    await page.screenshot({ path: 'map-verification.png' })
    console.log('PAGE ERRORS:', errors)
    if (errors.length) process.exitCode = 1
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
