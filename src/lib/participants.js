// 參與人員名單解析：每行「ID,顯示名稱」
// - ID（建議用員工編號）是唯一識別，用來排除已中獎者；顯示名稱可以重複
// - 分隔符號接受半形逗號、全形逗號或 Tab（可直接從 Excel 貼上兩欄）
// - 只以第一個分隔符號切開，顯示名稱中可以再有逗號
// - 第一行若是標題列（ID / 員編 / 員工編號 / 工號 / 編號）會自動略過

const SEPARATOR = /[,，\t]/
const HEADER_ID = /^(id|員編|員工編號|工號|編號|employee\s*id)$/i

export function parseParticipants(raw) {
  const people = []
  const errors = []
  const seen = new Map() // 大寫 ID → 第一次出現的行號

  const lines = (raw || '').split(/\r?\n/)
  let firstContent = true
  lines.forEach((text, i) => {
    const line = text.trim()
    if (!line) return
    const lineNo = i + 1
    const idx = line.search(SEPARATOR)
    if (idx < 0) {
      errors.push({ lineNo, text: line, reason: '缺少逗號，格式應為「ID,顯示名稱」' })
      firstContent = false
      return
    }
    const id = line.slice(0, idx).trim()
    const name = line.slice(idx + 1).trim()
    if (firstContent && HEADER_ID.test(id)) {
      firstContent = false
      return
    }
    firstContent = false
    if (!id) {
      errors.push({ lineNo, text: line, reason: '缺少 ID' })
      return
    }
    if (!name) {
      errors.push({ lineNo, text: line, reason: '缺少顯示名稱' })
      return
    }
    const key = id.toUpperCase()
    if (seen.has(key)) {
      errors.push({ lineNo, text: line, reason: `ID 重複（與第 ${seen.get(key)} 行相同）` })
      return
    }
    seen.set(key, lineNo)
    people.push({ id, name })
  })

  return { people, errors }
}
