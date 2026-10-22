import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {FlexDirection} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {CaseRoomLazyFollow} from "./CaseRoomLazyFollow"
import {addIcon, addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

const ICON_ARROW = requireAsset("../Icons/arrow_forward.png") as Texture // points right
const ICON_ARROW_UP = requireAsset("../Icons/arrow_upward.png") as Texture
const ICON_TURN_LEFT = requireAsset("../Icons/360.png") as Texture // ring arrow, near side heading left
const ICON_TURN_RIGHT = requireAsset("../Icons/360_mirrored.png") as Texture

const PAD_CM = 1.2

/** Which way to turn: "turn-left" / "turn-right" = the clue is behind you, turn around that way. */
export type TurnCue = "none" | "left" | "right" | "turn-left" | "turn-right"
/** Which way to tilt the head. */
export type TiltCue = "none" | "up" | "down"

/**
 * CaseRoomHudUI — the "N / 5" counter with two direction arrows next to it: one for turning left or
 * right (a ring-shaped "turn around" arrow when the clue is behind you) and one for looking up or down.
 * Kept apart so "behind you" can never be read as "below you".
 *
 * Passive view: main pushes the text, a pulse, and the world position the arrows should lead to.
 * Which arrows show is view logic, computed here each frame. The root is moved by a
 * CaseRoomLazyFollow on the same SceneObject (just below the line of sight, ~1 m away), except while
 * main has pinned it somewhere (pinAbove: the number alone, standing above an open description or
 * above the suspects, so it never covers text the player is reading).
 * Exposes: setVisible, setText, pulse, setArrowTarget, pinAbove, unpin, plateSizeFor, turnCue, tiltCue.
 * Must not: count clues.
 */
@component
export class CaseRoomHudUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomHudUI – clue counter and direction arrows</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Viewing distance the text is sized for, in cm (match the lazy follow distance)")
  @widget(new SliderWidget(50, 200, 1))
  viewDistanceCm: number = 100

  @input
  @hint("Text size multiplier; the brief asks for counter text about 3 cm tall")
  @widget(new SliderWidget(1, 4, 0.05))
  textBoost: number = 2.6

  @input
  @hint("Arrow size in cm")
  @widget(new SliderWidget(1, 8, 0.1))
  arrowSizeCm: number = 3.6

  @input
  @hint("No left/right arrow while the clue is within this many degrees of straight ahead")
  @widget(new SliderWidget(2, 30, 1))
  aheadDeg: number = 10

  @input
  @hint("Past this many degrees to the side the clue counts as behind you: the ring-shaped turn-around arrow")
  @widget(new SliderWidget(60, 150, 1))
  behindDeg: number = 90

  @input
  @hint("No up/down arrow while the clue is within this many degrees above or below where you look")
  @widget(new SliderWidget(2, 30, 1))
  levelDeg: number = 10

  @input
  @hint("Dead band in degrees around each threshold, so an arrow does not flicker when the head rests on one")
  @widget(new SliderWidget(0, 6, 0.5))
  hysteresisDeg: number = 2

  @input("vec4", "{1.0,0.85,0.45,1}")
  @hint("Color the counter flashes when it goes up")
  @widget(new ColorWidget())
  pulseColor: vec4
  @ui.group_end

  private gate: VisibilityGate
  private panel: Panel
  private follow: CaseRoomLazyFollow = null
  private pinned = false
  private counter: Text
  private turnArrow: SceneObject
  private tiltArrow: SceneObject
  private arrowTarget: vec3 | null = null
  private camT: Transform = null
  private em = 2
  private _turn: TurnCue = "none"
  private _tilt: TiltCue = "none"
  private _yawDeg = 0
  private _pitchDeg = 0

  /** The left/right cue currently shown ("none" when hidden or when the arrows are off). */
  get turnCue(): TurnCue {
    return this._turn
  }

  /** The up/down cue currently shown. */
  get tiltCue(): TiltCue {
    return this._tilt
  }

  /** Last measured angles to the target (deg): yaw + = to the right, pitch + = above where you look. */
  get targetYawDeg(): number {
    return this._yawDeg
  }

  get targetPitchDeg(): number {
    return this._pitchDeg
  }

  get target(): vec3 | null {
    return this.arrowTarget
  }

  /** True while pinAbove() holds the counter in place (off the head follow). */
  get isPinned(): boolean {
    return this.pinned
  }

  onAwake(): void {
    const d = this.viewDistanceCm
    this.em = roleEmCm("Headline1", d, this.textBoost / 1.4)
    this.panel = makePanel(this.sceneObject, "CounterPanel", -1, {padCm: PAD_CM, gapCm: 0})
    this.buildRow()
    this.gate = new VisibilityGate(this, this.panel.root, false)
    this.follow = this.sceneObject.getComponent(CaseRoomLazyFollow.getTypeName()) as CaseRoomLazyFollow
    this.createEvent("OnStartEvent").bind(() => {
      const cam = WorldCameraFinderProvider.getInstance().getComponent()
      this.camT = cam ? cam.getTransform() : null
    })
    this.createEvent("UpdateEvent").bind(() => this.keepPlateUnpinchable())
    // The head pose is read after every script's Update, so a pose set during Update (by a test holding the
    // head, or anything else) is the one the arrows answer to in that frame.
    this.createEvent("LateUpdateEvent").bind(() => this.updateArrows())
  }

  private buildRow(): void {
    // One row on the content layout: [left/right arrow][up/down arrow][counter text]; the plate hugs all three.
    // An arrow is hidden by turning off its Image only, so it keeps its laid-out slot and the counter
    // never jumps sideways.
    const flex = this.panel.flex
    flex.direction = FlexDirection.Row
    flex.columnGap = 1.0
    const c = this.panel.content
    this.turnArrow = addIcon(c, "TurnArrow", ICON_ARROW, this.arrowSizeCm)
    this.tiltArrow = addIcon(c, "TiltArrow", ICON_ARROW_UP, this.arrowSizeCm)
    this.image(this.turnArrow).enabled = false
    this.image(this.tiltArrow).enabled = false
    this.counter = addText(c, "CounterText", "0 / 5", "Headline1", this.viewDistanceCm, this.textWidth("0 / 5"), this.em * 1.4, {
      boost: this.textBoost / 1.4,
    })
  }

  /**
   * The counter now stays up while a clue's description is open, and a BackPlate brings its own collider
   * (re-enabled whenever the panel is shown), so keep it off: the HUD must never take a pinch meant for
   * the Flip / Close buttons behind it.
   */
  private keepPlateUnpinchable(): void {
    const plate = this.panel.plate
    if (!plate) return
    const col = this.panel.root.getComponent("Physics.ColliderComponent") as ColliderComponent
    if (col && col.enabled) col.enabled = false
    if (plate.interactable && plate.interactable.enabled) plate.interactable.enabled = false
  }

  private textWidth(s: string): number {
    return s.length * this.em * 0.56 + 1.5
  }

  setVisible(visible: boolean): void {
    this.gate.set(visible)
  }

  setText(text: string): void {
    if (!this.counter) return
    this.counter.text = text
    const w = this.textWidth(text)
    const h = this.em * 1.4
    this.counter.layoutRect = Rect.create(-w / 2, w / 2, -h / 2, h / 2)
    this.panel.flex.markDirty()
  }

  /** Grow and glow once (when a clue is counted). */
  pulse(): void {
    if (!this.counter) return
    const t = this.counter.getSceneObject().getTransform()
    const base = new vec4(1, 1, 1, 1)
    const hot = this.pulseColor
    animate({
      duration: 0.7,
      easing: "ease-out-cubic",
      update: (k: number) => {
        const bump = Math.sin(k * Math.PI)
        t.setLocalScale(vec3.one().uniformScale(1 + 0.35 * bump))
        this.counter.textFill.color = vec4.lerp(base, hot, bump)
      },
      ended: () => {
        t.setLocalScale(vec3.one())
        this.counter.textFill.color = base
      },
    })
  }

  /**
   * Plate size (cm, at the normal 1 m look) for `text` alone, without the arrows: what pinAbove() stands.
   * Worked out from the type scale, not from the layout, so it is right before the panel lays out again.
   */
  plateSizeFor(text: string): vec2 {
    return new vec2(this.textWidth(text) + 2 * PAD_CM, this.em * 1.4 + 2 * PAD_CM)
  }

  /**
   * Take the counter off the head follow and stand it still: the plate's bottom edge centred on
   * `bottomCenter`, facing along `rot`'s +Z, drawn `scale` times its normal size. The arrows are put
   * away together with their slots, so the plate hugs the number. unpin() hands it back to the follow.
   */
  pinAbove(bottomCenter: vec3, rot: quat, scale: number): void {
    if (!this.counter) return
    this.pinned = true
    if (this.follow) this.follow.paused = true
    this.setArrowSlots(false)
    const h = this.plateSizeFor(this.counter.text).y
    const t = this.sceneObject.getTransform()
    t.setWorldRotation(rot)
    t.setWorldScale(vec3.one().uniformScale(scale))
    t.setWorldPosition(bottomCenter.add(rot.multiplyVec3(vec3.up()).uniformScale((h * scale) / 2)))
  }

  /** Back under the line of sight, at once (a glide from where it stood would sweep across the view). */
  unpin(): void {
    if (!this.pinned) return
    this.pinned = false
    this.sceneObject.getTransform().setWorldScale(vec3.one())
    this.setArrowSlots(true)
    if (this.follow) {
      this.follow.paused = false
      this.follow.snap()
    }
  }

  /** Turning an arrow's SceneObject off drops it from the row once the layout looks for its children again. */
  private setArrowSlots(on: boolean): void {
    this.turnArrow.enabled = on
    this.tiltArrow.enabled = on
    this.panel.flex.refreshChildren()
    this.panel.flex.markDirty()
  }

  /** World position for the arrows to lead to, or null to hide both arrows. */
  setArrowTarget(worldPos: vec3 | null): void {
    this.arrowTarget = worldPos
    if (!worldPos) this.apply("none", "none")
  }

  private updateArrows(): void {
    if (!this.turnArrow || !this.arrowTarget || !this.camT) return
    const to = this.arrowTarget.sub(this.camT.getWorldPosition())
    const look = this.camT.back
    // Level frame of the head: "ahead" is the look direction flattened (the camera's up, flattened, when
    // looking straight down or up), "right" is to its right.
    let ahead = new vec3(look.x, 0, look.z)
    if (ahead.length < 1e-3) ahead = new vec3(this.camT.up.x, 0, this.camT.up.z).uniformScale(look.y < 0 ? 1 : -1)
    ahead = ahead.normalize()
    const right = new vec3(-ahead.z, 0, ahead.x)
    const R2D = 180 / Math.PI
    const yaw = Math.atan2(to.dot(right), to.dot(ahead)) * R2D
    const elev = Math.atan2(to.y, Math.sqrt(to.x * to.x + to.z * to.z)) * R2D
    const pitch = Math.asin(Math.max(-1, Math.min(1, look.y))) * R2D
    this._yawDeg = yaw
    this._pitchDeg = elev - pitch
    this.apply(this.nextTurn(yaw), this.nextTilt(elev - pitch))
  }

  private nextTurn(yaw: number): TurnCue {
    const a = Math.abs(yaw)
    const h = this.hysteresisDeg / 2
    const cur = this._turn
    const behind = cur === "turn-left" || cur === "turn-right"
    if (a < this.aheadDeg + (cur === "none" ? h : -h)) return "none"
    if (a > this.behindDeg + (behind ? -h : h)) {
      // Nearly straight behind, either way is as short: keep the side already shown.
      if (behind && a > 180 - this.aheadDeg) return cur
      return yaw >= 0 ? "turn-right" : "turn-left"
    }
    return yaw >= 0 ? "right" : "left"
  }

  private nextTilt(pitch: number): TiltCue {
    const h = this.hysteresisDeg / 2
    if (Math.abs(pitch) < this.levelDeg + (this._tilt === "none" ? h : -h)) return "none"
    return pitch > 0 ? "up" : "down"
  }

  private apply(turn: TurnCue, tilt: TiltCue): void {
    if (!this.turnArrow) return
    this._turn = turn
    this._tilt = tilt
    this.image(this.turnArrow).enabled = turn !== "none"
    if (turn !== "none") {
      const turning = turn === "turn-left" || turn === "turn-right"
      const tex = turning ? (turn === "turn-left" ? ICON_TURN_LEFT : ICON_TURN_RIGHT) : ICON_ARROW
      this.setIcon(this.turnArrow, tex, turn === "left" ? Math.PI : 0)
    }
    this.image(this.tiltArrow).enabled = tilt !== "none"
    if (tilt !== "none") this.setIcon(this.tiltArrow, ICON_ARROW_UP, tilt === "down" ? Math.PI : 0)
  }

  private image(icon: SceneObject): Image {
    return icon.getComponent("Component.Image") as Image
  }

  private setIcon(icon: SceneObject, tex: Texture, roll: number): void {
    const img = this.image(icon)
    if (img.mainPass.baseTex !== tex) img.mainPass.baseTex = tex
    icon.getTransform().setLocalRotation(quat.angleAxis(roll, vec3.forward()))
  }
}
