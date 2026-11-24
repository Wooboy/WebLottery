import { createApp, reactive, ref, computed, onMounted, onBeforeUnmount, watch, markRaw } from 'vue'
import './style.css'
import { sample, shuffle } from './lib/random.js'
import { parseParticipants } from './lib/participants.js'
import { sfx, setSoundEnabled } from './lib/sound.js'
import { confetti, clearConfetti } from './lib/confetti.js'
import { STAGES, DEFAULT_STAGE, stageOf, parseStageKey } from './stages/index.js'

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
    const themeClasses = {
      red: { grad: 'from-red-950 via-red-900 to-red-800', btn: 'bg-red-600' },
      black: { grad: 'from-zinc-950 via-zinc-900 to-black', btn: 'bg-zinc-800' },
      blue: { grad: 'from-blue-950 via-blue-900 to-blue-800', btn: 'bg-blue-600' },
      green: { grad: 'from-emerald-950 via-emerald-900 to-emerald-800', btn: 'bg-emerald-600' },
      yellow: { grad: 'from-amber-950 via-amber-900 to-amber-700', btn: 'bg-amber-500' },
    }

    function newPrize(fields = {}) {
      return {
        name: '新獎項',
        reward: '',
        count: 1,
        mode: 'single',
        bgUrl: '',
        allowRepeat: false,
        style: DEFAULT_STAGE,
        ...fields,
      }
    }

    // 預設資料結構
    const defaultState = {
      rawParticipants: '',
      prizes: [newPrize({ name: '壹等獎', reward: '神秘獎品' })],
      results: [],
      config: { theme: 'red', sound: true, effects: true },
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
      state.prizes = (Array.isArray(state.prizes) ? state.prizes : []).map((p) => newPrize(p))
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
    const participantErrors = computed(() => parsedParticipants.value.errors)

    // 已開始抽獎（有任何中獎紀錄）就鎖定名單，避免抽獎中途名單變動；
    // 「清空中獎名單」後才解除。名單格式有錯時不鎖定，讓舊資料可以修正。
    const isListLocked = computed(
      () => state.results.length > 0 && participantErrors.value.length === 0,
    )

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

    let drawCounter = 0
    // 提供給各抽獎舞台的抽獎引擎：
    // 中獎者一律由 decide() 以安全亂數從「當下可用名單」抽出，動畫只負責呈現；
    // 動畫結束後才以 commit() 寫入紀錄（中途切換獎項 / 頁面則不記錄）
    const ctx = markRaw({
      sfx,
      remaining: () => (activePrize.value ? remainingCount(activePrize.value.name) : 0),
      poolSize: () => availablePool.value.length,
      // 本回合要抽的人數：一次抽完 = 剩餘名額；連續單抽 = 1
      roundSize() {
        const r = ctx.remaining()
        const p = ctx.poolSize()
        return activePrize.value?.mode === 'all' ? Math.min(r, p) : Math.min(1, r, p)
      },
      canDraw() {
        if (ctx.remaining() <= 0) {
          notify('此獎項名額已滿！')
          return false
        }
        if (ctx.poolSize() === 0) {
          notify('可用人員名單已空！')
          return false
        }
        return true
      },
      decide: (n) => sample(availablePool.value, n),
      commit(people, { big = false } = {}) {
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
        if (!people.length) return
        if (state.config.effects !== false) confetti({ big })
        big ? sfx.bigWin() : sfx.win()
        if (ctx.remaining() > 0 && ctx.poolSize() === 0) notify('可用人員名單已空，無法再抽！')
      },
      setBusy(b) {
        isBusy.value = b
      },
      setHint(text) {
        hint.value = text
      },
    })

    // --- 鍵盤操作 ---
    // F：進入 / 離開抽獎模式（全螢幕）；Esc：離開抽獎模式
    // 抽獎模式中：空白鍵 / Enter 抽獎；PageUp / PageDown 上一個 / 下一個獎項
    const ACTION_KEYS = ['Space', 'Enter', 'NumpadEnter']

    function isTyping(el) {
      const tag = el?.tagName
      return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || el?.isContentEditable
    }

    function handleKeydown(e) {
      if (isTyping(e.target)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      if (e.code === 'KeyF') {
        e.preventDefault()
        if (!e.repeat) togglePresentation()
        return
      }
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
      }
    }

    function handleKeyup(e) {
      if (ACTION_KEYS.includes(e.code) && !isTyping(e.target)) e.preventDefault()
    }

    // --- 抽獎模式（全螢幕） ---
    function enterPresentation() {
      if (isPresenting.value) return
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
    function togglePresentation() {
      isPresenting.value ? exitPresentation() : enterPresentation()
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

    function importPrizeCSV(e) {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const lines = ev.target.result.split(/\r?\n/).filter((l) => l.trim())
        if (lines.length > 1) {
          state.prizes = lines.slice(1).map((l) => {
            const [name, reward, count, bgUrl, repeat, style] = l.split(',').map((s) => s.trim())
            return newPrize({
              name,
              reward,
              count: parseInt(count) || 1,
              bgUrl: bgUrl || '',
              // 第 5 欄「允許重複中獎」：Y / 1 / 是 / true 視為允許
              allowRepeat: /^(y|yes|1|true|是)$/i.test(repeat || ''),
              // 第 6 欄「動畫樣式」：英文 key 或中文名稱
              style: parseStageKey(style),
            })
          })
          state.currentIndex = 0
          alert('匯入獎項成功！')
        }
        e.target.value = ''
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
      stages: STAGES,
      stageOf,
      state,
      isBusy,
      isFullscreen,
      hint,
      toast,
      participantsAll,
      participantErrors,
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
      importPrizeCSV,
      confirmRedraw,
      changeTab,
      prevPrize,
      nextPrize,
      isPresenting,
      enterPresentation,
      exitPresentation,
      resetSystem,
      clearResults,
      addPrize,
      exportCSV,
    }
  },
}).mount('#app')
