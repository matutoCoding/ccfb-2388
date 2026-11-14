import type { Crease, Dieline, Panel, Slot } from './types'
import { uid } from './types'
import { ensureCCW, v2 } from './geom'

// 标准插舌盒(直插式):四个筒身面板 + 糊口,上下各一对防尘翼 + 插舌盖
// 布局: 前(L) 右(W) 后(L) 左(W) 糊口(g) 横向排开,盖翼在上下两侧
export const generateTuckBox = (
  name: string,
  L: number,
  W: number,
  H: number,
  thickness: number,
): Dieline => {
  const g = 15
  const fd = Math.max(8, W * 0.35)
  const td = Math.max(12, W * 0.75)
  const sh = Math.min(8, L * 0.15)
  const taper = 1.5

  const x0 = 0
  const x1 = L
  const x2 = L + W
  const x3 = 2 * L + W
  const x4 = 2 * L + 2 * W
  const x5 = x4 + g

  const panel = (
    id: string,
    pname: string,
    kind: Panel['kind'],
    pts: [number, number][],
  ): Panel => ({
    id,
    name: pname,
    kind,
    points: ensureCCW(pts.map(([x, y]) => v2(x, y))),
    holes: [],
    tab: null,
  })

  const front = panel('p_front', '前面', 'face', [[x0, 0], [x1, 0], [x1, H], [x0, H]])
  const right = panel('p_right', '右侧', 'face', [[x1, 0], [x2, 0], [x2, H], [x1, H]])
  const back = panel('p_back', '后面', 'face', [[x2, 0], [x3, 0], [x3, H], [x2, H]])
  const left = panel('p_left', '左侧', 'face', [[x3, 0], [x4, 0], [x4, H], [x3, H]])
  const glue = panel('p_glue', '糊口', 'glue', [[x4, 3], [x5, 0], [x5, H], [x4, H - 3]])

  const dustRT = panel('p_dust_rt', '右上防尘翼', 'flap', [
    [x1, H], [x2, H], [x2 - taper, H + fd], [x1 + taper, H + fd],
  ])
  const dustLT = panel('p_dust_lt', '左上防尘翼', 'flap', [
    [x3, H], [x4, H], [x4 - taper, H + fd], [x3 + taper, H + fd],
  ])
  const dustRB = panel('p_dust_rb', '右下防尘翼', 'flap', [
    [x2, 0], [x1, 0], [x1 + taper, -fd], [x2 - taper, -fd],
  ])
  const dustLB = panel('p_dust_lb', '左下防尘翼', 'flap', [
    [x4, 0], [x3, 0], [x3 + taper, -fd], [x4 - taper, -fd],
  ])

  const tipW = L - 2 * sh
  const tuckT = panel('p_tuck_t', '上插舌盖', 'tab', [
    [x2, H], [x3, H], [x3, H + td * 0.55], [x3 - sh, H + td], [x2 + sh, H + td], [x2, H + td * 0.55],
  ])
  const tuckB = panel('p_tuck_b', '下插舌盖', 'tab', [
    [x1, 0], [x0, 0], [x0, -td * 0.55], [x0 + sh, -td], [x1 - sh, -td], [x1, -td * 0.55],
  ])

  // 槽口朝面板内侧开:上槽边反向取,使垂直分量指向面板内部
  const slotT: Slot = {
    id: 'slot_t', panelId: front.id,
    edge: [v2(x1, H), v2(x0, H)], t: 0.5, width: tipW + 2, depth: 4,
  }
  const slotB: Slot = {
    id: 'slot_b', panelId: back.id,
    edge: [v2(x2, 0), v2(x3, 0)], t: 0.5, width: tipW + 2, depth: 4,
  }
  tuckT.tab = { tipWidth: tipW, shoulder: sh, length: td, slotId: slotT.id }
  tuckB.tab = { tipWidth: tipW, shoulder: sh, length: td, slotId: slotB.id }

  const crease = (
    id: string,
    a: string,
    b: string,
    p1: [number, number],
    p2: [number, number],
    group: string,
  ): Crease => ({
    id, a, b,
    p1: v2(p1[0], p1[1]),
    p2: v2(p2[0], p2[1]),
    dir: 'valley',
    angle: 90,
    group,
    comp: true,
  })

  const creases: Crease[] = [
    crease('c_g1', front.id, right.id, [x1, 0], [x1, H], '筒身'),
    crease('c_g2', right.id, back.id, [x2, 0], [x2, H], '筒身'),
    crease('c_g3', back.id, left.id, [x3, 0], [x3, H], '筒身'),
    crease('c_g4', left.id, glue.id, [x4, 0], [x4, H], '筒身'),
    crease('c_t1', back.id, tuckT.id, [x2, H], [x3, H], '上盖'),
    crease('c_t2', right.id, dustRT.id, [x1, H], [x2, H], '上盖'),
    crease('c_t3', left.id, dustLT.id, [x3, H], [x4, H], '上盖'),
    crease('c_b1', front.id, tuckB.id, [x0, 0], [x1, 0], '下盖'),
    crease('c_b2', right.id, dustRB.id, [x1, 0], [x2, 0], '下盖'),
    crease('c_b3', left.id, dustLB.id, [x3, 0], [x4, 0], '下盖'),
  ]

  return {
    id: uid('dl'),
    name,
    thickness,
    dims: { L, W, H },
    panels: [front, right, back, left, glue, dustRT, dustLT, dustRB, dustLB, tuckT, tuckB],
    creases,
    slots: [slotT, slotB],
    rootId: front.id,
    steps: [
      ['c_g1', 'c_g2', 'c_g3', 'c_g4'],
      ['c_t2', 'c_t3', 'c_b2', 'c_b3'],
      ['c_t1', 'c_b1'],
    ],
  }
}
