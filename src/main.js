import { createApp, reactive, ref, computed, onMounted, onBeforeUnmount, watch, markRaw } from 'vue'
import './style.css'
import { sample, shuffle } from './lib/random.js'
import { parseParticipants } from './lib/participants.js'
import { toImageUrl, cssImageUrl } from './lib/image-url.js'
import { sfx, setSoundEnabled } from './lib/sound.js'
import { confetti, clearConfetti } from './lib/confetti.js'
import { STAGES, DEFAULT_STAGE, stageOf, normalizeStageKey } from './stages/index.js'

const STORAGE_KEY = 'lottery_app_v2026_data'

createApp({
  setup() {
    // 一般模式：settings（設定）/ results（中獎清單）；抽獎畫面只在「抽獎模式」（全螢幕）顯示
    const currentView = ref('settings')
    const isPresenting = ref(false)
    const isBusy = ref(false) // 抽獎動畫 / 回合進行中（鎖定切換獎項）
    const hint = ref('')
    const toast = ref('')
    const isFullscreen = ref(false)
    const stageRef = ref(null)
    const stageEpoch = ref(0) // 清除紀錄時遞增，讓抽獎舞台重新初始化
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

    function newPrize(fields = {}) {
      const p = {
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
      // 舊版存檔補上新欄位的預設值
      state.config = { ...defaultState.config, ...state.config }
      state.prizes = (Array.isArray(state.prizes) ? state.prizes : []).map((p) =>
        newPrize({ ...p, style: normalizeStageKey(p.style) }),
      )
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
    // （找不到對應獎項的舊紀錄，視為不允許重複，保守排除）
    const availablePool = computed(() => {
      const prize = activePrize.value
      if (!prize) return []
      const repeatPrizeNames = new Set(state.prizes.filter((p) => p.allowRepeat).map((p) => p.name))
      const excluded = new Set(
        state.results
          .filter(
            (r) =>
              r.prizeName === prize.name ||
              (!prize.allowRepeat && !repeatPrizeNames.has(r.prizeName)),
          )
          // 舊版紀錄沒有 winnerId，以名稱比對
          .map((r) => (r.winnerId ?? r.winner).toUpperCase()),
      )
      return participantsAll.value.filter((p) => !excluded.has(p.id.toUpperCase()))
    })

    const currentWinners = computed(() => {
      if (!activePrize.value) return []
      return state.results.filter((r) => r.prizeName === activePrize.value.name)
    })
    const currentWinnerPeople = computed(() =>
      currentWinners.value.map((r) => ({ id: r.winnerId ?? '', name: r.winner })),
    )

    function remainingCount(prizeName) {
      const p = state.prizes.find((i) => i.name === prizeName)
      const won = state.results.filter((r) => r.prizeName === prizeName).length
      return p ? Math.max(0, p.count - won) : 0
    }

    // --- 抽獎舞台 ---
    const stageComponent = computed(() =>
      activePrize.value ? markRaw(stageOf(activePrize.value.style).component) : null,
    )
    const stageKey = computed(
      () => `${state.currentIndex}-${activePrize.value?.style}-${stageEpoch.value}`,
    )
    // 舞台重新建立（切換獎項 / 樣式 / 清除紀錄）時解除鎖定
    watch(stageKey, () => {
      isBusy.value = false
    })

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
    const ctx = makeDrawEngine({
      prize: () => activePrize.value,
      pool: () => availablePool.value,
      remaining: () => (activePrize.value ? remainingCount(activePrize.value.name) : 0),
      record(people) {
        const timestamp = Date.now()
        for (const person of people) {
          state.results.push({
            id: `${timestamp}-${drawCounter++}`,
            prizeName: activePrize.value.name,
            winnerId: person.id,
            winner: person.name,
            seed: timestamp,
          })
        }
      },
      onBusy: (b) => (isBusy.value = b),
      onHint: (t) => (hint.value = t),
    })

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
      isBusy.value = false
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
        state.prizes = data.prizes.map((p) =>
          newPrize({ ...p, count: parseInt(p?.count) || 1, style: normalizeStageKey(p?.style) }),
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
        state.results = state.results.filter((r) => r.prizeName !== activePrize.value.name)
        stageEpoch.value++
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
      const won = state.results.filter((r) => r.prizeName === p.name).length
      const msg = [`確定要刪除獎項「${p.name || '(未命名)'}」嗎？`]
      if (won) msg.push(`⚠️ 此獎項已有 ${won} 筆中獎紀錄，紀錄會保留在中獎清單中。`)
      if (!confirm(msg.join('\n'))) return
      state.prizes.splice(i, 1)
      if (state.currentIndex >= state.prizes.length) state.currentIndex = 0
    }

    function addPrize() {
      state.prizes.push(newPrize())
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
        const prize = state.prizes.find((p) => p.name === r.prizeName)
        content +=
          [r.prizeName, prize?.reward || '', r.winnerId ?? '', r.winner, r.seed]
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
        { id: 'settings', name: '⚙️ 設定' },
        { id: 'results', name: '🏆 中獎清單' },
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
}).mount('#app')
