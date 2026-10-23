import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CaseRoomCaptionUI} from "./CaseRoomCaptionUI"
import {CaseRoomClue} from "./CaseRoomClue"
import {CaseRoomClueTagUI} from "./CaseRoomClueTagUI"
import {ClueId, CLUES, counterText, REPLAY_ORDER, REVEAL_ORDER, SUSPECTS, TEXT, TOTAL_CLUES, CULPRIT_INDEX} from "./CaseRoomData"
import {CaseRoomHudUI} from "./CaseRoomHudUI"
import {CaseRoomInspectPanelUI} from "./CaseRoomInspectPanelUI"
import {faceTowardYaw, flatForward, yawQuat} from "./CaseRoomMeshes"
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
 * Size note: ~700 lines, of which ~180 are the Inspector @input block; kept whole so the flow reads end
 * to end. Candidate split: the placement helpers (describeInPlace, placeLineup) and the replay hand-off.
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
  @hint("Distance, in cm, at which the counter, description and buttons open in the middle of the view (true size at this distance)")
  @widget(new SliderWidget(30, 100, 1))
  inspectDistanceCm: number = 50

  @input
  @hint("Share of the view the counter + description + buttons may fill, edge to edge")
  @widget(new SliderWidget(0.5, 1, 0.01))
  inspectViewFill: number = 0.85

  @input
  @hint("Gap, in cm at the inspect look, between the top of an open description and the counter standing above it")
  @widget(new SliderWidget(0, 10, 0.5))
  counterGapCm: number = 3

  @input
  @hint("Margin, in cm at the inspect look, around the description, buttons and counter that must be clear of furniture and other clues")
  @widget(new SliderWidget(0, 6, 0.5))
  clearanceCm: number = 2

  @input
  @hint("How far in front of the nearest thing in the way a description or the line-up is drawn when it has to come nearer, in cm")
  @widget(new SliderWidget(1, 20, 0.5))
  clearanceDepthCm: number = 5

  @input
  @hint("Nearest a description may come to the eyes when something stands in the way, in cm")
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

  @input
  @hint("Nearest the line-up may come when something stands in the way (it is then scaled down to look the same), in cm")
  @widget(new SliderWidget(60, 200, 1))
  lineupNearCm: number = 100
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
  /** True while "The suspects have appeared" stands above the line-up. */
  private messageUp = false

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
   * A clue was pinched. It stays where it lies and its description opens in the middle of where the player
   * is looking. If another clue's description is still open, that one closes first and counts exactly as if
   * Close was pressed, so the player can go from clue to clue without closing each one.
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
    this.describeInPlace(c, this.camT.getWorldPosition(), this.camT.back)
  }

  /**
   * The clue stays where it lies. Its counter, name, description and buttons open as one group in the middle
   * of where the player is looking (`look`), facing them, drawn at inspectDistanceCm at true size (shrunk only
   * if the group would fill more than inspectViewFill of the view). It may cover the clue. If anything solid
   * (furniture, a clue, the floor) stands nearer inside the pyramid from the eyes through the group, the
   * group is drawn in front of it and scaled down by the same amount, so it looks exactly the same.
   * It then stays where it opened while the head moves: the buttons stay still for the hand's ray, the
   * clue and the room can be seen past it by looking aside, and the line of sight measured here stays true.
   */
  private describeInPlace(c: CaseRoomClue, eye: vec3, look: vec3): void {
    const withFlip = !c.info.noFlip
    const r = this.inspectPanel.groupRect(withFlip)
    const halfW = (r.max.x - r.min.x) / 2
    const halfH = (r.max.y - r.min.y) / 2
    // The counter, in the description's units: it keeps its own look (hud.viewDistanceCm away).
    const counterScale = this.inspectDistanceCm / this.hud.viewDistanceCm
    const counter = this.hud.plateSizeFor(counterText(this.found)).uniformScale(counterScale)
    // Around the description's centre: the description and buttons from -halfH to +halfH, the counter above.
    const top = halfH + this.counterGapCm + counter.y
    const groupHalfH = (top + halfH) / 2
    const lift = (top - halfH) / 2 // the group's centre above the description's centre
    const tanH = Math.tan(this.cam.fov / 2) * this.cam.aspect * this.inspectViewFill
    const tanV = Math.tan(this.cam.fov / 2) * this.inspectViewFill
    const far = this.inspectDistanceCm
    const k0 = Math.min(1, (far * tanH) / halfW, (far * tanV) / groupHalfH)
    const dir = look.normalize()
    const rot = quat.lookAt(dir.uniformScale(-1), Math.abs(dir.y) > 0.98 ? this.camT.up : vec3.up())
    const right = rot.multiplyVec3(vec3.right())
    const upP = rot.multiplyVec3(vec3.up())
    // The pyramid from the eye through the whole group (plus a margin): the nearest solid thing inside it
    // decides how near the group is drawn.
    const m = this.clearanceCm
    const at = (x: number, y: number) => eye.add(dir.uniformScale(far)).add(right.uniformScale(x * k0)).add(upP.uniformScale(y * k0))
    const corners = [
      at(-halfW - m, -groupHalfH - m),
      at(halfW + m, -groupHalfH - m),
      at(halfW + m, groupHalfH + m),
      at(-halfW - m, groupHalfH + m),
    ]
    const nearest = nearestDepth(eye, dir, corners, this.solids())
    const depth = Math.max(this.inspectNearCm, Math.min(far, nearest - this.clearanceDepthCm))
    const k = (k0 * depth) / far
    const groupCenter = eye.add(dir.uniformScale(depth))
    const descCenter = groupCenter.sub(upP.uniformScale(lift * k))
    const cx = ((r.min.x + r.max.x) / 2) * k
    const cy = ((r.min.y + r.max.y) / 2) * k
    const pos = descCenter.sub(right.uniformScale(cx)).sub(upP.uniformScale(cy))
    const t = this.inspectPanel.getSceneObject().getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(rot)
    t.setWorldScale(vec3.one().uniformScale(k))
    this.inspectPanel.layout(withFlip)
    this.inspectPanel.show(c.info.name, c.info.description, withFlip)
    this.hud.pinAbove(descCenter.add(upP.uniformScale((halfH + this.counterGapCm) * k)), rot, k * counterScale)
    const why = depth < far - 0.01 ? ` (brought in from ${far} cm: something in the way at ${nearest.toFixed(1)})` : ""
    this.log(`describe ${c.info.id} in the middle of the view: ${depth.toFixed(1)} cm away${why}, scale ${k.toFixed(2)}`)
  }

  /** Everything solid in the room: the stand-in furniture, the clues and the floor. */
  private solids(): SolidBox[] {
    let out: SolidBox[] = []
    for (const s of [this.standInDesk, this.standInChair, this.standInWall]) out = out.concat(s.worldBoxes())
    for (const k of this.clues) out = out.concat(k.worldBoxes())
    const floor = this.crimeScene.getTransform().getWorldPosition()
    out.push({center: floor.sub(new vec3(0, 5, 0)), axes: [vec3.right(), vec3.up(), vec3.forward()], half: new vec3(2000, 5, 2000)})
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
    // The suspects appear straight ahead of where the player faces at this moment (the 5th clue counted).
    const eye = this.camT.getWorldPosition()
    const fwd = flatForward(this.camT)
    this.delay(1.0, () => {
      for (const s of this.suspects) s.appear(0.8)
      this.suspectsUI.setVisible(true)
      // "The suspects have appeared" stands above the figures (where an alibi bubble goes later) instead of
      // under the line of sight, where it covered the names at their feet.
      this.hud.setText(TEXT.suspectsAppeared)
      this.messageUp = true
      const d = this.placeLineup(eye, fwd)
      this.hud.pulse()
      this.log(`suspects appeared ${d.toFixed(1)} cm away`)
      this.delay(2.5, () => this.hideSuspectsMessage())
    })
  }

  private hideSuspectsMessage(): void {
    this.messageUp = false
    this.hud.setVisible(false)
    this.hud.unpin()
  }

  /**
   * Stand the line-up straight ahead of `eye` along the flat direction `fwd`, at lineupDistance(). If anything
   * solid (furniture, a clue, the floor) stands nearer inside the pyramid from the eyes through the whole
   * line-up, it is brought in front of that and scaled down by the same amount, so it still fills the same
   * share of the view (never nearer than lineupNearCm). Returns the distance it stands at.
   */
  private placeLineup(eye: vec3, fwd: vec3): number {
    const d = this.lineupDistance()
    const boxes = this.lineupBoxes(d)
    let x0 = 0
    let x1 = 0
    let y0 = 0
    let y1 = 0
    let front = 0
    let back = 0
    for (const b of boxes) {
      x0 = Math.min(x0, b.min.x)
      x1 = Math.max(x1, b.max.x)
      y0 = Math.min(y0, b.min.y)
      y1 = Math.max(y1, b.max.y)
      front = Math.max(front, b.max.z)
      back = Math.max(back, -b.min.z)
    }
    for (const s of this.suspects) {
      // The busts' fronts and backs.
      front = Math.max(front, s.localBoundsCm().max.z)
      back = Math.max(back, -s.localBoundsCm().min.z)
    }
    const right = new vec3(-fwd.z, 0, fwd.x)
    const m = this.clearanceCm
    const at = (x: number, y: number) => eye.add(fwd.uniformScale(d - front)).add(right.uniformScale(x)).add(vec3.up().uniformScale(y))
    const corners = [at(x0 - m, y0 - m), at(x1 + m, y0 - m), at(x1 + m, y1 + m), at(x0 - m, y1 + m)]
    const nearest = nearestDepth(eye, fwd, corners, this.solids())
    // Scaled by k = D / d, its back stands at k * (d + back): keep all of it clearanceDepthCm short of `nearest`.
    const fit = ((nearest - this.clearanceDepthCm) * d) / (d + back)
    const dist = Math.max(this.lineupNearCm, Math.min(d, fit))
    const k = dist / d
    const pos = eye.add(fwd.uniformScale(dist))
    const t = this.suspectLineup.getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(faceTowardYaw(pos, eye))
    t.setWorldScale(vec3.one().uniformScale(k))
    if (this.messageUp) {
      const msgAt = t.getWorldTransform().multiplyPoint(new vec3(0, this.figureTopCm() + this.messageGapCm, 4))
      this.hud.pinAbove(msgAt, t.getWorldRotation(), dist / this.hud.viewDistanceCm)
    }
    if (dist < d - 0.01) this.log(`line-up brought in from ${d.toFixed(1)} to ${dist.toFixed(1)} cm (something in the way at ${nearest.toFixed(1)})`)
    return dist
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
    let d = this.lineupDistanceCm
    // The message keeps its look (it is scaled with the distance), so a few passes settle it.
    for (let pass = 0; pass < 4; pass++) {
      let need = this.lineupDistanceCm
      for (const b of this.lineupBoxes(d)) {
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

  /**
   * Boxes (cm, in the line-up's own frame at scale 1: x right, y up, z toward the player) covering the
   * figures, the name labels, every place the alibi bubble and the Accuse button can take, and the
   * "suspects have appeared" message sized for a line-up `d` away.
   */
  private lineupBoxes(d: number): {min: vec3; max: vec3}[] {
    const boxes: {min: vec3; max: vec3}[] = [this.suspectsUI.localExtentCm()]
    for (const s of this.suspects) {
      // A bust is round: it is widest across at its centre's depth, not at its front.
      const b = s.localBoundsCm()
      const at = s.getSceneObject().getTransform().getLocalPosition()
      boxes.push({min: new vec3(b.min.x, b.min.y, 0).add(at), max: new vec3(b.max.x, b.max.y, 0).add(at)})
    }
    const y0 = this.figureTopCm() + this.messageGapCm
    const msg = this.hud.plateSizeFor(TEXT.suspectsAppeared).uniformScale(d / this.hud.viewDistanceCm)
    boxes.push({min: new vec3(-msg.x / 2, y0, 4), max: new vec3(msg.x / 2, y0 + msg.y, 4)})
    return boxes
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
      const eye = this.camT.getWorldPosition()
      const walkStart = new vec3(start.x, floorY, start.z)
      this.replay.walk(
        stops,
        walkStart,
        center,
        {
          onCaption: (text) => this.caption.showCaption(text, 0),
          onFinished: (top) => this.showTruth(top),
        },
        {
          frame: this.crimeScene,
          standIns: [this.standInDesk, this.standInChair, this.standInWall],
          clues: stops.map((s) => s.clue),
          playerFloor: new vec3(eye.x, floorY, eye.z),
          playerFacing: flatForward(this.camT),
          walkStart,
        },
      )
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
