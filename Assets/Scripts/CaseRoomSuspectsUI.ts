import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SUSPECTS, TEXT} from "./CaseRoomData"
import {addButton, addText, makePanel, Panel, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

/**
 * CaseRoomSuspectsUI — the text around the suspect line-up: each suspect's name and one-word role
 * at their feet, the speech bubble with the selected suspect's alibi, and the
 * "Accuse this person" button at the selected suspect's feet.
 *
 * Lives under SuspectLineup (local +Z faces the player); suspect i stands at x = (i - 1) * spacing.
 * Passive view: main says which suspect is selected; the button emits onAccuse.
 * Exposes: setVisible, select(index), clearSelection, alibiText, selectedIndex.
 */
@component
export class CaseRoomSuspectsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomSuspectsUI – names, alibi bubble, Accuse button</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Center-to-center spacing of the suspects in cm (must match the figures)")
  @widget(new SliderWidget(30, 90, 1))
  spacingCm: number = 40

  @input
  @hint("Viewing distance the text is sized for, in cm (the line-up stands about 2 m away)")
  @widget(new SliderWidget(80, 300, 1))
  viewDistanceCm: number = 200

  @input
  @hint("Text size multiplier on top of the Specs type scale")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.25

  @input
  @hint("Height of the name labels below the figure centers, in cm")
  @widget(new SliderWidget(20, 80, 0.5))
  labelDropCm: number = 44

  @input
  @hint("Width of the alibi speech bubble in cm; it is kept inside the line-up width so it stays in view")
  @widget(new SliderWidget(20, 60, 0.5))
  bubbleWidthCm: number = 44
  @ui.group_end

  private labelGates: VisibilityGate[] = []
  private bubbleGate: VisibilityGate
  private buttonGate: VisibilityGate
  private bubble: Panel
  private accusePanel: Panel
  private alibi: Text
  private selected = -1
  private _onAccuse = new Event<void>()

  get onAccuse(): PublicApi<void> {
    return this._onAccuse.publicApi()
  }

  get alibiText(): string {
    return this.alibi && this.bubbleGate.visible ? this.alibi.text : ""
  }

  get selectedIndex(): number {
    return this.selected
  }

  onAwake(): void {
    const d = this.viewDistanceCm
    const b = this.textBoost
    const nameEm = roleEmCm("Subheadline", d, b)
    const roleEm = roleEmCm("Body", d, b * 0.9)
    SUSPECTS.forEach((s, i) => {
      const key = s.name.replace(/\s+/g, "")
      const p = makePanel(this.sceneObject, `SuspectLabel_${key}`, 28, {
        padCm: 1.2,
        gapCm: 0.3,
        position: new vec3(this.xFor(i), -this.labelDropCm, 2),
      })
      addText(p.content, `SuspectName_${key}`, s.name, "Subheadline", d, 25.5, nameEm * 1.3, {boost: b})
      addText(p.content, `SuspectRole_${key}`, s.role, "Body", d, 25.5, roleEm * 1.3, {
        boost: b * 0.9,
        color: new vec4(0.8, 0.92, 1.0, 1),
      })
      this.labelGates.push(new VisibilityGate(this, p.root, false))
    })

    this.bubble = makePanel(this.sceneObject, "AlibiBubble", this.bubbleWidthCm, {padCm: 1.6, gapCm: 0, position: new vec3(0, 44, 4)})
    const alibiEm = roleEmCm("Body", d, b * 1.05)
    this.alibi = addText(this.bubble.content, "AlibiText", "", "Body", d, this.bubbleWidthCm - 3.2, alibiEm * 2.8, {wrap: true, boost: b * 1.05})
    this.bubbleGate = new VisibilityGate(this, this.bubble.root, false)

    this.accusePanel = makePanel(this.sceneObject, "AccusePanel", -1, {padCm: 1.0, gapCm: 0, position: new vec3(0, -this.labelDropCm - 14, 3)})
    addButton(this.accusePanel.content, "AccuseButton", TEXT.accuse, 30, 7, d, b, () => this._onAccuse.invoke())
    this.buttonGate = new VisibilityGate(this, this.accusePanel.root, false)
  }

  private xFor(i: number): number {
    return (i - 1) * this.spacingCm
  }

  setVisible(visible: boolean): void {
    for (const g of this.labelGates) g.set(visible)
    if (!visible) this.clearSelection()
  }

  /** Show the alibi bubble above suspect `index` and the Accuse button at their feet. */
  select(index: number): void {
    this.selected = index
    const x = this.xFor(index)
    this.alibi.text = SUSPECTS[index].alibi
    // Above the selected suspect, but pulled in so the bubble never extends past the outer figures.
    const edge = this.spacingCm + 15 - this.bubbleWidthCm / 2
    const bx = Math.max(-edge, Math.min(edge, x))
    this.bubble.root.getTransform().setLocalPosition(new vec3(bx, 44, 4))
    this.accusePanel.root.getTransform().setLocalPosition(new vec3(x, -this.labelDropCm - 14, 3))
    this.bubbleGate.set(true)
    this.buttonGate.set(true)
  }

  clearSelection(): void {
    this.selected = -1
    this.bubbleGate.set(false)
    this.buttonGate.set(false)
  }
}
