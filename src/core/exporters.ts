import { Matrix4, Shape, ShapeUtils, Vector2, Vector3 } from 'three'

import type { Dieline } from './types'
import { boundsOf } from './geom'
import { slotPolygon } from './slots'

const fmt = (n: number): string => n.toFixed(3)

// SVG 刀版导出:红色切线、蓝色虚线压痕、绿色插槽,单位 mm
export const dielineSVG = (d: Dieline): string => {
  const all = d.panels.flatMap((p) => p.points)
  const b = boundsOf(all)
  const pad = 10
  const w = b.maxX - b.minX + pad * 2
  const h = b.maxY - b.minY + pad * 2
  const tx = (x: number): number => x - b.minX + pad
  const ty = (y: number): number => b.maxY - y + pad

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" ` +
    `viewBox="0 0 ${fmt(w)} ${fmt(h)}">`,
  )
  parts.push(`<rect width="${fmt(w)}" height="${fmt(h)}" fill="#ffffff"/>`)

  for (const p of d.panels) {
    const pts = p.points.map((q) => `${fmt(tx(q.x))},${fmt(ty(q.y))}`).join(' ')
    parts.push(`<polygon points="${pts}" fill="none" stroke="#d4202c" stroke-width="0.3"/>`)
    for (const hole of p.holes) {
      if (hole.shape === 'circle') {
        parts.push(
          `<circle cx="${fmt(tx(hole.cx))}" cy="${fmt(ty(hole.cy))}" r="${fmt(hole.w / 2)}" ` +
          `fill="none" stroke="#d4202c" stroke-width="0.3"/>`,
        )
      } else {
        const x = tx(hole.cx - hole.w / 2)
        const y = ty(hole.cy + hole.h / 2)
        parts.push(
          `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(hole.w)}" height="${fmt(hole.h)}" ` +
          `fill="none" stroke="#d4202c" stroke-width="0.3"/>`,
        )
      }
    }
  }
  for (const s of d.slots) {
    const pts = slotPolygon(s).map((q) => `${fmt(tx(q.x))},${fmt(ty(q.y))}`).join(' ')
    parts.push(`<polygon points="${pts}" fill="none" stroke="#1a9e4b" stroke-width="0.3"/>`)
  }
  for (const c of d.creases) {
    parts.push(
      `<line x1="${fmt(tx(c.p1.x))}" y1="${fmt(ty(c.p1.y))}" x2="${fmt(tx(c.p2.x))}" y2="${fmt(ty(c.p2.y))}" ` +
      `stroke="#2050d4" stroke-width="0.2" stroke-dasharray="3,2"/>`,
    )
  }
  parts.push('</svg>')
  return parts.join('\n')
}

// OBJ 三维导出:面板按当前折叠姿态挤出纸厚,含孔洞三角化
export const dielineOBJ = (d: Dieline, transforms: Map<string, Matrix4>): string => {
  const lines: string[] = ['# foldbench obj export']
  let vBase = 1
  const half = d.thickness / 2

  for (const p of d.panels) {
    const m = transforms.get(p.id)
    if (!m) continue
    lines.push(`o ${p.name}`)

    const contour = p.points.map((q) => new Vector2(q.x, q.y))
    const holes = p.holes.map((h) => {
      const path = new Shape()
      if (h.shape === 'circle') {
        path.absarc(h.cx, h.cy, h.w / 2, 0, Math.PI * 2, true)
      } else {
        path.moveTo(h.cx - h.w / 2, h.cy - h.h / 2)
        path.lineTo(h.cx + h.w / 2, h.cy - h.h / 2)
        path.lineTo(h.cx + h.w / 2, h.cy + h.h / 2)
        path.lineTo(h.cx - h.w / 2, h.cy + h.h / 2)
      }
      return path.getPoints(8)
    })
    const tris = ShapeUtils.triangulateShape(contour, holes)

    const emit = (x: number, y: number, z: number): number => {
      const v = new Vector3(x, y, z).applyMatrix4(m)
      lines.push(`v ${fmt(v.x)} ${fmt(v.y)} ${fmt(v.z)}`)
      return vBase++
    }

    // 正反两面三角
    for (const tri of tris) {
      const top = tri.map((q) => emit(q.x, q.y, half))
      lines.push(`f ${top.join(' ')}`)
      const bot = tri.map((q) => emit(q.x, q.y, -half))
      lines.push(`f ${bot[2]} ${bot[1]} ${bot[0]}`)
    }
    // 外轮廓侧壁
    const ring = p.points
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const bq = ring[(i + 1) % ring.length]
      const f = [emit(a.x, a.y, half), emit(bq.x, bq.y, half), emit(bq.x, bq.y, -half), emit(a.x, a.y, -half)]
      lines.push(`f ${f.join(' ')}`)
    }
  }
  return lines.join('\n')
}

export const downloadText = (filename: string, content: string, mime: string): void => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
