<script setup>
// 翻牌：第一下把所有可抽人員各發成一張牌（發牌時以安全亂數洗牌，蓋牌後看不出誰是誰）；
// 由來賓 / 主持人點選卡牌翻開，或按空白鍵隨機翻一張（一次抽完則一次翻開剩餘名額）
// 卡牌大小依舞台實際可用的寬高計算：找出能放下全部卡牌的最大尺寸（寬螢幕會自動多排），
// 字體、圓角、間距跟著卡牌大小縮放；卡牌太多、小於最小尺寸時才捲動
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { sample } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const phase = ref('idle') // idle | dealt | flipping | done
const cards = ref([]) // { id, name, flipped }

const isAll = computed(() => props.prize.mode === 'all' && props.prize.count > 1)
const MAX_W = 220 // 卡牌最大寬度（px）
const MIN_W = 28 // 卡牌最小寬度（px），再小就改為捲動
const PAD = 8 // 外框上下內距（px）
const box = ref({ w: 0, h: 0 })
const boxEl = ref(null)
let ro = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    // 隱藏（離開抽獎畫面 / 切換獎項）時尺寸為 0，保留上次的版面
    if (width > 0 && height > 0) box.value = { w: width, h: height }
  })
  ro.observe(boxEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

const gapOf = (w) => Math.round(Math.min(14, Math.max(4, w * 0.08)))
// 逐一嘗試每排幾張，取卡牌最大的排法（卡牌比例 3:4）
const layout = computed(() => {
  const n = cards.value.length
  const W = box.value.w
  const H = box.value.h - PAD * 2
  if (!n || W <= 0 || H <= 0) return { w: 80, gap: 8 }
  let best = MIN_W
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    // 先以估計的間距算，再用實際間距驗證
    let w = Math.min(MAX_W, (W - (cols - 1) * 8) / cols, ((H - (rows - 1) * 8) / rows) * 0.75)
    const g = gapOf(w)
    w = Math.min(MAX_W, (W - (cols - 1) * g) / cols, ((H - (rows - 1) * g) / rows) * 0.75)
    if (w > best) best = w
  }
  const w = Math.floor(best)
  return { w, gap: gapOf(w) }
})
const cardVars = computed(() => {
  const w = layout.value.w
  return {
    '--cw': w + 'px',
    '--num': Math.max(8, w * 0.36) + 'px',
    '--name': Math.max(6, Math.min(w * 0.22, 40)) + 'px',
    '--id': Math.max(6, Math.min(w * 0.1, 14)) + 'px',
    '--radius': Math.max(4, w * 0.1) + 'px',
    '--pad': Math.max(2, w * 0.05) + 'px',
    gap: layout.value.gap + 'px',
  }
})
// 卡牌太小時不顯示員編
const showId = computed(() => layout.value.w >= 56)
// 發牌動畫總長控制在約 1.5 秒內
const dealStep = computed(() => Math.min(40, 1500 / Math.max(1, cards.value.length)))

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
  // 所有可抽人員都上桌，decide 取全部即為安全亂數洗牌
  cards.value = ctx.decide(ctx.poolSize()).map((p) => ({ id: p.id, name: p.name, flipped: false }))
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
  <div ref="boxEl" class="flex-1 flex justify-center min-h-0 w-full overflow-y-auto">
    <div
      v-if="cards.length"
      class="my-auto flex flex-wrap justify-center content-center w-full py-2"
      :style="cardVars"
    >
      <button
        v-for="(c, i) in cards"
        :key="i"
        type="button"
        tabindex="-1"
        :class="['card aspect-[3/4] outline-none', c.flipped ? 'flipped' : '']"
        :style="{ animationDelay: i * dealStep + 'ms' }"
        :aria-label="c.flipped ? c.name : `第 ${i + 1} 張牌`"
        @click="onCardClick(i)"
      >
        <div class="card-inner">
          <div
            class="card-face card-back flex items-center justify-center font-black shadow-xl transition-colors"
          >
            <span class="card-num">{{ i + 1 }}</span>
          </div>
          <div class="card-face card-front flex flex-col items-center justify-center">
            <span
              class="card-name font-black text-gold text-center leading-tight"
              :style="{ '--len': Math.max(2, c.name.length) }"
            >
              {{ c.name }}
            </span>
            <span v-if="showId" class="card-id">{{ c.id }}</span>
          </div>
        </div>
      </button>
    </div>
    <div v-else class="my-auto text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
  </div>
</template>

<style scoped>
.card {
  width: var(--cw);
  perspective: 1000px;
  animation: dealIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
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
  border-radius: var(--radius);
  padding: var(--pad);
}
.card-num {
  font-size: var(--num);
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}
/* 名字維持一行：依字數縮小字體 */
.card-name {
  white-space: nowrap;
  font-size: min(var(--name), calc((var(--cw) - var(--pad) * 2) / var(--len) * 0.92));
}
.card-back {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0 10px, transparent 10px 20px),
    color-mix(in srgb, var(--accent) 45%, var(--ink));
  border: 1px solid color-mix(in srgb, var(--accent) 70%, white);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}
.card-back:hover {
  border-color: var(--gold);
}
.card-front {
  transform: rotateY(180deg);
  background: var(--gold-soft);
  border: 2px solid var(--gold);
}
.card-id {
  font-family: Consolas, monospace;
  font-size: var(--id);
  color: var(--muted);
}
@keyframes dealIn {
  from {
    opacity: 0;
    transform: translateY(-80px) rotate(-12deg) scale(0.6);
  }
}
</style>
