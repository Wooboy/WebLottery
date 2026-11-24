import ClassicStage from './ClassicStage.vue'
import SlotStage from './SlotStage.vue'
import WheelStage from './WheelStage.vue'
import PileStage from './PileStage.vue'
import FlipStage from './FlipStage.vue'
import CountdownStage from './CountdownStage.vue'
import GachaStage from './GachaStage.vue'

// 抽獎動畫樣式（key 存於獎項設定 prize.style）
export const STAGES = [
  { key: 'classic', label: '經典跳字', component: ClassicStage },
  { key: 'slot', label: '老虎機', component: SlotStage },
  { key: 'wheel', label: '幸運轉盤', component: WheelStage },
  { key: 'pile', label: '選堆', component: PileStage },
  { key: 'flip', label: '翻牌', component: FlipStage },
  { key: 'countdown', label: '倒數揭曉', component: CountdownStage },
  { key: 'gacha', label: '扭蛋機', component: GachaStage },
]

export const DEFAULT_STAGE = 'classic'

// 已停用的樣式對應到新樣式（淘汰制 → 選堆）
const LEGACY = { elimination: 'pile', 淘汰制: 'pile' }

export function normalizeStageKey(key) {
  const k = LEGACY[key] || key
  return STAGES.some((s) => s.key === k) ? k : DEFAULT_STAGE
}

export function stageOf(key) {
  return STAGES.find((s) => s.key === normalizeStageKey(key)) || STAGES[0]
}

// CSV 匯入：接受 key 或中文名稱
export function parseStageKey(text) {
  const raw = (text || '').trim()
  const t = LEGACY[raw] || LEGACY[raw.toLowerCase()] || raw.toLowerCase()
  const s = STAGES.find((x) => x.key === t || x.label === raw)
  return s ? s.key : DEFAULT_STAGE
}
