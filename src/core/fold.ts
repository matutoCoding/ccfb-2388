import { Matrix4, Vector3 } from 'three'

import type { Crease, Dieline } from './types'
import { centroid } from './geom'

const DEG2RAD = Math.PI / 180

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

// 时间轴进度 p(0..1) 映射到每条压痕的局部折叠进度,按 steps 分步推进
export const creaseProgress = (d: Dieline, p: number): Map<string, number> => {
  const map = new Map<string, number>()
  const n = Math.max(1, d.steps.length)
  d.steps.forEach((step, i) => {
    const t = clamp01(p * n - i)
    for (const id of step) map.set(id, t)
  })
  return map
}

// 绕世界坐标任意轴旋转的矩阵
const rotateAbout = (point: Vector3, axis: Vector3, angle: number): Matrix4 =>
  new Matrix4().makeTranslation(point.x, point.y, point.z)
    .multiply(new Matrix4().makeRotationAxis(axis, angle))
    .multiply(new Matrix4().makeTranslation(-point.x, -point.y, -point.z))

// 刚性折叠求解:面板只旋转不形变,从根面 BFS 沿压痕传播变换
// 旋转在展开坐标系内定义再复合父面变换,等价于绕当前世界铰链轴旋转
export const solveFold = (d: Dieline, p: number): Map<string, Matrix4> => {
  const tmap = creaseProgress(d, p)
  const out = new Map<string, Matrix4>()
  const byId = new Map(d.panels.map((pl) => [pl.id, pl]))
  const adj = new Map<string, Crease[]>()
  for (const c of d.creases) {
    if (!adj.has(c.a)) adj.set(c.a, [])
    if (!adj.has(c.b)) adj.set(c.b, [])
    adj.get(c.a)!.push(c)
    adj.get(c.b)!.push(c)
  }

  out.set(d.rootId, new Matrix4())
  const queue = [d.rootId]
  while (queue.length > 0) {
    const pid = queue.shift()!
    const tp = out.get(pid)!
    const parentNormal = new Vector3(0, 0, 1).transformDirection(tp)
    for (const c of adj.get(pid) ?? []) {
      const childId = c.a === pid ? c.b : c.a
      if (out.has(childId)) continue
      const child = byId.get(childId)
      if (!child) continue
      const t = tmap.get(c.id) ?? 0

      // 铰链端点随父面到世界系
      const p1w = new Vector3(c.p1.x, c.p1.y, 0).applyMatrix4(tp)
      const p2w = new Vector3(c.p2.x, c.p2.y, 0).applyMatrix4(tp)
      // 纸厚补偿:铰链轴沿父面法向外移半纸厚,给纸层留出弯折空间
      if (c.comp) {
        const off = parentNormal.clone().multiplyScalar(d.thickness / 2)
        p1w.add(off)
        p2w.add(off)
      }
      const axis = p2w.clone().sub(p1w)
      if (axis.lengthSq() < 1e-9) {
        out.set(childId, tp.clone())
        queue.push(childId)
        continue
      }
      axis.normalize()

      // 山谷方向:取子面形心,试转小角看 z 向位移,谷折朝 +z
      const cen = centroid(child.points)
      const cw = new Vector3(cen.x, cen.y, 0).applyMatrix4(tp)
      const v = cw.clone().sub(p1w)
      const along = v.dot(axis)
      v.addScaledVector(axis, -along)
      const probe = v.clone().applyAxisAngle(axis, 0.01)
      const zUp = probe.z - v.z > 0 ? 1 : -1
      const dirSign = c.dir === 'valley' ? 1 : -1
      const angle = zUp * dirSign * t * c.angle * DEG2RAD

      const rot = rotateAbout(p1w, axis, angle)
      out.set(childId, rot.multiply(tp))
      queue.push(childId)
    }
  }
  return out
}

// 游离面板检测:没有压痕路径连到根面
export const orphanPanels = (d: Dieline): string[] => {
  const reached = new Set<string>([d.rootId])
  const queue = [d.rootId]
  while (queue.length > 0) {
    const pid = queue.shift()!
    for (const c of d.creases) {
      const other = c.a === pid ? c.b : c.b === pid ? c.a : null
      if (other && !reached.has(other)) {
        reached.add(other)
        queue.push(other)
      }
    }
  }
  return d.panels.filter((pl) => !reached.has(pl.id)).map((pl) => pl.id)
}
