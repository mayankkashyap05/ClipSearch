// Optional: install playwright-core, set CHROMIUM_PATH, then node tests/sharing_browser.cjs.
// Serve real ES modules to a real browser; fixture API responses avoid model/codec downloads.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../frontend');
const origin = 'https://clip.test';
const video = { video_id: 'v1', job_id: 'j1', status: 'completed', filename: 'Field recordings',
  summary: 'Bird calls', chapters: [{ title: 'Morning', start: 2 }, { title: 'Untimed' }] };

// A short PCM recording: exercise the native media element, not a mocked seekTo().
const media = Buffer.alloc(44 + 8000 * 2 * 10);
media.write('RIFF'); media.writeUInt32LE(media.length - 8, 4); media.write('WAVEfmt ', 8);
media.writeUInt32LE(16, 16); media.writeUInt16LE(1, 20); media.writeUInt16LE(1, 22);
media.writeUInt32LE(8000, 24); media.writeUInt32LE(16000, 28); media.writeUInt16LE(2, 32);
media.writeUInt16LE(16, 34); media.write('data', 36); media.writeUInt32LE(media.length - 44, 40);

async function scenario(browser, mode) {
  const page = await browser.newPage({ viewport: { width: mode === 'guest' ? 375 : 1280, height: 850 } });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const owner = mode === 'owner';
  let jobStatus = 'processing', active = true;
  if (mode !== 'guest') await page.addInitScript(isOwner => {
    localStorage.setItem('clipsearch_token', 'saved-session');
    if (!isOwner) localStorage.setItem('clipsearch_api_base', 'https://other.test');
  }, owner);
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    const reply = json => route.fulfill({ json });
    if (url.origin === origin) {
      if (p === '/' || p.startsWith('/share/')) return route.fulfill({ path: path.join(root, 'index.html') });
      if (/^\/(src|styles)\//.test(p)) return route.fulfill({ path: path.join(root, p) });
      if (!owner && p.startsWith('/shared/t/')) {
        if (req.headers().authorization) errors.push('JWT on shared request');
        if (!active) return route.fulfill({ status: 404, json: {} });
        if (p.endsWith('/chat')) return reply({ answer: 'Bird calls', sources: [{ type: 'speech', timestamp: 1 }] });
        if (p.endsWith('/search') && url.searchParams.get('q') === 'none') return reply({ results: [] });
        if (p.endsWith('/search') && url.searchParams.get('q') === 'denied') return route.fulfill({ status: 401, json: {} });
        if (p.endsWith('/search')) return reply({ results: [3, 5].map(timestamp => ({ video_id: 'v1', timestamp, text: 'Bird' })) });
      }
      if (!owner && p === '/shared/t') {
        if (req.headers().authorization) errors.push('JWT on metadata');
        return active ? reply(video) : route.fulfill({ status: 404, json: {} });
      }
      if (p === (owner ? '/videos/v1/stream' : '/shared/t/stream')) {
        return route.fulfill({ contentType: 'audio/wav', body: req.method() === 'HEAD' ? '' : media });
      }
      if (owner && req.headers().authorization === 'Bearer saved-session') {
        if (p === '/videos') return reply({ videos: ['completed', 'pending', 'failed', jobStatus].map((status, i) =>
          ({ ...video, video_id: i === 3 ? 'v1' : 'other' + i, status })) });
        if (p === '/jobs/j1') return reply({ ...video, status: jobStatus, current_stage: 'indexing' });
        if (p === '/videos/v1/playback-token') return reply({ stream_url: '/videos/v1/stream' });
        if (p.endsWith('/share')) {
          if (req.method() === 'DELETE') active = false;
          return reply({ share_token: 't', share_path: '/share/t' });
        }
      }
    }
    errors.push('Unexpected request: ' + req.method() + ' ' + url);
    return route.fulfill({ status: 404, json: {} });
  });
  try {
    await page.goto(origin + (owner ? '/' : mode === 'guest' ? '/share/t' : '/?share=t'));
    if (owner) {
      await page.waitForSelector('[data-share-video]');
      assert.equal(await page.locator('[data-share-video]').count(), 1);
      await page.click('[data-share-video]');
      await page.waitForSelector('#openShare[href]');
      assert.equal(await page.inputValue('#shareUrl'), origin + '/share/t');
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
      await page.click('#copyShare');
      await page.waitForFunction(() => document.querySelector('#shareStatus').textContent === 'Copied!');
      await page.keyboard.press('Escape');
      await page.click('[data-video-id="v1"] .row-open');
      await page.waitForSelector('#signalPath:not([hidden])');
      assert.equal(await page.locator('#workspaceShareBtn').isVisible(), false);
      jobStatus = 'completed';
      await page.click('#workspaceShareBtn'); // waits for the live poll, no reload
      await page.click('#revokeShare');
      await page.waitForSelector('dialog', { state: 'hidden' });
      assert.equal(active, false);
    } else {
      await page.waitForSelector('#playerShell[data-state="ready"]');
      for (const control of ['#workspaceDeleteBtn', '#clearScope', '#backToHome', '#toggleIngest', '[data-scope="all"]', '.sidebar', '.mobile-nav']) {
        assert.equal(await page.locator(control).isVisible(), false, control);
      }
      async function jumped(selector, seconds) {
        await page.click(selector);
        await page.waitForFunction(t => {
          const v = document.querySelector('video');
          return !v.paused && v.currentTime >= t && v.currentTime < t + 1;
        }, seconds);
      }
      await jumped('[data-chapter-start]', 2);
      await page.keyboard.press('/');
      assert.equal(await page.locator('#searchInput').evaluate(e => e === document.activeElement), true);
      await page.fill('#searchInput', 'denied'); await page.keyboard.press('Enter');
      await page.waitForSelector('[data-retry-search]'); // public 401 must not log out
      await page.fill('#searchInput', 'none'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#searchResults').textContent.includes('No matches'));
      assert.equal(await page.locator('[data-clear-search-scope]').count(), 0);
      await page.fill('#searchInput', 'bird'); await page.keyboard.press('Enter');
      await page.waitForSelector('.result-item');
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('.result-item:focus').getAttribute('data-index'), '1');
      await page.keyboard.press('ArrowUp'); await jumped('.result-item:first-child', 3);
      await page.waitForSelector('.result-item:first-child[aria-current="true"]');
      await page.click('#railTabAsk'); await page.click('.suggestion-chip:first-child');
      await jumped('.chat-source', 1);
      active = false;
      await page.reload(); await page.waitForSelector('#sharedErrorView');
      if (mode !== 'guest') assert.equal(await page.evaluate(() => localStorage.getItem('clipsearch_token')), 'saved-session');
    }
    assert.deepEqual(errors, []);
    console.log('PASS:', mode);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-zygote'] });
  try {
    for (const mode of ['guest', 'signed-in viewer', 'owner']) await scenario(browser, mode);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
