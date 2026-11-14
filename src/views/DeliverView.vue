<script setup lang="ts">
import { computed, ref } from 'vue'

import { useProjectStore } from '@/stores/project'
import { dielineOBJ, dielineSVG, downloadText } from '@/core/exporters'
import { diffDielines } from '@/core/storage'

const store = useProjectStore()

const errors = computed(() => store.checks.filter((c) => c.level === 'error'))
const warns = computed(() => store.checks.filter((c) => c.level === 'warn'))

// 冲突阻断:有 error 时所有出件按钮禁用
const exportSVG = (): void => {
  downloadText(`${store.dieline.name}.svg`, dielineSVG(store.dieline), 'image/svg+xml')
}
const exportOBJ = (): void => {
  downloadText(`${store.dieline.name}.obj`, dielineOBJ(store.dieline, store.transforms), 'text/plain')
}
const exportJSON = (): void => {
  downloadText(
    `${store.dieline.name}.json`,
    JSON.stringify(store.dieline, null, 2),
    'application/json',
  )
}

const versionName = ref('')
const saveVer = (): void => {
  store.saveVersion(versionName.value.trim() || `版本 ${store.versions.length + 1}`)
  versionName.value = ''
}

const compareA = ref('')
const compareB = ref('')
const diff = computed(() => {
  const a = store.versions.find((v) => v.id === compareA.value)
  const b = store.versions.find((v) => v.id === compareB.value)
  if (!a || !b) return null
  return diffDielines(a.data, b.data)
})

const fmtTime = (t: number): string => new Date(t).toLocaleString('zh-CN')
</script>

<template>
  <div class="page">
    <h1 class="page-title">交付</h1>
    <p class="page-sub">出件检查通过后才能导出,插槽冲突与折叠穿插会阻断出件。</p>

    <div class="deliver-grid">
      <section class="card side-section">
        <h3>出件检查</h3>
        <div class="row-list">
          <div v-for="(c, i) in store.checks" :key="i" class="row-item" style="cursor: default">
            <span class="tag" :class="c.level">{{ c.level === 'error' ? '阻断' : c.level === 'warn' ? '警告' : '通过' }}</span>
            <span>{{ c.text }}</span>
          </div>
        </div>
        <p class="muted" style="margin: var(--sp-3) 0 0">
          {{ errors.length }} 项阻断 · {{ warns.length }} 项警告
        </p>
      </section>

      <section class="card side-section">
        <h3>出件导出</h3>
        <div v-if="store.blocked" class="blocker-note">
          冲突阻断中:先解决 {{ errors.length }} 项阻断才能出件
        </div>
        <div class="toolbar">
          <button class="primary" :disabled="store.blocked" @click="exportSVG">导出 SVG 刀版</button>
          <button class="primary" :disabled="store.blocked" @click="exportOBJ">导出 OBJ 三维</button>
          <button :disabled="store.blocked" @click="exportJSON">导出工程 JSON</button>
        </div>
        <p class="muted">
          存档状态:{{ store.savedAt ? `已存档 ${fmtTime(store.savedAt)}` : '未存档' }}
          <button style="margin-left: var(--sp-2)" @click="store.saveToBrowser()">立即存档</button>
        </p>
      </section>

      <section class="card side-section">
        <h3>版本管理</h3>
        <div class="toolbar" style="margin-bottom: var(--sp-3)">
          <input v-model="versionName" placeholder="版本名,如 客户确认版" style="width: 200px">
          <button class="primary" @click="saveVer">存为版本</button>
        </div>
        <div class="row-list">
          <div v-for="v in [...store.versions].reverse()" :key="v.id" class="row-item" style="cursor: default">
            <span>{{ v.name }}</span>
            <span class="muted mono">{{ fmtTime(v.time) }}</span>
            <button style="margin-left: auto" @click="store.restoreVersion(v.id)">回滚</button>
          </div>
          <div v-if="store.versions.length === 0" class="muted">还没有版本,存一个再做对照</div>
        </div>
      </section>

      <section class="card side-section">
        <h3>版本对照</h3>
        <div class="toolbar" style="margin-bottom: var(--sp-3)">
          <select v-model="compareA">
            <option value="" disabled>版本 A</option>
            <option v-for="v in store.versions" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
          <span class="muted">对比</span>
          <select v-model="compareB">
            <option value="" disabled>版本 B</option>
            <option v-for="v in store.versions" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </div>
        <div v-if="diff" class="row-list">
          <div v-for="(line, i) in diff" :key="i" class="row-item" style="cursor: default">
            <span class="tag info">差异</span>
            <span>{{ line }}</span>
          </div>
        </div>
        <p v-else class="muted">选两个版本查看差异</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.deliver-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
  align-items: start;
}
.blocker-note {
  background: var(--c-danger-soft);
  color: var(--c-danger);
  border-radius: var(--radius-sm);
  padding: var(--sp-2) var(--sp-3);
  margin-bottom: var(--sp-3);
}
</style>
