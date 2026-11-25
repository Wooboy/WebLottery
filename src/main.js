import {
  createApp,
  reactive,
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  markRaw,
  nextTick,
} from 'vue'
import './style.css'
import { sample, shuffle } from './lib/random.js'
import { parseParticipants } from './lib/participants.js'
import { toImageUrl, cssImageUrl } from './lib/image-url.js'
import { sfx, setSoundEnabled } from './lib/sound.js'
import { BxIcon } from './lib/icons.js'
import { confetti, clearConfetti } from './lib/confetti.js'
import { STAGES, DEFAULT_STAGE, stageOf, normalizeStageKey } from './stages/index.js'

const STORAGE_KEY = 'lottery_app_v2026_data'

createApp({
  setup() {
    // 一般模式：settings（設定）/ results（中獎清單）；抽獎畫面只在「抽獎模式」（全螢幕）顯示
    const currentView = ref('settings')
    const isPresenting = ref(false)
    const toast = ref('')
    const isFullscreen = ref(false)
    const stageRef = ref(null)
    const stageEpoch = ref(0) // 清空全部紀錄 / 匯入設定時遞增，讓所有抽獎舞台重新初始化
    const prizeEpoch = reactive({}) // 單一獎項重抽時遞增，只重新初始化該獎項的舞台
    let toastTimer = null

    // 色系主題對照表
    // 色系主題：底色固定深色，主題色只作為點綴（光暈、邊框、轉盤、牌背…）；金色保留給中獎者
    const themeClasses = {
      red: { label: '紅', accent: '#e23d3d', accent2: '#7f1d1d', swatch: '#e23d3d' },
      black: { label: '黑', accent: '#a1a1aa', accent2: '#27272a', swatch: '#3f3f46' },
      blue: { label: '藍', accent: '#3b82f6', accent2: '#1e3a8a', swatch: '#3b82f6' },
      green: { label: '綠', accent: '#10b981', accent2: '#064e3b', swatch: '#10b981' },
      yellow: { label: '金', accent: '#f59e0b', accent2: '#78350f', swatch: '#f59e0b' },
    }
    const themeVars = computed(() => {
      const t = themeClasses[state.config.theme] || themeClasses.red
      return { '--accent': t.accent, '--accent-2': t.accent2 }
    })

    // 操作提示：「[空白鍵]」這類片段畫成按鍵樣式
    const hintParts = computed(() =>
      hint.value
        .split(/(\[[^\]]+\])/)
        .filter(Boolean)
        .map((t) =>
          /^\[.+\]$/.test(t) ? { key: true, text: t.slice(1, -1) } : { key: false, text: t },
        ),
    )

    // 淘汰制：每局淘汰輪數（含最後揭曉那一下）
    const ELIM_ROUND_OPTIONS = [1, 2, 3, 4, 5, 6]
    const DEFAULT_ELIM_ROUNDS = 3

    // 獎項唯一識別碼：中獎紀錄以 prizeId 對應獎項，獎項同名或改名都不會互相影響
    function genId() {
      if (crypto.randomUUID) return crypto.randomUUID()
      const b = crypto.getRandomValues(new Uint8Array(16))
      b[6] = (b[6] & 0x0f) | 0x40
      b[8] = (b[8] & 0x3f) | 0x80
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    }

    // 整理獎項清單：補齊欄位、確保每個獎項都有不重複的 id
    function normalizePrizes(list) {
      const seen = new Set()
      return (Array.isArray(list) ? list : []).map((raw) => {
        const p = newPrize({ ...raw, style: normalizeStageKey(raw?.style) })
        if (seen.has(p.id)) p.id = genId()
        seen.add(p.id)
        return p
      })
    }

    function newPrize(fields = {}) {
      const p = {
        id: '',
        name: '新獎項',
        reward: '',
        count: 1,
        mode: 'single',
        bgUrl: '',
        allowRepeat: false,
        style: DEFAULT_STAGE,
        elimRounds: DEFAULT_ELIM_ROUNDS,
        ...fields,
      }
      const r = parseInt(p.elimRounds)
      p.elimRounds = ELIM_ROUND_OPTIONS.includes(r) ? r : DEFAULT_ELIM_ROUNDS
      if (!p.id || typeof p.id !== 'string') p.id = genId()
      return p
    }

    // 預設資料結構
    const defaultState = {
      rawParticipants: '',
      prizes: [newPrize({ name: '壹等獎', reward: '神秘獎品' })],
      results: [],
      config: { theme: 'red', sound: true, effects: true, idLength: 4 },
      currentIndex: 0,
    }

    const state = reactive({ ...defaultState })

    setSoundEnabled(() => state.config.sound !== false)

    // --- 核心邏輯：資料初始化 ---
    onMounted(() => {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          Object.assign(state, parsed)
        } catch (e) {
          console.error('解析存檔失敗:', e)
        }
      }
      // 檢查存檔內容，缺少的欄位補上預設值
      state.config = { ...defaultState.config, ...state.config }
      state.prizes = normalizePrizes(state.prizes)
      if (!Array.isArray(state.results)) state.results = []
      // 存檔中的獎項位置若超出範圍（例如曾刪除獎項），回到第一個獎項
      if (!(state.currentIndex >= 0 && state.currentIndex < state.prizes.length)) {
        state.currentIndex = 0
      }
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('keyup', handleKeyup)
      document.addEventListener('fullscreenchange', onFullscreenChange)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('keyup', handleKeyup)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    })

    // 監聽狀態改變並儲存
    watch(
      state,
      (newVal) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal))
      },
      { deep: true },
    )

    // --- 計算屬性 ---
    // 參與人員：每行「ID,顯示名稱」，以 ID 為唯一識別（同名不同人不會互相影響）
    const parsedParticipants = computed(() => parseParticipants(state.rawParticipants))
    const participantsAll = computed(() => parsedParticipants.value.people)
    // 老虎機（員編轉輪）需要固定長度、只含英數字的員編；有獎項使用老虎機時才檢查
    const usesSlot = computed(() => state.prizes.some((p) => p.style === 'slot'))
    const idLength = computed(() => Math.min(5, Math.max(3, Number(state.config.idLength) || 4)))
    const slotIdErrors = computed(() => {
      if (!usesSlot.value) return []
      const L = idLength.value
      const re = new RegExp(`^[A-Za-z0-9]{${L}}$`)
      return parsedParticipants.value.people
        .filter((p) => !re.test(p.id))
        .map((p) => ({
          lineNo: p.lineNo,
          text: `${p.id},${p.name}`,
          reason: `老虎機需要 ${L} 碼英數字員編（目前為「${p.id}」）`,
        }))
    })
    const participantErrors = computed(() =>
      [...parsedParticipants.value.errors, ...slotIdErrors.value].sort(
        (a, b) => a.lineNo - b.lineNo,
      ),
    )

    // 已開始抽獎（有任何中獎紀錄）就鎖定名單，避免抽獎中途名單變動；
    // 「清空中獎名單」後才解除。名單格式有錯時不鎖定，讓舊資料可以修正。
    const isListLocked = computed(
      () => state.results.length > 0 && participantErrors.value.length === 0,
    )

    // 名單編輯框：行號、錯誤行標示、跳到指定行
    const listEl = ref(null)
    const listScrollTop = ref(0)
    const listLineCount = computed(() => Math.max(1, state.rawParticipants.split(/\r?\n/).length))
    const errorLineSet = computed(() => new Set(participantErrors.value.map((e) => e.lineNo)))
    function jumpToLine(lineNo) {
      const el = listEl.value
      if (!el) return
      const lines = state.rawParticipants.split(/\r?\n/)
      let start = 0
      for (let i = 0; i < lineNo - 1 && i < lines.length; i++) start += lines[i].length + 1
      const end = start + (lines[lineNo - 1] || '').length
      el.focus()
      el.setSelectionRange(start, end)
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22
      el.scrollTop = Math.max(0, (lineNo - 1) * lineHeight - el.clientHeight / 2)
      listScrollTop.value = el.scrollTop
    }

    function shuffleParticipants() {
      if (isListLocked.value) return
      const lines = state.rawParticipants.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) return
      state.rawParticipants = shuffle(lines).join('\n')
      notify(`已打亂 ${lines.length} 行名單順序`)
    }

    const activePrize = computed(() => state.prizes[state.currentIndex] || null)

    // 目前獎項的可抽名單：
    // - 同一獎項內一律不重複中獎
    // - 「不允許重複中獎」的獎項：另外排除中過其他「不允許重複」獎項的人
    // - 「允許重複中獎」的獎項：從全部名單抽（僅排除本獎項已中獎者）
    // - 中過「允許重複」獎項的人，不影響其他獎項的抽獎資格
    // （已刪除獎項的紀錄視為不允許重複，保守排除）
    const availablePool = computed(() => poolFor(activePrize.value))
    function poolFor(prize) {
      if (!prize) return []
      const repeatPrizeIds = new Set(state.prizes.filter((p) => p.allowRepeat).map((p) => p.id))
      const excluded = new Set(
        state.results
          .filter(
            (r) => r.prizeId === prize.id || (!prize.allowRepeat && !repeatPrizeIds.has(r.prizeId)),
          )
          .map((r) => r.winnerId.toUpperCase()),
      )
      return participantsAll.value.filter((p) => !excluded.has(p.id.toUpperCase()))
    }

    const currentWinners = computed(() => {
      if (!activePrize.value) return []
      return state.results.filter((r) => r.prizeId === activePrize.value.id)
    })
    const currentWinnerPeople = computed(() =>
      currentWinners.value.map((r) => ({ id: r.winnerId, name: r.winner })),
    )

    function remainingCount(prizeId) {
      const p = state.prizes.find((i) => i.id === prizeId)
      const won = state.results.filter((r) => r.prizeId === prizeId).length
      return p ? Math.max(0, p.count - won) : 0
    }

    // 中獎紀錄顯示的獎項名稱：以目前獎項名稱為準（獎項已刪除則用抽獎當時的名稱）
    function resultPrizeName(r) {
      return state.prizes.find((p) => p.id === r.prizeId)?.name ?? r.prizeName
    }

    // --- 抽獎舞台 ---
    const stageComponent = computed(() =>
      activePrize.value ? markRaw(stageOf(activePrize.value.style).component) : null,
    )
    // 每個獎項（＋動畫樣式）各自一個舞台，以 KeepAlive 保留畫面：
    // 切換獎項再切回來時，停在上次的抽獎結果（例如淘汰賽停在淘汰結果）。
    // 每個舞台有自己的抽獎引擎、操作提示與忙碌狀態，互不干擾。
    const stageKey = computed(() => {
      const p = activePrize.value
      return p ? `${p.id}-${p.style}-${stageEpoch.value}-${prizeEpoch[p.id] || 0}` : ''
    })
    const stageHints = reactive({})
    const stageBusy = reactive({})
    const stageCtxCache = new Map()
    const hint = computed(() => {
      const p = activePrize.value
      // 名額已抽滿：提示切換到下一個獎項（各動畫的提示只管抽獎操作）
      if (p && !stageBusy[stageKey.value] && remainingCount(p.id) <= 0) {
        return '本獎項已抽完｜按 [PageDown] 切換下一個獎項'
      }
      return stageHints[stageKey.value] || ''
    })
    const isBusy = computed(() => !!stageBusy[stageKey.value]) // 回合進行中（鎖定切換獎項）

    function notify(msg) {
      toast.value = msg
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => (toast.value = ''), 2500)
    }

    // 建立提供給抽獎舞台的抽獎引擎（正式抽獎與設定頁預覽共用）：
    // 中獎者一律由 decide() 以安全亂數從「當下可用名單」抽出，動畫只負責呈現；
    // 動畫結束後才以 commit() 交給 record() 記錄（中途切換獎項 / 頁面則不記錄）
    function makeDrawEngine({ prize, pool, remaining, record, onBusy, onHint }) {
      const engine = markRaw({
        sfx,
        remaining,
        poolSize: () => pool().length,
        // 本回合要抽的人數：一次抽完 = 剩餘名額；連續單抽 = 1
        roundSize() {
          const r = engine.remaining()
          const p = engine.poolSize()
          return prize()?.mode === 'all' ? Math.min(r, p) : Math.min(1, r, p)
        },
        canDraw() {
          if (engine.remaining() <= 0) {
            notify('此獎項名額已滿！')
            return false
          }
          if (engine.poolSize() === 0) {
            notify('可用人員名單已空！')
            return false
          }
          return true
        },
        decide: (n) => sample(pool(), n),
        commit(people, { big = false } = {}) {
          record(people)
          if (!people.length) return
          if (state.config.effects !== false) confetti({ big })
          big ? sfx.bigWin() : sfx.win()
          if (engine.remaining() > 0 && engine.poolSize() === 0) {
            notify('可用人員名單已空，無法再抽！')
          }
        },
        setBusy: onBusy,
        setHint: onHint,
      })
      return engine
    }

    let drawCounter = 0
    function stageCtxFor(key, prizeId) {
      if (stageCtxCache.has(key)) return stageCtxCache.get(key)
      const prize = () => state.prizes.find((p) => p.id === prizeId)
      const engine = makeDrawEngine({
        prize,
        pool: () => poolFor(prize()),
        remaining: () => remainingCount(prizeId),
        record(people) {
          const p = prize()
          if (!p) return
          const timestamp = Date.now()
          for (const person of people) {
            state.results.push({
              id: `${timestamp}-${drawCounter++}`,
              prizeId: p.id,
              prizeName: p.name,
              winnerId: person.id,
              winner: person.name,
              seed: timestamp,
            })
          }
        },
        onBusy: (b) => (stageBusy[key] = b),
        onHint: (t) => (stageHints[key] = t),
      })
      stageCtxCache.set(key, engine)
      return engine
    }
    const ctx = computed(() =>
      activePrize.value ? stageCtxFor(stageKey.value, activePrize.value.id) : null,
    )

    // --- 抽獎動畫預覽（設定頁）---
    // 以獎項的實際設定（動畫樣式、名額、抽獎模式）模擬抽獎，結果只存在預覽視窗，不寫入中獎紀錄。
    // 名單：使用已輸入的參與人員（忽略正式中獎紀錄）；尚未輸入或格式有誤時使用示範名單。
    // 示範人員的 ID 長度跟隨「員編長度」設定，老虎機也能預覽
    const DEMO_PEOPLE = computed(() =>
      Array.from({ length: 30 }, (_, i) => ({
        id: 'D' + String(i + 1).padStart(idLength.value - 1, '0'),
        name: `示範人員 ${String(i + 1).padStart(2, '0')}`,
      })),
    )
    const previewIndex = ref(-1)
    const previewWinners = ref([])
    const previewEpoch = ref(0)
    const previewBusy = ref(false)
    const previewHint = ref('')
    const previewStageRef = ref(null)

    const previewPrize = computed(() => state.prizes[previewIndex.value] || null)
    const previewUsesDemo = computed(
      () => participantsAll.value.length === 0 || participantErrors.value.length > 0,
    )
    const previewPool = computed(() => {
      const base = previewUsesDemo.value ? DEMO_PEOPLE.value : participantsAll.value
      const won = new Set(previewWinners.value.map((p) => p.id))
      return base.filter((p) => !won.has(p.id))
    })
    const previewStageComponent = computed(() =>
      previewPrize.value ? markRaw(stageOf(previewPrize.value.style).component) : null,
    )
    const previewKey = computed(
      () => `${previewIndex.value}-${previewPrize.value?.style}-${previewEpoch.value}`,
    )

    const previewCtx = makeDrawEngine({
      prize: () => previewPrize.value,
      pool: () => previewPool.value,
      remaining: () =>
        previewPrize.value
          ? Math.max(0, previewPrize.value.count - previewWinners.value.length)
          : 0,
      record(people) {
        previewWinners.value.push(...people)
      },
      onBusy: (b) => (previewBusy.value = b),
      onHint: (t) => (previewHint.value = t),
    })

    function resetPreview() {
      previewWinners.value = []
      previewBusy.value = false
      previewEpoch.value++
      clearConfetti()
    }
    function openPreview(i) {
      previewIndex.value = i
      resetPreview()
      if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur()
    }
    function closePreview() {
      previewIndex.value = -1
      resetPreview()
    }
    // 預覽中切換動畫樣式 / 抽獎模式 / 名額時，重新開始模擬
    watch(
      () => [previewPrize.value?.style, previewPrize.value?.mode, previewPrize.value?.count],
      () => {
        if (previewIndex.value >= 0) resetPreview()
      },
    )
    function previewPress() {
      previewStageRef.value?.press()
    }

    // --- 鍵盤操作 ---
    // 抽獎模式中：Esc 離開
    // 抽獎模式中：空白鍵 / Enter 抽獎；PageUp / PageDown 上一個 / 下一個獎項
    const ACTION_KEYS = ['Space', 'Enter', 'NumpadEnter']

    function isTyping(el) {
      const tag = el?.tagName
      return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || el?.isContentEditable
    }

    function handleKeydown(e) {
      if (isTyping(e.target)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      if (previewIndex.value >= 0) {
        if (e.code === 'Escape') {
          closePreview()
        } else if (ACTION_KEYS.includes(e.code)) {
          e.preventDefault()
          if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur()
          if (!e.repeat) previewPress()
        } else if (!e.repeat && previewStageRef.value?.key?.(e.code)) {
          e.preventDefault()
        }
        return
      }
      // 進入抽獎模式只能按右上角「開始抽獎」，避免輸入時誤觸
      if (!isPresenting.value) return
      if (e.code === 'Escape') {
        // 真正全螢幕時 Esc 由瀏覽器處理（觸發 fullscreenchange）；這裡處理無法全螢幕時的視窗模式
        exitPresentation()
        return
      }
      if (!activePrize.value) return

      if (ACTION_KEYS.includes(e.code)) {
        // 避免焦點停在按鈕上時，按鍵同時觸發按鈕點擊
        e.preventDefault()
        if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur()
        // 按住不放的自動重複不視為新的操作
        if (e.repeat) return
        stageRef.value?.press()
      } else if (e.code === 'PageUp') {
        e.preventDefault()
        if (!e.repeat) prevPrize()
      } else if (e.code === 'PageDown') {
        e.preventDefault()
        if (!e.repeat) nextPrize()
      } else if (!e.repeat && stageRef.value?.key?.(e.code)) {
        // 舞台自訂按鍵（例如選堆的數字鍵 1～9）
        e.preventDefault()
      }
    }

    function handleKeyup(e) {
      if (ACTION_KEYS.includes(e.code) && !isTyping(e.target)) e.preventDefault()
    }

    // --- 抽獎模式（全螢幕） ---
    function enterPresentation() {
      if (isPresenting.value) return
      if (previewIndex.value >= 0) closePreview()
      if (!state.prizes.length) return notify('請先新增獎項')
      if (participantErrors.value.length) {
        return notify(`參與人員名單有 ${participantErrors.value.length} 處格式錯誤，請先修正`)
      }
      if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur()
      isPresenting.value = true
      const req = document.documentElement.requestFullscreen?.()
      if (!req) {
        notify('此瀏覽器不支援全螢幕，以視窗模式抽獎（按 Esc 離開）')
        return
      }
      req.catch(() => notify('瀏覽器未允許全螢幕，以視窗模式抽獎（按 Esc 離開）'))
    }
    function exitPresentation() {
      isPresenting.value = false
      if (document.fullscreenElement) document.exitFullscreen?.()
    }
    function onFullscreenChange() {
      isFullscreen.value = !!document.fullscreenElement
      // 使用者以 Esc / F11 等方式離開全螢幕時，同步回到一般模式
      if (!isFullscreen.value && isPresenting.value) isPresenting.value = false
    }
    // 離開抽獎模式時舞台會卸載，未完成的回合不記錄，解除鎖定
    watch(isPresenting, () => {
      for (const k of Object.keys(stageBusy)) delete stageBusy[k]
      for (const k of Object.keys(stageHints)) delete stageHints[k]
      stageCtxCache.clear()
      toast.value = ''
      clearConfetti()
    })

    // --- 選單功能 ---
    function changeTab(id) {
      currentView.value = id
    }

    function prevPrize() {
      if (isBusy.value || !state.prizes.length) return
      state.currentIndex = (state.currentIndex - 1 + state.prizes.length) % state.prizes.length
    }

    function nextPrize() {
      if (isBusy.value || !state.prizes.length) return
      state.currentIndex = (state.currentIndex + 1) % state.prizes.length
    }

    // --- 設定檔匯出 / 匯入：在個人電腦設定好，再帶到會場電腦 ---
    // 只包含參與名單、獎項與系統設定，不含中獎紀錄
    const SETTINGS_FILE_TYPE = 'web-lottery-settings'

    function download(content, filename, type) {
      const a = document.createElement('a')
      const url = URL.createObjectURL(new Blob([content], { type }))
      a.href = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function exportSettings() {
      const pad = (n) => String(n).padStart(2, '0')
      const d = new Date()
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
      const data = {
        type: SETTINGS_FILE_TYPE,
        version: 1,
        exportedAt: d.toISOString(),
        rawParticipants: state.rawParticipants,
        prizes: state.prizes,
        config: state.config,
      }
      download(JSON.stringify(data, null, 2), `抽獎設定_${stamp}.json`, 'application/json')
    }

    function importSettings(e) {
      const file = e.target.files[0]
      e.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        let data
        try {
          data = JSON.parse(String(ev.target.result).replace(/^﻿/, ''))
        } catch {
          return alert('匯入失敗：檔案不是有效的設定檔（JSON 格式錯誤）')
        }
        if (data?.type !== SETTINGS_FILE_TYPE || !Array.isArray(data.prizes)) {
          return alert('匯入失敗：這不是本抽獎系統匯出的設定檔')
        }
        const people = parseParticipants(String(data.rawParticipants || '')).people.length
        const msg = [
          `即將匯入設定檔「${file.name}」：`,
          `・參與人員 ${people} 人`,
          `・獎項 ${data.prizes.length} 個`,
          '',
          '目前的名單、獎項與系統設定將被覆蓋。',
        ]
        if (state.results.length) {
          msg.push(`⚠️ 目前有 ${state.results.length} 筆中獎紀錄，匯入後將一併清空！`)
        }
        if (!confirm(msg.join('\n'))) return
        state.rawParticipants = String(data.rawParticipants || '')
        state.prizes = normalizePrizes(
          data.prizes.map((p) => ({ ...p, count: parseInt(p?.count) || 1 })),
        )
        state.config = { ...defaultState.config, ...(data.config || {}) }
        state.results = []
        state.currentIndex = 0
        stageEpoch.value++
        alert('匯入設定成功！')
      }
      reader.readAsText(file)
    }

    function confirmRedraw() {
      if (confirm('警告：這將清除此獎項目前的「所有」中獎紀錄並讓名額回流，確定嗎？')) {
        const id = activePrize.value.id
        state.results = state.results.filter((r) => r.prizeId !== id)
        prizeEpoch[id] = (prizeEpoch[id] || 0) + 1
      }
    }

    function clearResults() {
      if (state.results.length === 0) return alert('目前尚無中獎紀錄')
      if (
        confirm(
          `確定要清空全部 ${state.results.length} 筆中獎紀錄嗎？\n名單、獎項與設定會保留，所有人員回到可抽狀態。此動作無法復原！`,
        )
      ) {
        state.results = []
        stageEpoch.value++
      }
    }

    function resetSystem() {
      if (
        confirm('🚨 確定要全部重設嗎？\n將刪除參與名單、獎項設定、中獎紀錄與色系，此動作無法復原！')
      ) {
        // 只刪除本系統的存檔，避免清掉同源（例如所有本機 file:// 頁面）其他程式的資料
        localStorage.removeItem(STORAGE_KEY)
        location.reload()
      }
    }

    // 背景圖載入狀態（以轉換後的網址為 key）：'ok' | 'error'
    const bgStatus = reactive({})
    function onBgLoad(url, ok) {
      bgStatus[url] = ok ? 'ok' : 'error'
    }

    function removePrize(i) {
      const p = state.prizes[i]
      if (!p) return
      const won = state.results.filter((r) => r.prizeId === p.id).length
      const msg = [`確定要刪除獎項「${p.name || '(未命名)'}」嗎？`]
      if (won) msg.push(`⚠️ 此獎項已有 ${won} 筆中獎紀錄，紀錄會保留在中獎清單中。`)
      if (!confirm(msg.join('\n'))) return
      state.prizes.splice(i, 1)
      if (state.currentIndex >= state.prizes.length) state.currentIndex = 0
    }

    function addPrize() {
      state.prizes.push(newPrize())
      // 新增後直接選取新獎項的名稱，方便馬上輸入
      nextTick(() => {
        const inputs = document.querySelectorAll('.prize-name')
        const el = inputs[inputs.length - 1]
        el?.focus()
        el?.select()
      })
    }

    function exportCSV() {
      if (state.results.length === 0) return alert('目前尚無紀錄可匯出')
      // 欄位內含逗號、引號或換行時加上引號；開頭為 = + - @ 時加上 ' 避免被 Excel 當成公式
      const cell = (v) => {
        let t = String(v ?? '')
        if (/^[=+\-@]/.test(t)) t = "'" + t
        return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
      }
      let content = '\ufeff獎項名稱,獎品內容,ID,中獎人員,抽出時間戳(Timestamp)\n'
      state.results.forEach((r) => {
        const prize = state.prizes.find((p) => p.id === r.prizeId)
        content +=
          [prize?.name ?? r.prizeName, prize?.reward || '', r.winnerId, r.winner, r.seed]
            .map(cell)
            .join(',') + '\n'
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
      a.download = `中獎清單_${new Date().getTime()}.csv`
      a.click()
    }

    return {
      currentView,
      tabs: [
        { id: 'settings', name: '設定', icon: 'bx-cog' },
        { id: 'results', name: '中獎清單', icon: 'bx-trophy' },
      ],
      themeClasses,
      themeVars,
      hintParts,
      stages: STAGES,
      elimRoundOptions: ELIM_ROUND_OPTIONS,
      stageOf,
      state,
      isBusy,
      isFullscreen,
      hint,
      toast,
      participantsAll,
      participantErrors,
      listEl,
      listScrollTop,
      listLineCount,
      errorLineSet,
      jumpToLine,
      usesSlot,
      isListLocked,
      shuffleParticipants,
      availablePool,
      activePrize,
      currentWinners,
      currentWinnerPeople,
      remainingCount,
      resultPrizeName,
      stageComponent,
      stageKey,
      stageRef,
      ctx,
      exportSettings,
      importSettings,
      toImageUrl,
      cssImageUrl,
      bgStatus,
      onBgLoad,
      confirmRedraw,
      changeTab,
      prevPrize,
      nextPrize,
      isPresenting,
      previewIndex,
      previewPrize,
      previewWinners,
      previewBusy,
      previewHint,
      previewUsesDemo,
      previewPool,
      previewStageComponent,
      previewKey,
      previewStageRef,
      previewCtx,
      openPreview,
      closePreview,
      resetPreview,
      previewPress,
      enterPresentation,
      exitPresentation,
      resetSystem,
      clearResults,
      addPrize,
      removePrize,
      exportCSV,
    }
  },
})
  .component('BxIcon', BxIcon)
  .mount('#app')
