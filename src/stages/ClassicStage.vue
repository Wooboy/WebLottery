<script setup>
// 經典跳字：第一下開始跳動；連續單抽每按一下抽出一位、動畫不停，抽滿才停止；一次抽完則一次揭曉
// 連續單抽抽出一位後，名字會停留約 1 秒（以金色顯示）再繼續跳動
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { pick } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const HOLD_MS = 1000

const phase = ref('idle') // idle | spinning
const display = ref(null) // { id, name }
const ghosts = ref(['', ''])
const justWon = ref(false)
let holdUntil = 0
let stopSpin = null

const lastWinner = computed(() => props.winners[props.winners.length - 1] || null)
const shown = computed(() => display.value || lastWinner.value)

watchEffect(() => {
  const all = props.prize.mode === 'all' && props.prize.count > 1
  props.ctx.setHint(
    phase.value === 'spinning'
      ? all
        ? '按 [空白鍵] 揭曉全部'
        : '按 [空白鍵] 抽出下一位'
      : '按 [空白鍵] 開始抽獎',
  )
})

function stop() {
  stopSpin?.()
  stopSpin = null
  phase.value = 'idle'
  props.ctx.setBusy(false)
}

function press() {
  const { ctx } = props
  if (phase.value === 'idle') {
    if (!ctx.canDraw()) return
    phase.value = 'spinning'
    justWon.value = false
    ctx.setBusy(true)
    let n = 0
    stopSpin = kit.every(60, () => {
      if (performance.now() < holdUntil) return
      justWon.value = false
      display.value = pick(props.pool) || null
      ghosts.value = [pick(props.pool)?.name || '', pick(props.pool)?.name || '']
      if (++n % 2 === 0) ctx.sfx.tick()
    })
    return
  }
  const people = ctx.decide(ctx.roundSize())
  if (!people.length) return stop()
  ctx.commit(people)
  display.value = people[people.length - 1]
  justWon.value = true
  holdUntil = performance.now() + HOLD_MS
  if (props.prize.mode === 'all' || ctx.remaining() <= 0 || ctx.poolSize() <= 0) stop()
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex items-center justify-center min-h-0 text-center">
    <div v-if="phase === 'spinning' && !justWon">
      <div class="ghost">{{ ghosts[0] }}</div>
      <div class="name-display font-black tracking-tight">{{ display?.name }}</div>
      <div class="ghost">{{ ghosts[1] }}</div>
    </div>
    <div v-else-if="shown" :key="shown.id">
      <div class="name-display font-black tracking-tight text-gold win-pop">{{ shown.name }}</div>
      <div v-if="shown.id" class="win-id">{{ shown.id }}</div>
    </div>
    <div v-else class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>

<style scoped>
.ghost {
  font-size: clamp(1.5rem, 4vw, 4.5rem);
  font-weight: 900;
  line-height: 1.15;
  color: rgba(255, 255, 255, 0.12);
}
.win-id {
  margin-top: 0.5rem;
  font-family: Consolas, monospace;
  font-size: clamp(0.9rem, 1.6vw, 2rem);
  color: var(--muted);
  letter-spacing: 0.1em;
}
.win-pop {
  animation: winPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes winPop {
  from {
    transform: scale(0.8);
  }
}
</style>
