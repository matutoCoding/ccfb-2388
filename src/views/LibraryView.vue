<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useProjectStore } from '@/stores/project'
import { getProject, listProjects, upsertProject, type StoredProject } from '@/core/storage'
import { uid } from '@/core/types'

const store = useProjectStore()
const router = useRouter()

const projects = ref<StoredProject[]>([])
const refresh = (): void => {
  projects.value = listProjects()
}
onMounted(refresh)

const form = ref({ name: '插舌盒', L: 120, W: 80, H: 40, thickness: 0.5 })
const create = (): void => {
  store.newProject(form.value.name, form.value.L, form.value.W, form.value.H, form.value.thickness)
  store.saveToBrowser()
  refresh()
  router.push('/editor')
}

const open = (id: string): void => {
  if (store.openProject(id)) router.push('/editor')
}

const duplicate = (id: string): void => {
  const src = getProject(id)
  if (!src) return
  const copy: StoredProject = JSON.parse(JSON.stringify(src))
  copy.meta.id = uid('prj')
  copy.meta.name = `${src.meta.name} 副本`
  copy.meta.updatedAt = Date.now()
  copy.dieline.id = uid('dl')
  copy.dieline.name = copy.meta.name
  upsertProject(copy)
  refresh()
}

const remove = (id: string): void => {
  store.deleteStoredProject(id)
  refresh()
}

const fmtTime = (t: number): string => new Date(t).toLocaleString('zh-CN')
</script>

<template>
  <div class="page">
    <h1 class="page-title">工程库</h1>
    <p class="page-sub">工程保存在浏览器本地,打开即进入刀版编辑。</p>

    <section class="card side-section" style="margin-bottom: var(--sp-5)">
      <h3>新建插舌盒</h3>
      <div class="toolbar">
        <div class="field"><label>名称</label><input v-model="form.name" style="width: 140px"></div>
        <div class="field"><label>长</label><input v-model.number="form.L" type="number" style="width: 72px"></div>
        <div class="field"><label>宽</label><input v-model.number="form.W" type="number" style="width: 72px"></div>
        <div class="field"><label>高</label><input v-model.number="form.H" type="number" style="width: 72px"></div>
        <div class="field"><label>纸厚</label><input v-model.number="form.thickness" type="number" step="0.1" style="width: 64px"></div>
        <button class="primary" @click="create">生成并打开</button>
      </div>
    </section>

    <div class="project-grid">
      <div v-for="p in projects" :key="p.meta.id" class="card project-card">
        <div class="project-name">{{ p.meta.name }}</div>
        <div class="muted mono">
          {{ p.dieline.dims.L }}×{{ p.dieline.dims.W }}×{{ p.dieline.dims.H }}mm ·
          纸厚 {{ p.dieline.thickness }}mm · {{ p.dieline.panels.length }} 面板
        </div>
        <div class="muted">更新于 {{ fmtTime(p.meta.updatedAt) }} · {{ p.versions.length }} 个版本</div>
        <div class="toolbar">
          <button class="primary" @click="open(p.meta.id)">打开</button>
          <button @click="duplicate(p.meta.id)">复制</button>
          <button class="danger" @click="remove(p.meta.id)">删除</button>
        </div>
      </div>
      <div v-if="projects.length === 0" class="card empty-card">
        <div class="empty-title">还没有工程</div>
        <div class="muted">在上方输入尺寸,一键生成插舌盒刀版</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--sp-4);
}
.project-card {
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.project-name {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}
.empty-card {
  padding: var(--sp-7);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.empty-title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-medium);
}
</style>
