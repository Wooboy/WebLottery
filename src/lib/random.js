// 密碼學安全亂數工具（crypto.getRandomValues）

// 產生 [0, n) 的均勻整數（拒絕取樣避免模數偏差）
export function secureRandomInt(n) {
  if (n <= 0) throw new Error('secureRandomInt: n must be > 0')
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= limit)
  return buf[0] % n
}

// Fisher–Yates 洗牌，回傳新陣列
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 從陣列中不重複地均勻抽出 n 個（順序亦為隨機）
export function sample(arr, n) {
  const a = [...arr]
  const count = Math.min(n, a.length)
  for (let i = 0; i < count; i++) {
    const j = i + secureRandomInt(a.length - i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, count)
}

// 隨機取一個（可重複，僅供視覺效果使用）
export function pick(arr) {
  return arr.length ? arr[secureRandomInt(arr.length)] : ''
}
