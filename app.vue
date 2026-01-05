<template>
  <div :class="['min-h-screen transition-colors duration-500 p-4 font-sans', themeClasses[state.config.theme]]">
    
    <!-- 導覽列 -->
    <nav class="flex justify-center space-x-4 mb-8">
      <button @click="view = 'settings'" :class="navBtnClass(view === 'settings')">設定設定</button>
      <button @click="view = 'lottery'" :class="navBtnClass(view === 'lottery')">開始抽獎</button>
      <button @click="view = 'results'" :class="navBtnClass(view === 'results')">抽獎結果</button>
    </nav>

    <!-- 1. 設定頁面 -->
    <div v-if="view === 'settings'" class="max-w-4xl mx-auto bg-white/10 backdrop-blur-md p-6 rounded-xl shadow-xl text-white">
      <h2 class="text-2xl font-bold mb-4">系統設定</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- 人員名單 -->
        <div>
          <label class="block mb-2">參與人員名單 (每行一個名字)</label>
          <textarea v-model="state.rawParticipants" class="w-full h-40 p-2 text-black rounded" placeholder="王小明\n李小華..."></textarea>
        </div>

        <!-- 風格設定 -->
        <div>
          <label class="block mb-2">介面風格</label>
          <div class="flex space-x-2 mb-4">
            <button v-for="(color, key) in themeClasses" :key="key" 
              @click="state.config.theme = key"
              :class="['w-8 h-8 rounded-full border-2', state.config.theme === key ? 'border-white' : 'border-transparent', color]">
            </button>
          </div>
          
          <label class="block mb-2">輪盤樣式</label>
          <select v-model="state.config.wheelType" class="w-full p-2 text-black rounded mb-4">
            <option value="circle">圓形轉盤</option>
            <option value="slot">吃角子老虎機</option>
          </select>
        </div>
      </div>

      <!-- 獎項設定 -->
      <div class="mt-6">
        <div class="flex justify-between items-center mb-2">
          <label>獎項清單</label>
          <button @click="addPrize" class="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-sm">+ 新增獎項</button>
        </div>
        <div v-for="(prize, index) in state.prizes" :key="index" class="grid grid-cols-4 gap-2 mb-2 bg-black/20 p-2 rounded">
          <input v-model="prize.name" placeholder="獎項名稱" class="p-1 text-black rounded">
          <input v-model="prize.reward" placeholder="獎品內容" class="p-1 text-black rounded">
          <input v-model.number="prize.count" type="number" placeholder="數量" class="p-1 text-black rounded">
          <div class="flex gap-1">
            <input v-model="prize.bgUrl" placeholder="背景圖連結" class="p-1 text-black rounded flex-1">
            <button @click="state.prizes.splice(index, 1)" class="text-red-400 text-xs">刪除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 抽獎頁面 -->
    <div v-if="view === 'lottery'" class="max-w-4xl mx-auto text-center">
      <div v-if="currentPrize" class="relative overflow-hidden rounded-3xl p-8 min-h-[500px] flex flex-col items-center justify-center bg-cover bg-center"
           :style="{ backgroundImage: `url(${currentPrize.bgUrl})` }">
        <div class="absolute inset-0 bg-black/40"></div>
        
        <div class="relative z-10 text-white">
          <h2 class="text-4xl font-bold mb-2">{{ currentPrize.name }}</h2>
          <p class="text-xl mb-8">獎品：{{ currentPrize.reward }} (剩餘：{{ remainingCount(currentPrize.name) }})</p>

          <!-- 圓形轉盤樣式 -->
          <div v-if="state.config.wheelType === 'circle'" class="relative w-64 h-64 mx-auto mb-8 border-8 border-white rounded-full flex items-center justify-center overflow-hidden bg-white/20 transition-transform duration-[3s] ease-out"
               :style="{ transform: `rotate(${wheelRotation}deg)` }">
            <div v-if="!isSpinning && !winnerName" class="text-2xl">準備抽獎</div>
            <div class="text-3xl font-bold">{{ spinningName }}</div>
          </div>

          <!-- 老虎機樣式 -->
          <div v-else class="h-32 overflow-hidden bg-black/50 border-4 border-yellow-500 rounded-lg mb-8 px-12 flex items-center justify-center">
            <div class="text-5xl font-mono font-bold text-yellow-400 tracking-widest">
              {{ spinningName || 'READY' }}
            </div>
          </div>

          <p class="text-lg animate-pulse mb-4">按下 [空白鍵] {{ isSpinning ? '停止' : '開始' }}</p>

          <!-- 重抽按鈕 -->
          <button v-if="lastWinnerInThisSession" @click="confirmRedraw" 
                  class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg transition">
            重抽此獎項
          </button>
        </div>
      </div>
      <div v-else class="text-white text-2xl mt-20">請先到設定頁面建立獎項與名單</div>
    </div>

    <!-- 3. 結果頁面 -->
    <div v-if="view === 'results'" class="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-xl">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold">中獎名單</h2>
        <button @click="exportCSV" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">匯出 CSV</button>
      </div>
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b-2">
            <th class="p-2">獎項</th>
            <th class="p-2">獎品</th>
            <th class="p-2">得獎者</th>
            <th class="p-2 text-xs text-gray-400">亂數種子</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(res, i) in state.results" :key="i" class="border-b">
            <td class="p-2">{{ res.prizeName }}</td>
            <td class="p-2">{{ res.reward }}</td>
            <td class="p-2 font-bold">{{ res.winner }}</td>
            <td class="p-2 text-xs text-gray-400 font-mono">{{ res.seed }}</td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onUnmounted, computed, watch } from 'vue';

// 狀態管理
const view = ref('settings');
const state = reactive({
  rawParticipants: '',
  prizes: [],
  results: [],
  config: {
    theme: 'red',
    wheelType: 'circle'
  }
});

const themeClasses = {
  red: 'bg-red-900',
  black: 'bg-zinc-900',
  blue: 'bg-blue-900',
  green: 'bg-emerald-900',
  yellow: 'bg-amber-700'
};

const isSpinning = ref(false);
const spinningName = ref('');
const winnerName = ref('');
const wheelRotation = ref(0);
const lastWinnerInThisSession = ref(null);
let spinInterval = null;

// 初始化與 LocalStorage
onMounted(() => {
  const saved = localStorage.getItem('lottery_app_v1');
  if (saved) {
    Object.assign(state, JSON.parse(saved));
  }
  window.addEventListener('keydown', handleKeyDown);
});

watch(state, (newVal) => {
  localStorage.setItem('lottery_app_v1', JSON.stringify(newVal));
}, { deep: true });

// 計算屬性
const participants = computed(() => 
  state.rawParticipants.split('\n').map(n => n.trim()).filter(n => n !== '')
);

const availableParticipants = computed(() => {
  const winners = state.results.map(r => r.winner);
  return participants.value.filter(p => !winners.includes(p));
});

const currentPrize = computed(() => {
  // 找出第一個還沒抽完的獎項
  return state.prizes.find(p => remainingCount(p.name) > 0);
});

function remainingCount(prizeName) {
  const prize = state.prizes.find(p => p.name === prizeName);
  const wonCount = state.results.filter(r => r.prizeName === prizeName).length;
  return prize ? prize.count - wonCount : 0;
}

// 邏輯方法
function addPrize() {
  state.prizes.push({ name: '', reward: '', count: 1, bgUrl: '' });
}

function handleKeyDown(e) {
  if (e.code === 'Space' && view.value === 'lottery' && currentPrize.value) {
    e.preventDefault();
    if (!isSpinning.value) {
      startSpin();
    } else {
      stopSpin();
    }
  }
}

function startSpin() {
  if (availableParticipants.value.length === 0) {
    alert('名單已空！');
    return;
  }
  isSpinning.value = true;
  winnerName.value = '';
  lastWinnerInThisSession.value = null;
  
  spinInterval = setInterval(() => {
    const pool = availableParticipants.value;
    spinningName.value = pool[Math.floor(Math.random() * pool.length)];
    if (state.config.wheelType === 'circle') {
      wheelRotation.value += 45;
    }
  }, 80);
}

function stopSpin() {
  clearInterval(spinInterval);
  isSpinning.value = false;
  
  const seed = Date.now();
  const pool = availableParticipants.value;
  
  // 使用 Seed 做亂數選擇 (確保隨機性基於按下停止的時間)
  const winnerIndex = seed % pool.length;
  const winner = pool[winnerIndex];
  
  winnerName.value = winner;
  spinningName.value = winner;
  
  const result = {
    prizeName: currentPrize.value.name,
    reward: currentPrize.value.reward,
    winner: winner,
    seed: seed
  };
  
  state.results.push(result);
  lastWinnerInThisSession.value = result;

  if (state.config.wheelType === 'circle') {
    wheelRotation.value += 1440; // 額外多轉幾圈特效
  }
}

function confirmRedraw() {
  if (confirm('確定要取消本次中獎並重新抽獎嗎？(中獎者將回到名單)')) {
    const lastResult = lastWinnerInThisSession.value;
    state.results = state.results.filter(r => r !== lastResult);
    lastWinnerInThisSession.value = null;
    winnerName.value = '';
    spinningName.value = '';
    startSpin();
  }
}

function exportCSV() {
  let csvContent = "\ufeff獎項,獎品,中獎人,亂數種子\n";
  state.results.forEach(r => {
    csvContent += `${r.prizeName},${r.reward},${r.winner},${r.seed}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "抽獎結果.csv");
  link.click();
}

const navBtnClass = (active) => `px-6 py-2 rounded-full transition ${active ? 'bg-white text-black shadow-lg' : 'bg-black/20 text-white hover:bg-black/40'}`;
</script>

<style scoped>
/* 簡單的老虎機滾動字體感 */
@font-face {
  font-family: 'Digital';
  src: url('https://fonts.cdnfonts.com/css/digital-numbers');
}
</style>