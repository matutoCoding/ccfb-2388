<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import FoldViewer from '@/components/FoldViewer.vue'
import { useProjectStore } from '@/stores/project'
import { solveFold } from '@/core/fold'
import { detectCollisions } from '@/core/collision'

const store = useProjectStore()
const side = ref<'in' | 'out'>('out')
const viewer = ref<InstanceType<typeof FoldViewer> | null>(null)

const nameOf = (id: string): string =>
  store.dieline.panels.find((p) => p.id === id)?.name ?? id

const creaseName = (id: string): string => {
  const c = store.dieline.creases.find((x) => x.id === id)
  return c ? `${nameOf(c.a)}↔${nameOf(c.b)}` : id
}

// 拖动回放:播放时按时间推进时间轴
let raf = 0
let last = 0
const tick = (t: number): void => {
  if (!store.playing) return
  const dt = (t - last) / 1000
  last = t
  store.progress = Math.min(1, store.progress + dt / 5)
  if (store.progress >= 1) {
    store.playing = false
    return
  }
  raf = requestAnimationFrame(tick)
}
watch(
  () => store.playing,
  (p) => {
    if (p) {
      if (store.progress >= 1) store.progress = 0
      last = performance.now()
      raf = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(raf)
    }
  },
)
onBeforeUnmount(() => cancelAnimationFrame(raf))

const currentStep = computed(() =>
  Math.min(store.dieline.steps.length - 1, Math.floor(store.progress * store.dieline.steps.length)),
)

const jumpStep = (i: number): void => {
  store.progress = store.dieline.steps.length > 0 ? (i + 1) / store.dieline.steps.length : 1
}

// 穿插定位:沿时间轴扫描,找到该对面板首次穿透的时刻并跳转
const locateCollision = (a: string, b: string): void => {
  for (let p = 0; p <= 1.001; p += 0.02) {
    const t = solveFold(store.dieline, Math.min(1, p))
    const hit = detectCollisions(store.dieline, t).find(
      (c) => (c.a === a && c.b === b) || (c.a === b && c.b === a),
    )
    if (hit) {
      store.progress = Math.min(1, p)
      return
    }
  }
}

const groups = computed(() => {
  const m = new Map<string, number>()
  for (const c of store.dieline.creases) m.set(c.group, c.angle)
  return [...m.entries()]
})
</script>

<template>
  <div class="fold-layout">
    <div class="fold-stage card">
      <FoldViewer ref="viewer" :side="side" />
      <div class="stage-bar">
        <button class="primary" @click="store.playing = !store.playing">
          {{ store.playing ? '暂停' : '播放折叠' }}
        </button>
        <input
          type="range" min="0" max="1" step="0.005" :value="store.progress"
          style="flex: 1"
          @input="store.progress = Number(($event.target as HTMLInputElement).value)"
        >
        <span class="mono">{{ Math.round(store.progress * 100) }}%</span>
        <button @click="side = side === 'out' ? 'in' : 'out'">
          {{ side === 'out' ? '看内衬' : '看印刷面' }}
        </button>
        <button @click="viewer?.fitCamera()">复位视角</button>
      </div>
    </div>

    <aside class="fold-side card">
      <div class="side-section">
        <h3>折叠顺序</h3>
        <div class="row-list">
          <div
            v-for="(step, i) in store.dieline.steps"
            :key="i"
            class="row-item"
            :class="{ selected: currentStep === i }"
            style="cursor: pointer"
            @click="jumpStep(i)"
          >
            <span class="tag info">第{{ i + 1 }}步</span>
            <div>
              <div v-for="cid in step" :key="cid" class="step-crease">
                <span>{{ creaseName(cid) }}</span>
                <span class="step-btns">
                  <button @click.stop="store.moveCreaseStep(cid, -1)">◀</button>
                  <button @click.stop="store.moveCreaseStep(cid, 1)">▶</button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="side-section">
        <h3>穿插定位 ({{ store.collisions.length }})</h3>
        <div v-if="store.collisions.length === 0" class="muted">当前姿态无穿插</div>
        <div class="row-list">
          <div v-for="(c, i) in store.collisions" :key="i" class="row-item">
            <span class="tag error">穿透 {{ c.depth.toFixed(2) }}mm</span>
            <span>{{ nameOf(c.a) }} × {{ nameOf(c.b) }}</span>
            <button style="margin-left: auto" @click="locateCollision(c.a, c.b)">定位</button>
          </div>
        </div>
      </div>

      <div class="side-section">
        <h3>联动折角</h3>
        <div class="row-list">
          <div v-for="[g, ang] in groups" :key="g" class="field">
            <label style="width: 48px">{{ g }}</label>
            <input
              type="range" min="0" max="180" step="1" :value="ang" style="flex: 1"
              @change="store.setGroupAngle(g, Number(($event.target as HTMLInputElement).value))"
            >
            <span class="mono" style="width: 42px">{{ ang }}°</span>
          </div>
        </div>
      </div>

      <div class="side-section">
        <h3>间隙测量</h3>
        <div v-if="store.gaps.length === 0" class="muted">没有已配对的插舌</div>
        <div class="row-list">
          <div v-for="g in store.gaps" :key="g.slot.id" class="row-item">
            <span>{{ g.tabPanel.name }} → {{ nameOf(g.slot.panelId) }}</span>
            <span class="mono" style="margin-left: auto">{{ g.gap.toFixed(2) }}mm</span>
            <span class="tag" :class="g.conflict ? 'error' : 'ok'">
              {{ g.conflict ? '冲突' : '合格' }}
            </span>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.fold-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--sp-3);
  height: 100%;
  padding: var(--sp-3);
}
.fold-stage {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.fold-stage > div:first-child {
  flex: 1;
  min-height: 0;
}
.stage-bar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-top: 1px solid var(--c-border);
}
.fold-side {
  overflow-y: auto;
}
.step-crease {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  justify-content: space-between;
}
.step-btns {
  display: inline-flex;
  gap: var(--sp-1);
}
.step-btns button {
  padding: 0 var(--sp-1);
}
</style>
