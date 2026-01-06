const { createApp, reactive, ref, computed, onMounted, watch } = Vue

const app = createApp({
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
      prizes: [{ name: '壹等獎', reward: '神秘獎品', count: 1, mode: 'single', bgUrl: '' }],
      results: [],
      config: { theme: 'red' },
      currentIndex: 0,
    }

    const state = reactive({ ...defaultState })

    // --- 核心邏輯：資料初始化 ---
    onMounted(() => {
      const saved = localStorage.getItem('lottery_app_v2026_data')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          Object.assign(state, parsed)
        } catch (e) {
          console.error('解析存檔失敗:', e)
        }
      }
      // 監聽鍵盤空白鍵
      window.addEventListener('keydown', handleKeydown)
    })

    // 監聽狀態改變並儲存
    watch(
      state,
      (newVal) => {
        localStorage.setItem('lottery_app_v2026_data', JSON.stringify(newVal))
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

    const availablePool = computed(() => {
      const winners = state.results.map((r) => r.winner)
      return participantsAll.value.filter((p) => !winners.includes(p))
    })

    const activePrize = computed(() => state.prizes[state.currentIndex] || null)

    const currentWinners = computed(() => {
      if (!activePrize.value) return []
      return state.results.filter((r) => r.prizeName === activePrize.value.name)
    })

    function remainingCount(prizeName) {
      const p = state.prizes.find((i) => i.name === prizeName)
      const won = state.results.filter((r) => r.prizeName === prizeName).length
      return p ? Math.max(0, p.count - won) : 0
    }

    // --- 抽獎動作 ---
    function handleKeydown(e) {
      // 禁止在輸入框按空白鍵時觸發抽獎
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return

      if (e.code === 'Space' && currentView.value === 'lottery' && activePrize.value) {
        e.preventDefault()
        if (isSpinning.value) {
          // 若是連續單抽模式且還有下位，則「記錄但不停止」
          const isSingleMode = activePrize.value.mode === 'single'
          const hasMoreThanOne = remainingCount(activePrize.value.name) > 1

          if (isSingleMode && hasMoreThanOne) {
            performDrawRecord(false) // 記錄一人，動畫繼續
          } else {
            performDrawRecord(true) // 最後一位或一次抽完模式，停止
          }
        } else {
          startSpinning()
        }
      }
    }

    function startSpinning() {
      if (remainingCount(activePrize.value.name) <= 0) return alert('此獎項名額已滿！')
      if (availablePool.value.length === 0) return alert('可用人員名單已空！')

      isSpinning.value = true
      spinTimer = setInterval(() => {
        const pool = availablePool.value
        spinningName.value = pool[Math.floor(Math.random() * pool.length)]
      }, 60)
    }

    function performDrawRecord(stopAnimation) {
      const timestamp = Date.now()
      const pool = [...availablePool.value]

      if (activePrize.value.mode === 'all') {
        // 一次性抽完所有名額
        const toDraw = Math.min(remainingCount(activePrize.value.name), pool.length)
        for (let i = 0; i < toDraw; i++) {
          const idx = (timestamp + i) % pool.length
          const winner = pool.splice(idx, 1)[0]
          state.results.push({ prizeName: activePrize.value.name, winner, seed: timestamp + i })
        }
        // 最後一位名字留在畫面上
        if (state.results.length > 0) {
          spinningName.value = state.results[state.results.length - 1].winner
        }
        clearInterval(spinTimer)
        isSpinning.value = false
      } else {
        // 單抽模式
        const winner = spinningName.value
        state.results.push({
          prizeName: activePrize.value.name,
          winner: winner,
          seed: timestamp,
        })

        if (stopAnimation) {
          clearInterval(spinTimer)
          isSpinning.value = false
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
            const [name, reward, count, bgUrl] = l.split(',').map((s) => s.trim())
            return { name, reward, count: parseInt(count) || 1, mode: 'single', bgUrl: bgUrl || '' }
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

    function resetSystem() {
      if (confirm('🚨 確定要刪除所有資料（名單、紀錄、設定）嗎？這將無法復原！')) {
        localStorage.clear()
        location.reload()
      }
    }

    function addPrize() {
      state.prizes.push({ name: '新獎項', reward: '', count: 1, mode: 'single', bgUrl: '' })
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
      addPrize,
      exportCSV,
    }
  },
}).mount('#app')
