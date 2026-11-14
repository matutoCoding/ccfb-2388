import type { Vec2 } from './types'

export const v2 = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const mid = (a: Vec2, b: Vec2): Vec2 => scale(add(a, b), 0.5)
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))
export const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l < 1e-9 ? { x: 0, y: 0 } : scale(a, 1 / l)
}
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })

export const signedArea = (pts: Vec2[]): number => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

// 统一为逆时针,三角化和法向计算都依赖这个约定
export const ensureCCW = (pts: Vec2[]): Vec2[] =>
  signedArea(pts) < 0 ? [...pts].reverse() : pts

export const centroid = (pts: Vec2[]): Vec2 => {
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  return { x: cx / pts.length, y: cy / pts.length }
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const boundsOf = (pts: Vec2[]): Bounds => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

export const boundsOverlap = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY

export const pointInPolygon = (p: Vec2, pts: Vec2[]): boolean => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    const hit =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (hit) inside = !inside
  }
  return inside
}

// 点到线段最近点
export const closestOnSegment = (p: Vec2, a: Vec2, b: Vec2): Vec2 => {
  const ab = sub(b, a)
  const denom = ab.x * ab.x + ab.y * ab.y
  if (denom < 1e-12) return { ...a }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / denom))
  return { x: a.x + ab.x * t, y: a.y + ab.y * t }
}

export const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number =>
  dist(p, closestOnSegment(p, a, b))

// 轮廓吸附:在候选点里找容差内最近的,否则吸附 1mm 网格
export const snapPoint = (p: Vec2, candidates: Vec2[], tol: number): Vec2 => {
  let best: Vec2 | null = null
  let bestD = tol
  for (const c of candidates) {
    const d = dist(p, c)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  if (best) return { ...best }
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

export const translatePoints = (pts: Vec2[], dx: number, dy: number): Vec2[] =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))

// 两条边是否重合(端点容差内,允许反向)
export const edgesCoincident = (
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
  tol: number,
): boolean =>
  (dist(a1, b1) < tol && dist(a2, b2) < tol) ||
  (dist(a1, b2) < tol && dist(a2, b1) < tol)
