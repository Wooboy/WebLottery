const { createApp, reactive, ref, computed, onMounted, watch } = Vue

const app = createApp({
  setup() {
    const currentView = ref('lottery')
    const isNavExpanded = ref(false)
    const isSpinning = ref(false)
    const spinningName = ref('')
    let spinTimer = null

    // 色系配置
    const themeClasses = {
      red: { grad: 'from-red-950 via-red-800 to-red-700', btn: 'bg-red-600' },
      black: { grad: 'from-black via-zinc-950 to-zinc-900', btn: 'bg-zinc-800' },
      blue: { grad: 'from-blue-950 via-blue-800 to-blue-700', btn: 'bg-blue-600' },
      green: { grad: 'from-emerald-950 via-emerald-800 to-emerald-700', btn: 'bg-emerald-600' },
      yellow: { grad: 'from-amber-950 via-amber-700 to-amber-600', btn: 'bg-amber-500' },
    }

    // 核心狀態
    const state = reactive({
      rawParticipants: '',
      prizes: [{ name: '壹等獎', reward: '神秘大禮', count: 1, mode: 'single', bgUrl: '' }],
      results: [],
      config: { theme: 'red' },
      currentIndex: 0,
    })

    // 1. 初始化與儲存邏輯
    onMounted(() => {
      const saved = localStorage.getItem('lottery_v2_final_storage')
      if (saved) {
        try {
          Object.assign(state, JSON.parse(saved))
        } catch (e) {
          console.error('Data error', e)
        }
      }
      window.addEventListener('keydown', handleKeydown)
    })

    watch(
      state,
      (v) => {
        localStorage.setItem('lottery_v2_final_storage', JSON.stringify(v))
      },
      { deep: true },
    )

    // 2. 計算屬性 (View 依賴)
    const participantsAll = computed(() =>
      state.rawParticipants
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s),
    )

    const availablePool = computed(() => {
      const winners = state.results.map((r) => r.winner)
      return participantsAll.value.filter((p) => !winners.includes(p))
    })

    const activePrize = computed(() => state.prizes[state.currentIndex])

    const currentWinners = computed(() => {
      if (!activePrize.value) return []
      return state.results.filter((r) => r.prizeName === activePrize.value.name)
    })

    function remainingCount(name) {
      const p = state.prizes.find((i) => i.name === name)
      const won = state.results.filter((r) => r.prizeName === name).length
      return p ? p.count - won : 0
    }

    // 3. 抽獎核心邏輯
    function handleKeydown(e) {
      if (e.code === 'Space' && currentView.value === 'lottery' && activePrize.value) {
        e.preventDefault()
        if (isSpinning.value) {
          // 若是連續單抽且名額超過1人，按空白鍵記錄但不停止動畫
          const isSingleMode = activePrize.value.mode === 'single'
          const hasMore = remainingCount(activePrize.value.name) > 1

          if (isSingleMode && hasMore) {
            recordWinner(false) // 記錄一人，不停動畫
          } else {
            recordWinner(true) // 最後一人或「一次抽完」，停下
          }
        } else {
          startSpinning()
        }
      }
    }

    function startSpinning() {
      if (remainingCount(activePrize.value.name) <= 0) return alert('名額已抽完')
      if (availablePool.value.length === 0) return alert('名單內已無待抽人員')
      isSpinning.value = true
      spinTimer = setInterval(() => {
        const pool = availablePool.value
        spinningName.value = pool[Math.floor(Math.random() * pool.length)]
      }, 50)
    }

    function recordWinner(shouldStop) {
      const timestamp = Date.now()
      const pool = [...availablePool.value]

      if (activePrize.value.mode === 'all') {
        // 一次抽完模式
        const countToDraw = Math.min(remainingCount(activePrize.value.name), pool.length)
        for (let i = 0; i < countToDraw; i++) {
          const idx = (timestamp + i) % pool.length
          const winner = pool.splice(idx, 1)[0]
          state.results.push({ prizeName: activePrize.value.name, winner, seed: timestamp + i })
        }
        spinningName.value = state.results[state.results.length - 1].winner
        clearInterval(spinTimer)
        isSpinning.value = false
      } else {
        // 單抽模式
        const winner = spinningName.value
        state.results.push({ prizeName: activePrize.value.name, winner, seed: timestamp })
        if (shouldStop) {
          clearInterval(spinTimer)
          isSpinning.value = false
        }
      }
    }

    // 4. 其他功能
    function changeTab(id) {
      currentView.value = id
      isNavExpanded.value = false
    }

    function prevPrize() {
      if (isSpinning.value) return
      state.currentIndex = (state.currentIndex - 1 + state.prizes.length) % state.prizes.length
      resetDisplay()
    }

    function nextPrize() {
      if (isSpinning.value) return
      state.currentIndex = (state.currentIndex + 1) % state.prizes.length
      resetDisplay()
    }

    function resetDisplay() {
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
        state.prizes = lines.slice(1).map((l) => {
          const [name, reward, count, bgUrl] = l.split(',').map((s) => s.trim())
          return { name, reward, count: parseInt(count) || 1, mode: 'single', bgUrl: bgUrl || '' }
        })
        state.currentIndex = 0
      }
      reader.readAsText(file)
    }

    function confirmRedraw() {
      if (confirm('確定作廢此獎項目前的紀錄並重新抽獎？')) {
        state.results = state.results.filter((r) => r.prizeName !== activePrize.value.name)
        spinningName.value = ''
      }
    }

    function resetSystem() {
      if (confirm('警告：這將徹底清除所有數據！')) {
        localStorage.clear()
        location.reload()
      }
    }

    function addPrize() {
      state.prizes.push({ name: '新獎項', reward: '', count: 1, mode: 'single', bgUrl: '' })
    }

    function exportCSV() {
      let content = '\ufeff獎項,得獎人,Timestamp Seed\n'
      state.results.forEach((r) => (content += `${r.prizeName},${r.winner},${r.seed}\n`))
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
