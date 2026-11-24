<script setup>
// 扭蛋機：按一下扭蛋機開始搖晃，掉出一顆扭蛋並打開揭曉中獎者
// 一次抽完：自動連續扭到抽滿（名額多時加快節奏）
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useStageKit, stageProps } from './kit.js'

const props = defineProps(stageProps)
const kit = useStageKit()

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

const phase = ref('idle') // idle | running
const shaking = ref(false)
const capsule = ref(null) // { color, state: 'drop' | 'open', key }
const result = ref('')
let capsuleKey = 0

// 球的位置：在圓頂內隨機分布（純視覺）
const balls = Array.from({ length: 16 }, (_, i) => {
  const r = 30 + Math.random() * 70
  const a = Math.random() * Math.PI * 2
  return {
    x: 130 + r * Math.cos(a) - 22,
    y: 140 + r * Math.sin(a) * 0.8 - 22,
    color: COLORS[i % COLORS.length],
    delay: -Math.random() * 3,
  }
})

// 依舞台高度縮放扭蛋機（原始尺寸 260 × 370）
const rootEl = ref(null)
const scale = ref(1)
let observer = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    scale.value = Math.max(0.4, Math.min(1.3, (entry.contentRect.height - 8) / 370))
  })
  observer.observe(rootEl.value)
})
onBeforeUnmount(() => observer?.disconnect())

const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const shown = computed(() => result.value || props.winners[props.winners.length - 1]?.name || '')

watchEffect(() => {
  props.ctx.setHint(phase.value === 'idle' ? '按 [空白鍵] 轉動扭蛋機' : '扭蛋中…')
})

async function once(fast) {
  const { ctx } = props
  const [winner] = ctx.decide(1)
  result.value = ''
  capsule.value = null
  shaking.value = true
  const shakeMs = fast ? 800 : 1700
  ctx.sfx.rattle(shakeMs / 1000)
  await kit.sleep(shakeMs)
  shaking.value = false
  capsule.value = { color: COLORS[capsuleKey % COLORS.length], state: 'drop', key: ++capsuleKey }
  ctx.sfx.whoosh()
  await kit.sleep(fast ? 600 : 900)
  capsule.value.state = 'open'
  ctx.sfx.pop()
  await kit.sleep(350)
  result.value = winner.name
  ctx.commit([winner], { big: props.prize.count === 1 })
}

async function run() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  phase.value = 'running'
  ctx.setBusy(true)
  await once(false)
  if (isAll.value) {
    while (ctx.remaining() > 0 && ctx.poolSize() > 0) {
      await kit.sleep(1100)
      await once(ctx.remaining() > 5)
    }
  }
  phase.value = 'idle'
  ctx.setBusy(false)
}

function press() {
  if (phase.value === 'idle') run()
}

defineExpose({ press })
</script>

<template>
  <div
    ref="rootEl"
    class="flex-1 flex flex-row items-center justify-center gap-10 min-h-0 overflow-hidden"
  >
    <!-- 扭蛋機本體 -->
    <div class="shrink-0" :style="{ width: 260 * scale + 'px', height: 370 * scale + 'px' }">
      <div
        :class="['machine relative origin-top-left', shaking ? 'shaking' : '']"
        :style="{ transform: `scale(${scale})` }"
      >
        <div class="dome absolute left-0 top-0 w-[260px] h-[260px] rounded-full overflow-hidden">
          <div
            v-for="(b, i) in balls"
            :key="i"
            class="ball absolute w-[44px] h-[44px] rounded-full"
            :style="{
              left: b.x + 'px',
              top: b.y + 'px',
              background: `radial-gradient(circle at 30% 30%, #fff8, transparent 45%), linear-gradient(${b.color} 50%, #f5f5f5 50%)`,
              animationDelay: b.delay + 's',
            }"
          ></div>
        </div>
        <div
          class="body absolute left-[20px] top-[230px] w-[220px] h-[130px] rounded-b-3xl rounded-t-lg"
        >
          <div
            class="knob absolute left-[30px] top-[30px] w-[56px] h-[56px] rounded-full border-4 border-white/70"
          >
            <div
              class="absolute left-1/2 top-1 bottom-1 w-[10px] -translate-x-1/2 bg-white/80 rounded"
            ></div>
          </div>
          <div
            class="chute absolute right-[24px] top-[52px] w-[80px] h-[60px] rounded-xl bg-black/50"
          ></div>
        </div>
        <!-- 掉出的扭蛋 -->
        <div
          v-if="capsule"
          :key="capsule.key"
          :class="['capsule absolute left-[156px] top-[300px] w-[56px] h-[56px]', capsule.state]"
        >
          <div class="half top-half" :style="{ background: capsule.color }"></div>
          <div class="half bottom-half"></div>
        </div>
      </div>
    </div>

    <!-- 揭曉 -->
    <div class="text-center min-w-[30%]">
      <div
        v-if="shown && !shaking"
        :key="shown"
        class="reveal text-[clamp(2.5rem,7vw,6rem)] font-black text-yellow-300 glow-text tracking-tight"
      >
        {{ shown }}
      </div>
      <div v-else class="text-4xl opacity-10 font-black tracking-[1rem]">
        {{ shaking ? '…' : 'READY' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.machine {
  width: 260px;
  height: 370px;
}
.dome {
  background: radial-gradient(
    circle at 35% 30%,
    rgba(255, 255, 255, 0.35),
    rgba(255, 255, 255, 0.06) 60%
  );
  border: 4px solid rgba(255, 255, 255, 0.45);
  box-shadow: inset 0 -20px 40px rgba(0, 0, 0, 0.25);
}
.body {
  background: linear-gradient(160deg, #ef4444, #991b1b);
  border: 3px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}
.ball {
  border: 2px solid rgba(0, 0, 0, 0.15);
  animation: float 3s ease-in-out infinite;
}
.shaking .ball {
  animation: jumble 0.18s linear infinite;
}
.shaking .dome {
  animation: wobble 0.12s linear infinite;
}
.shaking .knob {
  animation: turn 0.6s linear infinite;
}
@keyframes float {
  50% {
    transform: translateY(-4px);
  }
}
@keyframes jumble {
  0% {
    transform: translate(0, 0) rotate(0);
  }
  25% {
    transform: translate(9px, -12px) rotate(90deg);
  }
  50% {
    transform: translate(-8px, -4px) rotate(180deg);
  }
  75% {
    transform: translate(6px, 10px) rotate(270deg);
  }
  100% {
    transform: translate(0, 0) rotate(360deg);
  }
}
@keyframes wobble {
  50% {
    transform: rotate(1.5deg);
  }
}
@keyframes turn {
  to {
    transform: rotate(360deg);
  }
}
.capsule .half {
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  border: 2px solid rgba(0, 0, 0, 0.2);
  transition:
    transform 0.4s ease-out,
    opacity 0.4s;
}
.capsule .top-half {
  top: 0;
  border-radius: 28px 28px 0 0;
}
.capsule .bottom-half {
  bottom: 0;
  border-radius: 0 0 28px 28px;
  background: #f5f5f5;
}
.capsule.drop {
  animation: drop 0.8s cubic-bezier(0.3, 1.4, 0.6, 1) both;
}
.capsule.open .top-half {
  transform: translate(-18px, -36px) rotate(-35deg);
  opacity: 0;
}
.capsule.open .bottom-half {
  transform: translate(14px, 20px) rotate(25deg);
  opacity: 0;
}
@keyframes drop {
  from {
    transform: translateY(-70px) scale(0.6);
    opacity: 0;
  }
}
.reveal {
  animation: reveal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes reveal {
  from {
    opacity: 0;
    transform: scale(0.2) translateY(60px);
  }
}
</style>
