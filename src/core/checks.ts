import type { CheckItem, Collision, Dieline } from './types'
import { boundsOf, boundsOverlap, pointInPolygon } from './geom'
import { orphanPanels } from './fold'
import { measureGaps, MIN_CLEARANCE } from './slots'

// 出件检查:汇集所有阻断项与警告,有 error 即阻止出件
export const runChecks = (d: Dieline, collisions: Collision[]): CheckItem[] => {
  const items: CheckItem[] = []
  const nameOf = (id: string): string =>
    d.panels.find((p) => p.id === id)?.name ?? id

  // 插舌-插槽冲突:缩窄插槽导致间隙不足时定位到具体插舌
  for (const g of measureGaps(d)) {
    if (g.conflict) {
      items.push({
        level: 'error',
        text: `插槽冲突:「${g.tabPanel.name}」舌宽 ${g.tabPanel.tab!.tipWidth.toFixed(1)}mm,` +
          `「${nameOf(g.slot.panelId)}」上的插槽单边间隙 ${g.gap.toFixed(2)}mm < ${MIN_CLEARANCE}mm,加宽插槽可解除`,
      })
    }
  }

  // 折叠穿插(接触已按纸厚容差排除)
  for (const c of collisions) {
    items.push({
      level: 'error',
      text: `折叠穿插:「${nameOf(c.a)}」与「${nameOf(c.b)}」穿透 ${c.depth.toFixed(2)}mm`,
    })
  }

  // 游离面板
  for (const id of orphanPanels(d)) {
    items.push({ level: 'error', text: `面板「${nameOf(id)}」没有压痕连到根面,无法折叠` })
  }

  // 展开图面板重叠(包围盒粗判)
  for (let i = 0; i < d.panels.length; i++) {
    for (let j = i + 1; j < d.panels.length; j++) {
      const a = d.panels[i]
      const b = d.panels[j]
      const sharesCrease = d.creases.some(
        (c) => (c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id),
      )
      if (sharesCrease) continue
      if (boundsOverlap(boundsOf(a.points), boundsOf(b.points))) {
        items.push({ level: 'warn', text: `展开图上「${a.name}」与「${b.name}」包围盒重叠,请确认排版` })
      }
    }
  }

  // 孔洞出界
  for (const p of d.panels) {
    for (const h of p.holes) {
      const corners = [
        { x: h.cx - h.w / 2, y: h.cy - h.h / 2 },
        { x: h.cx + h.w / 2, y: h.cy + h.h / 2 },
      ]
      if (!corners.every((c) => pointInPolygon(c, p.points))) {
        items.push({ level: 'warn', text: `「${p.name}」上的孔洞超出面板轮廓` })
      }
    }
  }

  // 插舌未配对
  for (const p of d.panels) {
    if (p.tab && !p.tab.slotId) {
      items.push({ level: 'warn', text: `插舌「${p.name}」尚未配对插槽` })
    }
  }

  if (items.filter((i) => i.level === 'error').length === 0) {
    items.push({ level: 'ok', text: '无阻断项,可以出件' })
  }
  return items
}

export const hasBlocker = (items: CheckItem[]): boolean =>
  items.some((i) => i.level === 'error')
