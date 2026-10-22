import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {addText, makePanel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomTruthPanelUI — the one-sentence truth, on a panel that looks like the opening board.
 *
 * Passive view. Main calls showTruth with the sentence and a world pose (above the named suspect,
 * about 1.5 m in front, a little above eye height, facing the player).
 * Exposes: showTruth, hide, truthText.
 */
@component
export class CaseRoomTruthPanelUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomTruthPanelUI – the one-sentence truth</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Panel width in cm (the brief asks for about 60 cm)")
  @widget(new SliderWidget(30, 90, 1))
  panelWidthCm: number = 60

  @input
  @hint("Viewing distance the text is sized for, in cm (about 1.5 m)")
  @widget(new SliderWidget(50, 250, 1))
  viewDistanceCm: number = 150

  @input
  @hint("Text size multiplier on top of the Specs type scale (match the opening board look)")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.7
  @ui.group_end

  private gate: VisibilityGate
  private panelRoot: SceneObject
  private sentence: Text

  get truthText(): string {
    return this.sentence && this.gate.visible ? this.sentence.text : ""
  }

  onAwake(): void {
    const pad = 4
    const panel = makePanel(this.sceneObject, "TruthPanel", this.panelWidthCm, {padCm: pad, gapCm: 0})
    this.panelRoot = panel.root
    const em = roleEmCm("Headline2", this.viewDistanceCm, this.textBoost / 1.2)
    this.sentence = addText(panel.content, "TruthText", "", "Headline2", this.viewDistanceCm, this.panelWidthCm - pad * 2, em * 4, {
      wrap: true,
      boost: this.textBoost / 1.2,
      color: new vec4(1.0, 0.95, 0.8, 1),
    })
    this.gate = new VisibilityGate(this, this.panelRoot, false)
  }

  showTruth(text: string, worldPos: vec3, worldRot: quat): void {
    this.sentence.text = text
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(worldPos)
    t.setWorldRotation(worldRot)
    this.gate.set(true)
    const pt = this.panelRoot.getTransform()
    animate({
      duration: 0.6,
      easing: "ease-out-cubic",
      update: (k: number) => pt.setLocalScale(vec3.one().uniformScale(0.85 + 0.15 * k)),
    })
  }

  hide(): void {
    this.gate.set(false)
  }
}
