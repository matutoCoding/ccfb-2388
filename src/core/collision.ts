import { Matrix4, Vector3 } from 'three'

import type { Collision, Dieline, Vec2 } from './types'

interface OBB {
  c: Vector3
  u: [Vector3, Vector3, Vector3]
  e: [number, number, number]
}

// 面板变换后的有向包围盒:面内两轴取首边方向与其法向,第三轴为面法向(半厚)
const panelOBB = (points: Vec2[], m: Matrix4, thickness: number): OBB | null => {
  const pts = points.map((p) => new Vector3(p.x, p.y, 0).applyMatrix4(m))
  if (pts.length < 3) return null
  const u0 = pts[1].clone().sub(pts[0])
  if (u0.lengthSq() < 1e-12) return null
  u0.normalize()
  const normal = new Vector3()
  for (let i = 0; i < pts.length; i++) {
    const e1 = pts[(i + 1) % pts.length].clone().sub(pts[i])
    const e2 = pts[(i + 2) % pts.length].clone().sub(pts[(i + 1) % pts.length])
    normal.add(e1.cross(e2))
  }
  if (normal.lengthSq() < 1e-12) return null
  normal.normalize()
  const u2 = new Vector3().crossVectors(normal, u0).normalize()

  const proj = (axis: Vector3): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of pts) {
      const d = p.dot(axis)
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    }
    return [lo, hi]
  }
  const [a0, b0] = proj(u0)
  const [a1, b1] = proj(normal)
  const [a2, b2] = proj(u2)
  const halfT = Math.max((b1 - a1) / 2, thickness / 2, 0.01)
  const c = u0.clone().multiplyScalar((a0 + b0) / 2)
    .addScaledVector(u2, (a2 + b2) / 2)
    .addScaledVector(normal, (a1 + b1) / 2)
  return {
    c,
    u: [u0, normal, u2],
    e: [(b0 - a0) / 2, halfT, (b2 - a2) / 2],
  }
}

// OBB 分离轴测试,返回最小穿透深度;分离时返回 -1
const obbPenetration = (a: OBB, b: OBB): number => {
  const t = b.c.clone().sub(a.c)
  let minOverlap = Infinity
  const test = (axis: Vector3): boolean => {
    const l = axis.lengthSq()
    if (l < 1e-10) return true
    const n = axis.clone().normalize()
    const ra =
      a.e[0] * Math.abs(a.u[0].dot(n)) +
      a.e[1] * Math.abs(a.u[1].dot(n)) +
      a.e[2] * Math.abs(a.u[2].dot(n))
    const rb =
      b.e[0] * Math.abs(b.u[0].dot(n)) +
      b.e[1] * Math.abs(b.u[1].dot(n)) +
      b.e[2] * Math.abs(b.u[2].dot(n))
    const dist = Math.abs(t.dot(n))
    const overlap = ra + rb - dist
    if (overlap < 0) return false
    minOverlap = Math.min(minOverlap, overlap)
    return true
  }
  for (let i = 0; i < 3; i++) {
    if (!test(a.u[i])) return -1
    if (!test(b.u[i])) return -1
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (!test(new Vector3().crossVectors(a.u[i], b.u[j]))) return -1
    }
  }
  return minOverlap
}

// 穿插检测:共享压痕的面板跳过(铰链处必然相接)
// 接触不算穿插:穿透深度须超过纸厚才记为冲突
export const detectCollisions = (
  d: Dieline,
  transforms: Map<string, Matrix4>,
): Collision[] => {
  const linked = new Set<string>()
  for (const c of d.creases) {
    linked.add(`${c.a}|${c.b}`)
    linked.add(`${c.b}|${c.a}`)
  }
  const obbs = new Map<string, OBB>()
  for (const p of d.panels) {
    const m = transforms.get(p.id)
    if (!m) continue
    const obb = panelOBB(p.points, m, d.thickness)
    if (obb) obbs.set(p.id, obb)
  }
  const tol = Math.max(d.thickness, 0.05)
  const out: Collision[] = []
  const ids = [...obbs.keys()]
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]
      const b = ids[j]
      if (linked.has(`${a}|${b}`)) continue
      const depth = obbPenetration(obbs.get(a)!, obbs.get(b)!)
      if (depth > tol) out.push({ a, b, depth })
    }
  }
  return out.sort((x, y) => y.depth - x.depth)
}
