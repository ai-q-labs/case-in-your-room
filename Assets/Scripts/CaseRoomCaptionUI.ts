import {addText, makePanel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomCaptionUI — one caption line a little below the line of sight (~1.2 m away).
 *
 * Used for "Look around you", "That doesn't match the clues" and the replay captions.
 * Passive view; a CaseRoomLazyFollow on the same SceneObject makes it follow the face slowly.
 * Exposes: showCaption(text, seconds), hideCaption(), currentText.
 */
@component
export class CaseRoomCaptionUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomCaptionUI – caption below the line of sight</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Caption width in cm")
  @widget(new SliderWidget(20, 80, 1))
  widthCm: number = 48

  @input
  @hint("Viewing distance the text is sized for, in cm (match the lazy follow distance)")
  @widget(new SliderWidget(50, 250, 1))
  viewDistanceCm: number = 120

  @input
  @hint("Text size multiplier on top of the Specs type scale")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.6
  @ui.group_end

  private gate: VisibilityGate
  private caption: Text
  private token = 0

  get currentText(): string {
    return this.caption && this.gate.visible ? this.caption.text : ""
  }

  onAwake(): void {
    const pad = 1.6
    const panel = makePanel(this.sceneObject, "CaptionPanel", this.widthCm, {padCm: pad, gapCm: 0})
    const em = roleEmCm("Body", this.viewDistanceCm, this.textBoost)
    this.caption = addText(panel.content, "CaptionText", "", "Body", this.viewDistanceCm, this.widthCm - pad * 2, em * 2.7, {
      wrap: true,
      boost: this.textBoost,
    })
    this.gate = new VisibilityGate(this, panel.root, false)
  }

  /** Show a caption; hide it after `seconds` (0 keeps it until replaced or hidden). */
  showCaption(text: string, seconds: number = 0): void {
    this.caption.text = text
    this.gate.set(true)
    const my = ++this.token
    if (seconds > 0) {
      const ev = this.createEvent("DelayedCallbackEvent")
      ev.bind(() => {
        if (this.token === my) this.gate.set(false)
      })
      ev.reset(seconds)
    }
  }

  hideCaption(): void {
    this.token++
    this.gate.set(false)
  }
}
