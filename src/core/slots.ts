import type { Dieline, Panel, Slot } from './types'
import { uid } from './types'
import { add, centroid, dist, distToSegment, mid, norm, perp, scale, sub, v2 } from './geom'

export const MIN_CLEARANCE = 0.3
export const DEFAULT_CLEARANCE = 1

export interface SlotGap {
  slot: Slot
  tabPanel: Panel
  gap: number
  conflict: boolean
}

// 间隙测量:每个插舌-插槽对的单边间隙
export const measureGaps = (d: Dieline): SlotGap[] => {
  const out: SlotGap[] = []
  for (const p of d.panels) {
    if (!p.tab || !p.tab.slotId) continue
    const slot = d.slots.find((s) => s.id === p.tab!.slotId)
    if (!slot) continue
    const gap = (slot.width - p.tab.tipWidth) / 2
    out.push({ slot, tabPanel: p, gap, conflict: gap < MIN_CLEARANCE })
  }
  return out
}

// 插槽配对:在目标面板上找离插舌最近的边,自动生成插槽
export const pairSlot = (d: Dieline, tabPanelId: string, targetPanelId: string): void => {
  const tabPanel = d.panels.find((p) => p.id === tabPanelId)
  const target = d.panels.find((p) => p.id === targetPanelId)
  if (!tabPanel || !tabPanel.tab || !target) return
  const tabCen = centroid(tabPanel.points)
  let bestEdge: [Slot['edge'][0], Slot['edge'][1]] | null = null
  let bestD = Infinity
  for (let i = 0; i < target.points.length; i++) {
    const a = target.points[i]
    const b = target.points[(i + 1) % target.points.length]
    const dd = distToSegment(tabCen, a, b)
    if (dd < bestD) {
      bestD = dd
      bestEdge = [a, b]
    }
  }
  if (!bestEdge) return
  const existing = d.slots.find((s) => s.id === tabPanel.tab!.slotId)
  if (existing) {
    existing.panelId = target.id
    existing.edge = bestEdge
    existing.t = 0.5
    orientSlotInward(d, existing)
    return
  }
  const slot: Slot = {
    id: uid('slot'),
    panelId: target.id,
    edge: bestEdge,
    t: 0.5,
    width: tabPanel.tab.tipWidth + 2 * DEFAULT_CLEARANCE,
    depth: 4,
  }
  d.slots.push(slot)
  tabPanel.tab.slotId = slot.id
  orientSlotInward(d, slot)
}

// 插舌改形:根据参数重建舌面轮廓(基线来自与父面相连的压痕)
export const reshapeTab = (d: Dieline, tabPanelId: string): void => {
  const panel = d.panels.find((p) => p.id === tabPanelId)
  if (!panel || !panel.tab) return
  const crease = d.creases.find((c) => c.a === panel.id || c.b === panel.id)
  if (!crease) return
  const parentId = crease.a === panel.id ? crease.b : crease.a
  const parent = d.panels.find((p) => p.id === parentId)
  if (!parent) return

  const { p1, p2 } = crease
  const baseDir = norm(sub(p2, p1))
  const parentCen = centroid(parent.points)
  let out = perp(baseDir)
  const baseMid = mid(p1, p2)
  // 外法向取背离父面形心的一侧
  const toParent = sub(parentCen, baseMid)
  if (out.x * toParent.x + out.y * toParent.y > 0) out = scale(out, -1)

  const { tipWidth, length } = panel.tab
  const baseLen = dist(p1, p2)
  const halfTip = Math.min(tipWidth, baseLen) / 2
  const knee = length * 0.55
  const pt = (along: number, off: number) =>
    add(add(p1, scale(baseDir, along)), scale(out, off))
  const halfBase = baseLen / 2
  panel.points = [
    pt(0, 0),
    pt(baseLen, 0),
    pt(baseLen, knee),
    pt(halfBase + halfTip, length),
    pt(halfBase - halfTip, length),
    pt(0, knee),
  ]
}

// 插槽在展开图上的多边形(用于渲染与导出)
export const slotPolygon = (slot: Slot): { x: number; y: number }[] => {
  const a = slot.edge[0]
  const b = slot.edge[1]
  const dir = norm(sub(b, a))
  const center = add(a, scale(sub(b, a), slot.t))
  const half = slot.width / 2
  const inward = perp(dir)
  const c1 = add(center, scale(dir, -half))
  const c2 = add(center, scale(dir, half))
  return [
    c1,
    c2,
    add(c2, scale(inward, slot.depth)),
    add(c1, scale(inward, slot.depth)),
  ]
}

// 插槽内法向修正:让槽口朝面板内侧开
export const orientSlotInward = (d: Dieline, slot: Slot): void => {
  const panel = d.panels.find((p) => p.id === slot.panelId)
  if (!panel) return
  const cen = centroid(panel.points)
  const a = slot.edge[0]
  const b = slot.edge[1]
  const dir = norm(sub(b, a))
  const inward = perp(dir)
  const center = add(a, scale(sub(b, a), slot.t))
  const toCen = sub(cen, center)
  if (inward.x * toCen.x + inward.y * toCen.y < 0) {
    slot.edge = [b, a]
    slot.t = 1 - slot.t
  }
}

export const slotCenter = (slot: Slot): { x: number; y: number } => {
  const a = slot.edge[0]
  const b = slot.edge[1]
  const c = add(a, scale(sub(b, a), slot.t))
  return v2(c.x, c.y)
}
