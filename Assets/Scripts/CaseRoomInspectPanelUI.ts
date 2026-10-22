import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {TEXT} from "./CaseRoomData"
import {addButton, addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomInspectPanelUI — what shows just above a clue that is being inspected where it lies:
 * the clue name and 1-2 lines of description, with a row of buttons under them, "Flip" and "Close"
 * side by side (or "Close" alone for a clue with nothing to turn over: the footprints).
 *
 * Passive view. Main places this root above the clue, facing the player, scaled so it looks the same
 * size as it would 50 cm away, and calls layout() + show().
 * Emits: onFlip, onClose. Exposes: layout, groupRect, show, setBackText, hide, descriptionText, backText.
 */
@component
export class CaseRoomInspectPanelUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomInspectPanelUI – description + Flip / Close</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Width of the description panel in cm (at the 50 cm viewing distance; main scales the whole group)")
  @widget(new SliderWidget(12, 40, 0.5))
  infoWidthCm: number = 22

  @input
  @hint("Viewing distance the text is sized for, in cm (main scales the group to look this size)")
  @widget(new SliderWidget(30, 120, 1))
  viewDistanceCm: number = 50

  @input
  @hint("Text size multiplier on top of the Specs type scale")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.4

  @input
  @hint("Gap between the description panel and the row of buttons, in cm")
  @widget(new SliderWidget(0, 6, 0.1))
  gapCm: number = 1.5
  @ui.group_end

  private infoGate: VisibilityGate
  private flipGate: VisibilityGate
  private closeGate: VisibilityGate
  private info: Panel
  private flipPanel: Panel
  private closePanel: Panel
  private nameText: Text
  private descText: Text
  private backLine: Text
  // Laid-out panel sizes in cm (UIKit reports them on its first layout; these are close first guesses).
  private infoSize = new vec2(22, 10)
  private buttonSize = new vec2(10.6, 5.6)
  private _onFlip = new Event<void>()
  private _onClose = new Event<void>()

  get onFlip(): PublicApi<void> {
    return this._onFlip.publicApi()
  }

  get onClose(): PublicApi<void> {
    return this._onClose.publicApi()
  }

  get descriptionText(): string {
    return this.descText ? this.descText.text : ""
  }

  get backText(): string {
    return this.backLine ? this.backLine.text : ""
  }

  onAwake(): void {
    const d = this.viewDistanceCm
    const b = this.textBoost
    const pad = 1.2
    const inner = this.infoWidthCm - pad * 2

    this.info = makePanel(this.sceneObject, "InspectInfo", this.infoWidthCm, {padCm: pad, gapCm: 0.5})
    const nameEm = roleEmCm("Subheadline", d, b)
    this.nameText = addText(this.info.content, "InspectNameText", "Stopped clock", "Subheadline", d, inner, nameEm * 1.3, {boost: b})
    const bodyEm = roleEmCm("Body", d, b)
    this.descText = addText(this.info.content, "InspectDescriptionText", "", "Body", d, inner, bodyEm * 2.6, {wrap: true, boost: b})
    this.backLine = addText(this.info.content, "InspectBackText", "", "Body", d, inner, bodyEm * 1.4, {
      boost: b,
      color: new vec4(1.0, 0.85, 0.45, 1),
    })

    // One button per panel, placed side by side by layout(): UIKit's flex layout keeps the space of a
    // hidden child, so a shared row would leave a hole where Flip is hidden. No BackPlate behind the
    // buttons (it stole pinches from them); 9 x 4 cm buttons whose faces sit 1.6 cm apart (the panel
    // padding), the Specs "Large" target size and more than the 1-degree minimum spacing at 50 cm.
    this.flipPanel = makePanel(this.sceneObject, "InspectFlipButtons", -1, {padCm: 0.8, gapCm: 0, plate: false})
    addButton(this.flipPanel.content, "FlipButton", TEXT.flip, 9, 4, d, b, () => this._onFlip.invoke())
    this.closePanel = makePanel(this.sceneObject, "InspectCloseButtons", -1, {padCm: 0.8, gapCm: 0, plate: false})
    addButton(this.closePanel.content, "CloseButton", TEXT.close, 9, 4, d, b, () => this._onClose.invoke())

    this.info.flex.onLayoutComplete.add((r) => (this.infoSize = new vec2(r.containerWidth, r.containerHeight)))
    this.closePanel.flex.onLayoutComplete.add((r) => (this.buttonSize = new vec2(r.containerWidth, r.containerHeight)))

    this.infoGate = new VisibilityGate(this, this.info.root, false)
    this.flipGate = new VisibilityGate(this, this.flipPanel.root, false)
    this.closeGate = new VisibilityGate(this, this.closePanel.root, false)
  }

  /** The description centred on this root, the buttons in a row under it (Flip left of Close). */
  layout(withFlip: boolean): void {
    this.info.root.getTransform().setLocalPosition(new vec3(0, 0, 0.5))
    const y = -(this.infoSize.y / 2 + this.gapCm + this.buttonSize.y / 2)
    const half = this.buttonSize.x / 2
    this.flipPanel.root.getTransform().setLocalPosition(new vec3(-half, y, 0.5))
    this.closePanel.root.getTransform().setLocalPosition(new vec3(withFlip ? half : 0, y, 0.5))
  }

  /** The rectangle (cm, in this root's XY plane) covered by the description and the buttons of layout(). */
  groupRect(withFlip: boolean): {min: vec2; max: vec2} {
    const half = Math.max(this.infoSize.x, this.buttonSize.x * (withFlip ? 2 : 1)) / 2
    return {
      min: new vec2(-half, -(this.infoSize.y / 2 + this.gapCm + this.buttonSize.y)),
      max: new vec2(half, this.infoSize.y / 2),
    }
  }

  /** Show the name and description, with Flip and Close (or Close alone). */
  show(name: string, description: string, withFlip: boolean): void {
    this.nameText.text = name
    this.descText.text = description
    this.backLine.text = ""
    this.infoGate.set(true)
    this.flipGate.set(withFlip)
    this.closeGate.set(true)
  }

  setBackText(text: string): void {
    this.backLine.text = text
  }

  hide(): void {
    this.infoGate.set(false)
    this.flipGate.set(false)
    this.closeGate.set(false)
  }

  get isShown(): boolean {
    return this.infoGate.visible
  }
}
