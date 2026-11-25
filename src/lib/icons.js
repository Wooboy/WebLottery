// 介面圖示：使用 Boxicons（https://boxicons.com/，MIT 授權）
// SVG 檔放在 src/assets/icons/，打包時以文字內嵌，輸出仍是離線單一 HTML 檔。
// 使用方式：<bx-icon name="bx-cog"></bx-icon>（name = 檔名，不含 .svg）
// 新增圖示：從 boxicons.com 下載 SVG 放進 src/assets/icons/ 即可。
import { h } from 'vue'

const files = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const ICONS = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [
    path
      .split('/')
      .pop()
      .replace(/\.svg$/, ''),
    // 移除固定尺寸，改由 CSS 控制（1em、跟隨文字顏色）
    svg.replace(/\s(width|height)="[^"]*"/g, ''),
  ]),
)

export const BxIcon = {
  name: 'BxIcon',
  props: { name: { type: String, required: true } },
  setup(props) {
    return () =>
      h('span', {
        class: 'bx-icon',
        'aria-hidden': 'true',
        innerHTML: ICONS[props.name] || '',
      })
  },
}
