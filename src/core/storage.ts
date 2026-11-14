import type { Dieline } from './types'

const LIST_KEY = 'foldbench.projects.v1'
const CURRENT_KEY = 'foldbench.current.v1'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

export interface Version {
  id: string
  name: string
  time: number
  data: Dieline
}

export interface StoredProject {
  meta: ProjectMeta
  dieline: Dieline
  versions: Version[]
}

const readAll = (): StoredProject[] => {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    return raw ? (JSON.parse(raw) as StoredProject[]) : []
  } catch {
    return []
  }
}

const writeAll = (list: StoredProject[]): void => {
  localStorage.setItem(LIST_KEY, JSON.stringify(list))
}

export const listProjects = (): StoredProject[] =>
  readAll().sort((a, b) => b.meta.updatedAt - a.meta.updatedAt)

export const getProject = (id: string): StoredProject | null =>
  readAll().find((p) => p.meta.id === id) ?? null

export const upsertProject = (p: StoredProject): void => {
  const list = readAll()
  const i = list.findIndex((x) => x.meta.id === p.meta.id)
  if (i >= 0) list[i] = p
  else list.push(p)
  writeAll(list)
}

export const removeProject = (id: string): void => {
  writeAll(readAll().filter((p) => p.meta.id !== id))
}

export const setCurrentId = (id: string): void => {
  localStorage.setItem(CURRENT_KEY, id)
}

export const getCurrentId = (): string | null => localStorage.getItem(CURRENT_KEY)

// 版本对照:列出两个版本之间的关键差异
export const diffDielines = (a: Dieline, b: Dieline): string[] => {
  const out: string[] = []
  if (a.name !== b.name) out.push(`名称:「${a.name}」→「${b.name}」`)
  const da = a.dims
  const db = b.dims
  if (da.L !== db.L || da.W !== db.W || da.H !== db.H) {
    out.push(`尺寸: ${da.L}×${da.W}×${da.H} → ${db.L}×${db.W}×${db.H}`)
  }
  if (a.thickness !== b.thickness) out.push(`纸厚: ${a.thickness} → ${b.thickness}mm`)
  if (a.panels.length !== b.panels.length) {
    out.push(`面板数: ${a.panels.length} → ${b.panels.length}`)
  }
  if (a.creases.length !== b.creases.length) {
    out.push(`压痕数: ${a.creases.length} → ${b.creases.length}`)
  }
  if (a.slots.length !== b.slots.length) {
    out.push(`插槽数: ${a.slots.length} → ${b.slots.length}`)
  }
  const holesOf = (d: Dieline): number => d.panels.reduce((n, p) => n + p.holes.length, 0)
  if (holesOf(a) !== holesOf(b)) out.push(`孔洞数: ${holesOf(a)} → ${holesOf(b)}`)
  for (const pb of b.panels) {
    const pa = a.panels.find((p) => p.id === pb.id)
    if (!pa) {
      out.push(`新增面板「${pb.name}」`)
      continue
    }
    if (pa.points.length !== pb.points.length) {
      out.push(`面板「${pb.name}」轮廓顶点 ${pa.points.length} → ${pb.points.length}`)
    }
    if (pa.tab && pb.tab && pa.tab.tipWidth !== pb.tab.tipWidth) {
      out.push(`插舌「${pb.name}」舌宽 ${pa.tab.tipWidth} → ${pb.tab.tipWidth}`)
    }
  }
  for (const pa of a.panels) {
    if (!b.panels.find((p) => p.id === pa.id)) out.push(`删除面板「${pa.name}」`)
  }
  for (const sb of b.slots) {
    const sa = a.slots.find((s) => s.id === sb.id)
    if (sa && sa.width !== sb.width) {
      out.push(`插槽宽度 ${sa.width} → ${sb.width}mm`)
    }
  }
  if (out.length === 0) out.push('两个版本没有关键差异')
  return out
}
