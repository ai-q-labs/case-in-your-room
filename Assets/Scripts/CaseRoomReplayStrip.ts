import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {CaseRoomClue} from "./CaseRoomClue"
import {addVisual, DEG, glowMaterial, rollQuat, setGlow, yawQuat} from "./CaseRoomMeshes"

/** Where and how big the strip is drawn (cm). */
export interface StripLayout {
  /** How far straight ahead of the eyes. */
  distanceCm: number
  /** Height of the line the small figure walks on, relative to the eyes. */
  lineHeightCm: number
  /** Largest side of each small copy. */
  copySizeCm: number
  /** Centre-to-centre spacing of the copies. */
  spacingCm: number
  /** Height of the small figure. */
  figureHeightCm: number
  /** Largest side of the real clues where they gathered: each copy starts from there at that size. */
  startSizeCm: number
}

interface Copy {
  so: SceneObject
  glow: Material
  color: vec3
  flash: number
  visited: boolean
}

const FIGURE_MESH_HEIGHT_CM = 168 // FIGURE_PROFILE

/**
 * CaseRoomReplayStrip — the whole replay at a glance, straight ahead, while the culprit's figure walks the
 * room: a row of small copies of the clues in the order she visits them, a small copy of her walking along
 * the row in step with the real figure, and a glowing line for the way she has come. A copy lights up
 * together with the real clue when she arrives at it.
 *
 * Helper owned by CaseRoomReplay (not a component). Strip frame: +X to the player's right, +Y up, +Z toward
 * the player; origin on the walking line, centred straight ahead.
 * SceneObject names (tests find them): ReplayStrip, StripCopy_<clue id>, StripFigure, StripPath.
 */
export class CaseRoomReplayStrip {
  private root: SceneObject = null
  private copies: Copy[] = []
  private figure: SceneObject = null
  private path: SceneObject = null
  /** Where the small figure stands, along X: before the first copy, at each copy, after the last. */
  private xs: number[] = []

  constructor(
    private readonly parent: SceneObject,
    private readonly figureMesh: RenderMesh,
    private readonly boxMesh: RenderMesh,
    private readonly figureColor: vec3,
    private readonly pathColor: vec3,
  ) {}

  /** Build the strip in front of `eye` (looking along the flat direction `fwd`) for `clues` in visiting order. */
  show(clues: CaseRoomClue[], eye: vec3, fwd: vec3, layout: StripLayout): void {
    this.clear()
    this.root = global.scene.createSceneObject("ReplayStrip")
    this.root.setParent(this.parent)
    const t = this.root.getTransform()
    t.setWorldPosition(eye.add(fwd.uniformScale(layout.distanceCm)).add(new vec3(0, layout.lineHeightCm, 0)))
    t.setWorldRotation(yawQuat(Math.atan2(-fwd.x, -fwd.z))) // +Z toward the player
    const toLocal = t.getInvertedWorldTransform()

    const n = clues.length
    const s = layout.spacingCm
    this.xs = [-((n - 1) / 2) * s - s / 2]
    for (let i = 0; i < n; i++) this.xs.push((i - (n - 1) / 2) * s)
    this.xs.push(((n - 1) / 2) * s + s / 2)

    // The copies hang above the line, clear of the small figure's head.
    const copyY = layout.figureHeightCm + 1.5 + layout.copySizeCm / 2
    clues.forEach((c, i) => {
      // A long, narrow clue (the row of footprints) lies along the row, so it reads as prints walking by, and
      // is drawn a quarter longer (its narrow side is what shows the prints).
      const size = c.sizeCmUpright
      const long = size.y > size.x * 1.5
      // A tight glow, so neighbouring copies' halos stay apart.
      const copy = c.makeCopy(this.root, `StripCopy_${c.info.id}`, layout.copySizeCm * (long ? 1.25 : 1), 0.75)
      const ct = copy.root.getTransform()
      if (long) ct.setLocalRotation(rollQuat(90 * DEG))
      // Each starts where the real clue is (gathered in front, about to fly home) and slides into the row.
      const from = toLocal.multiplyPoint(c.getSceneObject().getTransform().getWorldPosition())
      const to = new vec3(this.xs[i + 1], copyY, 0)
      const s0 = layout.startSizeCm / layout.copySizeCm
      ct.setLocalPosition(from)
      ct.setLocalScale(vec3.one().uniformScale(s0))
      animate({
        duration: 0.9,
        easing: "ease-in-out-cubic",
        update: (k: number) => {
          ct.setLocalPosition(vec3.lerp(from, to, k))
          ct.setLocalScale(vec3.one().uniformScale(s0 + (1 - s0) * k))
        },
      })
      this.copies.push({so: copy.root, glow: copy.glow, color: copy.color, flash: 0, visited: false})
    })

    this.figure = addVisual(
      this.root,
      "StripFigure",
      this.figureMesh,
      glowMaterial(this.figureColor, 0.55),
      new vec3(this.xs[0], 0, 2),
      yawQuat(Math.PI / 2), // facing along the row
      vec3.one().uniformScale(layout.figureHeightCm / FIGURE_MESH_HEIGHT_CM),
    )
    // The box mesh runs from z = 0 to z = 1; turned so it runs along +X from the start.
    this.path = addVisual(this.root, "StripPath", this.boxMesh, glowMaterial(this.pathColor, 0.8), new vec3(this.xs[0], 0.3, 1), yawQuat(Math.PI / 2))
    this.walkTo(0, 0)
  }

  /** The small figure on its way to stop `segment` (0..copies, the last one being past the row), `fraction` of the way there. */
  walkTo(segment: number, fraction: number): void {
    if (!this.figure) return
    const i = Math.max(0, Math.min(this.xs.length - 2, segment))
    const f = Math.max(0, Math.min(1, fraction))
    const x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * f
    this.figure.getTransform().setLocalPosition(new vec3(x, 0, 2))
    this.path.getTransform().setLocalScale(new vec3(0.5, 0.5, Math.max(0.01, x - this.xs[0])))
  }

  /** She has reached the clue copy `index` (visiting order): it lights up like the real one. */
  arrive(index: number): void {
    const c = this.copies[index]
    if (!c) return
    c.flash = 0.85
    c.visited = true
    this.walkTo(index, 1)
  }

  /** Glow levels: a flash on arrival that settles to a faint glow on the copies she has visited. */
  update(dt: number): void {
    for (const c of this.copies) {
      setGlow(c.glow, c.color, Math.max(c.visited ? 0.15 : 0, c.flash))
      c.flash = Math.max(0, c.flash - dt * 0.9)
    }
  }

  /** Shrink away and remove (before the truth shows above the real figure). */
  hide(duration: number): void {
    const root = this.root
    if (!root) return
    this.root = null
    this.copies = []
    this.figure = null
    this.path = null
    const t = root.getTransform()
    animate({
      duration,
      easing: "ease-in-cubic",
      update: (k: number) => t.setLocalScale(vec3.one().uniformScale(Math.max(0.01, 1 - k))),
      ended: () => root.destroy(),
    })
  }

  private clear(): void {
    if (this.root) this.root.destroy()
    this.root = null
    this.copies = []
    this.figure = null
    this.path = null
  }
}
