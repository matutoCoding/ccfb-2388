<script setup lang="ts">
import { computed, ref } from 'vue'

import type { Vec2 } from '@/core/types'
import { boundsOf, distToSegment, edgesCoincident, snapPoint } from '@/core/geom'
import { slotPolygon } from '@/core/slots'
import { useProjectStore } from '@/stores/project'

const store = useProjectStore()

const gEl = ref<SVGGElement | null>(null)
const hint = ref('')

const MARGIN = 24
const viewBox = computed(() => {
  const all = store.dieline.panels.flatMap((p) => p.points)
  const b = all.length > 0 ? boundsOf(all) : { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  return `${b.minX - MARGIN} ${-(b.maxY + MARGIN)} ${b.maxX - b.minX + MARGIN * 2} ${b.maxY - b.minY + MARGIN * 2}`
})

const toDieline = (e: PointerEvent): Vec2 => {
  const ctm = gEl.value?.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  return { x: pt.x, y: pt.y }
}

const pathOf = (pts: Vec2[]): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'

const fillOf = (kind: string): string =>
  kind === 'tab' ? '#fff4dc' : kind === 'flap' ? '#eef3ff' : kind === 'glue' ? '#f1f1f1' : '#ffffff'

// 拖动状态
type Drag =
  | { type: 'vertex'; panelId: string; index: number }
  | { type: 'panel'; panelId: string; last: Vec2 }
  | { type: 'rect'; start: Vec2; holeTarget: string | null }
const drag = ref<Drag | null>(null)
const rubber = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const snapMark = ref<Vec2 | null>(null)

// 吸附候选:其他面板的顶点
const snapCandidates = (excludePanelId: string): Vec2[] =>
  store.dieline.panels.filter((p) => p.id !== excludePanelId).flatMap((p) => p.points)

const onVertexDown = (e: PointerEvent, panelId: string, index: number): void => {
  if (store.tool !== 'select') return
  e.stopPropagation()
  store.beginDrag()
  store.select('panel', panelId, index)
  drag.value = { type: 'vertex', panelId, index }
  ;(e.target as Element).setPointerCapture(e.pointerId)
}

const onPanelDown = (e: PointerEvent, panelId: string): void => {
  e.stopPropagation()
  const p = toDieline(e)
  if (store.tool === 'select') {
    store.beginDrag()
    store.select('panel', panelId)
    drag.value = { type: 'panel', panelId, last: p }
  } else if (store.tool === 'hole') {
    drag.value = { type: 'rect', start: p, holeTarget: panelId }
  } else if (store.tool === 'crease') {
    tryAddCrease(p, panelId)
  }
}

const onCreaseDown = (e: PointerEvent, id: string): void => {
  if (store.tool !== 'select') return
  e.stopPropagation()
  store.select('crease', id)
}

const onSlotDown = (e: PointerEvent, id: string): void => {
  if (store.tool !== 'select') return
  e.stopPropagation()
  store.select('slot', id)
}

const onBgDown = (e: PointerEvent): void => {
  const p = toDieline(e)
  if (store.tool === 'panel') {
    drag.value = { type: 'rect', start: p, holeTarget: null }
  } else if (store.tool === 'select') {
    store.select(null, null)
  }
}

// 压痕指派:点面板某条边,找共边的另一面板生成压痕
const tryAddCrease = (p: Vec2, panelId: string): void => {
  const d = store.dieline
  const panel = d.panels.find((x) => x.id === panelId)
  if (!panel) return
  let best: { a: Vec2; b: Vec2 } | null = null
  let bestD = 3
  for (let i = 0; i < panel.points.length; i++) {
    const a = panel.points[i]
    const b = panel.points[(i + 1) % panel.points.length]
    const dd = distToSegment(p, a, b)
    if (dd < bestD) {
      bestD = dd
      best = { a, b }
    }
  }
  if (!best) {
    hint.value = '请点在面板边缘 3mm 内'
    return
  }
  const other = d.panels.find(
    (x) =>
      x.id !== panelId &&
      x.points.some((pt, i) =>
        edgesCoincident(best!.a, best!.b, pt, x.points[(i + 1) % x.points.length], 1),
      ),
  )
  if (!other) {
    hint.value = '这条边没有贴合的面板,先把另一面板轮廓吸附过来'
    return
  }
  const dup = d.creases.find(
    (c) => (c.a === panelId && c.b === other.id) || (c.a === other.id && c.b === panelId),
  )
  if (dup) {
    hint.value = '两个面板之间已有压痕'
    store.select('crease', dup.id)
    return
  }
  store.addCrease(panelId, other.id, best.a, best.b)
  hint.value = `已在「${panel.name}」与「${other.name}」之间指派压痕`
}

const onMove = (e: PointerEvent): void => {
  if (!drag.value) return
  const p = toDieline(e)
  const d = store.dieline
  if (drag.value.type === 'vertex') {
    const { panelId, index } = drag.value
    const panel = d.panels.find((x) => x.id === panelId)
    if (!panel) return
    const snapped = snapPoint(p, snapCandidates(panelId), 2.5)
    snapMark.value = snapped
    panel.points[index] = snapped
  } else if (drag.value.type === 'panel') {
    const { panelId } = drag.value
    const panel = d.panels.find((x) => x.id === panelId)
    if (!panel) return
    const raw = { x: p.x - drag.value.last.x, y: p.y - drag.value.last.y }
    const anchor = panel.points[0]
    const snapped = snapPoint(
      { x: anchor.x + raw.x, y: anchor.y + raw.y },
      snapCandidates(panelId),
      2.5,
    )
    const dx = snapped.x - anchor.x
    const dy = snapped.y - anchor.y
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return
    snapMark.value = snapped
    panel.points = panel.points.map((q) => ({ x: q.x + dx, y: q.y + dy }))
    for (const h of panel.holes) {
      h.cx += dx
      h.cy += dy
    }
    // 压痕铰链与插槽跟着面板走
    for (const c of d.creases) {
      if (c.a === panelId || c.b === panelId) {
        c.p1 = { x: c.p1.x + dx, y: c.p1.y + dy }
        c.p2 = { x: c.p2.x + dx, y: c.p2.y + dy }
      }
    }
    for (const s of d.slots) {
      if (s.panelId === panelId) {
        s.edge = [
          { x: s.edge[0].x + dx, y: s.edge[0].y + dy },
          { x: s.edge[1].x + dx, y: s.edge[1].y + dy },
        ]
      }
    }
    drag.value.last = { x: p.x, y: p.y }
  } else if (drag.value.type === 'rect') {
    const s = drag.value.start
    rubber.value = {
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    }
  }
}

const onUp = (): void => {
  if (drag.value?.type === 'rect' && rubber.value) {
    const r = rubber.value
    if (r.w > 2 && r.h > 2) {
      if (drag.value.holeTarget) {
        store.addHole(drag.value.holeTarget, {
          shape: 'rect',
          cx: r.x + r.w / 2,
          cy: r.y + r.h / 2,
          w: r.w,
          h: r.h,
        })
      } else {
        store.addPanel(r.x, r.y, r.w, r.h)
      }
    }
  }
  drag.value = null
  rubber.value = null
  snapMark.value = null
}

const selectedPanel = computed(() =>
  store.selection.kind === 'panel'
    ? store.dieline.panels.find((p) => p.id === store.selection.id)
    : null,
)
</script>

<template>
  <svg
    class="dieline-svg"
    :viewBox="viewBox"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointerleave="onUp"
    @pointerdown="onBgDown"
  >
    <g ref="gEl" transform="scale(1,-1)">
      <g v-for="p in store.dieline.panels" :key="p.id">
        <path
          :d="pathOf(p.points)"
          :fill="fillOf(p.kind)"
          :stroke="store.selection.id === p.id ? '#2f6fed' : '#9aa3b2'"
          :stroke-width="store.selection.id === p.id ? 0.8 : 0.4"
          style="cursor: pointer"
          @pointerdown="onPanelDown($event, p.id)"
        />
        <rect
          v-for="h in p.holes.filter((x) => x.shape === 'rect')"
          :key="h.id"
          :x="h.cx - h.w / 2"
          :y="h.cy - h.h / 2"
          :width="h.w"
          :height="h.h"
          fill="#f6f7f9"
          stroke="#9aa3b2"
          stroke-width="0.3"
        />
        <circle
          v-for="h in p.holes.filter((x) => x.shape === 'circle')"
          :key="h.id"
          :cx="h.cx"
          :cy="h.cy"
          :r="h.w / 2"
          fill="#f6f7f9"
          stroke="#9aa3b2"
          stroke-width="0.3"
        />
      </g>

      <polygon
        v-for="s in store.dieline.slots"
        :key="s.id"
        :points="slotPolygon(s).map((q) => `${q.x},${q.y}`).join(' ')"
        fill="#dcf5e4"
        :stroke="store.selection.id === s.id ? '#2f6fed' : '#1a9e4b'"
        stroke-width="0.5"
        style="cursor: pointer"
        @pointerdown="onSlotDown($event, s.id)"
      />

      <g v-for="c in store.dieline.creases" :key="c.id">
        <line
          :x1="c.p1.x" :y1="c.p1.y" :x2="c.p2.x" :y2="c.p2.y"
          stroke="transparent"
          stroke-width="3"
          style="cursor: pointer"
          @pointerdown="onCreaseDown($event, c.id)"
        />
        <line
          :x1="c.p1.x" :y1="c.p1.y" :x2="c.p2.x" :y2="c.p2.y"
          :stroke="store.selection.id === c.id ? '#2f6fed' : c.dir === 'valley' ? '#2050d4' : '#d47020'"
          :stroke-width="store.selection.id === c.id ? 0.8 : 0.4"
          stroke-dasharray="3,2"
          pointer-events="none"
        />
      </g>

      <template v-if="selectedPanel">
        <circle
          v-for="(pt, i) in selectedPanel.points"
          :key="i"
          :cx="pt.x"
          :cy="pt.y"
          :r="store.selection.vertex === i ? 2 : 1.4"
          :fill="store.selection.vertex === i ? '#2f6fed' : '#fff'"
          stroke="#2f6fed"
          stroke-width="0.4"
          style="cursor: move"
          @pointerdown="onVertexDown($event, selectedPanel.id, i)"
        />
      </template>

      <rect
        v-if="rubber"
        :x="rubber.x"
        :y="rubber.y"
        :width="rubber.w"
        :height="rubber.h"
        fill="rgba(47, 111, 237, 0.08)"
        stroke="#2f6fed"
        stroke-width="0.4"
        stroke-dasharray="2,2"
      />
      <circle v-if="snapMark" :cx="snapMark.x" :cy="snapMark.y" r="2.4" fill="none" stroke="#1e8e4f" stroke-width="0.5" />
    </g>
  </svg>
  <div v-if="hint" class="canvas-hint" @click="hint = ''">{{ hint }}</div>
</template>

<style scoped>
.dieline-svg {
  width: 100%;
  height: 100%;
  display: block;
  background:
    linear-gradient(var(--c-border) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(90deg, var(--c-border) 1px, transparent 1px) 0 0 / 24px 24px,
    var(--c-panel);
  touch-action: none;
}
.canvas-hint {
  position: absolute;
  left: var(--sp-4);
  bottom: var(--sp-4);
  background: var(--c-text);
  color: #fff;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  cursor: pointer;
}
</style>
