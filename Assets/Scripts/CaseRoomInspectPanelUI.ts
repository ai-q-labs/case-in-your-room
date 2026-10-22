import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {TEXT} from "./CaseRoomData"
import {addButton, addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomInspectPanelUI — what shows around a clue held in the player's hands:
 * the clue name and 1-2 lines of description below it, and the Flip / Put back buttons beside it.
 * A clue described in place (footprints: not something you pick up) gets the same name and
 * description with a single Close button under them instead.
 *
 * Passive view. Main moves this root onto the inspected clue (same position and facing) and calls
 * show(); layoutFor(sizeCm) keeps the info below and the buttons beside the clue.
 * Emits: onFlip, onPutBack, onClose. Exposes: show, setBackText, hide, descriptionText, backText.
 */
@component
export class CaseRoomInspectPanelUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomInspectPanelUI – description + Flip / Put back</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Width of the description panel in cm")
  @widget(new SliderWidget(12, 40, 0.5))
  infoWidthCm: number = 22

  @input
  @hint("Viewing distance the text is sized for, in cm (the clue is held about 50 cm away)")
  @widget(new SliderWidget(30, 120, 1))
  viewDistanceCm: number = 50

  @input
  @hint("Text size multiplier on top of the Specs type scale")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.4

  @input
  @hint("Gap between the clue and the panels, in cm")
  @widget(new SliderWidget(0, 6, 0.1))
  gapCm: number = 1.5
  @ui.group_end

  private infoGate: VisibilityGate
  private buttonsGate: VisibilityGate
  private closeGate: VisibilityGate
  private info: Panel
  private buttons: Panel
  private closePanel: Panel
  private nameText: Text
  private descText: Text
  private backLine: Text
  // Laid-out panel sizes in cm (UIKit reports them on its first layout; these are close first guesses).
  private infoSize = new vec2(22, 10)
  private buttonsSize = new vec2(10.6, 11.2)
  private closeSize = new vec2(10.6, 5.6)
  private _onFlip = new Event<void>()
  private _onPutBack = new Event<void>()
  private _onClose = new Event<void>()

  get onFlip(): PublicApi<void> {
    return this._onFlip.publicApi()
  }

  get onPutBack(): PublicApi<void> {
    return this._onPutBack.publicApi()
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

    // No BackPlate behind the buttons (it stole near-field pinches from Flip), and buttons sized to
    // the Specs "Large" target at ~55 cm (4 cm) with a 1.6 cm gap (> the 1-degree minimum spacing),
    // so pressing Put back can no longer also press Flip.
    this.buttons = makePanel(this.sceneObject, "InspectButtons", -1, {padCm: 0.8, gapCm: 1.6, plate: false})
    addButton(this.buttons.content, "FlipButton", TEXT.flip, 9, 4, d, b, () => this._onFlip.invoke())
    addButton(this.buttons.content, "PutBackButton", TEXT.putBack, 9, 4, d, b, () => this._onPutBack.invoke())
    // A separate one-button panel for clues described in place: UIKit's flex layout keeps the space of a
    // hidden child, so hiding Flip in the panel above would leave a gap.
    this.closePanel = makePanel(this.sceneObject, "InspectCloseButtons", -1, {padCm: 0.8, gapCm: 1.6, plate: false})
    addButton(this.closePanel.content, "CloseButton", TEXT.close, 9, 4, d, b, () => this._onClose.invoke())

    this.info.flex.onLayoutComplete.add((r) => (this.infoSize = new vec2(r.containerWidth, r.containerHeight)))
    this.buttons.flex.onLayoutComplete.add((r) => (this.buttonsSize = new vec2(r.containerWidth, r.containerHeight)))
    this.closePanel.flex.onLayoutComplete.add((r) => (this.closeSize = new vec2(r.containerWidth, r.containerHeight)))

    this.infoGate = new VisibilityGate(this, this.info.root, false)
    this.buttonsGate = new VisibilityGate(this, this.buttons.root, false)
    this.closeGate = new VisibilityGate(this, this.closePanel.root, false)
  }

  /** Place the info panel below and the buttons beside a held clue of the given size (cm). */
  layoutFor(widthCm: number, heightCm: number): void {
    this.info.root.getTransform().setLocalPosition(new vec3(0, -(heightCm / 2 + this.gapCm + this.infoSize.y / 2), 0.5))
    this.buttons.root.getTransform().setLocalPosition(new vec3(widthCm / 2 + this.gapCm + this.buttonsSize.x / 2, 0, 0.5))
  }

  /**
   * The rectangle (cm, in this root's XY plane, origin at the clue's center) covered by a held clue of
   * the given size plus the info panel and buttons that layoutFor() places around it.
   */
  groupRect(widthCm: number, heightCm: number): {min: vec2; max: vec2} {
    const right = Math.max(widthCm / 2 + this.gapCm + this.buttonsSize.x, this.infoSize.x / 2)
    const left = -Math.max(widthCm / 2, this.infoSize.x / 2)
    const top = Math.max(heightCm / 2, this.buttonsSize.y / 2)
    const bottom = -(heightCm / 2 + this.gapCm + this.infoSize.y)
    return {min: new vec2(left, bottom), max: new vec2(right, top)}
  }

  /** For a clue described in place: the info panel centred on this root, the Close button under it. */
  layoutInPlace(): void {
    this.info.root.getTransform().setLocalPosition(new vec3(0, 0, 0.5))
    this.closePanel.root.getTransform().setLocalPosition(new vec3(0, -(this.infoSize.y / 2 + this.gapCm + this.closeSize.y / 2), 0.5))
  }

  /** The rectangle (cm, in this root's XY plane) covered by the info panel and Close button of layoutInPlace(). */
  groupRectInPlace(): {min: vec2; max: vec2} {
    const half = Math.max(this.infoSize.x, this.closeSize.x) / 2
    return {
      min: new vec2(-half, -(this.infoSize.y / 2 + this.gapCm + this.closeSize.y)),
      max: new vec2(half, this.infoSize.y / 2),
    }
  }

  /** Show the name and description; with `inPlace`, the Close button instead of Flip / Put back. */
  show(name: string, description: string, inPlace: boolean = false): void {
    this.nameText.text = name
    this.descText.text = description
    this.backLine.text = ""
    this.infoGate.set(true)
    this.buttonsGate.set(!inPlace)
    this.closeGate.set(inPlace)
  }

  setBackText(text: string): void {
    this.backLine.text = text
  }

  hide(): void {
    this.infoGate.set(false)
    this.buttonsGate.set(false)
    this.closeGate.set(false)
  }
}
