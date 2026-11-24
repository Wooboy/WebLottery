import ClassicStage from './ClassicStage.vue'
import SlotStage from './SlotStage.vue'
import WheelStage from './WheelStage.vue'
import EliminationStage from './EliminationStage.vue'
import FlipStage from './FlipStage.vue'
import CountdownStage from './CountdownStage.vue'
import GachaStage from './GachaStage.vue'

// 抽獎動畫樣式（key 存於獎項設定 prize.style）
export const STAGES = [
  { key: 'classic', label: '經典跳字', component: ClassicStage },
  { key: 'slot', label: '老虎機', component: SlotStage },
  { key: 'wheel', label: '幸運轉盤', component: WheelStage },
  { key: 'elimination', label: '淘汰制', component: EliminationStage },
  { key: 'flip', label: '翻牌', component: FlipStage },
  { key: 'countdown', label: '倒數揭曉', component: CountdownStage },
  { key: 'gacha', label: '扭蛋機', component: GachaStage },
]

export const DEFAULT_STAGE = 'classic'

export function stageOf(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0]
}

// CSV 匯入：接受 key 或中文名稱
export function parseStageKey(text) {
  const t = (text || '').trim().toLowerCase()
  const s = STAGES.find((x) => x.key === t || x.label === text?.trim())
  return s ? s.key : DEFAULT_STAGE
}
