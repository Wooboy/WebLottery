<script setup>
// 老虎機（員編轉輪）：一次抽一位。轉輪數 = 員編長度，每輪在 A–Z、0–9 間轉動。
// 第一下開始轉動；第二下以安全亂數抽出中獎者，轉輪由左到右依序停在其員編上，
// 每停一碼顯示「還有幾人符合」，全部停下後才帶出人名。
// 一次抽完：第一位手動停止，之後自動連續轉到抽滿。
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const SPEED = 14 // 每秒經過的字元數
const STOP_MS = 1300 // 每個轉輪減速停止的時間
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

const phase = ref('idle') // idle | spinning | stopping | chaining
const reels = ref([]) // { pos, state: 'spin' | 'stop' | 'lock', speed }
const matchInfo = ref(null) // { prefix, rest, count }
const revealed = ref(null) // { id, name }
let stopLoop = null

const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const lastWinner = computed(() => props.winners[props.winners.length - 1] || null)
const idLength = computed(() => {
  const sample = props.pool[0]?.id || lastWinner.value?.id || ''
  return Math.min(5, Math.max(3, sample.length || 4))
})
// 待機時顯示上一位中獎者的員編（或問號）
const idleChars = computed(() => {
  const id = (lastWinner.value?.id || '').toUpperCase()
  return Array.from({ length: idLength.value }, (_, i) => id[i] || '?')
})
const shownPerson = computed(
  () => revealed.value || (phase.value === 'idle' ? lastWinner.value : null),
)

watchEffect(() => {
  props.ctx.setHint(
    phase.value === 'spinning'
      ? '按 [空白鍵] 停止'
      : phase.value === 'idle'
        ? '按 [空白鍵] 開始轉動'
        : '轉輪依序停止中…',
  )
})

const charAt = (i) => CHARS[((i % CHARS.length) + CHARS.length) % CHARS.length]
function rowsOf(r) {
  const i = Math.floor(r.pos)
  return [charAt(i - 1), charAt(i), charAt(i + 1), charAt(i + 2)]
}
const offsetOf = (r) => -((r.pos - Math.floor(r.pos)) * 25)

function spin() {
  revealed.value = null
  matchInfo.value = null
  reels.value = Array.from({ length: idLength.value }, () => ({
    pos: Math.random() * CHARS.length,
    state: 'spin',
    speed: SPEED * (0.85 + Math.random() * 0.3),
  }))
  let last = -1
  stopLoop = kit.loop((dt) => {
    for (const r of reels.value) if (r.state === 'spin') r.pos += dt * r.speed
    const spinning = reels.value.find((r) => r.state === 'spin')
    if (spinning) {
      const idx = Math.floor(spinning.pos)
      if (idx !== last) {
        last = idx
        props.ctx.sfx.tick()
      }
    }
  })
}

async function land() {
  const { ctx } = props
  const [winner] = ctx.decide(1)
  const id = winner.id.toUpperCase()
  for (let j = 0; j < reels.value.length; j++) {
    const r = reels.value[j]
    const target = Math.max(0, CHARS.indexOf(id[j]))
    const p0 = r.pos
    let landing = Math.ceil(p0) + 8
    landing += (((target - landing) % CHARS.length) + CHARS.length) % CHARS.length
    const dist = landing - p0
    r.state = 'stop'
    let last = -1
    await kit.animate(STOP_MS, (t) => {
      r.pos = p0 + dist * easeOutCubic(t)
      const idx = Math.floor(r.pos)
      if (idx !== last) {
        last = idx
        ctx.sfx.tick()
      }
    })
    r.pos = landing
    r.state = 'lock'
    ctx.sfx.hit()
    const prefix = id.slice(0, j + 1)
    matchInfo.value = {
      prefix,
      rest: id.length - prefix.length,
      count: props.pool.filter((p) => p.id.toUpperCase().startsWith(prefix)).length,
    }
    await kit.sleep(j === reels.value.length - 1 ? 500 : 350)
  }
  stopLoop?.()
  revealed.value = winner
  ctx.commit([winner], { big: props.prize.count === 1 })
}

async function chain() {
  const { ctx } = props
  while (ctx.remaining() > 0 && ctx.poolSize() > 0) {
    phase.value = 'chaining'
    await kit.sleep(1800)
    spin()
    await kit.sleep(1000)
    await land()
  }
}

async function press() {
  const { ctx } = props
  if (phase.value === 'idle') {
    if (!ctx.canDraw()) return
    phase.value = 'spinning'
    ctx.setBusy(true)
    spin()
  } else if (phase.value === 'spinning') {
    phase.value = 'stopping'
    await land()
    if (isAll.value) await chain()
    phase.value = 'idle'
    ctx.setBusy(false)
  }
}

defineExpose({ press })
</script>

<template>
  <div class="slot-root flex-1 flex flex-col items-center justify-center gap-[2.5cqw] min-h-0">
    <div class="reels">
      <template v-if="reels.length && phase !== 'idle'">
        <div v-for="(r, i) in reels" :key="i" :class="['reel', r.state]">
          <div class="strip" :style="{ transform: `translateY(${offsetOf(r)}%)` }">
            <div v-for="(c, j) in rowsOf(r)" :key="j" :class="['ch', j === 1 ? 'mid' : '']">
              {{ c }}
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <div
          v-for="(c, i) in idleChars"
          :key="i"
          :class="['reel', lastWinner || revealed ? 'lock' : '']"
        >
          <div class="strip">
            <div class="ch">&nbsp;</div>
            <div class="ch mid">{{ c }}</div>
            <div class="ch">&nbsp;</div>
            <div class="ch">&nbsp;</div>
          </div>
        </div>
      </template>
    </div>

    <div class="info">
      <div v-if="shownPerson" :key="shownPerson.id" class="name">{{ shownPerson.name }}</div>
      <div v-else-if="matchInfo" class="match">
        目前符合
        <b class="mono">{{ matchInfo.prefix }}{{ ' _'.repeat(matchInfo.rest) }}</b>
        的還有 <b>{{ matchInfo.count }}</b> 人
      </div>
      <div v-else-if="phase === 'spinning'" class="match">員編轉動中…</div>
    </div>
  </div>
</template>

<style scoped>
.slot-root {
  container-type: inline-size;
}
.reels {
  position: relative;
  display: flex;
  gap: 1.3cqw;
  padding: 1.8cqw 2.2cqw;
  border-radius: 2cqw;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--line);
}
.reels::before,
.reels::after {
  content: '';
  position: absolute;
  top: 50%;
  margin-top: -1.1cqw;
  border: 1.1cqw solid transparent;
}
.reels::before {
  left: -0.6cqw;
  border-left: 1.5cqw solid var(--gold);
}
.reels::after {
  right: -0.6cqw;
  border-right: 1.5cqw solid var(--gold);
}
.reel {
  width: 9.5cqw;
  height: 16cqw;
  border-radius: 1.1cqw;
  border: 1px solid var(--line);
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.07) 50%, transparent);
  overflow: hidden;
  position: relative;
  transition:
    border-color 0.3s,
    background-color 0.3s;
}
.strip {
  position: absolute;
  inset: 0 0 auto 0;
  height: 133.333%;
}
.ch {
  height: 25%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Consolas, 'Courier New', monospace;
  font-weight: 700;
  font-size: 3.2cqw;
  color: rgba(255, 255, 255, 0.18);
}
.ch.mid {
  font-size: 8cqw;
  color: #fff;
}
.reel.spin .ch.mid {
  filter: blur(0.2cqw);
  opacity: 0.85;
}
.reel.lock {
  border-color: var(--gold);
  background-color: var(--gold-soft);
}
.reel.lock .ch.mid {
  color: var(--gold);
}
.info {
  min-height: 8cqw;
  display: flex;
  align-items: center;
}
.name {
  font-size: 7.5cqw;
  font-weight: 900;
  color: var(--gold);
  line-height: 1;
  animation: pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.match {
  font-size: 1.8cqw;
  color: var(--muted);
}
.match b {
  color: #fff;
}
.mono {
  font-family: Consolas, monospace;
  letter-spacing: 0.1em;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.3) translateY(3cqw);
  }
}
</style>
