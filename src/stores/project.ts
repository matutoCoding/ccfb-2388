import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { Crease, Dieline, Hole, Panel, Vec2 } from '@/core/types'
import { uid } from '@/core/types'
import { generateTuckBox } from '@/core/boxgen'
import { solveFold } from '@/core/fold'
import { detectCollisions } from '@/core/collision'
import { runChecks, hasBlocker } from '@/core/checks'
import { measureGaps, pairSlot, reshapeTab } from '@/core/slots'
import {
  getCurrentId,
  getProject,
  listProjects,
  removeProject,
  setCurrentId,
  upsertProject,
  type StoredProject,
  type Version,
} from '@/core/storage'

export type Tool = 'select' | 'panel' | 'hole' | 'crease'

export interface Selection {
  kind: 'panel' | 'crease' | 'slot' | null
  id: string | null
  vertex: number | null
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export const useProjectStore = defineStore('project', () => {
  const dieline = ref<Dieline>(generateTuckBox('未命名插舌盒', 120, 80, 40, 0.5))
  const projectId = ref<string>(uid('prj'))
  const versions = ref<Version[]>([])
  const savedAt = ref<number | null>(null)
  const selection = ref<Selection>({ kind: null, id: null, vertex: null })
  const tool = ref<Tool>('select')
  const progress = ref(1)
  const playing = ref(false)

  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])

  // 派生:折叠变换 / 穿插 / 出件检查,平立面联动都靠这条链
  const transforms = computed(() => solveFold(dieline.value, progress.value))
  const collisions = computed(() => detectCollisions(dieline.value, transforms.value))
  const checks = computed(() => runChecks(dieline.value, collisions.value))
  const blocked = computed(() => hasBlocker(checks.value))
  const gaps = computed(() => measureGaps(dieline.value))

  const snapshot = (): void => {
    undoStack.value.push(JSON.stringify(dieline.value))
    if (undoStack.value.length > 60) undoStack.value.shift()
    redoStack.value = []
  }

  // 所有结构性修改都走 commit,自动入撤销栈
  const commit = (fn: (d: Dieline) => void): void => {
    snapshot()
    fn(dieline.value)
  }

  // 拖动类操作:开始时打一次快照,过程中直接改
  const beginDrag = (): void => snapshot()

  const undo = (): void => {
    const prev = undoStack.value.pop()
    if (!prev) return
    redoStack.value.push(JSON.stringify(dieline.value))
    dieline.value = JSON.parse(prev) as Dieline
    selection.value = { kind: null, id: null, vertex: null }
  }

  const redo = (): void => {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(JSON.stringify(dieline.value))
    dieline.value = JSON.parse(next) as Dieline
    selection.value = { kind: null, id: null, vertex: null }
  }

  const select = (kind: Selection['kind'], id: string | null, vertex: number | null = null): void => {
    selection.value = { kind, id, vertex }
  }

  // 尺寸修改:重新生成盒型,面板不拉伸而是按新尺寸重建
  const regenerate = (L: number, W: number, H: number, thickness: number): void => {
    commit((d) => {
      const fresh = generateTuckBox(d.name, L, W, H, thickness)
      fresh.id = d.id
      dieline.value = fresh
    })
    selection.value = { kind: null, id: null, vertex: null }
  }

  const rename = (name: string): void => {
    commit((d) => {
      d.name = name
    })
  }

  const addPanel = (x: number, y: number, w: number, h: number): void => {
    commit((d) => {
      const p: Panel = {
        id: uid('p'),
        name: `面板${d.panels.length + 1}`,
        kind: 'face',
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        holes: [],
        tab: null,
      }
      d.panels.push(p)
    })
  }

  const deletePanel = (id: string): void => {
    commit((d) => {
      d.panels = d.panels.filter((p) => p.id !== id)
      d.creases = d.creases.filter((c) => c.a !== id && c.b !== id)
      d.slots = d.slots.filter((s) => s.panelId !== id)
      for (const p of d.panels) {
        if (p.tab && p.tab.slotId && !d.slots.find((s) => s.id === p.tab!.slotId)) {
          p.tab.slotId = null
        }
      }
      d.steps = d.steps
        .map((s) => s.filter((cid) => d.creases.find((c) => c.id === cid)))
        .filter((s) => s.length > 0)
      if (d.rootId === id && d.panels.length > 0) d.rootId = d.panels[0].id
    })
    selection.value = { kind: null, id: null, vertex: null }
  }

  const addHole = (panelId: string, hole: Omit<Hole, 'id'>): void => {
    commit((d) => {
      const p = d.panels.find((x) => x.id === panelId)
      if (p) p.holes.push({ ...hole, id: uid('h') })
    })
  }

  const deleteHole = (panelId: string, holeId: string): void => {
    commit((d) => {
      const p = d.panels.find((x) => x.id === panelId)
      if (p) p.holes = p.holes.filter((h) => h.id !== holeId)
    })
  }

  const addCrease = (a: string, b: string, p1: Vec2, p2: Vec2): void => {
    commit((d) => {
      const c: Crease = {
        id: uid('c'),
        a, b,
        p1: { ...p1 },
        p2: { ...p2 },
        dir: 'valley',
        angle: 90,
        group: '默认',
        comp: true,
      }
      d.creases.push(c)
      d.steps.push([c.id])
    })
  }

  const deleteCrease = (id: string): void => {
    commit((d) => {
      d.creases = d.creases.filter((c) => c.id !== id)
      d.steps = d.steps
        .map((s) => s.filter((cid) => cid !== id))
        .filter((s) => s.length > 0)
    })
    selection.value = { kind: null, id: null, vertex: null }
  }

  const setRoot = (id: string): void => {
    commit((d) => {
      d.rootId = id
    })
  }

  // 联动折角:同组压痕一起改
  const setGroupAngle = (group: string, angle: number): void => {
    commit((d) => {
      for (const c of d.creases) {
        if (c.group === group) c.angle = angle
      }
    })
  }

  const pairSlotTo = (tabPanelId: string, targetPanelId: string): void => {
    commit((d) => pairSlot(d, tabPanelId, targetPanelId))
  }

  const reshapeTabOf = (tabPanelId: string): void => {
    commit((d) => reshapeTab(d, tabPanelId))
  }

  const moveCreaseStep = (creaseId: string, dir: -1 | 1): void => {
    commit((d) => {
      const from = d.steps.findIndex((s) => s.includes(creaseId))
      if (from < 0) return
      const to = from + dir
      if (to < 0 || to >= d.steps.length) return
      d.steps[from] = d.steps[from].filter((id) => id !== creaseId)
      d.steps[to].push(creaseId)
      d.steps = d.steps.filter((s) => s.length > 0)
    })
  }

  // 浏览器存档
  const saveToBrowser = (): void => {
    const stored: StoredProject = {
      meta: { id: projectId.value, name: dieline.value.name, updatedAt: Date.now() },
      dieline: clone(dieline.value),
      versions: clone(versions.value),
    }
    upsertProject(stored)
    setCurrentId(projectId.value)
    savedAt.value = Date.now()
  }

  const openProject = (id: string): boolean => {
    const stored = getProject(id)
    if (!stored) return false
    projectId.value = stored.meta.id
    dieline.value = clone(stored.dieline)
    versions.value = clone(stored.versions)
    savedAt.value = stored.meta.updatedAt
    undoStack.value = []
    redoStack.value = []
    selection.value = { kind: null, id: null, vertex: null }
    setCurrentId(id)
    return true
  }

  const newProject = (name: string, L: number, W: number, H: number, thickness: number): void => {
    dieline.value = generateTuckBox(name, L, W, H, thickness)
    projectId.value = uid('prj')
    versions.value = []
    savedAt.value = null
    undoStack.value = []
    redoStack.value = []
    selection.value = { kind: null, id: null, vertex: null }
  }

  const deleteStoredProject = (id: string): void => {
    removeProject(id)
  }

  const saveVersion = (name: string): void => {
    versions.value.push({
      id: uid('ver'),
      name,
      time: Date.now(),
      data: clone(dieline.value),
    })
    saveToBrowser()
  }

  const restoreVersion = (versionId: string): void => {
    const v = versions.value.find((x) => x.id === versionId)
    if (!v) return
    snapshot()
    dieline.value = clone(v.data)
    selection.value = { kind: null, id: null, vertex: null }
  }

  // 启动:恢复上次工程,没有就生成默认插舌盒(打开即有)
  const init = (): void => {
    const id = getCurrentId()
    if (id && openProject(id)) return
    saveToBrowser()
  }

  return {
    dieline, projectId, versions, savedAt, selection, tool, progress, playing,
    transforms, collisions, checks, blocked, gaps,
    undoStack, redoStack,
    commit, beginDrag, undo, redo, select,
    regenerate, rename, addPanel, deletePanel, addHole, deleteHole,
    addCrease, deleteCrease, setRoot, setGroupAngle,
    pairSlotTo, reshapeTabOf, moveCreaseStep,
    saveToBrowser, openProject, newProject, deleteStoredProject,
    saveVersion, restoreVersion, init,
    listProjects,
  }
})
