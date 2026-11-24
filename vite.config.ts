import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // 相對路徑，讓 dist/index.html 可直接以 file:// 開啟
  base: './',
  plugins: [vue(), vueDevTools(), viteSingleFile()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 模板寫在 index.html（in-DOM template），需要含編譯器的 Vue 版本
      vue: 'vue/dist/vue.esm-bundler.js',
    },
  },
})
