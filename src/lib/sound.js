// 以 Web Audio API 即時合成音效，不需任何音檔，離線可用

let audioCtx = null
let isEnabled = () => true
let noiseBuffer = null

export function setSoundEnabled(fn) {
  isEnabled = fn
}

function getCtx() {
  if (!isEnabled()) return null
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    audioCtx = new AC()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function tone(freq, dur, { type = 'sine', gain = 0.2, at = 0, slide } = {}) {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime + at
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

function noise(dur, { gain = 0.15, at = 0, freq = 1200 } = {}) {
  const ac = getCtx()
  if (!ac) return
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const d = noiseBuffer.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  const g = ac.createGain()
  const t = ac.currentTime + at
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t)
  src.stop(t + dur + 0.05)
}

export const sfx = {
  // 滾動 / 轉盤經過格子的「喀」聲
  tick() {
    tone(1500, 0.03, { type: 'square', gain: 0.04 })
  },
  // 鼓聲（漸強）
  drumroll(seconds) {
    for (let t = 0; t < seconds; t += 0.05) {
      noise(0.07, { gain: 0.04 + 0.14 * (t / seconds), at: t, freq: 320 })
    }
  },
  // 重擊（淘汰、倒數結束）
  hit() {
    noise(0.3, { gain: 0.35, freq: 140 })
    tone(90, 0.35, { gain: 0.35, slide: 40 })
  },
  // 扭蛋搖晃聲
  rattle(seconds) {
    for (let t = 0; t < seconds; t += 0.06) {
      noise(0.04, { gain: 0.07, at: t + Math.random() * 0.03, freq: 2600 })
    }
  },
  pop() {
    tone(500, 0.14, { gain: 0.25, slide: 1300 })
  },
  whoosh() {
    noise(0.45, { gain: 0.12, freq: 700 })
  },
  // 中獎音效
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.4, { type: 'triangle', gain: 0.16, at: i * 0.1 }),
    )
  },
  // 大獎音效
  bigWin() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319]
    notes.forEach((f, i) =>
      tone(f, i === notes.length - 1 ? 1.2 : 0.3, { type: 'triangle', gain: 0.18, at: i * 0.12 }),
    )
    noise(1.2, { gain: 0.08, at: 0.72, freq: 5000 })
  },
}
