import { createApp, reactive, ref, computed, onMounted, watch } from 'vue'
import './style.css'

const STORAGE_KEY = 'lottery_app_v2026_data'

createApp({
  setup() {
    const currentView = ref('lottery')
    const isNavExpanded = ref(false)
    const isSpinning = ref(false)
    const spinningName = ref('')
    let spinTimer = null

    // 色系主題對照表
    const themeClasses = {
      red: { grad: 'from-red-950 via-red-900 to-red-800', btn: 'bg-red-600' },
      black: { grad: 'from-zinc-950 via-zinc-900 to-black', btn: 'bg-zinc-800' },
      blue: { grad: 'from-blue-950 via-blue-900 to-blue-800', btn: 'bg-blue-600' },
      green: { grad: 'from-emerald-950 via-emerald-900 to-emerald-800', btn: 'bg-emerald-600' },
      yellow: { grad: 'from-amber-950 via-amber-900 to-amber-700', btn: 'bg-amber-500' },
    }

    // 預設資料結構
    const defaultState = {
      rawParticipants: '',
      prizes: [
        { name: '壹等獎', reward: '神秘獎品', count: 1, mode: 'single', bgUrl: '', allowRepeat: false },
      ],
      results: [],
      config: { theme: 'red' },
      currentIndex: 0,
    }

    const state = reactive({ ...defaultState })

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
      // 存檔中的獎項位置若超出範圍（例如曾刪除獎項），回到第一個獎項
      if (!(state.currentIndex >= 0 && state.currentIndex < state.prizes.length)) {
        state.currentIndex = 0
      }
      // 重新進入時，中央大字顯示目前獎項的最後一位中獎者
      resetPrizeView()
      // 監聽鍵盤空白鍵
      window.addEventListener('keydown', handleKeydown)
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
    const participantsAll = computed(() =>
      state.rawParticipants
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
    )

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
      const repeatPrizeNames = new Set(
        state.prizes.filter((p) => p.allowRepeat).map((p) => p.name),
      )
      const excluded = new Set(
        state.results
          .filter(
            (r) =>
              r.prizeName === prize.name ||
              (!prize.allowRepeat && !repeatPrizeNames.has(r.prizeName)),
          )
          .map((r) => r.winner),
      )
      return participantsAll.value.filter((p) => !excluded.has(p))
    })

    const currentWinners = computed(() => {
      if (!activePrize.value) return []
      return state.results.filter((r) => r.prizeName === activePrize.value.name)
    })

    function remainingCount(prizeName) {
      const p = state.prizes.find((i) => i.name === prizeName)
      const won = state.results.filter((r) => r.prizeName === prizeName).length
      return p ? Math.max(0, p.count - won) : 0
    }

    // --- 亂數工具 ---
    // 使用 crypto.getRandomValues 產生 [0, n) 的均勻整數（拒絕取樣避免模數偏差）
    function secureRandomInt(n) {
      if (n <= 0) throw new Error('secureRandomInt: n must be > 0')
      const limit = Math.floor(0x100000000 / n) * n
      const buf = new Uint32Array(1)
      do {
        crypto.getRandomValues(buf)
      } while (buf[0] >= limit)
      return buf[0] % n
    }

    let drawCounter = 0
    function recordWinner(winner, timestamp) {
      state.results.push({
        id: `${timestamp}-${drawCounter++}`,
        prizeName: activePrize.value.name,
        winner,
        seed: timestamp,
      })
    }

    // --- 抽獎動作 ---
    function handleKeydown(e) {
      // 禁止在輸入框按空白鍵時觸發抽獎
      const tag = e.target.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || e.target.isContentEditable)
        return

      if (e.code === 'Space' && currentView.value === 'lottery' && activePrize.value) {
        e.preventDefault()
        // 按住空白鍵的自動重複不視為新的操作
        if (e.repeat) return
        if (isSpinning.value) {
          performDraw()
        } else {
          startSpinning()
        }
      }
    }

    function stopSpinning() {
      clearInterval(spinTimer)
      spinTimer = null
      isSpinning.value = false
    }

    function startSpinning() {
      if (remainingCount(activePrize.value.name) <= 0) return alert('此獎項名額已滿！')
      if (availablePool.value.length === 0) return alert('可用人員名單已空！')

      isSpinning.value = true
      spinTimer = setInterval(() => {
        const pool = availablePool.value
        // 跳動畫面僅供視覺效果，實際中獎者於按鍵當下另行抽出
        spinningName.value = pool.length ? pool[secureRandomInt(pool.length)] : ''
      }, 60)
    }

    function performDraw() {
      const timestamp = Date.now()
      const pool = [...availablePool.value]
      const remaining = remainingCount(activePrize.value.name)

      if (pool.length === 0 || remaining <= 0) {
        stopSpinning()
        if (pool.length === 0) alert('可用人員名單已空！')
        return
      }

      if (activePrize.value.mode === 'all') {
        // 一次抽完：從剩餘名單中不重複地均勻抽出（部分 Fisher–Yates）
        const toDraw = Math.min(remaining, pool.length)
        let last = ''
        for (let i = 0; i < toDraw; i++) {
          const idx = secureRandomInt(pool.length)
          last = pool.splice(idx, 1)[0]
          recordWinner(last, timestamp)
        }
        spinningName.value = last
        stopSpinning()
        if (toDraw < remaining) alert(`可用人員不足，僅抽出 ${toDraw} 位`)
      } else {
        // 連續單抽：於按鍵當下從「最新」可用名單抽出一位，不依賴畫面上正在跳動的名字
        const winner = pool[secureRandomInt(pool.length)]
        recordWinner(winner, timestamp)
        spinningName.value = winner

        // 名額抽滿或名單用盡才停止；否則動畫持續
        if (remaining - 1 <= 0 || pool.length - 1 <= 0) {
          stopSpinning()
          if (remaining - 1 > 0) alert('可用人員名單已空，無法再抽！')
        }
      }
    }

    // --- 選單功能 ---
    function changeTab(id) {
      currentView.value = id
      isNavExpanded.value = false
    }

    function prevPrize() {
      if (isSpinning.value) return
      state.currentIndex = (state.currentIndex - 1 + state.prizes.length) % state.prizes.length
      resetPrizeView()
    }

    function nextPrize() {
      if (isSpinning.value) return
      state.currentIndex = (state.currentIndex + 1) % state.prizes.length
      resetPrizeView()
    }

    function resetPrizeView() {
      spinningName.value =
        currentWinners.value.length > 0
          ? currentWinners.value[currentWinners.value.length - 1].winner
          : ''
    }

    function importPrizeCSV(e) {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = (ev) => {
        const lines = ev.target.result.split(/\r?\n/).filter((l) => l.trim())
        if (lines.length > 1) {
          state.prizes = lines.slice(1).map((l) => {
            const [name, reward, count, bgUrl, repeat] = l.split(',').map((s) => s.trim())
            return {
              name,
              reward,
              count: parseInt(count) || 1,
              mode: 'single',
              bgUrl: bgUrl || '',
              // 第 5 欄「允許重複中獎」：Y / 1 / 是 / true 視為允許
              allowRepeat: /^(y|yes|1|true|是)$/i.test(repeat || ''),
            }
          })
          state.currentIndex = 0
          alert('匯入獎項成功！')
        }
      }
      reader.readAsText(file)
    }

    function confirmRedraw() {
      if (confirm('警告：這將清除此獎項目前的「所有」中獎紀錄並讓名額回流，確定嗎？')) {
        state.results = state.results.filter((r) => r.prizeName !== activePrize.value.name)
        spinningName.value = ''
      }
    }

    function clearResults() {
      if (state.results.length === 0) return alert('目前尚無中獎紀錄')
      if (
        confirm(
          `確定要清空全部 ${state.results.length} 筆中獎紀錄嗎？\n名單、獎項與設定會保留，所有人員回到可抽狀態。此動作無法復原！`,
        )
      ) {
        if (isSpinning.value) stopSpinning()
        state.results = []
        spinningName.value = ''
      }
    }

    function resetSystem() {
      if (confirm('🚨 確定要全部重設嗎？\n將刪除參與名單、獎項設定、中獎紀錄與色系，此動作無法復原！')) {
        // 只刪除本系統的存檔，避免清掉同源（例如所有本機 file:// 頁面）其他程式的資料
        localStorage.removeItem(STORAGE_KEY)
        location.reload()
      }
    }

    function addPrize() {
      state.prizes.push({
        name: '新獎項',
        reward: '',
        count: 1,
        mode: 'single',
        bgUrl: '',
        allowRepeat: false,
      })
    }

    function exportCSV() {
      if (state.results.length === 0) return alert('目前尚無紀錄可匯出')
      let content = '\ufeff獎項名稱,獎品內容,中獎人員,亂數種子(Timestamp)\n'
      state.results.forEach((r) => {
        const prize = state.prizes.find((p) => p.name === r.prizeName)
        content += `${r.prizeName},${prize?.reward || ''},${r.winner},${r.seed}\n`
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
      a.download = `中獎清單_${new Date().getTime()}.csv`
      a.click()
    }

    return {
      currentView,
      tabs: [
        { id: 'settings', name: 'Setting 設定' },
        { id: 'lottery', name: 'Lottery 抽獎' },
        { id: 'results', name: 'Results 結果' },
      ],
      themeClasses,
      state,
      isNavExpanded,
      participantsAll,
      availablePool,
      activePrize,
      isSpinning,
      spinningName,
      currentWinners,
      remainingCount,
      importPrizeCSV,
      confirmRedraw,
      changeTab,
      prevPrize,
      nextPrize,
      resetSystem,
      clearResults,
      addPrize,
      exportCSV,
    }
  },
}).mount('#app')
