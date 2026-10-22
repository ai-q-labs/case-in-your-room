import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {FlexDirection} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {addIcon, addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

const ICON_ARROW = requireAsset("../Icons/navigation.png") as Texture

/**
 * CaseRoomHudUI — the "N / 5" counter and the direction arrow next to it.
 *
 * Passive view: main pushes the text, a pulse, and the world position the arrow should point at.
 * The arrow's on-screen angle is view logic, computed here each frame. The root is moved by a
 * CaseRoomLazyFollow on the same SceneObject (just below the line of sight, ~1 m away).
 * Exposes: setVisible, setText, pulse, setArrowTarget. Must not: count clues.
 */
@component
export class CaseRoomHudUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomHudUI – clue counter and direction arrow</span>')
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

  @input("vec4", "{1.0,0.85,0.45,1}")
  @hint("Color the counter flashes when it goes up")
  @widget(new ColorWidget())
  pulseColor: vec4
  @ui.group_end

  private gate: VisibilityGate
  private panel: Panel
  private counter: Text
  private arrow: SceneObject
  private arrowTarget: vec3 | null = null
  private camT: Transform = null
  private em = 2

  onAwake(): void {
    const d = this.viewDistanceCm
    this.em = roleEmCm("Headline1", d, this.textBoost / 1.4)
    this.panel = makePanel(this.sceneObject, "CounterPanel", -1, {padCm: 1.2, gapCm: 0})
    this.buildRow()
    this.gate = new VisibilityGate(this, this.panel.root, false)
    this.createEvent("OnStartEvent").bind(() => {
      const cam = WorldCameraFinderProvider.getInstance().getComponent()
      this.camT = cam ? cam.getTransform() : null
    })
    this.createEvent("UpdateEvent").bind(() => this.updateArrow())
  }

  private buildRow(): void {
    // One row on the content layout: [arrow][counter text]; the plate hugs both.
    const flex = this.panel.flex
    flex.direction = FlexDirection.Row
    flex.columnGap = 1.2
    const c = this.panel.content
    this.arrow = addIcon(c, "DirectionArrow", ICON_ARROW, this.arrowSizeCm)
    this.counter = addText(c, "CounterText", "0 / 5", "Headline1", this.viewDistanceCm, this.textWidth("0 / 5"), this.em * 1.4, {
      boost: this.textBoost / 1.4,
    })
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

  /** Grow and glow once (when a clue is put back). */
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

  /** World position for the arrow to point at, or null to hide the arrow. */
  setArrowTarget(worldPos: vec3 | null): void {
    this.arrowTarget = worldPos
    if (this.arrow) this.arrow.enabled = worldPos !== null
  }

  private updateArrow(): void {
    if (!this.arrow || !this.arrowTarget || !this.camT) return
    const eye = this.camT.getWorldPosition()
    const to = this.arrowTarget.sub(eye)
    let dx = to.dot(this.camT.right)
    let dy = to.dot(this.camT.up)
    const dz = to.dot(this.camT.back)
    if (dz < 0) {
      // Behind the player: point sideways toward the shorter turn.
      dy = 0
      dx = dx >= 0 ? 1 : -1
    }
    // The icon points up (+Y). Rolling by a turns +Y into (-sin a, cos a).
    const a = Math.atan2(-dx, dy)
    this.arrow.getTransform().setLocalRotation(quat.angleAxis(a, vec3.forward()))
  }
}
