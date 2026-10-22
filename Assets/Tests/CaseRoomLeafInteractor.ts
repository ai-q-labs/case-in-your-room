import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CaseRoomClue} from "../Scripts/CaseRoomClue"
import {CaseRoomMain} from "../Scripts/CaseRoomMain"
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
  putBack: "Put back",
  nothingOnBack: "Nothing on the back.",
  suspectsAppeared: "The suspects have appeared",
  accuse: "Accuse this person",
  wrong: "That doesn't match the clues",
  truth: "Sensing she was about to be cut out of the will, Nora Vale put something in his tea.",
}

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

/**
 * Shared LEAF helper for "Case in Your Room": scripted SIK interactions by SceneObject name,
 * scene/state lookups, camera-relative geometry, and the setup steps every scenario reuses
 * (Start, inspect / flip / put back a clue, find all clues, reach the suspect line-up, accuse).
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

  /**
   * Angle in degrees between where the arrow icon points (its +Y, projected onto the view plane)
   * and the on-screen direction toward `target` (sideways toward the shorter turn when behind).
   */
  arrowErrorDeg(target: vec3): number {
    const camT = this.cam.getTransform()
    const up = this.so("DirectionArrow").getTransform().up
    const a1 = Math.atan2(up.dot(camT.right), up.dot(camT.up))
    const to = target.sub(camT.getWorldPosition())
    let dx = to.dot(camT.right)
    let dy = to.dot(camT.up)
    if (to.dot(camT.back) < 0) {
      dy = 0
      dx = dx >= 0 ? 1 : -1
    }
    const a2 = Math.atan2(dx, dy)
    let d = Math.abs(a1 - a2) * RAD2DEG
    if (d > 180) d = 360 - d
    return d
  }

  /** World-space far end of a thread (its mesh is a unit box from local z=0 to z=1). */
  threadEnd(thread: SceneObject): vec3 {
    return thread.getTransform().getWorldTransform().multiplyPoint(new vec3(0, 0, 1))
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

  /** Clues described where they lie instead of coming to the hands (no Flip; a Close button). */
  isInPlace(clueSo: string): boolean {
    return !!this.clue(clueSo).info.inPlace
  }

  /** Pinch a clue and wait until its description and buttons show (held, or in place with Close). */
  async inspect(clueSo: string): Promise<void> {
    await this.tap(clueSo)
    const inPlace = this.isInPlace(clueSo)
    await this.waitUntil(
      `${clueSo} ${inPlace ? "described in place with Close" : "held with description and buttons"}`,
      () =>
        this.phase === "inspect" &&
        this.isShown("InspectInfo") &&
        (inPlace ? this.isShown("CloseButton") : this.isShown("FlipButton") && this.isShown("PutBackButton")),
      4000, // the rise takes up to 2.2 s (followable pace)
    )
  }

  /** Press Flip and wait for the back text and the 0.5 s spin. */
  async flip(): Promise<void> {
    await this.tap("FlipButton")
    await this.waitUntil("back text after Flip", () => this.text("InspectBackText") !== "", 2000)
    await sleep(650)
  }

  /** Press Put back (or Close, for a clue described in place) and wait until phase leaves "inspect". */
  async putBack(): Promise<void> {
    await this.tap(this.isShown("CloseButton") ? "CloseButton" : "PutBackButton")
    await this.waitUntil("clue back in its place", () => this.phase !== "inspect", 3000)
  }

  async inspectAndPutBack(clueSo: string): Promise<void> {
    const before = this.main.foundCount
    await this.inspect(clueSo)
    await this.putBack()
    expect(this.main.foundCount, `found count after putting back ${clueSo}`).toBe(before + 1)
    this.log(`${clueSo} put back -> ${this.text("CounterText")}`)
  }

  /** Inspect and put back every clue not yet inspected, in the brief's order. */
  async findRemainingClues(): Promise<void> {
    for (const c of CLUES) {
      if (!this.clue(c.so).inspected) await this.inspectAndPutBack(c.so)
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
