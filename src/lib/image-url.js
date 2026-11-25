// 獎項背景圖：把使用者輸入的網址 / 路徑轉成瀏覽器可用的圖片網址
// 支援：
//   https://… 、data:… 等完整網址（原樣使用）
//   img/award.jpg 這類相對於 index.html 的路徑
//   C:\pics\a.jpg、"C:\pics\a.jpg"（檔案總管「複製路徑」會帶引號）等 Windows 路徑
//   \\server\share\a.jpg 網路芳鄰路徑

// 本機檔案路徑中 % # ? 會被當成網址語法，需要先編碼
const encodePath = (p) => p.replace(/[%#?]/g, encodeURIComponent)

export function toImageUrl(raw) {
  let s = String(raw ?? '').trim()
  // 去掉頭尾成對的引號
  s = s.replace(/^(["'])(.*)\1$/, '$2').trim()
  if (!s) return ''
  // Windows 磁碟路徑：C:\pics\a.jpg、C:/pics/a.jpg
  if (/^[a-zA-Z]:[\\/]/.test(s)) return 'file:///' + encodePath(s.replace(/\\/g, '/'))
  // 網路芳鄰路徑：\\server\share\a.jpg
  if (/^\\\\[^\\]/.test(s)) return 'file:' + encodePath(s.replace(/\\/g, '/'))
  // 有協定的完整網址（http:、https:、data:、file:、blob:）原樣使用
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s
  // 相對路徑：反斜線一律視為資料夾分隔
  return encodePath(s.replace(/\\/g, '/'))
}

// 產生 CSS 的 url("…")：加上引號並跳脫，避免空格、括號、引號讓整個 background-image 失效
export function cssImageUrl(raw) {
  const url = toImageUrl(raw)
  if (!url) return ''
  return `url("${url.replace(/["\\\n\r]/g, (c) => '\\' + c.charCodeAt(0).toString(16) + ' ')}")`
}
