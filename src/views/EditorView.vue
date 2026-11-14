<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import DielineCanvas from '@/components/DielineCanvas.vue'
import { useProjectStore, type Tool } from '@/stores/project'
import { measureGaps } from '@/core/slots'

const store = useProjectStore()

const tools: { key: Tool; label: string }[] = [
  { key: 'select', label: '选择/拖动' },
  { key: 'panel', label: '加面板' },
  { key: 'hole', label: '加孔洞' },
  { key: 'crease', label: '指派压痕' },
]

const dims = ref({ ...store.dieline.dims, thickness: store.dieline.thickness })
// 切换工程或重建后同步尺寸表单
watch(
  () => [store.dieline.dims, store.dieline.thickness],
  () => {
    dims.value = { ...store.dieline.dims, thickness: store.dieline.thickness }
  },
)
const applyDims = (): void => {
  store.regenerate(dims.value.L, dims.value.W, dims.value.H, dims.value.thickness)
}

const sel = computed(() => store.selection)
const panel = computed(() =>
  sel.value.kind === 'panel' ? store.dieline.panels.find((p) => p.id === sel.value.id) : null,
)
const crease = computed(() =>
  sel.value.kind === 'crease' ? store.dieline.creases.find((c) => c.id === sel.value.id) : null,
)
const slot = computed(() =>
  sel.value.kind === 'slot' ? store.dieline.slots.find((s) => s.id === sel.value.id) : null,
)

const panelName = (id: string): string =>
  store.dieline.panels.find((p) => p.id === id)?.name ?? id

const slotGap = computed(() => {
  if (!slot.value) return null
  return measureGaps(store.dieline).find((g) => g.slot.id === slot.value!.id) ?? null
})

const pairTarget = ref('')
const doPair = (tabId: string): void => {
  if (!pairTarget.value) return
  store.pairSlotTo(tabId, pairTarget.value)
}

const addCircleHole = (panelId: string): void => {
  const p = store.dieline.panels.find((x) => x.id === panelId)
  if (!p) return
  const xs = p.points.map((q) => q.x)
  const ys = p.points.map((q) => q.y)
  store.addHole(panelId, {
    shape: 'circle',
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    w: 10,
    h: 10,
  })
}
</script>

<template>
  <div class="editor-layout">
    <div class="editor-toolbar card">
      <div class="toolbar">
        <button
          v-for="t in tools"
          :key="t.key"
          :class="{ primary: store.tool === t.key }"
          @click="store.tool = t.key"
        >
          {{ t.label }}
        </button>
        <span class="muted">拖动顶点自动吸附轮廓与网格;压痕工具点面板边缘</span>
      </div>
    </div>

    <div class="editor-canvas card">
      <DielineCanvas />
    </div>

    <aside class="editor-side card">
      <div v-if="!sel.kind" class="side-section">
        <h3>盒型尺寸</h3>
        <div class="row-list">
          <div class="field"><label>长 L</label><input v-model.number="dims.L" type="number" style="width: 80px"> mm</div>
          <div class="field"><label>宽 W</label><input v-model.number="dims.W" type="number" style="width: 80px"> mm</div>
          <div class="field"><label>高 H</label><input v-model.number="dims.H" type="number" style="width: 80px"> mm</div>
          <div class="field"><label>纸厚</label><input v-model.number="dims.thickness" type="number" step="0.1" style="width: 80px"> mm</div>
          <button class="primary" @click="applyDims">按尺寸重建(不拉伸)</button>
        </div>
      </div>

      <div v-if="!sel.kind" class="side-section">
        <h3>面板 ({{ store.dieline.panels.length }})</h3>
        <div class="row-list">
          <div
            v-for="p in store.dieline.panels"
            :key="p.id"
            class="row-item"
            @click="store.select('panel', p.id)"
          >
            <span>{{ p.name }}</span>
            <span class="tag info">{{ p.kind }}</span>
            <span v-if="store.dieline.rootId === p.id" class="tag ok">根面</span>
          </div>
        </div>
      </div>

      <template v-if="panel">
        <div class="side-section">
          <h3>面板 · {{ panel.name }}</h3>
          <div class="row-list">
            <div class="field">
              <label>名称</label>
              <input
                :value="panel.name"
                @change="store.commit((d) => { d.panels.find((x) => x.id === panel!.id)!.name = ($event.target as HTMLInputElement).value })"
              >
            </div>
            <div class="field">
              <label>类型</label>
              <select
                :value="panel.kind"
                @change="store.commit((d) => { d.panels.find((x) => x.id === panel!.id)!.kind = ($event.target as HTMLSelectElement).value as never })"
              >
                <option value="face">筒身</option>
                <option value="flap">防尘翼</option>
                <option value="tab">插舌</option>
                <option value="glue">糊口</option>
              </select>
            </div>
            <div class="toolbar">
              <button @click="store.setRoot(panel!.id)">设为根面</button>
              <button class="danger" @click="store.deletePanel(panel!.id)">删除面板</button>
            </div>
          </div>
        </div>

        <div v-if="panel.tab" class="side-section">
          <h3>插舌参数</h3>
          <div class="row-list">
            <div class="field">
              <label>舌宽</label>
              <input
                type="number" :value="panel.tab.tipWidth" style="width: 72px"
                @change="store.commit((d) => { d.panels.find((x) => x.id === panel!.id)!.tab!.tipWidth = Number(($event.target as HTMLInputElement).value) })"
              > mm
            </div>
            <div class="field">
              <label>肩缩</label>
              <input
                type="number" :value="panel.tab.shoulder" style="width: 72px"
                @change="store.commit((d) => { d.panels.find((x) => x.id === panel!.id)!.tab!.shoulder = Number(($event.target as HTMLInputElement).value) })"
              > mm
            </div>
            <div class="field">
              <label>舌长</label>
              <input
                type="number" :value="panel.tab.length" style="width: 72px"
                @change="store.commit((d) => { d.panels.find((x) => x.id === panel!.id)!.tab!.length = Number(($event.target as HTMLInputElement).value) })"
              > mm
            </div>
            <button @click="store.reshapeTabOf(panel!.id)">按参数改形</button>
            <div class="field">
              <label>配对插槽到</label>
              <select v-model="pairTarget">
                <option value="" disabled>选面板</option>
                <option v-for="p in store.dieline.panels.filter((x) => x.id !== panel!.id)" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
              <button @click="doPair(panel!.id)">配对</button>
            </div>
            <span v-if="panel.tab.slotId" class="tag ok">已配对插槽</span>
            <span v-else class="tag warn">未配对插槽</span>
          </div>
        </div>

        <div class="side-section">
          <h3>孔洞 ({{ panel.holes.length }})</h3>
          <div class="row-list">
            <div v-for="h in panel.holes" :key="h.id" class="row-item">
              <span>{{ h.shape === 'circle' ? '圆孔' : '方孔' }} {{ h.w }}×{{ h.h }}</span>
              <button class="danger" style="margin-left: auto" @click="store.deleteHole(panel!.id, h.id)">删</button>
            </div>
            <button @click="addCircleHole(panel!.id)">加圆孔(拖框可加方孔)</button>
          </div>
        </div>
      </template>

      <div v-if="crease" class="side-section">
        <h3>压痕 · {{ panelName(crease.a) }} ↔ {{ panelName(crease.b) }}</h3>
        <div class="row-list">
          <div class="field">
            <label>山/谷</label>
            <select
              :value="crease.dir"
              @change="store.commit((d) => { d.creases.find((x) => x.id === crease!.id)!.dir = ($event.target as HTMLSelectElement).value as never })"
            >
              <option value="valley">谷折</option>
              <option value="mountain">山折</option>
            </select>
          </div>
          <div class="field">
            <label>折角</label>
            <input
              type="number" :value="crease.angle" style="width: 72px"
              @change="store.commit((d) => { d.creases.find((x) => x.id === crease!.id)!.angle = Number(($event.target as HTMLInputElement).value) })"
            > °
          </div>
          <div class="field">
            <label>联动组</label>
            <input
              :value="crease.group"
              @change="store.commit((d) => { d.creases.find((x) => x.id === crease!.id)!.group = ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div class="field">
            <label>纸厚补偿</label>
            <input
              type="checkbox" :checked="crease.comp"
              @change="store.commit((d) => { d.creases.find((x) => x.id === crease!.id)!.comp = ($event.target as HTMLInputElement).checked })"
            >
          </div>
          <button class="danger" @click="store.deleteCrease(crease!.id)">删除压痕</button>
        </div>
      </div>

      <div v-if="slot" class="side-section">
        <h3>插槽 · {{ panelName(slot.panelId) }}</h3>
        <div class="row-list">
          <div class="field">
            <label>槽宽</label>
            <input
              type="number" step="0.5" :value="slot.width" style="width: 72px"
              @change="store.commit((d) => { d.slots.find((x) => x.id === slot!.id)!.width = Number(($event.target as HTMLInputElement).value) })"
            > mm
          </div>
          <div class="field">
            <label>槽深</label>
            <input
              type="number" :value="slot.depth" style="width: 72px"
              @change="store.commit((d) => { d.slots.find((x) => x.id === slot!.id)!.depth = Number(($event.target as HTMLInputElement).value) })"
            > mm
          </div>
          <div class="field">
            <label>位置</label>
            <input
              type="range" min="0.1" max="0.9" step="0.05" :value="slot.t"
              @change="store.commit((d) => { d.slots.find((x) => x.id === slot!.id)!.t = Number(($event.target as HTMLInputElement).value) })"
            >
          </div>
          <template v-if="slotGap">
            <span class="mono">单边间隙 {{ slotGap.gap.toFixed(2) }} mm(舌:{{ slotGap.tabPanel.name }})</span>
            <span v-if="slotGap.conflict" class="tag error">间隙不足,出件被阻断</span>
            <span v-else class="tag ok">间隙合格</span>
          </template>
          <span v-else class="muted">未关联插舌</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.editor-layout {
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr 300px;
  grid-template-areas: "toolbar toolbar" "canvas side";
  gap: var(--sp-3);
  height: 100%;
  padding: var(--sp-3);
}
.editor-toolbar { grid-area: toolbar; padding: var(--sp-2) var(--sp-3); }
.editor-canvas { grid-area: canvas; position: relative; overflow: hidden; }
.editor-side { grid-area: side; overflow-y: auto; }
</style>
