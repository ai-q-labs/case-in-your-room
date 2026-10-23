import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {CaseRoomClue} from "./CaseRoomClue"
import {addVisual, DEG, glowMaterial, MeshKit, setGlow, yawQuat} from "./CaseRoomMeshes"
import {CaseRoomStandIn} from "./CaseRoomStandIn"

/** How the model is drawn. */
export interface ModelLayout {
  /** How far straight ahead of the eyes the model's centre stands, in cm. */
  distanceCm: number
  /** The model's floor is tilted toward the player so it is seen as from this many degrees above. */
  lookDownDeg: number
  /** Share of the view (edge to edge) the model may use to the left, right and top. */
  fill: number
  /** Lowest the model may reach, in degrees below a level gaze (the captions sit below this). */
  bottomDeg: number
  /** Each clue's copy is drawn at least this big (cm, at the room's scale), so it can be told apart. */
  clueMinCm: number
}

/** The room the model copies. */
export interface ModelRoom {
  /** The room's frame (CrimeScene: floor at y = 0); the model copies everything in it. */
  frame: SceneObject
  standIns: CaseRoomStandIn[]
  /** The clues, in the order the figure visits them. */
  clues: CaseRoomClue[]
  /** Where the player stands (world, on the floor) and the flat direction they face. */
  playerFloor: vec3
  playerFacing: vec3
  /** Where the figure starts (world, on the floor). */
  walkStart: vec3
}

interface Copy {
  glow: Material
  color: vec3
  flash: number
  visited: boolean
}

/**
 * CaseRoomReplayModel — the room in miniature, straight ahead of the player, while the culprit's figure
 * walks the real room: the stand-in furniture (see-through), the 5 clues where they lie, a marker where the
 * player stands, and a small figure that walks the same path, in the same order, at the same moments as the
 * real one (it copies the real figure's place every frame), leaving the same footprints. Each clue's copy
 * lights up together with the real clue. The model keeps the room's own directions (what is ahead of the
 * player is at its far side), its floor is tilted toward the player so it is seen from above while they look
 * straight ahead, and it is sized to fit the view above the captions.
 *
 * Helper owned by CaseRoomReplay (not a component). ReplayModel stands at the model's centre (tilted and
 * scaled); its child ModelRoom holds everything in the room's own frame.
 * SceneObject names (tests find them): ReplayModel, ModelRoom, ModelBase, ModelFurniture_<stand-in name>,
 * ModelClue_<clue id>, ModelPlayer, ModelFigure, ModelTrail.
 */
export class CaseRoomReplayModel {
  private root: SceneObject = null
  private room: SceneObject = null
  private trail: SceneObject = null
  private figure: SceneObject = null
  private roomInv: mat4 = null
  private roomRotInv: quat = null
  private copies: Copy[] = []
  private size = 1

  constructor(
    private readonly parent: SceneObject,
    private readonly figureMesh: RenderMesh,
    private readonly footMesh: RenderMesh,
    private readonly figureColor: vec3,
    private readonly footColor: vec3,
  ) {}

  /** The model's scale (model cm per room cm). */
  get scale(): number {
    return this.size
  }

  get shown(): boolean {
    return this.root !== null
  }

  /** Build the model in front of `eye` (a player facing the flat direction `fwd`, seeing through `cam`). */
  show(room: ModelRoom, eye: vec3, fwd: vec3, cam: Camera, layout: ModelLayout): void {
    this.clear()
    const roomT = room.frame.getTransform()
    this.roomInv = roomT.getInvertedWorldTransform()
    this.roomRotInv = roomT.getWorldRotation().invert()
    const toRoom = (p: vec3) => this.roomInv.multiplyPoint(p)

    // What the model has to hold, in the room's frame: furniture, clues, the player, the figure's start.
    let lo = new vec3(1e9, 0, 1e9) // a vec3 cannot hold Infinity (it reads back as 0)
    let hi = new vec3(-1e9, 168, -1e9) // the figure's height
    const grow = (p: vec3) => {
      lo = new vec3(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z))
      hi = new vec3(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z))
    }
    for (const s of room.standIns) {
      for (const b of s.worldBoxes()) {
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            for (const sz of [-1, 1]) {
              grow(toRoom(b.center.add(b.axes[0].uniformScale(sx * b.half.x)).add(b.axes[1].uniformScale(sy * b.half.y)).add(b.axes[2].uniformScale(sz * b.half.z))))
            }
      }
    }
    for (const c of room.clues) for (const p of c.worldCorners()) grow(toRoom(p))
    grow(toRoom(room.playerFloor))
    grow(toRoom(room.walkStart))
    const margin = 25
    lo = new vec3(lo.x - margin, 0, lo.z - margin)
    hi = new vec3(hi.x + margin, hi.y, hi.z + margin)
    const center = new vec3((lo.x + hi.x) / 2, 0, (lo.z + hi.z) / 2)

    // Fit: the 8 corners of that box, seen by a player looking level along fwd, inside the window.
    const right = new vec3(-fwd.z, 0, fwd.x)
    const up = vec3.up()
    const tanV = Math.tan(cam.fov / 2)
    const tanH = tanV * cam.aspect
    const yLow = Math.tan(layout.bottomDeg * DEG) / tanV
    const corners: vec3[] = []
    for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) corners.push(new vec3(x, y, z))
    const roomRot = roomT.getWorldRotation()
    let s = 1 / 20
    let h = 0
    let w = 0
    let rot = roomRot
    let pos = eye
    const place = () => {
      pos = eye.add(fwd.uniformScale(layout.distanceCm)).add(up.uniformScale(h)).add(right.uniformScale(w))
      // Tilt the floor toward the player so that, seen from the eyes, it looks lookDownDeg from above.
      const toCenter = pos.sub(eye).normalize()
      const below = Math.asin(Math.max(-1, Math.min(1, -toCenter.y))) / DEG
      const tilt = (layout.lookDownDeg - below) * DEG
      const n = up.uniformScale(Math.cos(tilt)).sub(fwd.uniformScale(Math.sin(tilt)))
      rot = quat.rotationFromTo(up, n).multiply(roomRot)
    }
    const view = () => {
      const r = {x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9}
      for (const c of corners) {
        const p = pos.add(rot.multiplyVec3(c.sub(center).uniformScale(s)))
        const v = p.sub(eye)
        const z = Math.max(1e-3, v.dot(fwd))
        const x = v.dot(right) / (z * tanH)
        const y = v.dot(up) / (z * tanV)
        r.x0 = Math.min(r.x0, x)
        r.x1 = Math.max(r.x1, x)
        r.y0 = Math.min(r.y0, y)
        r.y1 = Math.max(r.y1, y)
      }
      return r
    }
    for (let pass = 0; pass < 6; pass++) {
      place()
      let r = view()
      s *= 0.99 * Math.min((2 * layout.fill) / (r.x1 - r.x0), (layout.fill - yLow) / (r.y1 - r.y0))
      r = view()
      h += ((layout.fill + yLow) / 2 - (r.y0 + r.y1) / 2) * layout.distanceCm * tanV
      w -= ((r.x0 + r.x1) / 2) * layout.distanceCm * tanH
    }
    place()
    this.size = s

    this.root = global.scene.createSceneObject("ReplayModel")
    this.root.setParent(this.parent)
    const rt = this.root.getTransform()
    rt.setWorldPosition(pos)
    rt.setWorldRotation(rot)
    rt.setWorldScale(vec3.one().uniformScale(s))
    this.room = global.scene.createSceneObject("ModelRoom")
    this.room.setParent(this.root)
    this.room.getTransform().setLocalPosition(center.uniformScale(-1))

    // The floor of the model, faint.
    const base = new MeshKit().box(center.x, -0.5, center.z, (hi.x - lo.x) / 2, 0.5, (hi.z - lo.z) / 2).build()
    addVisual(this.room, "ModelBase", base, glowMaterial(new vec3(0.55, 0.7, 0.9), 0.14))
    // Furniture, see-through so it hides nothing behind it.
    for (const st of room.standIns) {
      const t = st.getSceneObject().getTransform()
      const c = st.color
      addVisual(this.room, `ModelFurniture_${st.getSceneObject().name}`, st.mesh, glowMaterial(new vec3(c.x, c.y, c.z), 0.3), toRoom(t.getWorldPosition()), this.roomRotInv.multiply(t.getWorldRotation()))
    }
    // The clues where they lie, a little bigger than the room's scale so each can be told apart.
    for (const c of room.clues) {
      const copy = c.makeCopy(this.room, `ModelClue_${c.info.id}`, {scale: Math.max(1, layout.clueMinCm / c.maxDimensionCm), asPlaced: true, glowScale: 0.8})
      const ct = copy.root.getTransform()
      ct.setLocalPosition(toRoom(c.restPosition))
      ct.setLocalRotation(this.roomRotInv.multiply(c.getSceneObject().getTransform().getWorldRotation()))
      this.copies.push({glow: copy.glow, color: copy.color, flash: 0, visited: false})
    }
    // Where the player stands: a disc with a pointer the way they face.
    const facing = this.roomRotInv.multiplyVec3(room.playerFacing)
    const marker = new MeshKit().cylinderY(0, 0.75, 0, 18, 1.5, 24).box(0, 1, 28, 3, 1, 10).build()
    addVisual(this.room, "ModelPlayer", marker, glowMaterial(new vec3(0.9, 0.96, 1.0), 0.75), new vec3(toRoom(room.playerFloor).x, 0, toRoom(room.playerFloor).z), yawQuat(Math.atan2(facing.x, facing.z)))
    this.trail = global.scene.createSceneObject("ModelTrail")
    this.trail.setParent(this.room)
    this.figure = addVisual(this.room, "ModelFigure", this.figureMesh, glowMaterial(this.figureColor, 0.6), toRoom(room.walkStart))
  }

  /** Put the small figure where the real one is (called every frame while it walks). */
  follow(walker: Transform): void {
    if (!this.figure) return
    const t = this.figure.getTransform()
    t.setLocalPosition(this.roomInv.multiplyPoint(walker.getWorldPosition()))
    t.setLocalRotation(this.roomRotInv.multiply(walker.getWorldRotation()))
  }

  /** The real figure left a footprint: leave the same one in the model (half as big again, to be seen). */
  addFootprint(worldPos: vec3, worldRot: quat): void {
    if (!this.trail) return
    addVisual(
      this.trail,
      "ModelFootprint",
      this.footMesh,
      glowMaterial(this.footColor, 0.7),
      this.roomInv.multiplyPoint(worldPos),
      this.roomRotInv.multiply(worldRot),
      vec3.one().uniformScale(1.5),
    )
  }

  /** The figure has reached the clue `index` (visiting order): its copy lights up like the real one. */
  arrive(index: number): void {
    const c = this.copies[index]
    if (!c) return
    c.flash = 0.85
    c.visited = true
  }

  /** Glow levels: a flash on arrival that settles to a faint glow on the clues already visited. */
  update(dt: number): void {
    for (const c of this.copies) {
      setGlow(c.glow, c.color, Math.max(c.visited ? 0.15 : 0, c.flash))
      c.flash = Math.max(0, c.flash - dt * 0.9)
    }
  }

  /** Shrink away and remove (when the truth shows). */
  hide(duration: number): void {
    const root = this.root
    if (!root) return
    const s0 = this.size
    this.root = null
    this.room = null
    this.trail = null
    this.figure = null
    this.copies = []
    const t = root.getTransform()
    animate({
      duration,
      easing: "ease-in-cubic",
      update: (k: number) => t.setWorldScale(vec3.one().uniformScale(Math.max(1e-4, s0 * (1 - k)))),
      ended: () => root.destroy(),
    })
  }

  private clear(): void {
    if (this.root) this.root.destroy()
    this.root = null
    this.room = null
    this.trail = null
    this.figure = null
    this.copies = []
  }
}
