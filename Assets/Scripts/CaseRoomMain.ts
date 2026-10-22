import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CaseRoomCaptionUI} from "./CaseRoomCaptionUI"
import {CaseRoomClue} from "./CaseRoomClue"
import {CaseRoomClueTagUI} from "./CaseRoomClueTagUI"
import {ClueId, CLUES, counterText, REPLAY_ORDER, REVEAL_ORDER, SUSPECTS, TEXT, TOTAL_CLUES, CULPRIT_INDEX} from "./CaseRoomData"
import {CaseRoomHudUI} from "./CaseRoomHudUI"
import {CaseRoomInspectPanelUI} from "./CaseRoomInspectPanelUI"
import {DEG, faceTowardYaw, flatForward, yawQuat} from "./CaseRoomMeshes"
import {CaseRoomOpeningBoardUI} from "./CaseRoomOpeningBoardUI"
import {CaseRoomReplay, ReplayStop} from "./CaseRoomReplay"
import {nearestDepth, SolidBox} from "./CaseRoomSightline"
import {CaseRoomStandIn} from "./CaseRoomStandIn"
import {CaseRoomSuspect} from "./CaseRoomSuspect"
import {CaseRoomSuspectsUI} from "./CaseRoomSuspectsUI"
import {CaseRoomTruthPanelUI} from "./CaseRoomTruthPanelUI"

type Phase = "intro" | "explore" | "inspect" | "suspects" | "accusing" | "replay" | "ended"

/**
 * CaseRoomMain — orchestrates "Case in Your Room": opening board -> explore and inspect the 5 clues
 * -> suspects appear -> accuse (2 wrong = replay with the right culprit) -> replay -> truth.
 *
 * Owns: the game phase, which clues have been put back, the selected suspect and the wrong-guess
 * count (the single source of truth for game state). Places the room, board, line-up and panels
 * relative to the player. Pushes state into the passive UI modules and listens to their events.
 * Expects: every @input below wired by the scene bootstrap.
 * Must not: create UI text or UIKit components (those live in the CaseRoom*UI modules), or build
 * geometry (CaseRoomClue / CaseRoomSuspect / CaseRoomStandIn / CaseRoomReplay do).
 * Size note: ~650 lines, of which ~180 are the Inspector @input block; kept whole so the flow reads end
 * to end. Candidate split: the placement helpers (describeInPlace, lineupDistance) and the replay hand-off.
 */
@component
export class CaseRoomMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomMain – game flow for Case in Your Room</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Root of the crime scene (stand-ins + clues); moved under the player at Start")
  crimeScene: SceneObject

  @input
  @hint("Root of the suspect line-up; placed straight ahead when the suspects appear")
  suspectLineup: SceneObject

  @input
  @hint("Clue 1: memo on the desk")
  clueMemo: CaseRoomClue

  @input
  @hint("Clue 2: footprints on the floor")
  clueFootprints: CaseRoomClue

  @input
  @hint("Clue 3: stopped clock on the wall")
  clueClock: CaseRoomClue

  @input
  @hint("Clue 4: broken glass on the chair")
  clueGlass: CaseRoomClue

  @input
  @hint("Clue 5: torn photo above head height")
  cluePhoto: CaseRoomClue

  @input
  @hint("Stand-in desk (top at 75 cm)")
  standInDesk: CaseRoomStandIn

  @input
  @hint("Stand-in chair (seat at 45 cm)")
  standInChair: CaseRoomStandIn

  @input
  @hint("Stand-in wall section for the clock")
  standInWall: CaseRoomStandIn

  @input
  @hint("Suspect figure: Edgar Hale")
  suspectEdgar: CaseRoomSuspect

  @input
  @hint("Suspect figure: Nora Vale")
  suspectNora: CaseRoomSuspect

  @input
  @hint("Suspect figure: Iris Bell")
  suspectIris: CaseRoomSuspect

  @input
  @hint("Opening board UI")
  openingBoard: CaseRoomOpeningBoardUI

  @input
  @hint("Counter + arrow HUD UI")
  hud: CaseRoomHudUI

  @input
  @hint("Caption UI")
  caption: CaseRoomCaptionUI

  @input
  @hint("Inspect panel UI (description + Flip / Close, shown just above the clue)")
  inspectPanel: CaseRoomInspectPanelUI

  @input
  @hint("Clue name tag UI")
  clueTag: CaseRoomClueTagUI

  @input
  @hint("Suspect names / alibi / Accuse UI")
  suspectsUI: CaseRoomSuspectsUI

  @input
  @hint("Truth panel UI")
  truthPanel: CaseRoomTruthPanelUI

  @input
  @hint("Replay controller (gather, threads, culprit walk)")
  replay: CaseRoomReplay
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Sounds</span>')
  @ui.group_start("Sounds")
  @input
  @hint("Chime for the 1st clue to light up after Start (REVEAL_ORDER; rising pitch)")
  chime1: AudioTrackAsset

  @input
  @hint("Chime for the 2nd clue to light up after Start (REVEAL_ORDER; rising pitch)")
  chime2: AudioTrackAsset

  @input
  @hint("Chime for the 3rd clue to light up after Start (REVEAL_ORDER; rising pitch)")
  chime3: AudioTrackAsset

  @input
  @hint("Chime for the 4th clue to light up after Start (REVEAL_ORDER; rising pitch)")
  chime4: AudioTrackAsset

  @input
  @hint("Chime for the 5th clue to light up after Start (REVEAL_ORDER; rising pitch)")
  chime5: AudioTrackAsset
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Player eye height in cm; the floor is placed this far below the eyes at Start")
  @widget(new SliderWidget(120, 200, 1))
  eyeHeightCm: number = 160

  @input
  @hint("Opening board distance straight ahead, in cm")
  @widget(new SliderWidget(60, 250, 1))
  boardDistanceCm: number = 120

  @input
  @hint("Viewing distance, in cm, whose look the description and buttons copy: shown just above a clue that is farther away, they are scaled up so they look as big as at this distance")
  @widget(new SliderWidget(30, 100, 1))
  inspectDistanceCm: number = 50

  @input
  @hint("Share of the view the description + buttons may fill, edge to edge, for a player looking at them")
  @widget(new SliderWidget(0.5, 1, 0.01))
  inspectViewFill: number = 0.85

  @input
  @hint("Gap in degrees, as the player sees it, between the top of a clue and the bottom of its description")
  @widget(new SliderWidget(0, 10, 0.5))
  inPlaceGapDeg: number = 2

  @input
  @hint("Gap, in cm at the inspect look, between the top of an open description and the counter standing above it")
  @widget(new SliderWidget(0, 10, 0.5))
  counterGapCm: number = 3

  @input
  @hint("Margin, in cm at the inspect look, around the description, buttons and counter that must be clear of furniture and other clues")
  @widget(new SliderWidget(0, 6, 0.5))
  clearanceCm: number = 2

  @input
  @hint("How far in front of the nearest thing in the way a description is drawn when it has to come nearer than its clue, in cm")
  @widget(new SliderWidget(1, 20, 0.5))
  clearanceDepthCm: number = 5

  @input
  @hint("Nearest a description may come to the eyes when something stands in front of its clue, in cm")
  @widget(new SliderWidget(25, 80, 1))
  inspectNearCm: number = 35

  @input
  @hint("Nearest the suspect line-up may stand straight ahead, in cm (it stands farther when it would not fit the view)")
  @widget(new SliderWidget(100, 300, 1))
  lineupDistanceCm: number = 200

  @input
  @hint("Share of the view the whole line-up (figures, names, alibi bubble, Accuse button) may fill, edge to edge, for a player looking level at it")
  @widget(new SliderWidget(0.5, 1, 0.01))
  lineupViewFill: number = 0.85
  @ui.group_end

  @ui.separator
  @ui.group_start("Debug")
  @input
  @hint("Print flow events to the log")
  debugLog: boolean = true
  @ui.group_end

  private phase: Phase = "intro"
  private clues: CaseRoomClue[] = []
  private suspects: CaseRoomSuspect[] = []
  private found = 0
  private inspecting: CaseRoomClue | null = null
  private selected = -1
  private wrongCount = 0
  private camT: Transform = null
  private cam: Camera = null
  private frames = 0
  private boardPlaced = false
  private chimes: AudioComponent[] = []
  /** Gap between the figures' heads and the "suspects have appeared" message above them, in cm. */
  private readonly messageGapCm = 3

  /** Current phase, for tests and debugging. */
  get currentPhase(): string {
    return this.phase
  }

  get foundCount(): number {
    return this.found
  }

  onAwake(): void {
    const required: [string, any][] = [
      ["crimeScene", this.crimeScene], ["suspectLineup", this.suspectLineup],
      ["clueMemo", this.clueMemo], ["clueFootprints", this.clueFootprints], ["clueClock", this.clueClock],
      ["clueGlass", this.clueGlass], ["cluePhoto", this.cluePhoto],
      ["standInDesk", this.standInDesk], ["standInChair", this.standInChair], ["standInWall", this.standInWall],
      ["suspectEdgar", this.suspectEdgar], ["suspectNora", this.suspectNora], ["suspectIris", this.suspectIris],
      ["openingBoard", this.openingBoard], ["hud", this.hud], ["caption", this.caption],
      ["inspectPanel", this.inspectPanel], ["clueTag", this.clueTag], ["suspectsUI", this.suspectsUI],
      ["truthPanel", this.truthPanel], ["replay", this.replay],
    ]
    const missing = required.filter((r) => !r[1]).map((r) => r[0])
    if (missing.length > 0) {
      print(`[CaseRoomMain] ERROR: @input not wired: ${missing.join(", ")}`)
      return
    }
    this.clues = [this.clueMemo, this.clueFootprints, this.clueClock, this.clueGlass, this.cluePhoto]
    this.suspects = [this.suspectEdgar, this.suspectNora, this.suspectIris]

    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    const cam = WorldCameraFinderProvider.getInstance().getComponent()
    this.cam = cam
    this.camT = cam ? cam.getTransform() : null
    this.openingBoard.onStart.add(() => this.onStartPressed())
    for (const c of this.clues) {
      c.onPressed.add((clue) => this.onCluePressed(clue))
      c.onHoverChanged.add((on) => this.onClueHover(c, on))
    }
    this.inspectPanel.onFlip.add(() => this.onFlip())
    this.inspectPanel.onClose.add(() => this.closeInspect())
    for (const s of this.suspects) s.onPressed.add((i) => this.onSuspectPressed(i))
    this.suspectsUI.onAccuse.add(() => this.onAccuse())
    this.setupChimes()
    this.log("ready")
  }

  /** One chime per clue (Assets/GeneratedSFX), rising in pitch in the order the clues light up after Start. */
  private setupChimes(): void {
    const tracks = [this.chime1, this.chime2, this.chime3, this.chime4, this.chime5]
    this.chimes = this.clues.map((c) => {
      const j = REVEAL_ORDER.indexOf(c.info.id)
      if (!tracks[j]) {
        print(`[CaseRoomMain] chime${j + 1} not wired; ${c.info.id} lights up silently`)
        return null
      }
      const a = c.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent
      a.audioTrack = tracks[j]
      a.playbackMode = Audio.PlaybackMode.LowLatency
      a.volume = 0.6
      return a
    })
  }

  private onUpdate(): void {
    this.frames++
    if (!this.camT) return
    if (!this.boardPlaced && this.frames >= 2) {
      this.boardPlaced = true
      const eye = this.camT.getWorldPosition()
      const pos = eye.add(flatForward(this.camT).uniformScale(this.boardDistanceCm))
      const t = this.openingBoard.getSceneObject().getTransform()
      t.setWorldPosition(pos)
      t.setWorldRotation(faceTowardYaw(pos, eye))
      this.log(`board placed; eye=${eye.toString()} look=${this.camT.back.toString()}`)
    }
    // While a description is open the arrows are put away (they would sit over the text).
    if (this.phase === "explore") this.hud.setArrowTarget(this.nextUnfoundClue())
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  private onStartPressed(): void {
    if (this.phase !== "intro") return
    this.phase = "explore"
    this.openingBoard.hide(0.5)

    // Center the room on the player's position and facing at Start (no surface detection).
    const eye = this.camT.getWorldPosition()
    const fwd = flatForward(this.camT)
    const rt = this.crimeScene.getTransform()
    rt.setWorldPosition(new vec3(eye.x, eye.y - this.eyeHeightCm, eye.z))
    rt.setWorldRotation(yawQuat(Math.atan2(-fwd.x, -fwd.z)))
    for (const s of [this.standInDesk, this.standInChair, this.standInWall]) s.setVisible(true)
    for (const c of this.clues) c.captureRestPose()

    // The stopped clock (straight ahead, on the front wall) is the one clue in view at Start, so it lights
    // up first, once the board has faded; the arrow then leads to the others.
    REVEAL_ORDER.forEach((id, j) => {
      const i = this.clues.indexOf(this.clueById(id))
      const c = this.clues[i]
      this.delay(0.6 + j * 0.45, () => {
        c.reveal()
        c.setInteractive(true)
        if (this.chimes[i]) this.chimes[i].play(1)
      })
    })
    this.caption.showCaption(TEXT.lookAround, 3)
    this.hud.setText(counterText(0))
    this.hud.setVisible(true)
    this.log("start: room placed, clues lighting up")
  }

  // ── Clues ────────────────────────────────────────────────────────────────────

  private onClueHover(c: CaseRoomClue, hovering: boolean): void {
    if (this.phase !== "explore" && this.phase !== "inspect") return
    if (!hovering || c === this.inspecting) {
      this.clueTag.hideTag()
      return
    }
    const above = Math.min(20, c.maxDimensionCm / 2) + 14
    const pos = c.restPosition.add(new vec3(0, above, 0))
    this.clueTag.showTag(c.info.name, pos, faceTowardYaw(pos, this.camT.getWorldPosition()))
  }

  /**
   * A clue was pinched. It stays where it lies and its description opens just above it. If another
   * clue's description is still open, that one closes first and counts exactly as if Close was pressed,
   * so the player can go from clue to clue without closing each one.
   */
  private onCluePressed(c: CaseRoomClue): void {
    if (this.phase === "inspect") {
      if (c === this.inspecting) return
      this.closeInspect()
      if ((this.phase as Phase) !== "explore") return // that close found the 5th clue: the suspects come next
    }
    if (this.phase !== "explore") return
    this.phase = "inspect"
    this.inspecting = c
    this.clueTag.hideTag()
    c.setInteractive(false) // the other clues stay pinchable
    c.setGlowMode("off") // the halo is wider than the clue and would sit behind the description
    this.hud.setArrowTarget(null)
    this.describeInPlace(c, this.camT.getWorldPosition())
  }

  /**
   * The clue stays where it is, and its name, description and buttons appear just above it as the player
   * sees it (bottom edge inPlaceGapDeg above the clue's highest visible point, so they never cover it),
   * facing the player, at the same apparent size as at inspectDistanceCm (shrunk if that would overfill
   * the view of a player looking at them). The counter stands just above them, at its usual look.
   * They are drawn at the clue's distance, or nearer when furniture or another clue stands in the way, and
   * then scaled down by the same amount so they look exactly the same: nothing in the room hides them or
   * the buttons, wherever the player stands.
   */
  private describeInPlace(c: CaseRoomClue, eye: vec3): void {
    const withFlip = !c.info.noFlip
    const r = this.inspectPanel.groupRect(withFlip)
    const halfW = (r.max.x - r.min.x) / 2
    const halfH = (r.max.y - r.min.y) / 2
    // The counter, in the description's units: it keeps its own look (hud.viewDistanceCm away).
    const counterScale = this.inspectDistanceCm / this.hud.viewDistanceCm
    const counter = this.hud.plateSizeFor(counterText(this.found)).uniformScale(counterScale)
    const top = halfH + this.counterGapCm + counter.y // top of the counter, above the description's centre
    const tanH = Math.tan(this.cam.fov / 2) * this.cam.aspect * this.inspectViewFill
    const tanV = Math.tan(this.cam.fov / 2) * this.inspectViewFill
    const rest = c.restPosition
    const dist = rest.sub(eye).length
    const k0 = Math.min(dist / this.inspectDistanceCm, (dist * tanH) / halfW, (dist * tanV) / top)
    // Angles measured from the line of sight to the clue, upward in the vertical plane that contains it.
    const toClue = rest.sub(eye).normalize()
    let up = vec3.up().sub(toClue.uniformScale(toClue.y))
    up = up.length > 1e-3 ? up.normalize() : vec3.forward()
    let clueTop = 0
    for (const p of c.worldCorners()) {
      const v = p.sub(eye)
      clueTop = Math.max(clueTop, Math.atan2(v.dot(up), v.dot(toClue)))
    }
    const lift = clueTop + this.inPlaceGapDeg * DEG + Math.atan2(halfH * k0, dist)
    const dir = toClue.uniformScale(Math.cos(lift)).add(up.uniformScale(Math.sin(lift)))
    const rot = quat.lookAt(dir.uniformScale(-1), vec3.up())
    const right = rot.multiplyVec3(vec3.right())
    const upP = rot.multiplyVec3(vec3.up())
    // The pyramid from the eye through the description, the buttons and the counter (plus a margin): the
    // nearest solid thing inside it decides how near they are drawn.
    const m = this.clearanceCm
    const at = (x: number, y: number) => eye.add(dir.uniformScale(dist)).add(right.uniformScale(x * k0)).add(upP.uniformScale(y * k0))
    const corners = [at(-halfW - m, -halfH - m), at(halfW + m, -halfH - m), at(halfW + m, top + m), at(-halfW - m, top + m)]
    const nearest = nearestDepth(eye, dir, corners, this.solidsBesides(c))
    const depth = Math.max(this.inspectNearCm, Math.min(dist, nearest - this.clearanceDepthCm))
    const k = (k0 * depth) / dist
    const center = eye.add(dir.uniformScale(depth))
    const cx = ((r.min.x + r.max.x) / 2) * k
    const cy = ((r.min.y + r.max.y) / 2) * k
    const pos = center.sub(right.uniformScale(cx)).sub(upP.uniformScale(cy))
    const t = this.inspectPanel.getSceneObject().getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(rot)
    t.setWorldScale(vec3.one().uniformScale(k))
    this.inspectPanel.layout(withFlip)
    this.inspectPanel.show(c.info.name, c.info.description, withFlip)
    this.hud.pinAbove(center.add(upP.uniformScale((halfH + this.counterGapCm) * k)), rot, k * counterScale)
    const why = depth < dist - 0.01 ? `, drawn ${depth.toFixed(1)} cm away (something in the way at ${nearest.toFixed(1)})` : ""
    this.log(`describe ${c.info.id} in place: ${dist.toFixed(1)} cm away${why}, scale ${k.toFixed(2)}, ${(lift / DEG).toFixed(1)} deg above it`)
  }

  /** Everything solid that could stand between the player and a description: the stand-in furniture and the other clues. */
  private solidsBesides(c: CaseRoomClue): SolidBox[] {
    let out: SolidBox[] = []
    for (const s of [this.standInDesk, this.standInChair, this.standInWall]) out = out.concat(s.worldBoxes())
    for (const k of this.clues) if (k !== c) out = out.concat(k.worldBoxes())
    return out
  }

  private onFlip(): void {
    const c = this.inspecting
    if (this.phase !== "inspect" || !c || c.info.noFlip) return
    c.flip(0.5)
    const back = c.info.backText
    this.inspectPanel.setBackText(c.isFlipped ? (back ? TEXT.backPrefix + back : TEXT.nothingOnBack) : "")
    this.log(`flip ${c.info.id} -> ${c.isFlipped ? "back" : "front"}`)
  }

  /** Close the open description (Close button, or another clue pinched): the clue counts once, the first time. */
  private closeInspect(): void {
    const c = this.inspecting
    if (this.phase !== "inspect" || !c) return
    this.inspecting = null
    this.inspectPanel.hide()
    this.hud.unpin()
    c.unflip()
    const firstTime = !c.inspected
    c.markInspected()
    c.setInteractive(true)
    if (firstTime) {
      this.found++
      this.hud.setText(counterText(this.found))
      this.hud.pulse()
    }
    this.log(`close ${c.info.id}; found ${this.found}/${TOTAL_CLUES}`)
    if (this.found >= TOTAL_CLUES) {
      this.onAllFound()
    } else {
      this.phase = "explore"
    }
  }

  /** The uninspected clue closest to where the player is looking (for the arrow). */
  private nextUnfoundClue(): vec3 | null {
    const eye = this.camT.getWorldPosition()
    const look = this.camT.back
    let best: vec3 | null = null
    let bestDot = -2
    for (const c of this.clues) {
      if (c.inspected || c === this.inspecting) continue
      const d = c.restPosition.sub(eye).normalize()
      const dot = d.dot(look)
      if (dot > bestDot) {
        bestDot = dot
        best = c.restPosition
      }
    }
    return best
  }

  // ── Suspects ─────────────────────────────────────────────────────────────────

  private onAllFound(): void {
    this.phase = "suspects"
    for (const k of this.clues) k.setInteractive(false)
    this.hud.setArrowTarget(null)
    this.delay(1.0, () => {
      const eye = this.camT.getWorldPosition()
      const d = this.lineupDistance()
      const pos = eye.add(flatForward(this.camT).uniformScale(d))
      const t = this.suspectLineup.getTransform()
      t.setWorldPosition(pos)
      t.setWorldRotation(faceTowardYaw(pos, eye))
      for (const s of this.suspects) s.appear(0.8)
      this.suspectsUI.setVisible(true)
      // "The suspects have appeared" stands above the figures (where an alibi bubble goes later) instead of
      // under the line of sight, where it covered the names at their feet.
      this.hud.setText(TEXT.suspectsAppeared)
      const at = t.getWorldTransform().multiplyPoint(new vec3(0, this.figureTopCm() + this.messageGapCm, 4))
      this.hud.pinAbove(at, t.getWorldRotation(), d / this.hud.viewDistanceCm)
      this.hud.pulse()
      this.log(`suspects appeared ${d.toFixed(1)} cm away`)
      this.delay(2.5, () => this.hideSuspectsMessage())
    })
  }

  private hideSuspectsMessage(): void {
    this.hud.setVisible(false)
    this.hud.unpin()
  }

  private figureTopCm(): number {
    let top = 0
    for (const s of this.suspects) top = Math.max(top, s.localBoundsCm().max.y + s.getSceneObject().getTransform().getLocalPosition().y)
    return top
  }

  /**
   * How far ahead the line-up stands: far enough that all of it (the figures, the name labels, every place
   * the alibi bubble and the Accuse button can take, and the "suspects have appeared" message above the
   * figures) fills at most lineupViewFill of the view of a player looking level at it, the same idea as
   * the description's fit. Never nearer than lineupDistanceCm.
   */
  private lineupDistance(): number {
    const tanV = Math.tan(this.cam.fov / 2) * this.lineupViewFill
    const tanH = tanV * this.cam.aspect
    const boxes: {min: vec3; max: vec3}[] = [this.suspectsUI.localExtentCm()]
    for (const s of this.suspects) {
      // A bust is round: it is widest across at its centre's depth, not at its front.
      const b = s.localBoundsCm()
      const at = s.getSceneObject().getTransform().getLocalPosition()
      boxes.push({min: new vec3(b.min.x, b.min.y, 0).add(at), max: new vec3(b.max.x, b.max.y, 0).add(at)})
    }
    const y0 = this.figureTopCm() + this.messageGapCm
    let d = this.lineupDistanceCm
    // The message keeps its look (it is scaled with the distance), so a few passes settle it.
    for (let pass = 0; pass < 4; pass++) {
      const msg = this.hud.plateSizeFor(TEXT.suspectsAppeared).uniformScale(d / this.hud.viewDistanceCm)
      const all = boxes.concat([{min: new vec3(-msg.x / 2, y0, 4), max: new vec3(msg.x / 2, y0 + msg.y, 4)}])
      let need = this.lineupDistanceCm
      for (const b of all) {
        for (const x of [b.min.x, b.max.x]) {
          for (const y of [b.min.y, b.max.y]) {
            // A point b.max.z toward the player is that much nearer the eyes.
            need = Math.max(need, b.max.z + Math.abs(x) / tanH, b.max.z + Math.abs(y) / tanV)
          }
        }
      }
      d = need
    }
    return d
  }

  private onSuspectPressed(index: number): void {
    if (this.phase !== "suspects") return
    this.hideSuspectsMessage() // it stands where the alibi bubble goes
    this.selected = index
    this.suspects.forEach((s, k) => s.setSelected(k === index))
    this.suspectsUI.select(index)
    this.log(`select ${SUSPECTS[index].name}`)
  }

  private onAccuse(): void {
    if (this.phase !== "suspects" || this.selected < 0) return
    const index = this.selected
    this.selected = -1
    this.suspectsUI.clearSelection()
    this.phase = "accusing"
    if (SUSPECTS[index].isCulprit) {
      this.log(`accuse ${SUSPECTS[index].name}: right`)
      this.runReplay(index)
      return
    }
    this.wrongCount++
    this.log(`accuse ${SUSPECTS[index].name}: wrong (${this.wrongCount})`)
    this.replay.accuse(this.clues, this.suspectCenter(index), false, () => {
      this.suspects[index].setSelected(false)
      this.caption.showCaption(TEXT.wrong, 3)
      if (this.wrongCount >= 2) {
        this.delay(2.0, () => this.runReplay(CULPRIT_INDEX))
      } else {
        this.phase = "suspects"
      }
    })
  }

  private suspectCenter(index: number): vec3 {
    return this.suspects[index].getSceneObject().getTransform().getWorldPosition()
  }

  // ── Replay and truth ─────────────────────────────────────────────────────────

  private runReplay(culprit: number): void {
    this.phase = "accusing"
    this.caption.hideCaption()
    this.suspects.forEach((s, k) => s.setSelected(k === culprit))
    this.replay.accuse(this.clues, this.suspectCenter(culprit), true, () => {
      this.phase = "replay"
      const start = this.suspectCenter(culprit)
      const floorY = this.crimeScene.getTransform().getWorldPosition().y
      for (const s of this.suspects) s.setVisible(false)
      this.suspectsUI.setVisible(false)
      const stops: ReplayStop[] = REPLAY_ORDER.map((id: ClueId) => ({clue: this.clueById(id), caption: CLUES[id].replayCaption}))
      const center = this.crimeScene.getTransform().getWorldPosition()
      this.replay.walk(stops, new vec3(start.x, floorY, start.z), center, {
        onCaption: (text) => this.caption.showCaption(text, 0),
        onFinished: (top) => this.showTruth(top),
      })
      this.log("replay walking")
    })
  }

  private showTruth(figureTop: vec3): void {
    this.phase = "ended"
    this.caption.hideCaption()
    const eye = this.camT.getWorldPosition()
    let dir = new vec3(figureTop.x - eye.x, 0, figureTop.z - eye.z)
    dir = dir.length > 1e-3 ? dir.normalize() : flatForward(this.camT)
    const pos = eye.add(dir.uniformScale(150)).add(new vec3(0, 22, 0))
    this.truthPanel.showTruth(TEXT.truth, pos, faceTowardYaw(pos, eye))
    this.log("truth shown")
  }

  private clueById(id: ClueId): CaseRoomClue {
    return this.clues.filter((c) => c.info.id === id)[0]
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private delay(seconds: number, fn: () => void): void {
    const ev = this.createEvent("DelayedCallbackEvent")
    ev.bind(fn)
    ev.reset(seconds)
  }

  private log(msg: string): void {
    if (this.debugLog) print(`[CaseRoom] ${msg}`)
  }
}
