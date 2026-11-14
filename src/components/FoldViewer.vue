<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { useProjectStore } from '@/stores/project'
import { makePanelTexture } from '@/core/texture'
import { boundsOf } from '@/core/geom'

const props = defineProps<{ side: 'in' | 'out' }>()

const store = useProjectStore()
const host = ref<HTMLDivElement | null>(null)

let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let resizeObs: ResizeObserver | null = null
let raf = 0
const meshes = new Map<string, Mesh>()
const materials = new Map<string, MeshStandardMaterial[]>()

const disposeAll = (): void => {
  for (const m of meshes.values()) {
    m.geometry.dispose()
    scene?.remove(m)
  }
  for (const mats of materials.values()) {
    for (const m of mats) {
      m.map?.dispose()
      m.dispose()
    }
  }
  meshes.clear()
  materials.clear()
}

const rebuild = (): void => {
  if (!scene) return
  disposeAll()
  const d = store.dieline
  const tex = makePanelTexture(d, props.side)
  for (const p of d.panels) {
    const shape = new Shape()
    p.points.forEach((q, i) => (i === 0 ? shape.moveTo(q.x, q.y) : shape.lineTo(q.x, q.y)))
    for (const h of p.holes) {
      const path = new Shape()
      if (h.shape === 'circle') {
        path.absarc(h.cx, h.cy, h.w / 2, 0, Math.PI * 2, true)
      } else {
        path.moveTo(h.cx - h.w / 2, h.cy - h.h / 2)
        path.lineTo(h.cx + h.w / 2, h.cy - h.h / 2)
        path.lineTo(h.cx + h.w / 2, h.cy + h.h / 2)
        path.lineTo(h.cx - h.w / 2, h.cy + h.h / 2)
      }
      shape.holes.push(path)
    }
    const geo = new ExtrudeGeometry(shape, { depth: d.thickness, bevelEnabled: false })
    geo.translate(0, 0, -d.thickness / 2)
    const cap = new MeshStandardMaterial({ map: tex, roughness: 0.85, side: DoubleSide })
    const wall = new MeshStandardMaterial({ color: new Color('#b9a582'), roughness: 0.9 })
    const mesh = new Mesh(geo, [cap, wall])
    mesh.matrixAutoUpdate = false
    materials.set(p.id, [cap, wall])
    meshes.set(p.id, mesh)
    scene.add(mesh)
  }
  applyTransforms()
}

const applyTransforms = (): void => {
  for (const [id, mesh] of meshes) {
    const m = store.transforms.get(id)
    if (m) {
      mesh.matrix.copy(m)
      mesh.matrixWorldNeedsUpdate = true
    }
  }
}

const applyCollisionTint = (): void => {
  const hit = new Set<string>()
  for (const c of store.collisions) {
    hit.add(c.a)
    hit.add(c.b)
  }
  for (const [id, mats] of materials) {
    for (const m of mats) m.emissive.set(hit.has(id) ? '#7a1010' : '#000000')
  }
}

const fitCamera = (): void => {
  if (!camera || !controls) return
  const all = store.dieline.panels.flatMap((p) => p.points)
  if (all.length === 0) return
  const b = boundsOf(all)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY)
  camera.position.set(cx + diag * 0.6, cy - diag * 0.7, diag * 0.9)
  controls.target.set(cx, cy, 0)
  controls.update()
}

const loop = (): void => {
  raf = requestAnimationFrame(loop)
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

onMounted(() => {
  const el = host.value!
  renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  el.appendChild(renderer.domElement)
  scene = new Scene()
  scene.background = new Color('#f6f7f9')
  camera = new PerspectiveCamera(45, 1, 0.1, 10000)
  controls = new OrbitControls(camera, renderer.domElement)
  scene.add(new AmbientLight(0xffffff, 0.75))
  const sun = new DirectionalLight(0xffffff, 1.4)
  sun.position.set(200, -150, 400)
  scene.add(sun)
  const grid = new GridHelper(1000, 50, 0xd0d5dd, 0xe8ebf0)
  grid.rotation.x = Math.PI / 2
  grid.position.z = -store.dieline.thickness
  scene.add(grid)

  const resize = (): void => {
    const w = el.clientWidth
    const h = el.clientHeight
    renderer!.setSize(w, h)
    camera!.aspect = w / Math.max(1, h)
    camera!.updateProjectionMatrix()
  }
  resizeObs = new ResizeObserver(resize)
  resizeObs.observe(el)
  resize()
  rebuild()
  fitCamera()
  loop()
})

watch(() => store.dieline, () => { rebuild(); applyCollisionTint() }, { deep: true })
watch(() => store.transforms, applyTransforms)
watch(() => store.collisions, applyCollisionTint)
watch(() => props.side, rebuild)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObs?.disconnect()
  disposeAll()
  controls?.dispose()
  renderer?.dispose()
})

defineExpose({ fitCamera })
</script>

<template>
  <div ref="host" class="fold-viewer" />
</template>

<style scoped>
.fold-viewer {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
