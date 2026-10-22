import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {TEXT} from "./CaseRoomData"
import {addButton, addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomInspectPanelUI — what shows around a clue held in the player's hands:
 * the clue name and 1-2 lines of description below it, and the Flip / Put back buttons beside it.
 *
 * Passive view. Main moves this root onto the inspected clue (same position and facing) and calls
 * show(); layoutFor(sizeCm) keeps the info below and the buttons beside the clue.
 * Emits: onFlip, onPutBack. Exposes: show, setBackText, hide, descriptionText, backText.
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
  private info: Panel
  private buttons: Panel
  private nameText: Text
  private descText: Text
  private backLine: Text
  private _onFlip = new Event<void>()
  private _onPutBack = new Event<void>()

  get onFlip(): PublicApi<void> {
    return this._onFlip.publicApi()
  }

  get onPutBack(): PublicApi<void> {
    return this._onPutBack.publicApi()
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

    this.buttons = makePanel(this.sceneObject, "InspectButtons", -1, {padCm: 0.8, gapCm: 0.8})
    addButton(this.buttons.content, "FlipButton", TEXT.flip, 8.5, 2.8, d, b, () => this._onFlip.invoke())
    addButton(this.buttons.content, "PutBackButton", TEXT.putBack, 8.5, 2.8, d, b, () => this._onPutBack.invoke())

    this.infoGate = new VisibilityGate(this, this.info.root, false)
    this.buttonsGate = new VisibilityGate(this, this.buttons.root, false)
  }

  /** Place the info panel below and the buttons beside a held clue of the given size (cm). */
  layoutFor(widthCm: number, heightCm: number): void {
    this.info.root.getTransform().setLocalPosition(new vec3(0, -(heightCm / 2 + this.gapCm + 3.1), 0.5))
    this.buttons.root.getTransform().setLocalPosition(new vec3(widthCm / 2 + this.gapCm + 5.0, 0, 0.5))
  }

  show(name: string, description: string): void {
    this.nameText.text = name
    this.descText.text = description
    this.backLine.text = ""
    this.infoGate.set(true)
    this.buttonsGate.set(true)
  }

  setBackText(text: string): void {
    this.backLine.text = text
  }

  hide(): void {
    this.infoGate.set(false)
    this.buttonsGate.set(false)
  }
}
