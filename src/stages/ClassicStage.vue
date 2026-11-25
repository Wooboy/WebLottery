<script setup>
// 經典跳字（名字老虎機）：每台老虎機的轉輪是人員名字。
// 第一下所有老虎機開始轉動；第二下以安全亂數抽出中獎者，老虎機由左到右輪流減速停在中獎者名字上。
// 連續單抽：一台老虎機，每局抽一位；一次抽完：剩餘名額有幾位就有幾台老虎機，按一下全部輪流停下。
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps, easeOutQuad } from './kit.js'
import { pick } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const SPEED = 12 // 每秒經過的名字數
const STRIP_LEN = 24

const phase = ref('idle') // idle | spinning | stopping
const reels = ref([]) // { strip: [{id,name}], pos, state: 'spin' | 'stop' | 'lock', speed }
let stopLoop = null

const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)

// 待機畫面：一次抽完顯示本獎項全部中獎者，連續單抽顯示上一位；
// 尚無中獎者時先排好本局的老虎機（一次抽完 = 剩餘名額台數），顯示問號
const idleReels = computed(() => {
  const w = props.winners
  if (w.length) return (isAll.value ? w : [w[w.length - 1]]).map((p) => ({ person: p }))
  const n = isAll.value ? Math.max(1, props.ctx.roundSize()) : 1
  return Array.from({ length: n }, () => ({ person: null }))
})

const shownCount = computed(() =>
  reels.value.length ? reels.value.length : idleReels.value.length,
)

// 依老虎機台數決定排列：在舞台高度內盡量放大
const layout = computed(() => {
  const n = Math.max(1, shownCount.value)
  for (let cols = 1; cols <= 10; cols++) {
    const mw = Math.min(50, 88 / cols)
    const rows = Math.ceil(n / cols)
    // 每排台數平均分配（例如 5 台排成 3＋2，而不是 4＋1）
    if (rows * mw * 0.8 <= 40 || cols === 10) return { cols: Math.ceil(n / rows), mw }
  }
  return { cols: 10, mw: 8.8 }
})
const gridStyle = computed(() => ({
  maxWidth: `calc(${layout.value.cols} * ${layout.value.mw}cqw + ${layout.value.cols - 1} * 1.6cqw)`,
  '--mw': layout.value.mw,
}))

watchEffect(() => {
  props.ctx.setHint(
    phase.value === 'spinning'
      ? isAll.value
        ? '按 [空白鍵] 停止，老虎機將輪流停下'
        : '按 [空白鍵] 停止'
      : phase.value === 'stopping'
        ? '揭曉中…'
        : '按 [空白鍵] 開始轉動',
  )
})

const at = (r, i) => r.strip[((i % r.strip.length) + r.strip.length) % r.strip.length]
function rowsOf(r) {
  const i = Math.floor(r.pos)
  return [at(r, i - 1), at(r, i), at(r, i + 1), at(r, i + 2)]
}
const offsetOf = (r) => -((r.pos - Math.floor(r.pos)) * 25)

function makeStrip() {
  return Array.from({ length: STRIP_LEN }, () => pick(props.pool) || { id: '', name: '' })
}

function spin() {
  const { ctx } = props
  const n = ctx.roundSize()
  reels.value = Array.from({ length: n }, () => ({
    strip: makeStrip(),
    pos: Math.random() * STRIP_LEN,
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
        ctx.sfx.tick()
      }
    }
  })
}

async function landOne(r, person) {
  const p0 = r.pos
  const landing = Math.ceil(p0) + 10
  r.strip[((landing % STRIP_LEN) + STRIP_LEN) % STRIP_LEN] = person
  const dist = landing - p0
  r.state = 'stop'
  await kit.animate(((2 * dist) / r.speed) * 1000, (t) => {
    r.pos = p0 + dist * easeOutQuad(t)
  })
  r.pos = landing
  r.state = 'lock'
  r.person = person
  props.ctx.sfx.hit()
}

async function land() {
  const { ctx } = props
  const people = ctx.decide(reels.value.length)
  reels.value = reels.value.slice(0, people.length)
  // 輪流停下：台數越多間隔越短，整體控制在數秒內
  const gap = Math.max(120, Math.min(600, 3000 / Math.max(1, people.length)))
  await Promise.all(
    reels.value.map(async (r, i) => {
      await kit.sleep(i * gap)
      await landOne(r, people[i])
    }),
  )
  stopLoop?.()
  stopLoop = null
  await kit.sleep(250)
  ctx.commit(people, { big: props.prize.count === 1 })
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
    phase.value = 'idle'
    ctx.setBusy(false)
  }
}

defineExpose({ press })
</script>

<template>
  <div class="cls-root flex-1 flex items-center justify-center min-h-0 w-full">
    <div class="machines" :style="gridStyle">
      <template v-if="reels.length">
        <div v-for="(r, i) in reels" :key="i" :class="['machine', r.state]">
          <div class="window">
            <div class="strip" :style="{ transform: `translateY(${offsetOf(r)}%)` }">
              <div v-for="(p, j) in rowsOf(r)" :key="j" :class="['row', j === 1 ? 'mid' : '']">
                {{ p.name }}
              </div>
            </div>
          </div>
          <div class="pid">{{ r.state === 'lock' ? r.person.id : ' ' }}</div>
        </div>
      </template>
      <template v-else>
        <div
          v-for="(r, i) in idleReels"
          :key="'idle' + i"
          :class="['machine', r.person ? 'lock' : '']"
        >
          <div class="window">
            <div class="strip">
              <div class="row">&nbsp;</div>
              <div class="row mid">{{ r.person ? r.person.name : '?' }}</div>
              <div class="row">&nbsp;</div>
              <div class="row">&nbsp;</div>
            </div>
          </div>
          <div class="pid">{{ r.person ? r.person.id : ' ' }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cls-root {
  container-type: inline-size;
  overflow-y: auto;
}
.machines {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.6cqw;
  padding: 1cqw 0;
}
.machine {
  /* 一台老虎機：外框＋左右金色指針 */
  position: relative;
  width: calc(var(--mw) * 1cqw);
  padding: calc(var(--mw) * 0.04cqw);
  border-radius: calc(var(--mw) * 0.06cqw);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--line);
  transition:
    border-color 0.3s,
    box-shadow 0.3s;
}
.machine::before,
.machine::after {
  content: '';
  position: absolute;
  top: calc(50% - var(--mw) * 0.05cqw);
  margin-top: calc(var(--mw) * -0.035cqw);
  border: calc(var(--mw) * 0.035cqw) solid transparent;
}
.machine::before {
  left: calc(var(--mw) * -0.02cqw);
  border-left: calc(var(--mw) * 0.05cqw) solid var(--gold);
}
.machine::after {
  right: calc(var(--mw) * -0.02cqw);
  border-right: calc(var(--mw) * 0.05cqw) solid var(--gold);
}
.window {
  position: relative;
  height: calc(var(--mw) * 0.42cqw);
  border-radius: calc(var(--mw) * 0.04cqw);
  border: 1px solid var(--line);
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.07) 50%, transparent);
  overflow: hidden;
  mask-image: linear-gradient(transparent, #000 22%, #000 78%, transparent);
}
.strip {
  position: absolute;
  inset: 0 0 auto 0;
  height: 133.333%;
}
.row {
  height: 25%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.5em;
  white-space: nowrap;
  overflow: hidden;
  font-weight: 800;
  font-size: calc(var(--mw) * 0.075cqw);
  color: rgba(255, 255, 255, 0.2);
}
.row.mid {
  font-weight: 900;
  font-size: calc(var(--mw) * 0.14cqw);
  color: #fff;
}
.machine.spin .row.mid,
.machine.stop .row.mid {
  filter: blur(calc(var(--mw) * 0.003cqw));
  opacity: 0.85;
}
.machine.lock {
  border-color: var(--gold);
  box-shadow: 0 0 calc(var(--mw) * 0.08cqw) color-mix(in srgb, var(--gold) 30%, transparent);
}
.machine.lock .window {
  background-color: var(--gold-soft);
}
.machine.lock .row.mid {
  color: var(--gold);
  animation: pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pid {
  margin-top: calc(var(--mw) * 0.02cqw);
  text-align: center;
  font-family: Consolas, monospace;
  font-size: max(11px, calc(var(--mw) * 0.05cqw));
  letter-spacing: 0.1em;
  color: var(--muted);
  min-height: 1.2em;
}
@keyframes pop {
  from {
    transform: scale(0.7);
  }
}
</style>
