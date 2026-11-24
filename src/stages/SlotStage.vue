<script setup>
// 老虎機：第一下滾輪開始轉動，第二下抽出中獎者，滾輪依序減速停在中獎者身上
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps, easeOutQuad } from './kit.js'
import { pick } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const SPEED = 16 // 每秒經過的名字數
const phase = ref('idle') // idle | spinning | stopping
const reels = ref([])
let stopLoop = null

const idleNames = computed(() => {
  const w = props.winners
  return w.length ? [w[w.length - 1].name] : ['?']
})

const sizeClass = computed(() => {
  const n = Math.max(1, reels.value.length)
  if (n === 1) return { box: 'w-[min(92%,900px)] h-[180px]', text: 'text-[clamp(3rem,9vw,7.5rem)]' }
  if (n <= 3) return { box: 'w-[min(31%,360px)] h-[110px]', text: 'text-5xl' }
  if (n === 4) return { box: 'w-[min(44%,420px)] h-[110px]', text: 'text-5xl' }
  if (n <= 12) return { box: 'w-[210px] h-[84px]', text: 'text-3xl' }
  return { box: 'w-[150px] h-[58px]', text: 'text-xl' }
})

watchEffect(() => {
  props.ctx.setHint(
    phase.value === 'spinning'
      ? '按 [空白鍵] 停止'
      : phase.value === 'stopping'
        ? '揭曉中…'
        : '按 [空白鍵] 開始轉動',
  )
})

function rowsOf(r) {
  const len = r.strip.length
  const i = Math.floor(r.pos)
  return [r.strip[((i % len) + len) % len], r.strip[(((i + 1) % len) + len) % len]]
}
function offsetOf(r) {
  return -((r.pos - Math.floor(r.pos)) / 2) * 100
}

function makeStrip(extra) {
  return Array.from({ length: 40 + extra }, () => pick(props.pool)?.name || '')
}

function start() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  const n = ctx.roundSize()
  reels.value = Array.from({ length: n }, () => {
    const strip = makeStrip(n * 5)
    return { strip, pos: Math.random() * strip.length, landed: false }
  })
  phase.value = 'spinning'
  ctx.setBusy(true)
  let lastIdx = -1
  stopLoop = kit.loop((dt) => {
    for (const r of reels.value) r.pos += dt * SPEED
    const idx = Math.floor(reels.value[0].pos)
    if (idx !== lastIdx) {
      lastIdx = idx
      ctx.sfx.tick()
    }
  })
}

async function stop() {
  const { ctx } = props
  phase.value = 'stopping'
  stopLoop?.()
  const people = ctx.decide(reels.value.length)
  reels.value = reels.value.slice(0, people.length)
  let lastIdx = -1
  await Promise.all(
    reels.value.map((r, i) => {
      const p0 = r.pos
      const landing = Math.ceil(p0) + 14 + i * 5
      r.strip[landing % r.strip.length] = people[i].name
      const dist = landing - p0
      return kit
        .animate(((2 * dist) / SPEED) * 1000, (t) => {
          r.pos = p0 + dist * easeOutQuad(t)
          if (i === reels.value.length - 1) {
            const idx = Math.floor(r.pos)
            if (idx !== lastIdx) {
              lastIdx = idx
              ctx.sfx.tick()
            }
          }
        })
        .then(() => {
          r.landed = true
        })
    }),
  )
  ctx.commit(people, { big: props.prize.count === 1 })
  phase.value = 'idle'
  ctx.setBusy(false)
}

function press() {
  if (phase.value === 'idle') start()
  else if (phase.value === 'spinning') stop()
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex items-center justify-center min-h-0 overflow-y-auto">
    <div class="flex flex-wrap justify-center gap-4 w-full py-2">
      <template v-if="reels.length">
        <div
          v-for="(r, i) in reels"
          :key="i"
          :class="[
            'slot-window glass-panel rounded-3xl relative overflow-hidden border-2 transition-colors duration-500',
            sizeClass.box,
            r.landed
              ? 'border-yellow-300 shadow-[0_0_40px_rgba(253,224,71,0.45)]'
              : 'border-white/20',
          ]"
        >
          <div
            class="absolute inset-x-0 top-0 h-[200%]"
            :style="{ transform: `translateY(${offsetOf(r)}%)` }"
          >
            <div
              v-for="(name, j) in rowsOf(r)"
              :key="j"
              :class="[
                'h-1/2 flex items-center justify-center font-black tracking-tight whitespace-nowrap px-2',
                sizeClass.text,
                r.landed ? 'text-yellow-300 glow-text' : '',
              ]"
            >
              {{ name }}
            </div>
          </div>
        </div>
      </template>
      <div
        v-else
        :class="[
          'slot-window glass-panel rounded-3xl flex items-center justify-center border-2 border-white/20',
          sizeClass.box,
        ]"
      >
        <span
          :class="[
            'font-black',
            sizeClass.text,
            winners.length ? 'text-yellow-300 glow-text' : 'opacity-20',
          ]"
        >
          {{ idleNames[0] }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slot-window {
  mask-image: linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%);
}
</style>
