import { onBeforeUnmount } from 'vue'

// 抽獎舞台共用的計時工具：元件卸載（切換獎項 / 頁面）時自動停止所有計時器，
// 未完成的動畫不會再繼續，也不會寫入中獎紀錄
export function useStageKit() {
  let alive = true
  const timeouts = new Set()
  const intervals = new Set()
  const rafs = new Set()

  onBeforeUnmount(() => {
    alive = false
    timeouts.forEach(clearTimeout)
    intervals.forEach(clearInterval)
    rafs.forEach(cancelAnimationFrame)
  })

  // 等待 ms 毫秒；元件卸載後永遠不會 resolve，後續流程自然中止
  const sleep = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timeouts.delete(t)
        if (alive) resolve()
      }, ms)
      timeouts.add(t)
    })

  const every = (ms, fn) => {
    const t = setInterval(fn, ms)
    intervals.add(t)
    return () => {
      clearInterval(t)
      intervals.delete(t)
    }
  }

  const requestFrame = (fn) => {
    const id = requestAnimationFrame((now) => {
      rafs.delete(id)
      if (alive) fn(now)
    })
    rafs.add(id)
    return id
  }

  // 補間動畫：duration 毫秒內以 t ∈ [0,1] 呼叫 onFrame
  const animate = (duration, onFrame) =>
    new Promise((resolve) => {
      const start = performance.now()
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration)
        onFrame(t)
        if (t < 1) requestFrame(step)
        else resolve()
      }
      requestFrame(step)
    })

  // 持續動畫：每幀以經過秒數呼叫 fn，回傳停止函式
  const loop = (fn) => {
    let stopped = false
    let last = performance.now()
    const step = (now) => {
      if (stopped) return
      fn((now - last) / 1000)
      last = now
      requestFrame(step)
    }
    requestFrame(step)
    return () => {
      stopped = true
    }
  }

  return { sleep, every, animate, loop, isAlive: () => alive }
}

// 減速曲線：起始速度為 2 × 距離 / 時間，與等速轉動銜接
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t)

// 各舞台共用的 props
export const stageProps = {
  ctx: { type: Object, required: true },
  prize: { type: Object, required: true },
  pool: { type: Array, required: true },
  winners: { type: Array, required: true },
}
