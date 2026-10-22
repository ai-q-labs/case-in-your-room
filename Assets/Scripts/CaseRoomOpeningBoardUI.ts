import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {TEXT} from "./CaseRoomData"
import {addButton, addIcon, addText, makePanel, makeRow, roleEmCm, VisibilityGate} from "./CaseRoomSharedUI"

const ICON_PINCH = requireAsset("../Icons/pinch.png") as Texture

/**
 * CaseRoomOpeningBoardUI — the opening board: title, 2-3 lines about the case, how to play
 * (with a small pinching-hand icon) and the Start button.
 *
 * Passive view. Main places it straight ahead at launch and calls hide() after Start.
 * Emits: onStart. Exposes: show(), hide(fadeSec), isVisible.
 * Must not: start the game itself or hold game state.
 */
@component
export class CaseRoomOpeningBoardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomOpeningBoardUI – title, case, how to play, Start</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Board width in cm (the brief asks for about 60 cm)")
  @widget(new SliderWidget(30, 90, 1))
  panelWidthCm: number = 60

  @input
  @hint("Viewing distance the text is sized for, in cm (the board sits about 1.2 m away)")
  @widget(new SliderWidget(50, 250, 1))
  viewDistanceCm: number = 120

  @input
  @hint("Text size multiplier on top of the Specs type scale (the board is large, so text is boosted)")
  @widget(new SliderWidget(1, 3, 0.05))
  textBoost: number = 1.8
  @ui.group_end

  private gate: VisibilityGate
  private panelRoot: SceneObject
  private texts: Text[] = []
  private startButton: Button
  private _onStart = new Event<void>()

  get onStart(): PublicApi<void> {
    return this._onStart.publicApi()
  }

  get isVisible(): boolean {
    return this.gate ? this.gate.visible : false
  }

  onAwake(): void {
    const d = this.viewDistanceCm
    const b = this.textBoost
    const pad = 4
    const inner = this.panelWidthCm - pad * 2
    const panel = makePanel(this.sceneObject, "OpeningBoard", this.panelWidthCm, {padCm: pad, gapCm: 2.2})
    this.panelRoot = panel.root
    const c = panel.content

    const titleEm = roleEmCm("Title1", d, b * 0.85)
    this.texts.push(addText(c, "BoardTitleText", TEXT.title, "Title1", d, inner, titleEm * 1.3, {boost: b * 0.85}))
    const bodyEm = roleEmCm("Body", d, b)
    this.texts.push(
      addText(c, "BoardCaseText", TEXT.opening, "Body", d, inner, bodyEm * 4.2, {wrap: true, boost: b}),
    )

    const row = makeRow(c, "BoardHowToRow", 1.5)
    const iconCm = 4
    addIcon(row, "BoardPinchIcon", ICON_PINCH, iconCm)
    const howEm = roleEmCm("Caption", d, b)
    this.texts.push(
      addText(row, "BoardHowToText", TEXT.howToPlay, "Caption", d, inner - iconCm - 2, howEm * 2.8, {
        wrap: true,
        boost: b,
        color: new vec4(0.85, 0.95, 1.0, 1),
      }),
    )

    const btn = addButton(c, "StartButton", TEXT.start, 18, 6, d, b, () => this._onStart.invoke())
    this.startButton = btn.button
    this.texts.push(btn.label)

    this.gate = new VisibilityGate(this, this.panelRoot, true)
  }

  show(): void {
    this.panelRoot.getTransform().setLocalScale(vec3.one())
    for (const t of this.texts) {
      const col = t.textFill.color
      t.textFill.color = new vec4(col.x, col.y, col.z, 1)
    }
    this.gate.set(true)
  }

  /** Fade out (text alpha + a slight shrink), then hide. */
  hide(fadeSec: number = 0.5): void {
    const pt = this.panelRoot.getTransform()
    animate({
      duration: fadeSec,
      easing: "ease-in-cubic",
      update: (k: number) => {
        for (const t of this.texts) {
          const col = t.textFill.color
          t.textFill.color = new vec4(col.x, col.y, col.z, 1 - k)
        }
        if (this.startButton) this.startButton.opacity = 1 - k
        pt.setLocalScale(vec3.one().uniformScale(1 - 0.15 * k))
      },
      ended: () => this.gate.set(false),
    })
  }
}
