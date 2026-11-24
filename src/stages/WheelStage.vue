<script setup>
// 幸運轉盤：第一下開始轉動，第二下抽出中獎者，轉盤減速停在中獎者格子
// 轉盤最多顯示 12 格（從可抽名單隨機取），中獎者一定在盤面上
// 一次抽完：第一位手動停止，之後自動連續轉動直到抽滿
import { ref, computed, watch, watchEffect, onMounted } from 'vue'
import { useStageKit, stageProps, easeOutQuad } from './kit.js'
import { sample } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const MAX_SECTORS = 12
const SPEED = 600 // 度 / 秒
const COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]

const phase = ref('idle') // idle | spinning | stopping | chaining
const sectors = ref([])
const rot = ref(0)
const highlight = ref(-1)
const result = ref('')
let stopLoop = null

const angle = computed(() => 360 / Math.max(1, sectors.value.length))
const fontSize = computed(() =>
  sectors.value.length <= 6 ? 13 : sectors.value.length <= 9 ? 11 : 9,
)
const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const shownResult = computed(() => result.value || props.winners[props.winners.length - 1] || '')

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
  sectors.value = sample(props.pool, MAX_SECTORS)
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
function tickIfCrossed() {
  const s = Math.floor(rot.value / angle.value)
  if (s !== lastSector) {
    lastSector = s
    props.ctx.sfx.tick()
  }
}

function spin() {
  refill()
  result.value = ''
  stopLoop = kit.loop((dt) => {
    rot.value += SPEED * dt
    tickIfCrossed()
  })
}

async function land() {
  const { ctx } = props
  stopLoop?.()
  const [winner] = ctx.decide(1)
  const S = sectors.value.length
  const a = angle.value
  let k = sectors.value.indexOf(winner)
  if (k < 0) {
    // 中獎者不在盤面上：替換一個遠離指針的格子（轉盤高速轉動中，觀眾看不出來）
    const under = Math.floor((((-rot.value % 360) + 360) % 360) / a)
    k = (under + Math.floor(S / 2)) % S
    sectors.value[k] = winner
  }
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
              v-for="(name, k) in sectors"
              :key="'p' + k"
              :d="sectorPath(k)"
              :fill="COLORS[k % COLORS.length]"
              :opacity="highlight < 0 || highlight === k ? 1 : 0.35"
              stroke="rgba(255,255,255,0.6)"
              stroke-width="0.6"
            />
          </template>
          <circle v-else r="96" :fill="COLORS[0]" />
          <g
            v-for="(name, k) in sectors"
            :key="'t' + k"
            :transform="`rotate(${(k + 0.5) * angle})`"
          >
            <text
              x="0"
              y="-58"
              :transform="sectors.length > 1 ? 'rotate(-90 0 -58)' : ''"
              text-anchor="middle"
              dominant-baseline="middle"
              :font-size="fontSize"
              font-weight="900"
              fill="#fff"
              style="paint-order: stroke"
              stroke="rgba(0,0,0,0.35)"
              stroke-width="1.5"
            >
              {{ label(name) }}
            </text>
          </g>
        </g>
        <circle r="14" fill="#fff" />
        <circle r="9" fill="#facc15" />
        <path d="M0 -88 L-9 -106 L9 -106 Z" fill="#facc15" stroke="#fff" stroke-width="1.5" />
      </svg>
    </div>
    <div class="text-center min-w-[30%]">
      <div
        v-if="shownResult && phase !== 'spinning'"
        :key="shownResult"
        class="text-[clamp(2.5rem,7vw,6rem)] font-black text-yellow-300 glow-text tracking-tight pop-in"
      >
        {{ shownResult }}
      </div>
      <div v-else class="text-4xl opacity-10 font-black tracking-[1rem]">
        {{ phase === 'spinning' ? '…' : 'READY' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
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
