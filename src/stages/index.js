import ClassicStage from './ClassicStage.vue'
import SlotStage from './SlotStage.vue'
import WheelStage from './WheelStage.vue'
import PileStage from './PileStage.vue'
import FlipStage from './FlipStage.vue'
import CountdownStage from './CountdownStage.vue'
import GachaStage from './GachaStage.vue'
import EliminationStage from './EliminationStage.vue'

// 抽獎動畫樣式（key 存於獎項設定 prize.style）
export const STAGES = [
  { key: 'classic', label: '經典跳字', component: ClassicStage },
  { key: 'slot', label: '老虎機', component: SlotStage },
  { key: 'wheel', label: '幸運轉盤', component: WheelStage },
  { key: 'pile', label: '選堆', component: PileStage },
  { key: 'elimination', label: '淘汰制', component: EliminationStage },
  { key: 'flip', label: '翻牌', component: FlipStage },
  { key: 'countdown', label: '倒數揭曉', component: CountdownStage },
  { key: 'gacha', label: '扭蛋機', component: GachaStage },
]

export const DEFAULT_STAGE = 'classic'

// 不認得的樣式（例如手動修改過的設定檔）回到預設樣式
export function normalizeStageKey(key) {
  return STAGES.some((s) => s.key === key) ? key : DEFAULT_STAGE
}

export function stageOf(key) {
  return STAGES.find((s) => s.key === normalizeStageKey(key)) || STAGES[0]
}
