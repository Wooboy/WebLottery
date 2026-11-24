<script setup>
// 翻牌：第一下發牌（每張牌背後的人在發牌時以安全亂數決定）；
// 由來賓 / 主持人點選卡牌翻開，或按空白鍵隨機翻一張（一次抽完則一次翻開剩餘名額）
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { sample } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | dealt | flipping | done
const cards = ref([]) // { id, name, flipped }

const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const sizeClass = computed(() => {
  const n = cards.value.length
  // 依螢幕高度決定卡牌大小，避免小螢幕溢出
  if (n <= 8) return { card: 'w-[clamp(5rem,15vh,11rem)]', num: 'text-5xl', name: 'text-2xl' }
  if (n <= 16) return { card: 'w-[clamp(4rem,11vh,8rem)]', num: 'text-4xl', name: 'text-lg' }
  if (n <= 30) return { card: 'w-[clamp(3.5rem,8vh,6rem)]', num: 'text-2xl', name: 'text-sm' }
  return { card: 'w-[clamp(3rem,6vh,4.5rem)]', num: 'text-lg', name: 'text-[10px]' }
})

watchEffect(() => {
  props.ctx.setHint(
    phase.value === 'dealt'
      ? isAll.value
        ? '點選卡牌翻開，或按 [空白鍵] 一次翻開全部名額'
        : '點選卡牌翻開，或按 [空白鍵] 隨機翻一張'
      : phase.value === 'flipping'
        ? '翻牌中…'
        : '按 [空白鍵] 發牌',
  )
})

function deal() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  const r = ctx.remaining()
  const n = Math.min(ctx.poolSize(), Math.max(r, Math.min(24, Math.max(8, r * 2))))
  cards.value = ctx.decide(n).map((p) => ({ id: p.id, name: p.name, flipped: false }))
  phase.value = 'dealt'
  ctx.setBusy(true)
  ctx.sfx.whoosh()
}

function finishIfDone() {
  const { ctx } = props
  const left = cards.value.some((c) => !c.flipped)
  if (ctx.remaining() <= 0 || !left) {
    phase.value = 'done'
    ctx.setBusy(false)
  } else {
    phase.value = 'dealt'
  }
}

async function flip(indices) {
  const { ctx } = props
  phase.value = 'flipping'
  for (const i of indices) {
    cards.value[i].flipped = true
    ctx.sfx.pop()
    await kit.sleep(indices.length > 1 ? 160 : 0)
  }
  await kit.sleep(650)
  ctx.commit(
    indices.map((i) => ({ id: cards.value[i].id, name: cards.value[i].name })),
    { big: props.prize.count === 1 },
  )
  finishIfDone()
}

function onCardClick(i) {
  if (phase.value !== 'dealt' || cards.value[i].flipped) return
  if (props.ctx.remaining() <= 0) return
  flip([i])
}

function press() {
  if (phase.value === 'idle' || phase.value === 'done') return deal()
  if (phase.value !== 'dealt') return
  const closed = cards.value.map((c, i) => (c.flipped ? -1 : i)).filter((i) => i >= 0)
  const n = isAll.value ? Math.min(props.ctx.remaining(), closed.length) : 1
  flip(sample(closed, n))
}

defineExpose({ press })
</script>

<template>
  <div class="flex-1 flex items-center justify-center min-h-0 overflow-y-auto">
    <div v-if="cards.length" class="flex flex-wrap justify-center content-center gap-3 w-full py-2">
      <button
        v-for="(c, i) in cards"
        :key="i"
        type="button"
        tabindex="-1"
        :class="['card aspect-[3/4] outline-none', sizeClass.card, c.flipped ? 'flipped' : '']"
        :style="{ animationDelay: i * 40 + 'ms' }"
        :aria-label="c.flipped ? c.name : `第 ${i + 1} 張牌`"
        @click="onCardClick(i)"
      >
        <div class="card-inner">
          <div
            class="card-face card-back rounded-2xl border-2 border-white/40 flex items-center justify-center font-black shadow-xl hover:border-yellow-300 transition-colors"
          >
            <span :class="[sizeClass.num, 'opacity-80']">{{ i + 1 }}</span>
          </div>
          <div
            class="card-face card-front rounded-2xl border-2 border-yellow-300 bg-yellow-400/25 flex items-center justify-center p-2 shadow-[0_0_30px_rgba(253,224,71,0.4)]"
          >
            <span
              :class="[
                sizeClass.name,
                'font-black text-yellow-200 glow-text break-all text-center',
              ]"
            >
              {{ c.name }}
            </span>
          </div>
        </div>
      </button>
    </div>
    <div v-else class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>

<style scoped>
.card {
  perspective: 1000px;
  animation: dealIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}
.card.flipped .card-inner {
  transform: rotateY(180deg);
}
.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}
.card-back {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08) 0 10px, transparent 10px 20px),
    linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.05));
  cursor: pointer;
}
.card-front {
  transform: rotateY(180deg);
}
@keyframes dealIn {
  from {
    opacity: 0;
    transform: translateY(-80px) rotate(-12deg) scale(0.6);
  }
}
</style>
