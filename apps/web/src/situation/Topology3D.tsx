import { useEffect, useRef, useState } from 'react'
import {
  Scene,
  Color,
  Fog,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
  DoubleSide,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  CanvasTexture,
  BufferGeometry,
  Vector3,
  LineBasicMaterial,
  Line,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { SituationTopology } from '../api/situation-topology'

export function Topology3D({ graph }: { graph: SituationTopology }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true })
    } catch {
      setError(true)
      return
    }
    let active = true
    const scene = new Scene()
    scene.background = new Color(790052)
    scene.fog = new Fog(790052, 600, 60000)
    const camera = new PerspectiveCamera(
      100,
      element.clientWidth / element.clientHeight,
      1,
      100000,
    )
    camera.position.set(-100, 2000, 2000)
    camera.lookAt(0, 0, 0)
    renderer.setPixelRatio(window.devicePixelRatio)
    element.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.autoRotate = false
    const grid = new Group()
    const plane = new PlaneGeometry(60000, 60000, 150, 150)
    const wire = new MeshBasicMaterial({ color: 3356544, wireframe: true })
    const fill = new MeshBasicMaterial({
      color: 3356544,
      transparent: true,
      opacity: 0.2,
      side: DoubleSide,
    })
    grid.add(new Mesh(plane, wire), new Mesh(plane, fill))
    grid.rotation.x = Math.PI / 2
    grid.rotation.z = Math.PI / 4
    scene.add(grid)
    const textures: Texture[] = []
    const materials: SpriteMaterial[] = []
    const lines: Line[] = []
    const loader = new TextureLoader()
    const addSprite = (texture: Texture, x: number, y: number, z: number) => {
      const material = new SpriteMaterial({
        map: texture,
        depthTest: false,
        fog: false,
      })
      materials.push(material)
      const sprite = new Sprite(material)
      sprite.scale.set(150, 150, 1)
      sprite.position.set(x, z, y)
      scene.add(sprite)
    }
    for (const node of graph.nodes) {
      if (node.logo) {
        const texture = loader.load(node.logo, (texture) => {
          if (!active) texture.dispose()
          else texture.colorSpace = SRGBColorSpace
        })
        textures.push(texture)
        addSprite(texture, node.x, node.y, node.z)
      }
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 200
      const context = canvas.getContext('2d')!
      context.font = '60px Arial'
      context.fillStyle = 'white'
      context.fillText(node.name, 0, 100)
      const texture = new CanvasTexture(canvas)
      textures.push(texture)
      addSprite(texture, node.x, node.y, node.z - 100)
    }
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
    const lineMaterial = new LineBasicMaterial({ color: 2402012 })
    for (const edge of graph.links) {
      const source = nodes.get(edge.source)!,
        target = nodes.get(edge.target)!
      const geometry = new BufferGeometry().setFromPoints([
        new Vector3(source.x, source.z, source.y),
        new Vector3(target.x, target.z, target.y),
      ])
      const line = new Line(geometry, lineMaterial)
      scene.add(line)
      lines.push(line)
    }
    const resize = new ResizeObserver(() => {
      camera.aspect = element.clientWidth / element.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(element.clientWidth, element.clientHeight)
    })
    resize.observe(element)
    renderer.setSize(element.clientWidth, element.clientHeight)
    let frame = 0
    const render = () => {
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()
    return () => {
      active = false
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.dispose()
      textures.forEach((texture) => texture.dispose())
      materials.forEach((material) => material.dispose())
      lines.forEach((line) => line.geometry.dispose())
      lineMaterial.dispose()
      plane.dispose()
      wire.dispose()
      fill.dispose()
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [graph])
  return (
    <div className="situation-3d" role="img" aria-label="防御3D拓扑" ref={ref}>
      {error ? <p role="alert">3D 拓扑不可用</p> : null}
    </div>
  )
}
