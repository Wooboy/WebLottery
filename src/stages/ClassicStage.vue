<script setup>
// 經典跳字：第一下開始跳動；連續單抽每按一下抽出一位、動畫不停，抽滿才停止；一次抽完則一次揭曉
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { pick } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | spinning
const display = ref('')
let stopSpin = null

const lastWinner = computed(() => props.winners[props.winners.length - 1]?.name || '')
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
    ctx.setBusy(true)
    let n = 0
    stopSpin = kit.every(60, () => {
      display.value = pick(props.pool)?.name || ''
      if (++n % 2 === 0) ctx.sfx.tick()
    })
    return
  }
  const people = ctx.decide(ctx.roundSize())
  if (!people.length) return stop()
  ctx.commit(people)
  display.value = people[people.length - 1].name
  if (props.prize.mode === 'all' || ctx.remaining() <= 0 || ctx.poolSize() <= 0) stop()
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex items-center justify-center min-h-0">
    <div
      v-if="phase === 'spinning'"
      class="name-display font-black glow-text opacity-90 tracking-tighter text-center"
    >
      {{ display }}
    </div>
    <div
      v-else-if="shown"
      class="name-display font-black text-yellow-300 glow-text animate-pulse tracking-tighter text-center"
    >
      {{ shown }}
    </div>
    <div v-else class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>
