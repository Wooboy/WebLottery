// 輕量彩帶特效（canvas），不依賴外部套件

const COLORS = [
  '#facc15',
  '#f87171',
  '#60a5fa',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#ffffff',
  '#fb923c',
]

let canvas = null
let ctx2d = null
let particles = []
let rafId = 0
let lastTime = 0

function ensureCanvas() {
  if (canvas) return
  canvas = document.createElement('canvas')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '3000',
  })
  document.body.appendChild(canvas)
  ctx2d = canvas.getContext('2d')
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function spawn(x, y, angle, spread, speed, count) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread
    const v = speed * (0.5 + Math.random() * 0.7)
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 12,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      wobble: Math.random() * 10,
    })
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  const W = window.innerWidth
  const H = window.innerHeight
  ctx2d.clearRect(0, 0, W, H)
  particles = particles.filter((p) => p.y < H + 40 && p.x > -60 && p.x < W + 60)
  for (const p of particles) {
    p.vy += 900 * dt
    p.vx *= 0.99
    p.vy *= 0.99
    p.wobble += dt * 8
    p.x += (p.vx + Math.sin(p.wobble) * 30) * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt
    ctx2d.save()
    ctx2d.translate(p.x, p.y)
    ctx2d.rotate(p.rot)
    ctx2d.fillStyle = p.color
    ctx2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.wobble)))
    ctx2d.restore()
  }
  if (particles.length) {
    rafId = requestAnimationFrame(frame)
  } else {
    rafId = 0
    ctx2d.clearRect(0, 0, W, H)
  }
}

export function confetti({ big = false } = {}) {
  ensureCanvas()
  resize()
  const W = window.innerWidth
  const H = window.innerHeight
  if (big) {
    // 大獎：左右兩側往中間噴發
    spawn(0, H, -Math.PI / 3, 0.7, 1500, 160)
    spawn(W, H, (-2 * Math.PI) / 3, 0.7, 1500, 160)
    spawn(W / 2, H * 0.35, -Math.PI / 2, Math.PI * 2, 700, 100)
  } else {
    spawn(W / 2, H * 0.45, -Math.PI / 2, Math.PI * 1.2, 900, 140)
  }
  if (!rafId) {
    lastTime = performance.now()
    rafId = requestAnimationFrame(frame)
  }
}

// 立即清除畫面上的彩帶（例如離開抽獎模式時）
export function clearConfetti() {
  particles = []
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  if (ctx2d) ctx2d.clearRect(0, 0, window.innerWidth, window.innerHeight)
}
