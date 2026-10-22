import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SUSPECTS, SuspectInfo} from "./CaseRoomData"
import {addVisual, BUST_PROFILE, glowMaterial, MeshKit, setGlow} from "./CaseRoomMeshes"

/**
 * CaseRoomSuspect — one translucent chest-up suspect figure in the line-up.
 *
 * Owns: the bust geometry (MeshBuilder lathe, ~70 cm tall, ~34 cm wide), its outline glow when
 * selected, and its pinch target (collider + SIK Interactable on this unit-scale wrapper, whose
 * origin is the bust's center so the collider sits on the visual).
 * Emits: onPressed(suspectIndex).
 * Must not: show text (name, role, alibi live in CaseRoomSuspectsUI) or judge accusations.
 */
@component
export class CaseRoomSuspect extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomSuspect – translucent suspect figure</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Which suspect this figure is")
  @widget(new ComboBoxWidget([new ComboBoxItem("Edgar Hale", 0), new ComboBoxItem("Nora Vale", 1), new ComboBoxItem("Iris Bell", 2)]))
  suspectIndex: number = 0

  @input("vec3", "{0.7,1.0,0.78}")
  @hint("Figure color (light colors only: the display is additive)")
  @widget(new ColorWidget())
  figureColor: vec3

  @input
  @hint("Figure width in cm at the shoulders (slimmer than real shoulders so neighbors don't overlap)")
  @widget(new SliderWidget(20, 40, 0.5))
  figureWidthCm: number = 31

  @input
  @hint("Pinch target width in cm (the brief caps it at 40 cm so neighbors never overlap)")
  @widget(new SliderWidget(20, 40, 1))
  hitboxWidthCm: number = 32

  @input
  @hint("Figure brightness when not selected (0..1)")
  @widget(new SliderWidget(0.1, 1, 0.05))
  idleBrightness: number = 0.42
  @ui.group_end

  @ui.separator
  @ui.group_start("Debug")
  @input
  @hint("Draw the pinch target collider")
  debugColliders: boolean = false
  @ui.group_end

  private visual: SceneObject
  private bodyMat: Material
  private outlineMat: Material
  private collider: ColliderComponent
  private interactable: Interactable
  private selected = false
  private shown = false
  private _onPressed = new Event<number>()

  get onPressed(): PublicApi<number> {
    return this._onPressed.publicApi()
  }

  get info(): SuspectInfo {
    return SUSPECTS[this.suspectIndex]
  }

  onAwake(): void {
    this.visual = global.scene.createSceneObject("Figure")
    this.visual.setParent(this.sceneObject)
    // Bust origin is its bottom; offset so this wrapper's origin is the bust's center.
    const bust = new MeshKit().lathe(BUST_PROFILE, 32, 0, -35, 0).build()
    this.bodyMat = glowMaterial(this.figureColor, this.idleBrightness)
    this.outlineMat = glowMaterial(this.figureColor, 0)
    // The lathe bust is 34 cm wide; squeeze it to figureWidthCm (visual-only child, no collider on it).
    const w = this.figureWidthCm / 34
    addVisual(this.visual, "Body", bust, this.bodyMat, vec3.zero(), quat.quatIdentity(), new vec3(w, 1, w))
    addVisual(this.visual, "Outline", bust, this.outlineMat, new vec3(0, -2.8, -1), quat.quatIdentity(), new vec3(w * 1.08, 1.08, w * 1.08))

    this.collider = this.sceneObject.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(Math.min(40, this.hitboxWidthCm), 72, 24)
    this.collider.shape = shape
    this.collider.fitVisual = false
    this.collider.debugDrawEnabled = this.debugColliders
    this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable

    this.createEvent("OnStartEvent").bind(() => {
      this.interactable.onTriggerEnd.add(() => {
        if (this.shown) this._onPressed.invoke(this.suspectIndex)
      })
    })
    this.setVisible(false)
  }

  setVisible(visible: boolean): void {
    this.shown = visible
    this.visual.enabled = visible
    this.collider.enabled = visible
    this.interactable.enabled = visible
    if (!visible) this.setSelected(false)
  }

  /** Fade and rise into view. */
  appear(duration: number = 0.8): void {
    this.setVisible(true)
    const t = this.visual.getTransform()
    animate({
      duration,
      easing: "ease-out-cubic",
      update: (k: number) => {
        setGlow(this.bodyMat, this.figureColor, this.idleBrightness * k)
        t.setLocalPosition(new vec3(0, -12 * (1 - k), 0))
      },
    })
  }

  setSelected(selected: boolean): void {
    this.selected = selected
    setGlow(this.bodyMat, this.figureColor, selected ? Math.min(1, this.idleBrightness + 0.15) : this.idleBrightness)
    setGlow(this.outlineMat, this.figureColor, selected ? 0.3 : 0)
  }

  get isSelected(): boolean {
    return this.selected
  }
}
