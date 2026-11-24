<script setup>
// 倒數揭曉：按一下即抽出中獎者，倒數 3、2、1 後逐字揭曉（多人時依序跳出）
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | counting | revealing
const count = ref(0)
const typed = ref('')
const revealed = ref([])

const lastWinner = computed(() => props.winners[props.winners.length - 1] || '')

watchEffect(() => {
  props.ctx.setHint(phase.value === 'idle' ? '按 [空白鍵] 開始倒數' : '揭曉中…')
})

async function run() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  const names = ctx.decide(ctx.roundSize())
  ctx.setBusy(true)
  typed.value = ''
  revealed.value = []
  phase.value = 'counting'
  ctx.sfx.drumroll(2.7)
  for (const c of [3, 2, 1]) {
    count.value = c
    ctx.sfx.tick()
    await kit.sleep(900)
  }
  ctx.sfx.hit()
  phase.value = 'revealing'
  if (names.length === 1) {
    for (const ch of Array.from(names[0])) {
      typed.value += ch
      ctx.sfx.tick()
      await kit.sleep(260)
    }
  } else {
    const gap = names.length > 10 ? 120 : 300
    for (const n of names) {
      revealed.value.push(n)
      ctx.sfx.pop()
      await kit.sleep(gap)
    }
  }
  await kit.sleep(200)
  ctx.commit(names, { big: props.prize.count === 1 })
  phase.value = 'idle'
  ctx.setBusy(false)
}

function press() {
  if (phase.value === 'idle') run()
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex items-center justify-center min-h-0 overflow-y-auto">
    <div
      v-if="phase === 'counting'"
      :key="count"
      class="countdown font-black glow-text text-[clamp(8rem,28vw,22rem)] leading-none"
    >
      {{ count }}
    </div>
    <div v-else-if="revealed.length" class="flex flex-wrap justify-center gap-4 w-full py-2">
      <div
        v-for="(n, i) in revealed"
        :key="i"
        class="pop-in px-6 py-2 rounded-2xl bg-yellow-400/20 border border-yellow-300/50 text-4xl font-black text-yellow-300 glow-text"
      >
        {{ n }}
      </div>
    </div>
    <div
      v-else-if="typed || lastWinner"
      class="name-display font-black text-yellow-300 glow-text tracking-tighter text-center"
    >
      {{ phase === 'revealing' ? typed : typed || lastWinner
      }}<span v-if="phase === 'revealing'" class="caret">|</span>
    </div>
    <div v-else class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>

<style scoped>
.countdown {
  animation: countPop 0.9s ease-out both;
}
@keyframes countPop {
  0% {
    opacity: 0;
    transform: scale(2.2);
  }
  25% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0.15;
    transform: scale(0.85);
  }
}
.caret {
  animation: blink 0.6s steps(1) infinite;
  opacity: 0.7;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.pop-in {
  animation: popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.3);
  }
}
</style>
