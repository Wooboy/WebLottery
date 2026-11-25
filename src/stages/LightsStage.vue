<script setup>
// 跑燈：所有可抽人員以暗色排列，畫面上有「剩餘名額」盞亮燈在名字間隨機跳動。
// 按下抽獎時以安全亂數決定中獎者，亮燈逐漸減速後停在中獎者名字上。
// 一次抽完：按一下所有亮燈一起停下；連續單抽：每按一下停下一盞燈（其他燈繼續跑）。
import { ref, computed, watch, watchEffect, onMounted } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { shuffle, secureRandomInt } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const RUN_MS = 110 // 亮燈跳動間隔
// 停下時的跳動間隔（逐漸變慢），最後一跳落在中獎者身上
const STOP_STEPS = [90, 100, 110, 125, 145, 170, 200, 240, 290, 350, 420, 500]

const cells = ref([]) // { id, name, win }
const lights = ref([]) // { at: 格子索引, state: 'run' | 'stop' }
const stopping = ref(0) // 正在減速中的燈數
let stopRun = null

const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const sizeClass = computed(() => {
  const n = cells.value.length
  if (n <= 12) return 'cell-xl'
  if (n <= 40) return 'cell-lg'
  if (n <= 120) return 'cell-md'
  if (n <= 300) return 'cell-sm'
  return 'cell-xs'
})
// 每格目前是否有亮燈
const litSet = computed(() => new Set(lights.value.map((l) => l.at)))

watchEffect(() => {
  props.ctx.setHint(
    stopping.value
      ? '揭曉中…'
      : isAll.value
        ? '按 [空白鍵] 亮燈全部停下'
        : '按 [空白鍵] 停下一盞燈',
  )
})

// 名單：本獎項已中獎者（亮金色）＋目前可抽人員，打亂順序排列
function buildCells() {
  const won = props.winners.map((w) => ({ id: w.id, name: w.name, win: true }))
  const pool = props.pool.map((p) => ({ id: p.id, name: p.name, win: false }))
  cells.value = shuffle([...won, ...pool])
  resetLights()
}

// 亮燈數 = 剩餘名額（不超過可抽人數）
function resetLights() {
  const n = Math.min(props.ctx.remaining(), props.ctx.poolSize())
  const free = shuffle(freeCells(new Set()))
  lights.value = free.slice(0, Math.max(0, n)).map((at) => ({ at, state: 'run' }))
}

function freeCells(taken) {
  const out = []
  cells.value.forEach((c, i) => {
    if (!c.win && !taken.has(i)) out.push(i)
  })
  return out
}

// 亮燈跳到另一個沒有被其他燈占用、也不是中獎者的格子
function hop(light) {
  const taken = new Set(lights.value.filter((l) => l !== light).map((l) => l.at))
  const free = freeCells(taken)
  if (free.length) light.at = free[secureRandomInt(free.length)]
}

function startRunning() {
  stopRun?.()
  stopRun = kit.every(RUN_MS, () => {
    for (const l of lights.value) if (l.state === 'run') hop(l)
  })
}

// 參與名單變動（人數改變）且沒有在揭曉時，重新排列
watch(
  () => props.pool.length + props.winners.length,
  () => {
    if (!stopping.value) buildCells()
  },
)

onMounted(() => {
  buildCells()
  startRunning()
})

async function stopLight(light, person) {
  const target = cells.value.findIndex((c) => c.id === person.id && !c.win)
  light.state = 'stop'
  for (const ms of STOP_STEPS) {
    await kit.sleep(ms)
    hop(light)
    props.ctx.sfx.tick()
  }
  await kit.sleep(560)
  light.at = target
  props.ctx.sfx.hit()
}

async function press() {
  const { ctx } = props
  if (stopping.value) return
  if (!ctx.canDraw()) return
  const running = lights.value.filter((l) => l.state === 'run')
  if (!running.length) return
  const people = ctx.decide(isAll.value ? running.length : 1)
  if (!people.length) return
  // 連續單抽：隨機挑一盞正在跑的燈停下
  const chosen = isAll.value
    ? running.slice(0, people.length)
    : [running[secureRandomInt(running.length)]]
  stopping.value = chosen.length
  ctx.setBusy(true)
  await Promise.all(chosen.map((l, i) => stopLight(l, people[i])))
  // 停下的格子變成中獎者，亮燈移除
  for (const l of chosen) cells.value[l.at].win = true
  lights.value = lights.value.filter((l) => !chosen.includes(l))
  await kit.sleep(200)
  ctx.commit(people, { big: props.prize.count === 1 })
  stopping.value = 0
  ctx.setBusy(false)
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center min-h-0 w-full">
    <div v-if="cells.length" class="lights-cells">
      <div
        v-for="(c, i) in cells"
        :key="c.id"
        :class="['cell', sizeClass, c.win ? 'win' : litSet.has(i) ? 'lit' : '']"
      >
        <span>{{ c.name }}</span>
        <span v-if="c.win" class="cell-id">{{ c.id }}</span>
      </div>
    </div>
    <div v-else class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>

<style scoped>
.lights-cells {
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
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition:
    background-color 0.12s,
    color 0.12s,
    box-shadow 0.12s,
    border-color 0.12s;
}
.cell.lit {
  color: #fff;
  background: color-mix(in srgb, var(--accent) 70%, white 10%);
  border-color: color-mix(in srgb, var(--accent) 60%, white);
  box-shadow:
    0 0 1.2em color-mix(in srgb, var(--accent) 80%, transparent),
    0 0 0.3em rgba(255, 255, 255, 0.6) inset;
  transition-duration: 0.05s;
}
.cell.win {
  background: var(--gold);
  border-color: var(--gold);
  color: #3b2a00;
  box-shadow: 0 0 1.5em color-mix(in srgb, var(--gold) 55%, transparent);
  animation: winPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cell-id {
  font-family: Consolas, monospace;
  font-weight: 600;
  font-size: 0.5em;
  opacity: 0.75;
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
@keyframes winPop {
  from {
    transform: scale(0.8);
  }
}
</style>
