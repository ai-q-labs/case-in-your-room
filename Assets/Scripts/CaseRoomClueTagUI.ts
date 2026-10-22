import {addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomClueTagUI — the name tag ("Memo", "Stopped clock", ...) that appears over a clue while
 * the hand ray is on it.
 *
 * Passive view. Main calls showTag with the clue's name and a world pose (above the clue, facing
 * the player) and hideTag when the ray leaves.
 * Exposes: showTag, hideTag, currentName.
 */
@component
export class CaseRoomClueTagUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomClueTagUI – clue name tag on hover</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Viewing distance the text is sized for, in cm (clues sit 1.2 to 2 m away)")
  @widget(new SliderWidget(50, 250, 1))
  viewDistanceCm: number = 160

  @input
  @hint("Text size multiplier on top of the Specs type scale")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.4
  @ui.group_end

  private gate: VisibilityGate
  private panel: Panel
  private label: Text
  private em = 2

  get currentName(): string {
    return this.label && this.gate.visible ? this.label.text : ""
  }

  onAwake(): void {
    this.panel = makePanel(this.sceneObject, "ClueNameTag", -1, {padCm: 1.0, gapCm: 0})
    this.em = roleEmCm("Subheadline", this.viewDistanceCm, this.textBoost)
    this.label = addText(this.panel.content, "ClueNameTagText", "Stopped clock", "Subheadline", this.viewDistanceCm, this.widthFor("Stopped clock"), this.em * 1.4, {
      boost: this.textBoost,
    })
    this.gate = new VisibilityGate(this, this.panel.root, false)
  }

  private widthFor(s: string): number {
    return s.length * this.em * 0.58 + 1.5
  }

  showTag(name: string, worldPos: vec3, worldRot: quat): void {
    this.label.text = name
    const w = this.widthFor(name)
    const h = this.em * 1.4
    this.label.layoutRect = Rect.create(-w / 2, w / 2, -h / 2, h / 2)
    this.panel.flex.markDirty()
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(worldPos)
    t.setWorldRotation(worldRot)
    this.gate.set(true)
  }

  hideTag(): void {
    this.gate.set(false)
  }
}
