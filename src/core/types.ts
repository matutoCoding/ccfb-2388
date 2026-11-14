// 刀版核心数据模型,单位统一 mm,展开图坐标 y 向上
export interface Vec2 {
  x: number
  y: number
}

export type PanelKind = 'face' | 'flap' | 'tab' | 'glue'

// 插舌参数,仅 kind === 'tab' 的面板携带
export interface TabParams {
  tipWidth: number
  shoulder: number
  length: number
  slotId: string | null
}

// 孔洞用参数化矩形/圆,便于编辑
export interface Hole {
  id: string
  shape: 'rect' | 'circle'
  cx: number
  cy: number
  w: number
  h: number
}

export interface Panel {
  id: string
  name: string
  kind: PanelKind
  points: Vec2[]
  holes: Hole[]
  tab: TabParams | null
}

// 插槽,挂在某面板的一条边上
export interface Slot {
  id: string
  panelId: string
  edge: [Vec2, Vec2]
  t: number
  width: number
  depth: number
}

export type FoldDir = 'mountain' | 'valley'

export interface Crease {
  id: string
  a: string
  b: string
  p1: Vec2
  p2: Vec2
  dir: FoldDir
  angle: number
  group: string
  comp: boolean
}

export interface Dieline {
  id: string
  name: string
  thickness: number
  dims: { L: number; W: number; H: number }
  panels: Panel[]
  creases: Crease[]
  slots: Slot[]
  rootId: string
  steps: string[][]
}

export interface Collision {
  a: string
  b: string
  depth: number
}

export interface CheckItem {
  level: 'error' | 'warn' | 'ok'
  text: string
}

export const uid = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}`
