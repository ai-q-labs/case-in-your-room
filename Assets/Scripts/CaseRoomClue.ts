import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import animate, {CancelFunction} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {ClueId, ClueInfo, CLUES} from "./CaseRoomData"
import {
  addVisual,
  DEG,
  faceTowardYaw,
  glowMaterial,
  MeshKit,
  P2,
  pitchQuat,
  rollQuat,
  setGlow,
  shoeOutline,
  solidMaterial,
} from "./CaseRoomMeshes"

type GlowMode = "off" | "faint" | "hover"

/**
 * CaseRoomClue — one clue placed in the room (memo, footprints, clock, glass, photo).
 *
 * Owns: its code-authored geometry, its pinch target (collider + SIK Interactable on this
 * unit-scale wrapper), its glow, and its pose animations (reveal, flip where it lies, gather for the
 * replay and fly back). The wrapper's authored position is the clue's place in the room.
 * Emits: onPressed (pinch released on it), onHoverChanged (hand ray in/out).
 * Must not: count clues, decide game flow, or create UI text (the main script and UI modules do).
 * Size note: ~410 lines because the five clue geometries live here; candidate split for the detail
 * stage: move buildGeometry() into a CaseRoomClueGeometry module.
 */
@component
export class CaseRoomClue extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomClue – one inspectable clue</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Which clue this is (drives geometry and texts)")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Memo", "memo"),
      new ComboBoxItem("Footprints", "footprints"),
      new ComboBoxItem("Stopped clock", "clock"),
      new ComboBoxItem("Broken glass", "glass"),
      new ComboBoxItem("Torn photo", "photo"),
    ]),
  )
  clueId: string = "memo"

  @input
  @hint("Tilt at rest in degrees: -90 lies flat face-up, 0 stands facing the room center, + leans down")
  @widget(new SliderWidget(-90, 90, 1))
  restPitchDeg: number = 0

  @input
  @hint("Turn the clue so its face points at the room center (the player's start position)")
  faceRoomCenter: boolean = true

  @input
  @hint("Smallest pinch-target size in cm (the brief asks for about 30 cm)")
  @widget(new SliderWidget(10, 60, 1))
  hitboxMinCm: number = 30

  @input("vec3", "{1.0,0.82,0.42}")
  @hint("Glow color around the clue")
  @widget(new ColorWidget())
  glowColor: vec3

  @input("vec4", "{0.62,1.0,0.78,1}")
  @hint("Tint mixed into the clue once it has been inspected and put back")
  @widget(new ColorWidget())
  inspectedTint: vec4
  @ui.group_end

  @ui.separator
  @ui.group_start("Debug")
  @input
  @hint("Draw the pinch target collider")
  debugColliders: boolean = false
  @ui.group_end

  private pivot: SceneObject
  private haloMat: Material
  private parts: {mat: Material; base: vec4}[] = []
  private collider: ColliderComponent
  private interactable: Interactable
  private restPivotRot: quat = quat.quatIdentity()
  private restWorldPos: vec3 = vec3.zero()
  private restWorldRot: quat = quat.quatIdentity()
  private sizeCm: vec3 = new vec3(15, 15, 2)
  private glowMode: GlowMode = "off"
  private flash = 0
  private time = 0
  private flipped = false
  private _inspected = false
  private interactive = false
  private cancelMove: CancelFunction | null = null
  private cancelFlip: CancelFunction | null = null

  private _onPressed = new Event<CaseRoomClue>()
  private _onHoverChanged = new Event<boolean>()

  get onPressed(): PublicApi<CaseRoomClue> {
    return this._onPressed.publicApi()
  }

  get onHoverChanged(): PublicApi<boolean> {
    return this._onHoverChanged.publicApi()
  }

  get info(): ClueInfo {
    return CLUES[this.clueId as ClueId]
  }

  get inspected(): boolean {
    return this._inspected
  }

  /** Visual size in cm at rest scale, in the clue's own upright frame (x wide, y tall, z deep). */
  get sizeCmUpright(): vec3 {
    return this.sizeCm
  }

  /** Largest visual dimension in cm at rest scale. */
  get maxDimensionCm(): number {
    return Math.max(this.sizeCm.x, this.sizeCm.y, this.sizeCm.z)
  }

  onAwake(): void {
    if (!CLUES[this.clueId as ClueId]) {
      print(`[CaseRoomClue] ERROR: unknown clueId '${this.clueId}' on ${this.sceneObject.name}`)
      return
    }
    const t = this.sceneObject.getTransform()
    t.setLocalRotation(quat.quatIdentity())
    t.setLocalScale(vec3.one())

    this.pivot = global.scene.createSceneObject("Pivot")
    this.pivot.setParent(this.sceneObject)
    this.buildGeometry()

    const yaw = this.faceRoomCenter ? faceTowardYaw(t.getLocalPosition(), vec3.zero()) : quat.quatIdentity()
    // Rotation about +X by a: the face normal (0,0,1) becomes (0, -sin a, cos a), so -90 = face up.
    this.restPivotRot = yaw.multiply(pitchQuat(this.restPitchDeg * DEG))
    this.pivot.getTransform().setLocalRotation(this.restPivotRot)

    this.buildPinchTarget()
    this.pivot.enabled = false
    this.setInteractive(false)

    this.createEvent("OnStartEvent").bind(() => {
      this.interactable.onHoverEnter.add(() => {
        if (!this.interactive) return
        this.setGlowMode(this._inspected ? "off" : "hover")
        this._onHoverChanged.invoke(true)
      })
      this.interactable.onHoverExit.add(() => {
        if (this.glowMode === "hover") this.setGlowMode(this._inspected ? "off" : "faint")
        this._onHoverChanged.invoke(false)
      })
      this.interactable.onTriggerEnd.add(() => {
        if (!this.interactive) return
        this._onPressed.invoke(this)
      })
    })
    this.createEvent("UpdateEvent").bind(() => this.updateGlow())
  }

  // ── Public API (called by CaseRoomMain / CaseRoomReplay) ─────────────────────

  /** Record the current world pose as "its place in the room" (call after the room is placed). */
  captureRestPose(): void {
    const t = this.sceneObject.getTransform()
    this.restWorldPos = t.getWorldPosition()
    this.restWorldRot = t.getWorldRotation()
  }

  get restPosition(): vec3 {
    return this.restWorldPos
  }

  /** World-space corners of the clue's visible parts (its own meshes, not the glow halo). */
  worldCorners(): vec3[] {
    const out: vec3[] = []
    const visit = (o: SceneObject) => {
      if (o.name === "Glow") return
      const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (v) {
        const lo = v.worldAabbMin()
        const hi = v.worldAabbMax()
        for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) out.push(new vec3(x, y, z))
      }
      for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
    }
    visit(this.pivot)
    return out
  }

  /** Show the clue with a bright flash that settles into a faint glow. */
  reveal(): void {
    this.pivot.enabled = true
    this.flash = 1
    this.setGlowMode("faint")
    const pt = this.pivot.getTransform()
    animate({
      duration: 0.45,
      easing: "ease-out-cubic",
      update: (k: number) => pt.setLocalScale(vec3.one().uniformScale(0.5 + 0.5 * k)),
    })
  }

  setInteractive(on: boolean): void {
    this.interactive = on
    if (this.collider) this.collider.enabled = on
    if (this.interactable) this.interactable.enabled = on
    if (!on && this.glowMode === "hover") this.setGlowMode(this._inspected ? "off" : "faint")
  }

  setGlowMode(mode: GlowMode): void {
    this.glowMode = mode
  }

  /** A one-off strong glow (e.g. when the replay figure arrives at this clue). */
  flashGlow(): void {
    this.flash = 1
  }

  /**
   * Move the clue (wrapper) to a world pose, standing upright and facing along `worldRot`'s +Z,
   * scaled so its largest side is `maxSizeCm` (never more than `maxScale`).
   */
  moveTo(
    worldPos: vec3,
    worldRot: quat,
    maxSizeCm: number,
    maxScale: number,
    duration: number,
    done?: () => void,
    around?: vec3,
  ): void {
    const scale = Math.min(maxScale, maxSizeCm / Math.max(1, this.maxDimensionCm))
    this.flipped = false
    this.tweenTo(worldPos, worldRot, quat.quatIdentity(), scale, duration, done, around)
  }

  /** Fly back to its place in the room. */
  returnToRest(duration: number, done?: () => void): void {
    this.flipped = false
    this.tweenTo(this.restWorldPos, this.restWorldRot, this.restPivotRot, 1, duration, done)
  }

  /**
   * Turn the clue over where it lies (180 degrees around its own upright axis) to show the other side,
   * or back again. On the way it lifts off its face (out of the desk, chair or wall) by half its width,
   * so it never sinks into what it rests on, and lands back in its place.
   */
  flip(duration: number = 0.5): void {
    const pt = this.pivot.getTransform()
    const from = pt.getLocalRotation()
    const to = this.flipped ? this.restPivotRot : this.restPivotRot.multiply(quat.angleAxis(Math.PI, vec3.up()))
    const lift = this.restPivotRot.multiplyVec3(vec3.forward()).uniformScale(this.sizeCm.x / 2 + 1)
    this.flipped = !this.flipped
    if (this.cancelFlip) this.cancelFlip()
    this.cancelFlip = animate({
      duration,
      easing: "ease-in-out-cubic",
      update: (k: number) => {
        pt.setLocalRotation(quat.slerp(from, to, k))
        pt.setLocalPosition(lift.uniformScale(Math.sin(Math.PI * k)))
      },
      ended: () => {
        this.cancelFlip = null
        pt.setLocalPosition(vec3.zero())
      },
    })
  }

  /** Turn back to the front if flipped (when its description closes). */
  unflip(duration: number = 0.3): void {
    if (this.flipped) this.flip(duration)
  }

  get isFlipped(): boolean {
    return this.flipped
  }

  /** Change to the "inspected" color and stop glowing. */
  markInspected(): void {
    this._inspected = true
    for (const p of this.parts) {
      const b = p.base
      const c = this.inspectedTint
      p.mat.mainPass.baseColor = new vec4(b.x + (c.x - b.x) * 0.6, b.y + (c.y - b.y) * 0.6, b.z + (c.z - b.z) * 0.6, 1)
    }
    this.setGlowMode("off")
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  /**
   * Tween the wrapper to a world pose. With `around` (the eye), the path swings around that point at an
   * even angular pace (direction slerped, distance lerped, ease-in-out-sine) so the eye can follow it;
   * without it, a straight ease-in-out-cubic move.
   */
  private tweenTo(
    pos: vec3,
    rot: quat,
    pivotRot: quat,
    pivotScale: number,
    duration: number,
    done?: () => void,
    around?: vec3,
  ): void {
    const t = this.sceneObject.getTransform()
    const pt = this.pivot.getTransform()
    const p0 = t.getWorldPosition()
    const r0 = t.getWorldRotation()
    const pr0 = pt.getLocalRotation()
    const s0 = pt.getLocalScale().x
    const path = around ? this.orbitPath(around, p0, pos) : (k: number) => vec3.lerp(p0, pos, k)
    if (this.cancelMove) this.cancelMove()
    if (this.cancelFlip) this.cancelFlip()
    this.cancelFlip = null
    pt.setLocalPosition(vec3.zero())
    this.cancelMove = animate({
      duration,
      easing: around ? "ease-in-out-sine" : "ease-in-out-cubic",
      update: (k: number) => {
        t.setWorldPosition(path(k))
        t.setWorldRotation(quat.slerp(r0, rot, k))
        pt.setLocalRotation(quat.slerp(pr0, pivotRot, k))
        pt.setLocalScale(vec3.one().uniformScale(s0 + (pivotScale - s0) * k))
      },
      ended: () => {
        this.cancelMove = null
        if (done) done()
      },
    })
  }

  /** Point on a path from `from` to `to` that turns around `center` at a constant rate (k = 0..1). */
  private orbitPath(center: vec3, from: vec3, to: vec3): (k: number) => vec3 {
    const a = from.sub(center)
    const b = to.sub(center)
    const da = a.length
    const db = b.length
    if (da < 1e-3 || db < 1e-3) return (k: number) => vec3.lerp(from, to, k)
    const ua = a.uniformScale(1 / da)
    const turn = quat.rotationFromTo(ua, b.uniformScale(1 / db))
    const none = quat.quatIdentity()
    return (k: number) => center.add(quat.slerp(none, turn, k).multiplyVec3(ua).uniformScale(da + (db - da) * k))
  }

  private updateGlow(): void {
    if (!this.haloMat) return
    const dt = getDeltaTime()
    this.time += dt
    let level = 0
    if (this.glowMode === "faint") level = 0.2 + 0.08 * Math.sin(this.time * 2.4)
    else if (this.glowMode === "hover") level = 0.75
    if (this.flash > 0) {
      level = Math.max(level, this.flash)
      this.flash = Math.max(0, this.flash - dt * 0.9)
    }
    setGlow(this.haloMat, this.glowColor, level)
  }

  private part(name: string, kit: MeshKit, color: vec4, pos?: vec3, rot?: quat): void {
    const mat = solidMaterial(color)
    this.parts.push({mat, base: color})
    addVisual(this.pivot, name, kit.build(), mat, pos, rot)
  }

  private buildGeometry(): void {
    switch (this.clueId as ClueId) {
      case "memo": {
        this.sizeCm = new vec3(15, 10, 1)
        this.part("Paper", new MeshKit().box(0, 0, 0, 7.5, 5, 0.2), new vec4(1.0, 0.96, 0.84, 1))
        const ink = new MeshKit()
        ink.box(-0.5, 2.6, 0.25, 5.5, 0.25, 0.06).box(-1.2, 1.0, 0.25, 4.8, 0.25, 0.06).box(-0.2, -0.6, 0.25, 5.8, 0.25, 0.06)
        ink.box(-2.5, -2.2, 0.25, 3.5, 0.25, 0.06)
        // The "10:40" on the back, as two short strokes.
        ink.box(0, 0, -0.25, 3.0, 0.5, 0.06)
        this.part("Ink", ink, new vec4(0.55, 0.75, 1.0, 1))
        break
      }
      case "footprints": {
        this.sizeCm = new vec3(22, 90, 1)
        const kit = new MeshKit()
        const toesToward = (pts: P2[]): P2[] => pts.map((p): P2 => [p[0], -p[1]]).reverse()
        const offsets: P2[] = [[-6, 32], [6, 0], [-6, -32]]
        for (const o of offsets) {
          kit.flatXY(toesToward(shoeOutline(26, 10)).map((p): P2 => [p[0] + o[0], p[1] + o[1]]), 0.2, 0.4)
        }
        this.part("Prints", kit, new vec4(1.0, 0.72, 0.48, 1))
        break
      }
      case "clock": {
        this.sizeCm = new vec3(30, 30, 4)
        // Clock body: a Y-cylinder pitched +90 deg so its axis points along +Z (the face).
        this.part("Body", new MeshKit().cylinderY(0, 0, 0, 15, 4, 32), new vec4(0.98, 0.94, 0.84, 1), vec3.zero(), pitchQuat(90 * DEG))
        const ticks = new MeshKit()
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2
          const major = k % 3 === 0
          ticks.box(12.3 * Math.sin(a), 12.3 * Math.cos(a), 2.15, major ? 0.7 : 0.5, major ? 0.7 : 0.5, 0.1)
        }
        this.part("Ticks", ticks, new vec4(1.0, 0.8, 0.4, 1))
        // 10:45 — minute hand at 9 o'clock, hour hand three quarters past 10.
        const hourAngle = (10.75 / 12) * Math.PI * 2
        const minuteAngle = (45 / 60) * Math.PI * 2
        this.part("HourHand", new MeshKit().box(0, 3.8, 0, 0.6, 3.8, 0.12), new vec4(1.0, 0.45, 0.35, 1), new vec3(0, 0, 2.3), rollQuat(-hourAngle))
        this.part("MinuteHand", new MeshKit().box(0, 5.8, 0, 0.4, 5.8, 0.12), new vec4(1.0, 0.45, 0.35, 1), new vec3(0, 0, 2.5), rollQuat(-minuteAngle))
        break
      }
      case "glass": {
        this.sizeCm = new vec3(15, 10, 15)
        const glassColor = new vec4(0.72, 0.95, 1.0, 1)
        this.part("Base", new MeshKit().cylinderY(0, -3.5, 0, 3.4, 3, 20), glassColor)
        const shards: [number, number, number, number, number][] = [
          [-4.5, -4.6, 3.0, 25, 10],
          [5.0, -4.6, -1.5, -20, 70],
          [1.5, -4.6, 5.0, 15, 140],
          [-2.0, -2.0, -4.5, 60, -30],
        ]
        shards.forEach((s, i) => {
          const rot = quat.angleAxis(s[4] * DEG, vec3.up()).multiply(quat.angleAxis(s[3] * DEG, vec3.right()))
          this.part(`Shard${i}`, new MeshKit().box(0, 0, 0, 1.8, 0.15, 3.2), glassColor, new vec3(s[0], s[1], s[2]), rot)
        })
        break
      }
      case "photo": {
        this.sizeCm = new vec3(26, 19, 1)
        const paper = new vec4(0.96, 0.93, 0.86, 1)
        const picture = new vec4(1.0, 0.84, 0.62, 1)
        this.part("LeftHalf", new MeshKit().box(0, 0, 0, 6, 9, 0.15), paper, new vec3(-6.8, 0.3, 0), rollQuat(4 * DEG))
        this.part("RightHalf", new MeshKit().box(0, 0, 0, 6, 9, 0.15), paper, new vec3(6.9, -0.4, 0), rollQuat(-5 * DEG))
        const pics = new MeshKit()
        pics.box(-6.6, 0.4, 0.2, 4.8, 7.6, 0.05).box(6.9, -0.4, 0.2, 4.8, 7.6, 0.05)
        this.part("Picture", pics, picture)
        const people = new MeshKit()
        people.ellipsoid(-8.2, 2.2, 0.35, 1.6, 1.9, 0.3).ellipsoid(-8.2, -2.8, 0.35, 2.6, 3.2, 0.3)
        people.ellipsoid(-4.4, 2.8, 0.35, 1.5, 1.8, 0.3).ellipsoid(-4.4, -2.2, 0.35, 2.4, 3.0, 0.3)
        people.ellipsoid(7.2, 1.8, 0.35, 1.6, 1.9, 0.3).ellipsoid(7.2, -3.2, 0.35, 2.6, 3.2, 0.3)
        this.part("People", people, new vec4(1.0, 0.68, 0.72, 1))
        break
      }
    }

    // Soft glow shell around the clue (additive, faint until hovered).
    this.haloMat = glowMaterial(this.glowColor, 0)
    const s = this.sizeCm
    addVisual(
      this.pivot,
      "Glow",
      new MeshKit().ellipsoid(0, 0, 0, s.x * 0.62 + 3, s.y * 0.62 + 3, s.z * 0.62 + 3, 24).build(),
      this.haloMat,
    )
  }

  private buildPinchTarget(): void {
    // Axis-aligned box (in wrapper space) around the rotated visual, at least hitboxMinCm per side.
    const half = this.sizeCm.uniformScale(0.5)
    let ext = vec3.zero()
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const c = this.restPivotRot.multiplyVec3(new vec3(sx * half.x, sy * half.y, sz * half.z))
          ext = new vec3(Math.max(ext.x, Math.abs(c.x)), Math.max(ext.y, Math.abs(c.y)), Math.max(ext.z, Math.abs(c.z)))
        }
      }
    }
    const m = this.hitboxMinCm
    const size = new vec3(Math.max(m, ext.x * 2 + 6), Math.max(m, ext.y * 2 + 6), Math.max(m, ext.z * 2 + 6))
    this.collider = this.sceneObject.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = size
    this.collider.shape = shape
    this.collider.fitVisual = false
    this.collider.debugDrawEnabled = this.debugColliders
    this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable
  }
}
