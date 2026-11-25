// 產生使用手冊的抽獎動畫截圖（1024×768）
// 用法：先 npm run build && npm run preview（預設 http://localhost:4173），再執行
//   node scripts/capture-manual.mjs [網址]
// 需要本機安裝 Chrome 或 Edge；截圖輸出到 src/assets/manual/<樣式>.webp
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_BASE = process.argv[2] || 'http://localhost:4173/'
const OUT = new URL('../src/assets/manual/', import.meta.url)
const WIDTH = 1024
const HEIGHT = 768
const PORT = 9333

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
]

// 示範名單：60 位虛構人員
const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周'
const GIVEN = [
  '志明',
  '淑芬',
  '家豪',
  '雅婷',
  '冠宇',
  '怡君',
  '俊傑',
  '佩珊',
  '建宏',
  '詩涵',
  '宗翰',
  '欣怡',
]
const people = Array.from({ length: 60 }, (_, i) => {
  const name =
    SURNAMES[(i * 7) % SURNAMES.length] + GIVEN[(i * 5 + Math.floor(i / 12)) % GIVEN.length]
  return `E${String(i + 1).padStart(3, '0')},${name}`
})

// 每種樣式一個獎項，keys 為按鍵 / 等待的劇本，最後截圖
const SHOTS = [
  {
    style: 'classic',
    name: '貳獎',
    reward: '平板電腦',
    count: 5,
    mode: 'all',
    steps: [
      ['Space', 900],
      ['Space', 5200],
    ],
  },
  {
    style: 'slot',
    name: '頭獎',
    reward: '機車一台',
    count: 1,
    mode: 'single',
    steps: [
      ['Space', 900],
      ['Space', 11000],
    ],
  },
  {
    style: 'wheel',
    name: '參獎',
    reward: '咖啡機',
    count: 1,
    mode: 'single',
    steps: [
      ['Space', 1200],
      ['Space', 6500],
    ],
  },
  {
    style: 'pile',
    name: '特別獎',
    reward: '旅遊住宿券',
    count: 1,
    mode: 'single',
    steps: [['Space', 4500]],
  },
  {
    style: 'elimination',
    name: '肆獎',
    reward: '藍牙耳機',
    count: 5,
    mode: 'all',
    elimRounds: 3,
    steps: [
      ['Space', 900],
      ['Space', 3200],
    ],
  },
  {
    style: 'lights',
    name: '伍獎',
    reward: '行動電源',
    count: 5,
    mode: 'all',
    steps: [[null, 1500]],
  },
  {
    style: 'flip',
    name: '陸獎',
    reward: '保溫杯',
    count: 3,
    mode: 'single',
    steps: [
      ['Space', 2200],
      ['Space', 2500],
    ],
  },
  {
    style: 'countdown',
    name: '加碼獎',
    reward: '現金紅包',
    count: 1,
    mode: 'single',
    steps: [['Space', 5200]],
  },
  {
    style: 'gacha',
    name: '幸運獎',
    reward: '電影票',
    count: 1,
    mode: 'single',
    steps: [['Space', 5000]],
  },
]

const browser = BROWSERS.find(existsSync)
if (!browser) throw new Error('找不到 Chrome / Edge')
const profile = mkdtempSync(join(tmpdir(), 'lottery-shot-'))
const proc = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  '--hide-scrollbars',
  '--mute-audio',
  'about:blank',
])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('無法連線到瀏覽器')
}

const ws = new WebSocket(await connect())
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = (expression) =>
  send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    userGesture: true,
    returnByValue: true,
  })

async function key(code) {
  const k = { Space: [' ', 32], Enter: ['Enter', 13] }[code]
  const base = { code, key: k[0], windowsVirtualKeyCode: k[1] }
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...base,
    text: code === 'Space' ? ' ' : '\r',
  })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: false,
})

const prizes = SHOTS.map((s, i) => ({
  id: `manual-${i}`,
  name: s.name,
  reward: s.reward,
  count: s.count,
  mode: s.mode,
  bgUrl: '',
  allowRepeat: false,
  style: s.style,
  elimRounds: s.elimRounds || 3,
}))

mkdirSync(OUT, { recursive: true })
await send('Page.navigate', { url: URL_BASE })
await sleep(1000)

for (const [i, shot] of SHOTS.entries()) {
  const state = {
    rawParticipants: people.join('\n'),
    prizes,
    results: [],
    config: { theme: 'red', sound: false, effects: false, idLength: 4 },
    currentIndex: i,
  }
  await evaluate(
    `localStorage.setItem('lottery_app_v2026_data', ${JSON.stringify(JSON.stringify(state))}); location.reload()`,
  )
  await sleep(1200)
  await evaluate(
    `[...document.querySelectorAll('header button')].find(b => b.textContent.includes('開始抽獎')).click()`,
  )
  await sleep(1500)
  for (const [code, wait] of shot.steps) {
    if (code) await key(code)
    await sleep(wait)
  }
  const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 82 })
  writeFileSync(new URL(`${shot.style}.webp`, OUT), Buffer.from(data, 'base64'))
  console.log('✓', shot.style)
}

ws.close()
proc.kill()
await sleep(500)
rmSync(profile, { recursive: true, force: true })
