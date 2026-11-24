<script setup>
// 淘汰制：第一下列出所有可抽人員並抽出中獎者（安全亂數）；
// 之後每按一下淘汰一批，直到只剩中獎者，最後一下揭曉
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { shuffle } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | running | animating | done
const cells = ref([]) // { name, out, win, delay }
const steps = ref([])
const stepIdx = ref(0)
let queue = [] // 淘汰順序
let finalists = []

const aliveCount = computed(() => cells.value.filter((c) => !c.out).length)
const textClass = computed(() => {
  const n = cells.value.length
  if (n <= 12) return 'text-4xl px-6 py-3'
  if (n <= 40) return 'text-2xl px-4 py-2'
  if (n <= 120) return 'text-base px-3 py-1'
  if (n <= 300) return 'text-xs px-2 py-0.5'
  return 'text-[10px] px-1 py-0'
})

watchEffect(() => {
  let hint = '按 [空白鍵] 開始淘汰賽'
  if (phase.value === 'running') {
    const next = steps.value[stepIdx.value]
    hint =
      stepIdx.value === steps.value.length - 1
        ? `按 [空白鍵] 揭曉最後 ${next} 位`
        : `剩 ${aliveCount.value} 人｜按 [空白鍵] 淘汰至 ${next} 人`
  } else if (phase.value === 'animating') hint = '淘汰中…'
  props.ctx.setHint(hint)
})

// 淘汰階段：大名單每次留 1/3、再每次減半，最後剩「中獎人數 + 2」再揭曉
function buildSteps(total, k) {
  const seq = []
  let n = total
  while (n > k) {
    if (n > 3 * k + 20) n = Math.max(k, Math.ceil(n / 3))
    else if (n > 2 * k + 5) n = Math.max(k, Math.ceil(n / 2))
    else if (n > k + 2) n = k + 2
    else n = k
    seq.push(n)
  }
  return seq
}

function start() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  const k = ctx.roundSize()
  const pool = shuffle(props.pool)
  finalists = ctx.decide(k)
  const fset = new Set(finalists)
  queue = shuffle(pool.filter((n) => !fset.has(n)))
  cells.value = pool.map((name) => ({ name, out: false, win: false, delay: 0 }))
  steps.value = buildSteps(pool.length, finalists.length)
  stepIdx.value = 0
  ctx.setBusy(true)
  ctx.sfx.whoosh()
  // 可抽人數剛好等於名額時沒有淘汰階段，直接進入揭曉
  if (!steps.value.length) steps.value = [finalists.length]
  phase.value = 'running'
}

async function eliminate() {
  const { ctx } = props
  const target = steps.value[stepIdx.value]
  const kill = new Set(queue.splice(0, aliveCount.value - target))
  const isFinal = stepIdx.value === steps.value.length - 1
  phase.value = 'animating'
  const spread = Math.min(1100, 300 + kill.size * 8)
  for (const c of cells.value) {
    if (kill.has(c.name)) {
      c.delay = Math.random() * spread
      c.out = true
    }
  }
  ctx.sfx.drumroll(spread / 1000)
  await kit.sleep(spread + 350)
  ctx.sfx.hit()
  stepIdx.value++
  if (isFinal) {
    for (const c of cells.value) if (!c.out) c.win = true
    ctx.commit(finalists, { big: true })
    phase.value = 'done'
    ctx.setBusy(false)
  } else {
    phase.value = 'running'
  }
}

function press() {
  if (phase.value === 'idle' || phase.value === 'done') start()
  else if (phase.value === 'running') eliminate()
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex items-center justify-center min-h-0 overflow-y-auto">
    <div v-if="cells.length" class="flex flex-wrap justify-center content-center gap-2 w-full py-2">
      <div
        v-for="(c, i) in cells"
        :key="i"
        :style="{ transitionDelay: c.delay + 'ms' }"
        :class="[
          'rounded-xl font-black transition-all duration-500 border',
          textClass,
          c.win
            ? 'bg-yellow-400/25 border-yellow-300 text-yellow-200 glow-text scale-125 z-10'
            : c.out
              ? 'opacity-10 scale-75 grayscale border-transparent line-through'
              : 'bg-white/10 border-white/20',
        ]"
      >
        {{ c.name }}
      </div>
    </div>
    <div v-else class="text-center">
      <div class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
      <div class="mt-4 opacity-40 font-bold">{{ pool.length }} 人參加淘汰賽</div>
    </div>
  </div>
</template>
