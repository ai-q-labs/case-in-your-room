import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CaseRoomCaptionUI} from "./CaseRoomCaptionUI"
import {CaseRoomClue} from "./CaseRoomClue"
import {CaseRoomClueTagUI} from "./CaseRoomClueTagUI"
import {ClueId, CLUES, counterText, REPLAY_ORDER, SUSPECTS, TEXT, TOTAL_CLUES, CULPRIT_INDEX} from "./CaseRoomData"
import {CaseRoomHudUI} from "./CaseRoomHudUI"
import {CaseRoomInspectPanelUI} from "./CaseRoomInspectPanelUI"
import {faceTowardYaw, flatForward, yawQuat} from "./CaseRoomMeshes"
import {CaseRoomOpeningBoardUI} from "./CaseRoomOpeningBoardUI"
import {CaseRoomReplay, ReplayStop} from "./CaseRoomReplay"
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
 * Size note: ~460 lines, of which ~150 are the Inspector @input block; kept whole in stage 1 so the
 * flow reads end to end. Candidate split for the detail stage: placement helpers and the replay hand-off.
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
  @hint("Inspect panel UI (description + Flip / Put back)")
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
  @hint("How far in front the inspected clue is held, in cm")
  @widget(new SliderWidget(30, 100, 1))
  inspectDistanceCm: number = 50

  @input
  @hint("How far below the eyes the inspected clue is held, in cm (kept small so the clue, its description and buttons all fit in the glasses' view at 50 cm)")
  @widget(new SliderWidget(0, 50, 1))
  inspectDropCm: number = 3

  @input
  @hint("Largest size of an inspected clue in cm (2x, capped so it fits the view at 50 cm)")
  @widget(new SliderWidget(6, 40, 0.5))
  inspectMaxSizeCm: number = 11

  @input
  @hint("Distance of the suspect line-up straight ahead, in cm")
  @widget(new SliderWidget(100, 300, 1))
  lineupDistanceCm: number = 200
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
  private frames = 0
  private boardPlaced = false

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
    this.camT = cam ? cam.getTransform() : null
    this.openingBoard.onStart.add(() => this.onStartPressed())
    for (const c of this.clues) {
      c.onPressed.add((clue) => this.onCluePressed(clue))
      c.onHoverChanged.add((on) => this.onClueHover(c, on))
    }
    this.inspectPanel.onFlip.add(() => this.onFlip())
    this.inspectPanel.onPutBack.add(() => this.onPutBack())
    for (const s of this.suspects) s.onPressed.add((i) => this.onSuspectPressed(i))
    this.suspectsUI.onAccuse.add(() => this.onAccuse())
    this.log("ready")
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

    this.clues.forEach((c, i) => {
      this.delay(0.4 + i * 0.45, () => {
        c.reveal()
        c.setInteractive(true)
      })
    })
    this.caption.showCaption(TEXT.lookAround, 3)
    this.hud.setText(counterText(0))
    this.hud.setVisible(true)
    this.log("start: room placed, clues lighting up")
  }

  // ── Clues ────────────────────────────────────────────────────────────────────

  private onClueHover(c: CaseRoomClue, hovering: boolean): void {
    if (this.phase !== "explore") return
    if (!hovering) {
      this.clueTag.hideTag()
      return
    }
    const above = Math.min(20, c.maxDimensionCm / 2) + 14
    const pos = c.restPosition.add(new vec3(0, above, 0))
    this.clueTag.showTag(c.info.name, pos, faceTowardYaw(pos, this.camT.getWorldPosition()))
  }

  private onCluePressed(c: CaseRoomClue): void {
    if (this.phase !== "explore") return
    this.phase = "inspect"
    this.inspecting = c
    this.clueTag.hideTag()
    this.hud.setVisible(false) // the held clue and its panels would overlap the counter
    for (const k of this.clues) k.setInteractive(false)

    const eye = this.camT.getWorldPosition()
    const fwd = flatForward(this.camT)
    const right = new vec3(-fwd.z, 0, fwd.x)
    // Held ~50 cm ahead, a little below the eyes; shifted left so the buttons beside it stay in view.
    const pos = eye
      .add(fwd.uniformScale(this.inspectDistanceCm))
      .sub(new vec3(0, this.inspectDropCm, 0))
      .sub(right.uniformScale(3))
    const rot = quat.lookAt(eye.sub(pos).normalize(), vec3.up())
    const scale = Math.min(2, this.inspectMaxSizeCm / Math.max(1, c.maxDimensionCm))
    const size = c.sizeCmUpright.uniformScale(scale)
    c.moveTo(pos, rot, this.inspectMaxSizeCm, 2, 0.6, () => {
      const t = this.inspectPanel.getSceneObject().getTransform()
      t.setWorldPosition(pos)
      t.setWorldRotation(rot)
      this.inspectPanel.layoutFor(size.x, size.y)
      this.inspectPanel.show(c.info.name, c.info.description)
    })
    this.log(`inspect ${c.info.id}`)
  }

  private onFlip(): void {
    const c = this.inspecting
    if (this.phase !== "inspect" || !c) return
    c.flip(0.5)
    const back = c.info.backText
    this.inspectPanel.setBackText(c.isFlipped ? (back ? TEXT.backPrefix + back : TEXT.nothingOnBack) : "")
    this.log(`flip ${c.info.id} -> ${c.isFlipped ? "back" : "front"}`)
  }

  private onPutBack(): void {
    const c = this.inspecting
    if (this.phase !== "inspect" || !c) return
    this.inspecting = null
    this.inspectPanel.hide()
    const firstTime = !c.inspected
    c.returnToRest(0.6, () => {
      c.markInspected()
      this.hud.setVisible(true)
      if (firstTime) {
        this.found++
        this.hud.setText(counterText(this.found))
        this.hud.pulse()
      }
      this.log(`put back ${c.info.id}; found ${this.found}/${TOTAL_CLUES}`)
      if (this.found >= TOTAL_CLUES) {
        this.onAllFound()
      } else {
        this.phase = "explore"
        for (const k of this.clues) k.setInteractive(true)
      }
    })
  }

  /** The uninspected clue closest to where the player is looking (for the arrow). */
  private nextUnfoundClue(): vec3 | null {
    const eye = this.camT.getWorldPosition()
    const look = this.camT.back
    let best: vec3 | null = null
    let bestDot = -2
    for (const c of this.clues) {
      if (c.inspected) continue
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
      this.hud.setText(TEXT.suspectsAppeared)
      this.hud.pulse()
      const eye = this.camT.getWorldPosition()
      const pos = eye.add(flatForward(this.camT).uniformScale(this.lineupDistanceCm))
      const t = this.suspectLineup.getTransform()
      t.setWorldPosition(pos)
      t.setWorldRotation(faceTowardYaw(pos, eye))
      for (const s of this.suspects) s.appear(0.8)
      this.suspectsUI.setVisible(true)
      this.log("suspects appeared")
      this.delay(2.5, () => this.hud.setVisible(false))
    })
  }

  private onSuspectPressed(index: number): void {
    if (this.phase !== "suspects") return
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
