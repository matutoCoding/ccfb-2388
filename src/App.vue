<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useProjectStore } from '@/stores/project'

const store = useProjectStore()
store.init()

const onKey = (e: KeyboardEvent): void => {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    store.undo()
  } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
    e.preventDefault()
    store.redo()
  } else if (e.key === 's') {
    e.preventDefault()
    store.saveToBrowser()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-title">折盒工作台</div>
      <nav class="app-nav">
        <RouterLink to="/library" active-class="active">工程库</RouterLink>
        <RouterLink to="/editor" active-class="active">刀版编辑</RouterLink>
        <RouterLink to="/fold" active-class="active">折叠校核</RouterLink>
        <RouterLink to="/deliver" active-class="active">交付</RouterLink>
      </nav>
      <div class="toolbar" style="margin-left: auto">
        <span class="muted">{{ store.dieline.name }}</span>
        <span v-if="store.blocked" class="tag error">有阻断项</span>
        <span v-else class="tag ok">可出件</span>
        <button :disabled="store.undoStack.length === 0" @click="store.undo()">撤销</button>
        <button :disabled="store.redoStack.length === 0" @click="store.redo()">重做</button>
        <button class="primary" @click="store.saveToBrowser()">存档</button>
      </div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
