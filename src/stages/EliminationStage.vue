<script setup>
// 淘汰制：第一下列出所有可抽人員並以安全亂數決定中獎者；
// 之後每按一下淘汰一批（大名單先留 1/3、再減半），最後剩「名額 + 2」人時揭曉。
// 適合一次抽多人：所有中獎者在最後一下同時亮起。
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { shuffle } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | running | animating | done
const cells = ref([]) // { id, name, out, win, delay }
const steps = ref([])
const stepIdx = ref(0)
const total = ref(0)
let queue = [] // 淘汰順序（不含中獎者）
let finalists = []

const aliveCount = computed(() => cells.value.filter((c) => !c.out).length)
const winCount = computed(() => cells.value.filter((c) => c.win).length)
const sizeClass = computed(() => {
  const n = cells.value.length
  if (n <= 12) return 'cell-xl'
  if (n <= 40) return 'cell-lg'
  if (n <= 120) return 'cell-md'
  if (n <= 300) return 'cell-sm'
  return 'cell-xs'
})

watchEffect(() => {
  let hint = '按 [空白鍵] 開始淘汰賽'
  if (phase.value === 'running') {
    const next = steps.value[stepIdx.value]
    hint =
      stepIdx.value === steps.value.length - 1
        ? `按 [空白鍵] 揭曉最後 ${next} 位`
        : `按 [空白鍵] 淘汰至 ${next} 人`
  } else if (phase.value === 'animating') hint = '淘汰中…'
  else if (phase.value === 'done' && props.ctx.remaining() > 0) hint = '按 [空白鍵] 再來一輪'
  props.ctx.setHint(hint)
})

// 淘汰階段：大名單每次留 1/3、再每次減半，最後剩「中獎人數 + 2」再揭曉
function buildSteps(n, k) {
  const seq = []
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
  const fset = new Set(finalists.map((p) => p.id))
  queue = shuffle(pool.filter((p) => !fset.has(p.id)).map((p) => p.id))
  cells.value = pool.map((p) => ({ id: p.id, name: p.name, out: false, win: false, delay: 0 }))
  total.value = pool.length
  steps.value = buildSteps(pool.length, finalists.length)
  // 可抽人數剛好等於名額時沒有淘汰階段，直接進入揭曉
  if (!steps.value.length) steps.value = [finalists.length]
  stepIdx.value = 0
  ctx.setBusy(true)
  ctx.sfx.whoosh()
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
    if (kill.has(c.id)) {
      c.delay = Math.random() * spread
      c.out = true
    }
  }
  if (kill.size) {
    ctx.sfx.drumroll(spread / 1000)
    await kit.sleep(spread + 350)
    ctx.sfx.hit()
  }
  stepIdx.value++
  if (isFinal) {
    await kit.sleep(250)
    for (const c of cells.value) {
      if (!c.out) {
        c.delay = 0
        c.win = true
      }
    }
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
  <div class="flex-1 flex flex-col items-center justify-center min-h-0 w-full">
    <template v-if="cells.length">
      <div class="elim-bar">
        <span>
          共 <b>{{ total }}</b> 人
        </span>
        <span class="elim-rounds">
          <i
            v-for="(s, i) in steps"
            :key="i"
            :class="{ done: i < stepIdx, now: i === stepIdx && phase !== 'done' }"
          >
            {{ i === steps.length - 1 ? '揭曉' : s }}
          </i>
        </span>
        <span v-if="phase === 'done'">
          中獎 <b class="text-gold">{{ winCount }}</b> 人
        </span>
        <span v-else>
          剩 <b>{{ aliveCount }}</b> 人
        </span>
      </div>
      <div class="elim-cells">
        <div
          v-for="(c, i) in cells"
          :key="i"
          :style="{ transitionDelay: c.delay + 'ms' }"
          :class="['cell', sizeClass, c.win ? 'win' : c.out ? 'out' : 'alive']"
        >
          <span class="cell-name">{{ c.name }}</span>
          <span v-if="c.win" class="cell-id">{{ c.id }}</span>
        </div>
      </div>
    </template>
    <div v-else class="text-center">
      <div class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
      <div class="mt-4 font-bold" style="color: var(--muted)">{{ pool.length }} 人參加淘汰賽</div>
    </div>
  </div>
</template>

<style scoped>
.elim-bar {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 2cqw;
  padding: 0 1cqw 1.2cqw;
  font-size: clamp(12px, 1.4cqw, 22px);
  color: var(--muted);
  flex-shrink: 0;
}
.elim-bar b {
  color: #fff;
  font-size: 1.45em;
  font-variant-numeric: tabular-nums;
}
.elim-bar b.text-gold {
  color: var(--gold);
}
.elim-rounds {
  display: flex;
  gap: 0.6cqw;
  flex-wrap: wrap;
  justify-content: center;
}
.elim-rounds i {
  font-style: normal;
  padding: 0.15em 0.9em;
  border-radius: 2em;
  border: 1px solid var(--line);
  font-size: 0.85em;
  font-variant-numeric: tabular-nums;
}
.elim-rounds i.done {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.elim-rounds i.now {
  border-color: var(--gold);
  color: var(--gold);
}
.elim-cells {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: center;
  gap: 0.6cqw;
  padding: 1cqw 0;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 0.6em;
  font-weight: 800;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.08);
  transition: all 0.5s;
  white-space: nowrap;
}
.cell.alive {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  border-color: color-mix(in srgb, var(--accent) 80%, white);
}
.cell.out {
  opacity: 0.12;
  transform: scale(0.85);
  text-decoration: line-through;
  filter: grayscale(1);
}
.cell.win {
  background: var(--gold);
  border-color: var(--gold);
  color: #3b2a00;
  transform: scale(1.15);
  box-shadow: 0 0 2cqw color-mix(in srgb, var(--gold) 55%, transparent);
  z-index: 1;
}
.cell-id {
  font-family: Consolas, monospace;
  font-weight: 600;
  font-size: 0.5em;
  opacity: 0.75;
  text-decoration: none;
}
.cell-xl {
  font-size: clamp(22px, 3.6cqw, 64px);
  padding: 0.3em 0.8em;
}
.cell-lg {
  font-size: clamp(16px, 2.2cqw, 40px);
  padding: 0.3em 0.7em;
}
.cell-md {
  font-size: clamp(13px, 1.4cqw, 26px);
  padding: 0.25em 0.6em;
}
.cell-sm {
  font-size: clamp(11px, 0.95cqw, 18px);
  padding: 0.2em 0.5em;
}
.cell-xs {
  font-size: clamp(9px, 0.7cqw, 14px);
  padding: 0.1em 0.35em;
}
</style>
