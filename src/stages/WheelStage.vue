<script setup>
// 幸運轉盤：第一下開始轉動，第二下抽出中獎者，轉盤減速停在中獎者格子
// 盤面放上所有可抽人員（打亂順序、每人一格、格子大小相同），人多時字體縮小，太多時只顯示色塊
// 一次抽完：第一位手動停止，之後自動連續轉動直到抽滿
import { ref, computed, watch, watchEffect, onMounted } from 'vue'
import { useStageKit, stageProps, easeOutQuad } from './kit.js'
import { shuffle } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const LABEL_R = 93 // 名字從外緣往內排
const MIN_FONT = 2.6 // 字體小於此值時不顯示名字（看不清楚）
const SPEED = 600 // 度 / 秒
// 扇區顏色：主題色深淺交錯，中獎扇區為金色（CSS 變數由外層主題提供）
const sectorFill = (k) =>
  highlight.value === k ? 'var(--gold)' : k % 2 ? 'var(--accent)' : 'var(--accent-2)'

const phase = ref('idle') // idle | spinning | stopping | chaining
const sectors = ref([])
const rot = ref(0)
const highlight = ref(-1)
const result = ref(null) // { id, name }
// 轉盤轉動中（含減速、連抽的下一輪）：不顯示任何中獎者，停下後才揭曉
const turning = ref(false)
let stopLoop = null

const angle = computed(() => 360 / Math.max(1, sectors.value.length))
// 字體依外緣格寬縮放，上限 13
const fontSize = computed(() => {
  const S = sectors.value.length
  if (S <= 1) return 13
  return Math.min(13, ((2 * Math.PI * (LABEL_R - 8)) / S) * 0.8)
})
const showLabels = computed(() => fontSize.value >= MIN_FONT)
// 格線寬度：格子多時變細，避免整片變白
const strokeWidth = computed(() => {
  const S = sectors.value.length
  return S > 150 ? 0 : S > 60 ? 0.2 : 0.6
})
const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const shownResult = computed(() => result.value || props.winners[props.winners.length - 1] || null)

watchEffect(() => {
  props.ctx.setHint(
    phase.value === 'spinning'
      ? '按 [空白鍵] 停止'
      : phase.value === 'idle'
        ? '按 [空白鍵] 轉動轉盤'
        : '揭曉中…',
  )
})

function refill() {
  sectors.value = shuffle(props.pool)
  highlight.value = -1
}
onMounted(refill)
watch(
  () => props.pool.length,
  () => {
    if (phase.value === 'idle' && highlight.value < 0) refill()
  },
)

function sectorPath(k) {
  const a = angle.value
  const r = 96
  const p = (deg) => {
    const rad = (deg * Math.PI) / 180
    return `${(r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`
  }
  return `M0 0 L${p(k * a)} A${r} ${r} 0 ${a > 180 ? 1 : 0} 1 ${p((k + 1) * a)} Z`
}
function label(name) {
  return name.length > 6 ? name.slice(0, 6) + '…' : name
}

let lastSector = -1
let lastTick = 0
function tickIfCrossed() {
  const s = Math.floor(rot.value / angle.value)
  if (s !== lastSector) {
    lastSector = s
    // 格子很多時轉一圈會跨過上百格，音效限制最多每 45ms 一次
    const now = performance.now()
    if (now - lastTick >= 45) {
      lastTick = now
      props.ctx.sfx.tick()
    }
  }
}

function spin() {
  refill()
  result.value = null
  turning.value = true
  stopLoop = kit.loop((dt) => {
    rot.value += SPEED * dt
    tickIfCrossed()
  })
}

async function land() {
  const { ctx } = props
  stopLoop?.()
  const [winner] = ctx.decide(1)
  const a = angle.value
  // 盤面就是完整的可抽名單，中獎者一定在盤面上
  const k = sectors.value.findIndex((s) => s.id === winner.id)
  const jitter = (Math.random() - 0.5) * 0.6 * a
  const base = -(k + 0.5) * a - jitter
  const r0 = rot.value
  const target = base + 360 * Math.ceil((r0 + 720 - base) / 360)
  const dist = target - r0
  await kit.animate(((2 * dist) / SPEED) * 1000, (t) => {
    rot.value = r0 + dist * easeOutQuad(t)
    tickIfCrossed()
  })
  highlight.value = k
  result.value = winner
  turning.value = false
  ctx.commit([winner], { big: props.prize.count === 1 })
}

async function chain() {
  const { ctx } = props
  while (ctx.remaining() > 0 && ctx.poolSize() > 0) {
    phase.value = 'chaining'
    await kit.sleep(1300)
    spin()
    await kit.sleep(1200)
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
  <div class="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 min-h-0">
    <div class="relative h-full max-h-[52vh] aspect-square min-h-[220px]">
      <svg viewBox="-100 -108 200 208" class="w-full h-full drop-shadow-2xl">
        <g :transform="`rotate(${rot})`">
          <circle r="99" fill="rgba(255,255,255,0.15)" />
          <template v-if="sectors.length > 1">
            <path
              v-for="(s, k) in sectors"
              :key="'p' + k"
              :d="sectorPath(k)"
              :style="{ fill: sectorFill(k) }"
              :opacity="highlight < 0 || highlight === k ? 1 : 0.45"
              stroke="rgba(255,255,255,0.35)"
              :stroke-width="strokeWidth"
            />
          </template>
          <circle v-else r="96" :style="{ fill: sectorFill(0) }" />
          <g
            v-for="(s, k) in showLabels ? sectors : []"
            :key="'t' + k"
            :transform="`rotate(${(k + 0.5) * angle})`"
          >
            <text
              x="0"
              :y="sectors.length > 1 ? -LABEL_R : -58"
              :transform="sectors.length > 1 ? `rotate(-90 0 ${-LABEL_R})` : ''"
              :text-anchor="sectors.length > 1 ? 'end' : 'middle'"
              dominant-baseline="middle"
              :font-size="fontSize"
              font-weight="900"
              :fill="highlight === k ? '#3b2a00' : '#fff'"
              style="paint-order: stroke"
              stroke="rgba(0,0,0,0.35)"
              :stroke-width="fontSize / 8"
            >
              {{ label(s.name) }}
            </text>
          </g>
        </g>
        <circle r="14" fill="#fff" />
        <circle r="9" style="fill: var(--gold)" />
        <path
          d="M0 -88 L-9 -106 L9 -106 Z"
          style="fill: var(--gold)"
          stroke="#fff"
          stroke-width="1.5"
        />
      </svg>
      <div v-if="sectors.length > 1" class="wheel-count">盤面共 {{ sectors.length }} 人</div>
    </div>
    <div class="text-center min-w-[30%]">
      <div v-if="shownResult && !turning" :key="shownResult.id" class="result-card pop-in">
        <div class="result-lbl">恭喜中獎</div>
        <div class="result-name">{{ shownResult.name }}</div>
        <div v-if="shownResult.id" class="result-id">{{ shownResult.id }}</div>
      </div>
      <div v-else class="text-4xl opacity-10 font-black tracking-[1rem]">
        {{ turning ? '…' : 'READY' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.wheel-count {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2.2em;
  text-align: center;
  font-size: clamp(12px, 1.2cqw, 18px);
  color: var(--muted);
}
.result-card {
  display: inline-block;
  text-align: left;
  padding: 1.2rem 2rem;
  border-radius: 1.2rem;
  background: var(--gold-soft);
  border: 1px solid var(--gold-line);
}
.result-lbl {
  font-size: clamp(0.8rem, 1.1vw, 1.3rem);
  letter-spacing: 0.25em;
  color: var(--muted);
}
.result-name {
  font-size: clamp(2.5rem, 6vw, 6.5rem);
  font-weight: 900;
  line-height: 1.1;
  color: var(--gold);
}
.result-id {
  font-family: Consolas, monospace;
  font-size: clamp(0.9rem, 1.4vw, 1.6rem);
  color: var(--muted);
}
.pop-in {
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
}
</style>
