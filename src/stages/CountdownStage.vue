<script setup>
// 倒數揭曉：按一下即抽出中獎者，倒數 3、2、1 後逐字揭曉（多人時依序跳出）
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | counting | revealing
const count = ref(0)
const typed = ref('')
const revealed = ref([]) // 多人時依序跳出的 { id, name }
const typedId = ref('')

const lastWinner = computed(() => props.winners[props.winners.length - 1] || null)

watchEffect(() => {
  props.ctx.setHint(phase.value === 'idle' ? '按 [空白鍵] 開始倒數' : '揭曉中…')
})

async function run() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  const people = ctx.decide(ctx.roundSize())
  ctx.setBusy(true)
  typed.value = ''
  typedId.value = ''
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
  if (people.length === 1) {
    for (const ch of Array.from(people[0].name)) {
      typed.value += ch
      ctx.sfx.tick()
      await kit.sleep(260)
    }
    typedId.value = people[0].id
  } else {
    const gap = people.length > 10 ? 120 : 300
    for (const p of people) {
      revealed.value.push(p)
      ctx.sfx.pop()
      await kit.sleep(gap)
    }
  }
  await kit.sleep(200)
  ctx.commit(people, { big: props.prize.count === 1 })
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
    <div v-if="phase === 'counting'" class="ring">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="4" />
        <circle
          :key="count"
          class="ring-arc"
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke-width="4"
          stroke-linecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div :key="count" class="countdown font-black leading-none">{{ count }}</div>
    </div>
    <div v-else-if="revealed.length" class="flex flex-wrap justify-center gap-4 w-full py-2">
      <div v-for="(p, i) in revealed" :key="i" class="pop-in lt-chip">
        <b>{{ p.name }}</b>
        <span>{{ p.id }}</span>
      </div>
    </div>
    <div v-else-if="typed || lastWinner" class="text-center">
      <div class="name-display font-black text-gold tracking-tight">
        {{ phase === 'revealing' || typed ? typed : lastWinner.name
        }}<span v-if="phase === 'revealing'" class="caret">|</span>
      </div>
      <div v-if="typedId || (!typed && lastWinner)" class="win-id pop-in">
        {{ typedId || lastWinner.id }}
      </div>
    </div>
    <div v-else class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  width: min(28vw, 55vh);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring svg {
  position: absolute;
  inset: 0;
}
.ring-arc {
  stroke: var(--accent);
  stroke-dasharray: 283;
  stroke-dashoffset: 0;
  animation: ringDrain 0.9s linear both;
}
@keyframes ringDrain {
  to {
    stroke-dashoffset: 283;
  }
}
.countdown {
  font-size: min(16vw, 32vh);
  animation: countPop 0.9s ease-out both;
}
.win-id {
  margin-top: 0.5rem;
  font-family: Consolas, monospace;
  font-size: clamp(0.9rem, 1.6vw, 2rem);
  color: var(--muted);
  letter-spacing: 0.1em;
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
