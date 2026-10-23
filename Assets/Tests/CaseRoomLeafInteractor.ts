import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {UpdateDispatcher} from "Leaf.lspkg/Utils/common/UpdateDispatcher"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {CaseRoomClue} from "../Scripts/CaseRoomClue"
import {CaseRoomHudUI} from "../Scripts/CaseRoomHudUI"
import {CaseRoomMain} from "../Scripts/CaseRoomMain"
import {SolidBox} from "../Scripts/CaseRoomSightline"
import {CaseRoomStandIn} from "../Scripts/CaseRoomStandIn"
import {CaseRoomSuspect} from "../Scripts/CaseRoomSuspect"

/**
 * Exact on-screen English texts, copied by hand from devpost/design-brief.md.
 * Deliberately NOT imported from the Lens's CaseRoomData, so the tests check the Lens against the brief.
 */
export const BRIEF = {
  title: "Case in Your Room",
  opening:
    "Last night, the master of this house was found collapsed in this room. " +
    "Inspect the 5 clues left here, then name the culprit among the 3 suspects.",
  howToPlay: "Aim at a glowing object with the ray from your hand and pinch",
  start: "Start",
  lookAround: "Look around you",
  flip: "Flip",
  nothingOnBack: "Nothing on the back.",
  suspectsAppeared: "The suspects have appeared",
  accuse: "Accuse this person",
  wrong: "That doesn't match the clues",
  truth: "Sensing she was about to be cut out of the will, Nora Vale put something in his tea.",
}

/**
 * Not in the brief (devpost/design-brief.md, "Changes during the build"): every clue is now described
 * where it lies, so the second button is "Close" instead of "Put back".
 */
export const CLOSE = "Close"

export function counter(n: number): string {
  return `${n} / 5`
}

export interface BriefClue {
  so: string
  name: string
  front: string
  back: string | null
  caption: string
}

/** The 5 clues in the brief's order (Clue 1..5). */
export const CLUES: BriefClue[] = [
  {
    so: "Clue_Memo",
    name: "Memo",
    front: "The study, tonight. We need to talk about the will.",
    back: "10:40",
    caption: "The 10:40 note calling her here. She already knew it was about the will.",
  },
  {
    so: "Clue_Footprints",
    name: "Footprints",
    front: "Small, narrow prints with a pointed heel, coming in through the kitchen-side door. Not a gardener's boot.",
    back: null,
    caption: "10:40. Nora comes in through the kitchen-side door.",
  },
  {
    so: "Clue_StoppedClock",
    name: "Stopped clock",
    front: "Knocked off the wall when he fell. It stopped at 10:45.",
    back: null,
    caption: "10:45. He falls, and the clock stops.",
  },
  {
    so: "Clue_BrokenGlass",
    name: "Broken glass",
    front: "His glass. It smells of kitchen tea, not his usual brandy.",
    back: null,
    caption: "She hands him tea from the kitchen in his glass.",
  },
  {
    so: "Clue_TornPhoto",
    name: "Torn photo",
    front: "A family portrait, torn in half.",
    back: "...ra, my only heir",
    caption: "He tells her he will change his will, and tears her photo.",
  },
]

/** Replay order from the brief: footprints, memo, broken glass, torn photo, stopped clock. */
export const REPLAY_ORDER: string[] = ["Clue_Footprints", "Clue_Memo", "Clue_BrokenGlass", "Clue_TornPhoto", "Clue_StoppedClock"]

export interface BriefSuspect {
  so: string
  key: string
  name: string
  role: string
  alibi: string
}

/** The 3 suspects, left to right as the Lens lines them up. */
export const SUSPECTS: BriefSuspect[] = [
  {so: "Suspect_EdgarHale", key: "EdgarHale", name: "Edgar Hale", role: "Gardener", alibi: "I was in the greenhouse until eleven."},
  {so: "Suspect_NoraVale", key: "NoraVale", name: "Nora Vale", role: "Niece", alibi: "At that time I was in the kitchen."},
  {so: "Suspect_IrisBell", key: "IrisBell", name: "Iris Bell", role: "Secretary", alibi: "I went to bed at half past ten."},
]

export function clueBySo(so: string): BriefClue {
  return CLUES.filter((c) => c.so === so)[0]
}

/** Strip one pair of surrounding double quotes (the Lens shows spoken/written lines in quotes). */
export function unquote(s: string): string {
  return s.length >= 2 && s[0] === "\"" && s[s.length - 1] === "\"" ? s.substring(1, s.length - 1) : s
}

const RAD2DEG = 180 / Math.PI

/** The stand-in furniture, by SceneObject name. */
export const STAND_INS = ["StandIn_Desk", "StandIn_Chair", "StandIn_ClockWall"]

/** Where the head is and which way it faces (the camera's axes). */
export interface ViewBasis {
  eye: vec3
  fwd: vec3
  right: vec3
  up: vec3
}

/** A rectangle in view coordinates (x right, y up; -1..1 = edge to edge of the view). */
export interface ViewRect {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** A named solid box of the room. */
export interface NamedSolid {
  name: string
  box: SolidBox
}

/**
 * Shared LEAF helper for "Case in Your Room": scripted SIK interactions by SceneObject name,
 * scene/state lookups, camera-relative geometry, and the setup steps every scenario reuses
 * (Start, inspect / flip / close a clue, find all clues, reach the suspect line-up, accuse).
 */
export class CaseRoomLeafInteractor extends DefaultLeafInteractor {
  private cache = new Map<string, SceneObject>()

  constructor(private readonly logTag: string) {
    super("CaseRoomLeafInteractor")
  }

  // ── Lookups ──────────────────────────────────────────────────────────────────

  so(name: string): SceneObject {
    const hit = this.cache.get(name)
    if (hit && !isNull(hit)) return hit
    const found = findSceneObjectByName(name)
    if (!found) throw new Error(`SceneObject "${name}" not found`)
    this.cache.set(name, found)
    return found
  }

  child(parent: SceneObject, name: string): SceneObject | null {
    for (let i = 0; i < parent.getChildrenCount(); i++) {
      const c = parent.getChild(i)
      if (c.name === name) return c
    }
    return null
  }

  children(parentName: string): SceneObject[] {
    const p = this.so(parentName)
    const out: SceneObject[] = []
    for (let i = 0; i < p.getChildrenCount(); i++) out.push(p.getChild(i))
    return out
  }

  text(name: string): string {
    const t = this.so(name).getComponent("Component.Text") as Text
    if (!t) throw new Error(`SceneObject "${name}" has no Text component`)
    return t.text
  }

  isShown(name: string): boolean {
    const o = findSceneObjectByName(name)
    return !!o && o.isEnabledInHierarchy
  }

  /** Caption currently on screen ("" when the caption panel is hidden). */
  caption(): string {
    return this.isShown("CaptionPanel") ? this.text("CaptionText") : ""
  }

  /** Counter text currently on screen ("" when the counter panel is hidden). */
  counterShown(): string {
    return this.isShown("CounterPanel") ? this.text("CounterText") : ""
  }

  interactable(name: string): Interactable {
    const target = findInteractablesByName(name, undefined, true)[0]
    if (!target) throw new Error(`Interactable "${name}" not found or not enabled`)
    return target
  }

  isPinchable(name: string): boolean {
    return findInteractablesByName(name, undefined, true).length > 0
  }

  get main(): CaseRoomMain {
    return this.so("CaseRoom").getComponent(CaseRoomMain.getTypeName()) as CaseRoomMain
  }

  get phase(): string {
    return this.main.currentPhase
  }

  clue(so: string): CaseRoomClue {
    return this.so(so).getComponent(CaseRoomClue.getTypeName()) as CaseRoomClue
  }

  suspect(so: string): CaseRoomSuspect {
    return this.so(so).getComponent(CaseRoomSuspect.getTypeName()) as CaseRoomSuspect
  }

  pivot(clueSo: string): SceneObject {
    const p = this.child(this.so(clueSo), "Pivot")
    if (!p) throw new Error(`${clueSo} has no Pivot child`)
    return p
  }

  isRevealed(clueSo: string): boolean {
    return this.pivot(clueSo).enabled
  }

  /** baseColor of a RenderMeshVisual SceneObject (material main pass). */
  colorOf(o: SceneObject): vec4 {
    const rmv = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!rmv || isNull(rmv.mainMaterial)) throw new Error(`${o.name} has no RenderMeshVisual material`)
    return rmv.mainMaterial.mainPass.baseColor
  }

  /** The clue's glow shell intensity (alpha of the additive halo material: 0 = off, 1 = full). */
  glowLevel(clueSo: string): number {
    const g = this.child(this.pivot(clueSo), "Glow")
    if (!g) throw new Error(`${clueSo} has no Glow shell`)
    return this.colorOf(g).w
  }

  /** The clue's solid parts (everything under the pivot except the glow shell). */
  parts(clueSo: string): SceneObject[] {
    const p = this.pivot(clueSo)
    const out: SceneObject[] = []
    for (let i = 0; i < p.getChildrenCount(); i++) {
      const c = p.getChild(i)
      if (c.name !== "Glow") out.push(c)
    }
    return out
  }

  world(name: string): vec3 {
    return this.so(name).getTransform().getWorldPosition()
  }

  // ── Camera-relative geometry ─────────────────────────────────────────────────

  /** The world camera (named `cam`: the LEAF base class already has a `camera` member). */
  get cam(): Camera {
    return WorldCameraFinderProvider.getInstance().getComponent()
  }

  get eye(): vec3 {
    return this.cam.getTransform().getWorldPosition()
  }

  /** Viewing direction (the camera's -Z axis). */
  get look(): vec3 {
    return this.cam.getTransform().back
  }

  get flatLook(): vec3 {
    const f = this.look
    return new vec3(f.x, 0, f.z).normalize()
  }

  /** Normalized screen position, (0,0) top-left .. (1,1) bottom-right. */
  screen(p: vec3): vec2 {
    return this.cam.worldSpaceToScreenSpace(p)
  }

  inView(p: vec3): boolean {
    if (p.sub(this.eye).dot(this.look) <= 0) return false
    const s = this.screen(p)
    return s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1
  }

  /** Horizontal angle in degrees between the flat viewing direction and the direction to `p`. */
  bearingDeg(p: vec3): number {
    const e = this.eye
    const d = new vec3(p.x - e.x, 0, p.z - e.z)
    if (d.length < 1e-3) return 0
    const c = Math.max(-1, Math.min(1, d.normalize().dot(this.flatLook)))
    return Math.acos(c) * RAD2DEG
  }

  /** Signed horizontal angle (deg) of `p` from the viewing direction; + = to the player's right. */
  signedBearingDeg(p: vec3): number {
    const e = this.eye
    const f = this.flatLook
    const right = new vec3(-f.z, 0, f.x)
    const d = new vec3(p.x - e.x, 0, p.z - e.z)
    return Math.atan2(d.dot(right), d.dot(f)) * RAD2DEG
  }

  horizontalDistance(a: vec3, b: vec3): number {
    return new vec3(a.x - b.x, 0, a.z - b.z).length
  }

  quatAngleDeg(a: quat, b: quat): number {
    return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * RAD2DEG
  }

  get hud(): CaseRoomHudUI {
    return this.main.hud
  }

  /** Whether an arrow icon is drawn (the arrows hide by turning off their Image, keeping their slot). */
  arrowShown(name: "TurnArrow" | "TiltArrow"): boolean {
    const o = this.so(name)
    const img = o.getComponent("Component.Image") as Image
    return o.isEnabledInHierarchy && !!img && img.enabled
  }

  /** Name of the texture an arrow icon shows. */
  arrowIcon(name: "TurnArrow" | "TiltArrow"): string {
    return (this.so(name).getComponent("Component.Image") as Image).mainPass.baseTex.name
  }

  /**
   * Check the two arrows against the arrows' target, measured here independently of the HUD:
   * left/right from the signed bearing (straight arrow ahead of 90 degrees, ring-shaped turn-around arrow
   * behind), up/down from the target's elevation minus the head's pitch. A cue is only checked when the
   * angle is more than `margin` degrees from a threshold (10 and 90 degrees; the HUD has a dead band there).
   * Also checks what is drawn: the icon, and the straight arrows pointing the right way on the counter panel
   * (measured in the panel's own plane: the panel faces the head the preview tracks, which a test that holds
   * the head itself does not move).
   * Returns the problems found ([] = all good).
   */
  arrowProblems(label: string, margin: number = 3): string[] {
    const out: string[] = []
    const target = this.hud.target
    if (!target) return [`${label}: arrows have no target`]
    const panelT = this.so("CounterPanel").getTransform()
    const yaw = this.signedBearingDeg(target)
    const to = target.sub(this.eye)
    const elev = Math.atan2(to.y, Math.sqrt(to.x * to.x + to.z * to.z)) * RAD2DEG
    const pitch = elev - Math.asin(Math.max(-1, Math.min(1, this.look.y))) * RAD2DEG
    const turn = this.hud.turnCue
    const tilt = this.hud.tiltCue
    const a = Math.abs(yaw)
    const near = (x: number, t: number) => Math.abs(x - t) <= margin
    let wantTurn: string | null = null
    if (!near(a, 10) && !near(a, 90)) {
      if (a < 10) wantTurn = "none"
      else if (a < 90) wantTurn = yaw > 0 ? "right" : "left"
      else if (a < 180 - 10) wantTurn = yaw > 0 ? "turn-right" : "turn-left"
      else wantTurn = "turn-*" // straight behind: either way is as short
    }
    if (wantTurn === "turn-*" ? turn !== "turn-left" && turn !== "turn-right" : wantTurn !== null && turn !== wantTurn) {
      out.push(`${label}: left/right arrow "${turn}", expected "${wantTurn}" (target ${yaw.toFixed(1)} deg to the right)`)
    }
    let wantTilt: string | null = null
    if (!near(Math.abs(pitch), 10)) wantTilt = Math.abs(pitch) < 10 ? "none" : pitch > 0 ? "up" : "down"
    if (wantTilt !== null && tilt !== wantTilt) {
      out.push(`${label}: up/down arrow "${tilt}", expected "${wantTilt}" (target ${pitch.toFixed(1)} deg above the gaze)`)
    }
    // What is drawn.
    if (this.arrowShown("TurnArrow") !== (turn !== "none")) out.push(`${label}: left/right arrow drawn ${this.arrowShown("TurnArrow")} for "${turn}"`)
    if (this.arrowShown("TiltArrow") !== (tilt !== "none")) out.push(`${label}: up/down arrow drawn ${this.arrowShown("TiltArrow")} for "${tilt}"`)
    if (turn === "left" || turn === "right") {
      const px = this.so("TurnArrow").getTransform().right.dot(panelT.right) // arrow_forward points along +X
      if (this.arrowIcon("TurnArrow") !== "arrow_forward" || (turn === "right" ? px < 0.9 : px > -0.9)) {
        out.push(`${label}: "${turn}" drawn as ${this.arrowIcon("TurnArrow")} pointing ${px.toFixed(2)} along the panel's right`)
      }
    }
    if (turn === "turn-left" || turn === "turn-right") {
      const want = turn === "turn-left" ? "360" : "360_mirrored"
      if (this.arrowIcon("TurnArrow") !== want) out.push(`${label}: "${turn}" drawn as ${this.arrowIcon("TurnArrow")} (expected the ring arrow ${want})`)
    }
    if (tilt !== "none") {
      const py = this.so("TiltArrow").getTransform().up.dot(panelT.up) // arrow_upward points along +Y
      if (this.arrowIcon("TiltArrow") !== "arrow_upward" || (tilt === "up" ? py < 0.9 : py > -0.9)) {
        out.push(`${label}: "${tilt}" drawn as ${this.arrowIcon("TiltArrow")} pointing ${py.toFixed(2)} along the panel's up`)
      }
    }
    return out
  }

  /** World-space far end of a thread (its mesh is a unit box from local z=0 to z=1). */
  threadEnd(thread: SceneObject): vec3 {
    return thread.getTransform().getWorldTransform().multiplyPoint(new vec3(0, 0, 1))
  }

  // ── Holding the head ─────────────────────────────────────────────────────────

  private heldRot: quat | null = null
  private heldPos: vec3 | null = null
  private stopHolding: (() => void) | null = null

  /**
   * Hold the head at a pose every frame from now on (the preview re-poses the camera each frame, as LEAF's
   * IK head does). `pos` null keeps the preview's position. releaseHead() hands the head back.
   */
  holdHead(rot: quat | null, pos: vec3 | null = null): void {
    this.heldRot = rot
    this.heldPos = pos
    const t = this.cam.getTransform()
    if (pos) t.setWorldPosition(pos)
    if (rot) t.setWorldRotation(rot)
    if (!this.stopHolding) {
      this.stopHolding = UpdateDispatcher.getInstance().onUpdate.add(() => {
        if (this.heldPos) t.setWorldPosition(this.heldPos)
        if (this.heldRot) t.setWorldRotation(this.heldRot)
      })
    }
  }

  releaseHead(): void {
    if (this.stopHolding) this.stopHolding()
    this.stopHolding = null
    this.heldRot = null
    this.heldPos = null
  }

  /** The head rotation that looks along `dir`, upright. */
  lookRot(dir: vec3): quat {
    return quat.lookAt(dir.uniformScale(-1), vec3.up())
  }

  // ── What the player sees ─────────────────────────────────────────────────────

  basis(): ViewBasis {
    const t = this.cam.getTransform()
    return {eye: t.getWorldPosition(), fwd: t.back, right: t.right, up: t.up}
  }

  /** View coordinates of `p` (x right, y up; +-1 = the view's edges), or null when it is behind the eye. */
  viewXY(p: vec3, b: ViewBasis): vec2 | null {
    const v = p.sub(b.eye)
    const z = v.dot(b.fwd)
    if (z <= 1e-3) return null
    const tanV = Math.tan(this.cam.fov / 2)
    const tanH = tanV * this.cam.aspect
    return new vec2(v.dot(b.right) / (z * tanH), v.dot(b.up) / (z * tanV))
  }

  /** Largest |view coordinate| over the points (1 = on the view edge; > 1 = outside; 99 = behind the eye). */
  fill(pts: vec3[], b: ViewBasis): number {
    let m = 0
    for (const p of pts) {
      const xy = this.viewXY(p, b)
      if (!xy) return 99
      m = Math.max(m, Math.abs(xy.x), Math.abs(xy.y))
    }
    return m
  }

  /** The view rectangle around the points, or null if any is behind the eye. */
  viewRect(pts: vec3[], b: ViewBasis): ViewRect | null {
    const r = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity}
    for (const p of pts) {
      const xy = this.viewXY(p, b)
      if (!xy) return null
      r.x0 = Math.min(r.x0, xy.x)
      r.x1 = Math.max(r.x1, xy.x)
      r.y0 = Math.min(r.y0, xy.y)
      r.y1 = Math.max(r.y1, xy.y)
    }
    return r
  }

  overlaps(a: ViewRect, b: ViewRect): boolean {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  }

  rectText(r: ViewRect | null): string {
    return r ? `x ${r.x0.toFixed(2)}..${r.x1.toFixed(2)}, y ${r.y0.toFixed(2)}..${r.y1.toFixed(2)}` : "behind the eye"
  }

  /**
   * Corners of what is drawn under `root` (4 per plate, button or non-empty text, in that order). UIKit plates
   * and buttons are drawn by a shader on a placeholder mesh, so their AABB is not what you see (a plate's box
   * measured 1.00 of the view where the screenshot shows 0.77); they and text use their layout rectangles.
   * `names` gets the SceneObject name of each corner.
   */
  drawnCorners(root: string, names: string[] = []): vec3[] {
    const out: vec3[] = []
    const rect = (o: SceneObject, w: number, h: number, cx: number = 0, cy: number = 0) => {
      const m = o.getTransform().getWorldTransform()
      for (const x of [cx - w / 2, cx + w / 2])
        for (const y of [cy - h / 2, cy + h / 2]) {
          out.push(m.multiplyPoint(new vec3(x, y, 0)))
          names.push(o.name)
        }
    }
    const visit = (o: SceneObject) => {
      if (!o.isEnabledInHierarchy) return
      const plate = o.getComponent(BackPlate.getTypeName()) as BackPlate
      const button = o.getComponent(Button.getTypeName()) as Button
      if (plate) rect(o, plate.size.x, plate.size.y)
      else if (button) rect(o, button.size.x, button.size.y)
      for (const t of o.getComponents("Component.Text") as Text[]) {
        if (t.text === "") continue // empty line: draws nothing
        const r = t.layoutRect
        rect(o, r.right - r.left, r.top - r.bottom, (r.left + r.right) / 2, (r.top + r.bottom) / 2)
      }
      for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
    }
    visit(this.so(root))
    return out
  }

  /** The vertices of every mesh drawn under `root`, in world space (exact, where a box around a round shape is not). */
  meshPoints(root: SceneObject): vec3[] {
    const out: vec3[] = []
    const visit = (o: SceneObject) => {
      if (!o.isEnabledInHierarchy) return
      const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (v && v.mesh) {
        const m = o.getTransform().getWorldTransform()
        const xyz = v.mesh.extractVerticesForAttribute("position")
        for (let k = 0; k + 2 < xyz.length; k += 3) out.push(m.multiplyPoint(new vec3(xyz[k], xyz[k + 1], xyz[k + 2])))
      }
      for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
    }
    visit(root)
    return out
  }

  /** The open description and its buttons. */
  descriptionCorners(names: string[] = []): vec3[] {
    return this.drawnCorners("InspectInfo", names)
      .concat(this.drawnCorners("InspectFlipButtons", names))
      .concat(this.drawnCorners("InspectCloseButtons", names))
  }

  /** Each group of 4 corners (one drawn rectangle) and its centre. */
  withCentres(pts: vec3[], names: string[]): {pts: vec3[]; names: string[]} {
    const p = pts.slice()
    const n = names.slice()
    for (let i = 0; i + 3 < pts.length; i += 4) {
      p.push(pts[i].add(pts[i + 1]).add(pts[i + 2]).add(pts[i + 3]).uniformScale(0.25))
      n.push(`${names[i]} centre`)
    }
    return {pts: p, names: n}
  }

  centroid(pts: vec3[]): vec3 {
    let sum = vec3.zero()
    for (const p of pts) sum = sum.add(p)
    return sum.uniformScale(1 / Math.max(1, pts.length))
  }

  // ── What can stand in the way ────────────────────────────────────────────────

  standIn(name: string): CaseRoomStandIn {
    return this.so(name).getComponent(CaseRoomStandIn.getTypeName()) as CaseRoomStandIn
  }

  /** The room's solid things: every stand-in's boxes and every clue's mesh boxes, except `skipClueSo`'s. */
  solids(skipClueSo: string = ""): NamedSolid[] {
    const out: NamedSolid[] = []
    for (const n of STAND_INS) for (const box of this.standIn(n).worldBoxes()) out.push({name: n, box})
    for (const c of CLUES) {
      if (c.so === skipClueSo) continue
      for (const box of this.clue(c.so).worldBoxes()) out.push({name: c.so, box})
    }
    return out
  }

  /**
   * The stand-ins' boxes are what is drawn: for each stand-in, the bounding box of its boxes' corners and the
   * bounding box of its drawn mesh agree (within 0.5 cm). Returns the mismatches.
   */
  standInBoxProblems(): string[] {
    const out: string[] = []
    for (const n of STAND_INS) {
      const boxes = this.standIn(n).worldBoxes()
      if (boxes.length === 0) {
        out.push(`${n} has no boxes (hidden?)`)
        continue
      }
      // A vec3 cannot hold Infinity (it reads back as 0), so start from a large finite size.
      let lo = new vec3(1e9, 1e9, 1e9)
      let hi = new vec3(-1e9, -1e9, -1e9)
      for (const b of boxes) {
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            for (const sz of [-1, 1]) {
              const p = b.center
                .add(b.axes[0].uniformScale(sx * b.half.x))
                .add(b.axes[1].uniformScale(sy * b.half.y))
                .add(b.axes[2].uniformScale(sz * b.half.z))
              lo = new vec3(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z))
              hi = new vec3(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z))
            }
      }
      const visual = this.child(this.so(n), "StandInVisual")
      const meshSo = visual ? this.child(visual, "Mesh") : null
      if (!meshSo) {
        out.push(`${n} has no drawn mesh`)
        continue
      }
      const mesh = meshSo.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const d =Math.max(lo.distance(mesh.worldAabbMin()), hi.distance(mesh.worldAabbMax()))
      if (d > 0.5) {
        const list = boxes.map((b) => `c ${b.center} h ${b.half} x ${b.axes[0]}`).join(" | ")
        out.push(`${n}: boxes span ${lo}..${hi}, mesh ${mesh.worldAabbMin()}..${mesh.worldAabbMax()}; boxes: ${list}`)
      }
    }
    return out
  }

  /** Where (0..1 along a -> b) the segment first enters the box, or -1 if it misses it. */
  segmentEnters(a: vec3, b: vec3, box: SolidBox): number {
    let t0 = 0
    let t1 = 1
    const d = b.sub(a)
    const h = [box.half.x, box.half.y, box.half.z]
    for (let i = 0; i < 3; i++) {
      const o = a.sub(box.center).dot(box.axes[i])
      const v = d.dot(box.axes[i])
      if (Math.abs(v) < 1e-9) {
        if (Math.abs(o) > h[i]) return -1
        continue
      }
      let ta = (-h[i] - o) / v
      let tb = (h[i] - o) / v
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) return -1
    }
    return t0
  }

  /** For each point hidden from `eye` by one of `solids`: "<point> behind <solid>". */
  hiddenBy(eye: vec3, pts: vec3[], names: string[], solids: NamedSolid[]): string[] {
    const out: string[] = []
    pts.forEach((p, i) => {
      for (const s of solids) {
        const t = this.segmentEnters(eye, p, s.box)
        if (t >= 0 && t < 0.999) {
          out.push(`${names[i]} behind ${s.name} (${(t * eye.distance(p)).toFixed(0)} cm from the eye)`)
          break
        }
      }
    })
    return out
  }

  /** Name of the nearest *Button ancestor of the first collider a ray hits, "other:<name>" for any other collider, "" for none. */
  async firstButtonHit(probe: Probe, start: vec3, end: vec3): Promise<string> {
    let result: string | null = null
    probe.rayCast(start, end, (hit) => {
      if (!hit) {
        result = ""
        return
      }
      let o = hit.collider.getSceneObject()
      while (o && !o.name.endsWith("Button")) o = o.getParent()
      result = o ? o.name : `other:${hit.collider.getSceneObject().name}`
    })
    for (let i = 0; i < 30 && result === null; i++) await nextFrame()
    if (result === null) throw new Error("ray cast never returned")
    return result
  }

  /**
   * Rays from the eye and from a right-hand position (20 cm right, 35 cm down, 25 cm forward of the eye,
   * with the head as in `b`) to each shown button of the open description: the first thing each ray hits
   * must be that button. Returns the problems.
   */
  async buttonRayProblems(probe: Probe, b: ViewBasis, label: string): Promise<string[]> {
    const out: string[] = []
    const hand = b.eye.add(b.right.uniformScale(20)).add(b.up.uniformScale(-35)).add(b.fwd.uniformScale(25))
    for (const btn of ["FlipButton", "CloseButton"]) {
      if (!this.isShown(btn)) continue
      const target = this.world(btn)
      for (const [who, origin] of [["eye", b.eye], ["right hand", hand]] as [string, vec3][]) {
        const end = origin.add(target.sub(origin).normalize().uniformScale(target.sub(origin).length + 30))
        const hit = await this.firstButtonHit(probe, origin, end)
        if (hit !== btn) out.push(`${label}: ray from the ${who} to ${btn} hits ${hit || "nothing"} first`)
      }
    }
    return out
  }

  /**
   * While a description is open: the arrows are put away, the counter stands still (pinned) and does not
   * overlap the description as seen with the head as in `b`. Returns the problems.
   */
  counterProblems(b: ViewBasis, label: string): string[] {
    const out: string[] = []
    if (this.arrowShown("TurnArrow") || this.arrowShown("TiltArrow")) out.push(`${label}: an arrow is shown while the description is open`)
    if (!this.isShown("CounterPanel")) out.push(`${label}: counter not shown`)
    if (!this.hud.isPinned) out.push(`${label}: counter still following the head`)
    const d = this.viewRect(this.descriptionCorners(), b)
    const c = this.viewRect(this.drawnCorners("CounterPanel"), b)
    if (d && c && this.overlaps(d, c)) out.push(`${label}: counter (${this.rectText(c)}) overlaps the description (${this.rectText(d)})`)
    return out
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  near(label: string, actual: number, expected: number, tol: number): void {
    const ok = Math.abs(actual - expected) <= tol
    expect(ok, `${label}: got ${actual.toFixed(3)}, expected ${expected} ± ${tol}`).toBe(true)
  }

  between(label: string, actual: number, lo: number, hi: number): void {
    expect(actual >= lo && actual <= hi, `${label}: got ${actual.toFixed(3)}, expected between ${lo} and ${hi}`).toBe(true)
  }

  // ── Waiting ──────────────────────────────────────────────────────────────────

  /** Poll every frame until `cond` holds; throws after `timeoutMs` (Lens time). Returns seconds waited. */
  async waitUntil(label: string, cond: () => boolean, timeoutMs: number): Promise<number> {
    const t0 = getTime()
    while (!cond()) {
      if ((getTime() - t0) * 1000 > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${label}`)
      await nextFrame()
    }
    return getTime() - t0
  }

  // ── Interactions ─────────────────────────────────────────────────────────────

  async tap(name: string): Promise<void> {
    await this.trigger(this.interactable(name))
    await nextFrame()
  }

  // ── Shared setup steps ───────────────────────────────────────────────────────

  /** Wait for the opening board, press Start, wait until all 5 clues are revealed and pinchable. */
  async startGame(): Promise<void> {
    await this.waitUntil("opening board shown in phase intro", () => this.phase === "intro" && this.isShown("OpeningBoard"), 5000)
    await this.tap("StartButton")
    await this.waitUntil("phase explore after Start", () => this.phase === "explore", 2000)
    await this.waitUntil(
      "all 5 clues revealed and pinchable",
      () => CLUES.every((c) => this.isRevealed(c.so) && this.isPinchable(c.so)),
      5000,
    )
    this.log("started")
  }

  /** Clues with something to turn over get "Flip" next to "Close" (all but the footprints). */
  hasFlip(clueSo: string): boolean {
    return !this.clue(clueSo).info.noFlip
  }

  /** Pinch a clue and wait until its description and buttons show just above it. */
  async inspect(clueSo: string): Promise<void> {
    await this.tap(clueSo)
    const flip = this.hasFlip(clueSo)
    await this.waitUntil(
      `${clueSo} described with ${flip ? "Flip and Close" : "Close only"}`,
      () =>
        this.phase === "inspect" &&
        this.isShown("InspectInfo") &&
        this.isShown("CloseButton") &&
        this.isShown("FlipButton") === flip,
      2000,
    )
  }

  /** Press Flip and wait for the back text and the 0.5 s turn. */
  async flip(): Promise<void> {
    await this.tap("FlipButton")
    await this.waitUntil("back text after Flip", () => this.text("InspectBackText") !== "", 2000)
    await sleep(650)
  }

  /** Press Close and wait until phase leaves "inspect". */
  async close(): Promise<void> {
    await this.tap("CloseButton")
    await this.waitUntil("description closed", () => this.phase !== "inspect", 2000)
  }

  async inspectAndClose(clueSo: string): Promise<void> {
    const before = this.main.foundCount
    await this.inspect(clueSo)
    await this.close()
    expect(this.main.foundCount, `found count after closing ${clueSo}`).toBe(before + 1)
    this.log(`${clueSo} closed -> ${this.text("CounterText")}`)
  }

  /** Inspect and close every clue not yet inspected, in the brief's order. */
  async findRemainingClues(): Promise<void> {
    for (const c of CLUES) {
      if (!this.clue(c.so).inspected) await this.inspectAndClose(c.so)
    }
  }

  /** Wait for the suspect line-up (phase suspects, all 3 pinchable) and for the counter to hide. */
  async waitForSuspects(): Promise<void> {
    await this.waitUntil(
      "3 suspects pinchable in phase suspects",
      () => this.phase === "suspects" && SUSPECTS.every((s) => this.isPinchable(s.so)),
      4000,
    )
    await this.waitUntil("counter hidden after the suspects appear", () => !this.isShown("CounterPanel"), 4000)
  }

  /** Start, find all 5 clues and wait for the line-up. */
  async reachSuspects(): Promise<void> {
    await this.startGame()
    await this.findRemainingClues()
    await this.waitForSuspects()
    this.log("suspects ready")
  }

  /** Pinch a suspect and wait for their alibi bubble and the Accuse button. */
  async select(suspectSo: string): Promise<void> {
    await this.tap(suspectSo)
    await this.waitUntil(
      `alibi bubble + Accuse button for ${suspectSo}`,
      () => this.isShown("AlibiBubble") && this.isShown("AccuseButton") && this.suspect(suspectSo).isSelected,
      2000,
    )
  }

  /**
   * Wait until the accusation has drawn its 6 glowing threads (one from each gathered clue to a
   * convergence point, then one from there toward the suspect) and they have finished growing.
   * Returns the threads in creation order; index 5 is the one toward the suspect.
   */
  async waitForThreads(): Promise<SceneObject[]> {
    await this.waitUntil("6 accusation threads drawn", () => this.children("Threads").length === 6, 5000)
    await sleep(800) // the last thread grows over 0.7 s
    return this.children("Threads")
  }

  log(msg: string): void {
    print(`[${this.logTag}] ${msg}`)
  }
}
