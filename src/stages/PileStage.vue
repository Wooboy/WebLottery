<script setup>
// 選堆：攤開所有可抽人員 → 蓋牌洗牌、平均分成 N 堆（3～5）→ 老闆選一堆留下，其餘淘汰
// → 重複分堆，直到剩下少量牌時一張張攤開，老闆選中的那張即為中獎者。
// 公平性：每次分堆前都以安全亂數洗牌，老闆在看不到內容的情況下選擇，
// 不論各堆張數是否相同，每個人最終中獎的機率都相等。
// 每局抽出一位；名額多於 1 時，按空白鍵再開一局。
import { ref, computed, watchEffect } from 'vue'
import { useStageKit, stageProps } from './kit.js'
import { shuffle, secureRandomInt } from '../lib/random.js'

const props = defineProps(stageProps)
const kit = useStageKit()

const FINAL_CARDS = 8 // 剩下不超過此數量時，直接攤牌讓老闆選
const FINAL_CARDS_MAX = 20 // 已分堆 2 輪後，剩下不超過此數量也直接攤牌（避免超過 3 輪）

// idle | showing | shuffling | piles | collecting | cards | flipping | done
const phase = ref('idle')
const alive = ref([]) // 目前留下的人（已洗牌）
const piles = ref([]) // 分堆：[[person, ...], ...]
const pickedPile = ref(-1)
const cards = ref([]) // 最後一輪：{ person, flipped, win }
const pileRounds = ref(0)
const history = ref([]) // 每輪人數變化，例如 ['100→20', '20→7']
const showNames = ref([])

const roundLabel = computed(() => {
  if (phase.value === 'cards' || phase.value === 'flipping' || phase.value === 'done') {
    return `第 ${pileRounds.value + 1} 輪 · 選 1 張`
  }
  if (phase.value === 'piles' || phase.value === 'collecting') {
    return `第 ${pileRounds.value + 1} 輪 · ${piles.value.length} 堆`
  }
  return ''
})

const showTextClass = computed(() => {
  const n = showNames.value.length
  if (n <= 12) return 'text-4xl px-6 py-3'
  if (n <= 40) return 'text-2xl px-4 py-2'
  if (n <= 120) return 'text-base px-3 py-1'
  if (n <= 300) return 'text-xs px-2 py-0.5'
  return 'text-[10px] px-1 py-0'
})
const cardWidth = computed(() => {
  const n = cards.value.length
  if (n <= 6) return '13cqw'
  if (n <= 10) return '10.5cqw'
  if (n <= 14) return '9cqw'
  return '7.5cqw'
})

watchEffect(() => {
  const map = {
    idle: '按 [空白鍵] 開始選堆',
    done: props.ctx.remaining() > 0 ? '按 [空白鍵] 再抽一位' : '本獎項已抽完',
    showing: '展示所有參加人員…',
    shuffling: '洗牌中…',
    collecting: '淘汰其他牌堆…',
    flipping: '揭曉中…',
    piles: `請選一堆：點選牌堆，或按 [1]～[${piles.value.length}]　[空白鍵] 隨機`,
    cards:
      cards.value.length <= 9
        ? `請選一張：點選卡牌，或按 [1]～[${cards.value.length}]　[空白鍵] 隨機`
        : '請選一張：點選卡牌　[空白鍵] 隨機',
  }
  props.ctx.setHint(map[phase.value] || '')
})

function pileCount(n) {
  if (n <= 40) return Math.min(5, Math.max(3, Math.ceil(n / FINAL_CARDS)))
  return 5
}

async function shuffleAnim() {
  phase.value = 'shuffling'
  props.ctx.sfx.rattle(0.9)
  await kit.sleep(900)
}

async function nextStep() {
  const n = alive.value.length
  if (n <= FINAL_CARDS || (pileRounds.value >= 2 && n <= FINAL_CARDS_MAX)) {
    cards.value = alive.value.map((person) => ({ person, flipped: false, win: false }))
    phase.value = 'cards'
    return
  }
  const N = Math.min(pileCount(n), n)
  const groups = Array.from({ length: N }, () => [])
  alive.value.forEach((p, i) => groups[i % N].push(p))
  piles.value = groups
  pickedPile.value = -1
  phase.value = 'piles'
}

async function start() {
  const { ctx } = props
  if (!ctx.canDraw()) return
  ctx.setBusy(true)
  // 以抽獎引擎的安全亂數取得整份可抽名單的隨機排列
  alive.value = ctx.decide(ctx.poolSize())
  pileRounds.value = 0
  history.value = []
  cards.value = []
  piles.value = []
  showNames.value = alive.value.map((p) => p.name)
  phase.value = 'showing'
  ctx.sfx.whoosh()
  await kit.sleep(alive.value.length > 100 ? 2600 : 2000)
  await shuffleAnim()
  await nextStep()
}

async function choosePile(i) {
  if (phase.value !== 'piles' || i < 0 || i >= piles.value.length) return
  const { ctx } = props
  pickedPile.value = i
  phase.value = 'collecting'
  ctx.sfx.hit()
  const before = alive.value.length
  await kit.sleep(1100)
  alive.value = shuffle(piles.value[i])
  history.value.push(`${before}→${alive.value.length}`)
  pileRounds.value++
  await shuffleAnim()
  await nextStep()
}

async function chooseCard(i) {
  if (phase.value !== 'cards' || i < 0 || i >= cards.value.length) return
  const { ctx } = props
  phase.value = 'flipping'
  const card = cards.value[i]
  card.flipped = true
  card.win = true
  ctx.sfx.pop()
  await kit.sleep(800)
  ctx.commit([card.person], { big: true })
  // 揭曉後翻開其他牌（差一點就是你）
  await kit.sleep(1200)
  for (const c of cards.value) c.flipped = true
  phase.value = 'done'
  ctx.setBusy(false)
}

function press() {
  if (phase.value === 'idle' || phase.value === 'done') return start()
  if (phase.value === 'piles') return choosePile(secureRandomInt(piles.value.length))
  if (phase.value === 'cards') return chooseCard(secureRandomInt(cards.value.length))
}

// 數字鍵 1～9 選擇牌堆 / 卡牌
function key(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code)
  if (!m) return false
  const i = Number(m[1]) - 1
  if (phase.value === 'piles') choosePile(i)
  else if (phase.value === 'cards' && cards.value.length <= 9) chooseCard(i)
  return true
}

defineExpose({ press, key })
</script>

<template>
  <div class="pile-root flex-1 flex flex-col min-h-0">
    <div
      v-if="phase !== 'idle'"
      class="flex items-center justify-between mb-3 shrink-0 text-sm"
      style="color: var(--muted)"
    >
      <span>
        剩
        <b class="text-white text-xl">{{
          phase === 'showing' ? showNames.length : alive.length
        }}</b>
        人
      </span>
      <div class="flex gap-2">
        <span v-for="(h, i) in history" :key="i" class="pile-round done"
          >第 {{ i + 1 }} 輪 {{ h }}</span
        >
        <span v-if="roundLabel" class="pile-round now">{{ roundLabel }}</span>
      </div>
    </div>

    <div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
      <!-- 待機 -->
      <div v-if="phase === 'idle'" class="text-center">
        <div class="text-5xl opacity-10 font-black tracking-[1.5rem]">READY</div>
        <div class="mt-4 font-bold" style="color: var(--muted)">{{ pool.length }} 人參加選堆</div>
      </div>

      <!-- 攤開所有人 / 洗牌 -->
      <div
        v-else-if="phase === 'showing' || phase === 'shuffling'"
        :class="[
          'flex flex-wrap justify-center content-center gap-2 w-full max-h-full overflow-hidden',
          phase === 'shuffling' ? 'pile-gather' : '',
        ]"
      >
        <div
          v-for="(n, i) in showNames"
          :key="i"
          :class="['rounded-lg font-bold border pile-name', showTextClass]"
          :style="{ animationDelay: Math.min(i * 6, 900) + 'ms' }"
        >
          {{ n }}
        </div>
      </div>

      <!-- 分堆 -->
      <div
        v-else-if="phase === 'piles' || phase === 'collecting'"
        class="flex justify-center gap-[3cqw] w-full"
      >
        <button
          v-for="(p, i) in piles"
          :key="i"
          type="button"
          tabindex="-1"
          :class="['pile', pickedPile === i ? 'pick' : pickedPile >= 0 ? 'out' : '']"
          :style="{ animationDelay: i * 90 + 'ms' }"
          @click="choosePile(i)"
        >
          <div class="stack">
            <div
              v-for="k in Math.min(p.length, 6)"
              :key="k"
              class="cd"
              :style="{
                top: (k - 1) * 0.35 + 'cqw',
                transform: `translateX(${(k - 3.5) * 0.25}cqw) rotate(${(k - 3.5) * 2}deg)`,
              }"
            ></div>
          </div>
          <div class="lbl">{{ i + 1 }}</div>
          <div class="n">{{ p.length }} 張</div>
        </button>
      </div>

      <!-- 最後一輪：攤牌 -->
      <div v-else class="flex flex-wrap justify-center content-center gap-[1.4cqw] w-full">
        <button
          v-for="(c, i) in cards"
          :key="i"
          type="button"
          tabindex="-1"
          :class="['fcard', c.flipped ? 'flipped' : '', c.win ? 'win' : c.flipped ? 'lose' : '']"
          :style="{ width: cardWidth, animationDelay: i * 50 + 'ms' }"
          @click="chooseCard(i)"
        >
          <div class="fcard-inner">
            <div class="fcard-face fcard-back">
              <span>{{ i + 1 }}</span>
            </div>
            <div class="fcard-face fcard-front">
              <b>{{ c.person.name }}</b>
              <span>{{ c.person.id }}</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pile-root {
  container-type: inline-size;
}
.pile-round {
  padding: 0.15rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 0.8rem;
}
.pile-round.done {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.pile-round.now {
  border-color: var(--gold);
  color: var(--gold);
}
.pile-name {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--line);
  animation: nameIn 0.35s ease-out both;
}
.pile-gather .pile-name {
  transition: all 0.8s ease-in;
  transform: scale(0.3) rotate(8deg);
  opacity: 0;
  background: color-mix(in srgb, var(--accent) 45%, var(--ink));
  color: transparent;
}
@keyframes nameIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.pile {
  width: 15cqw;
  text-align: center;
  cursor: pointer;
  transition:
    opacity 0.6s,
    transform 0.6s;
  animation: dealIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.pile:hover .cd {
  border-color: var(--gold);
}
.stack {
  position: relative;
  height: 16cqw;
}
.cd {
  position: absolute;
  left: 50%;
  width: 10.5cqw;
  height: 14cqw;
  margin-left: -5.25cqw;
  border-radius: 1cqw;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0 0.6cqw, transparent 0.6cqw 1.2cqw),
    color-mix(in srgb, var(--accent) 45%, var(--ink));
  border: 1px solid color-mix(in srgb, var(--accent) 70%, white);
  transition: border-color 0.2s;
}
.pile .lbl {
  margin-top: 1cqw;
  font-size: 3.2cqw;
  font-weight: 900;
}
.pile .n {
  font-size: 1.3cqw;
  color: var(--muted);
}
.pile.pick {
  transform: scale(1.12);
}
.pile.pick .cd {
  border-color: var(--gold);
  box-shadow: 0 0 0 0.3cqw var(--gold-soft);
}
.pile.pick .lbl {
  color: var(--gold);
}
.pile.out {
  opacity: 0.12;
  transform: translateY(3cqw) scale(0.85);
}
@keyframes dealIn {
  from {
    opacity: 0;
    transform: translateY(-6cqw) scale(0.7);
  }
}

.fcard {
  aspect-ratio: 3 / 4;
  perspective: 1000px;
  animation: dealIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.fcard-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}
.fcard.flipped .fcard-inner {
  transform: rotateY(180deg);
}
.fcard-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 1cqw;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5cqw;
}
.fcard-back {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0 0.6cqw, transparent 0.6cqw 1.2cqw),
    color-mix(in srgb, var(--accent) 45%, var(--ink));
  border: 1px solid color-mix(in srgb, var(--accent) 70%, white);
  font-weight: 900;
  font-size: 3cqw;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}
.fcard-back:hover {
  border-color: var(--gold);
}
.fcard-front {
  transform: rotateY(180deg);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
}
.fcard-front b {
  font-size: 1.8cqw;
  word-break: break-all;
  text-align: center;
  line-height: 1.2;
}
.fcard-front span {
  font-size: 1cqw;
  color: var(--muted);
  font-family: Consolas, monospace;
}
.fcard.win .fcard-front {
  background: var(--gold-soft);
  border: 2px solid var(--gold);
}
.fcard.win .fcard-front b {
  color: var(--gold);
}
.fcard.win {
  transform: translateY(-1.5cqw) scale(1.12);
  transition: transform 0.4s;
  z-index: 1;
}
.fcard.lose {
  opacity: 0.45;
}
</style>
