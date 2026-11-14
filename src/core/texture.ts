import { CanvasTexture, SRGBColorSpace } from 'three'

import type { Dieline } from './types'
import { boundsOf } from './geom'

// 程序化生成内/外纹理:按展开图坐标绘制,3D 面板 UV 与刀版对齐
export const makePanelTexture = (d: Dieline, side: 'in' | 'out'): CanvasTexture => {
  const all = d.panels.flatMap((p) => p.points)
  const b = boundsOf(all)
  const w = Math.max(1, b.maxX - b.minX)
  const h = Math.max(1, b.maxY - b.minY)
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const sx = size / w
  const sy = size / h
  const px = (x: number): number => (x - b.minX) * sx
  // flipY=false 时 v=0 对应画布首行,这里不做 y 翻转保持采样一致
  const py = (y: number): number => (y - b.minY) * sy

  if (side === 'out') {
    // 印刷面:浅色底 + 定位网格 + 面板名
    ctx.fillStyle = '#f4efe6'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(180, 160, 120, 0.25)'
    ctx.lineWidth = 1
    const grid = Math.max(4, 10 * sx)
    for (let x = 0; x < size; x += grid) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size)
      ctx.stroke()
    }
    for (let y = 0; y < size; y += grid) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(120, 90, 50, 0.6)'
    ctx.font = `${Math.max(10, 5 * sx)}px sans-serif`
    ctx.textAlign = 'center'
    for (const p of d.panels) {
      const pb = boundsOf(p.points)
      ctx.fillText(p.name, px((pb.minX + pb.maxX) / 2), py((pb.minY + pb.maxY) / 2))
    }
  } else {
    // 内衬面:牛皮纸色 + 纤维丝
    ctx.fillStyle = '#c9a878'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(100, 75, 45, 0.18)'
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 6)
      ctx.stroke()
    }
  }

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.flipY = false
  // UV 由展开坐标直接给出,这里把坐标范围归一到 0..1
  tex.repeat.set(1 / w, 1 / h)
  tex.offset.set(-b.minX / w, -b.minY / h)
  return tex
}
