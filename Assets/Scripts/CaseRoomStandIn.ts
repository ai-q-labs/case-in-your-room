import {addVisual, faceTowardYaw, MeshKit, solidMaterial} from "./CaseRoomMeshes"

/**
 * CaseRoomStandIn — preview stand-in furniture (desk, chair, wall section) built with MeshBuilder.
 *
 * The brief has no surface detection in the preview, so the Lens brings its own real-size desk
 * (top at 75 cm), chair (seat at 45 cm) and a wall section for the clock. Each stand-in is an
 * authored SceneObject under CrimeScene; its position is the design decision, this script only
 * builds the geometry under it (hidden until the main script calls setVisible(true)).
 * Must not: hold game state, create colliders.
 */
@component
export class CaseRoomStandIn extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomStandIn – preview stand-in furniture</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Which stand-in to build")
  @widget(new ComboBoxWidget([new ComboBoxItem("Desk", "Desk"), new ComboBoxItem("Chair", "Chair"), new ComboBoxItem("Wall", "Wall")]))
  kind: string = "Desk"

  @input
  @hint("Width in cm (left-right as seen from the room center)")
  @widget(new SliderWidget(20, 300, 1))
  widthCm: number = 100

  @input
  @hint("Depth in cm (toward the room center)")
  @widget(new SliderWidget(3, 120, 1))
  depthCm: number = 55

  @input
  @hint("Height in cm: desk top, chair seat, or wall height")
  @widget(new SliderWidget(10, 300, 1))
  heightCm: number = 75

  @input("vec4", "{0.86,0.72,0.52,1}")
  @hint("Surface color (keep it light: the display is additive)")
  @widget(new ColorWidget())
  color: vec4

  @input
  @hint("Turn so the front (+Z) faces the CrimeScene origin (where the player starts)")
  faceRoomCenter: boolean = true
  @ui.group_end

  private visualRoot: SceneObject

  onAwake(): void {
    if (this.faceRoomCenter) {
      const p = this.sceneObject.getTransform().getLocalPosition()
      this.sceneObject.getTransform().setLocalRotation(faceTowardYaw(p, vec3.zero()))
    }
    this.visualRoot = global.scene.createSceneObject("StandInVisual")
    this.visualRoot.setParent(this.sceneObject)
    const kit = new MeshKit()
    const w = this.widthCm, d = this.depthCm, h = this.heightCm
    if (this.kind === "Wall") {
      kit.box(0, h / 2, 0, w / 2, h / 2, d / 2)
    } else {
      const slab = 3
      kit.box(0, h - slab / 2, 0, w / 2, slab / 2, d / 2)
      const leg = 4
      const lx = w / 2 - leg, lz = d / 2 - leg
      const legH = h - slab
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          kit.box(sx * lx, legH / 2, sz * lz, leg / 2, legH / 2, leg / 2)
        }
      }
      if (this.kind === "Chair") {
        // Backrest on the far side (away from the room center).
        kit.box(0, h + 22, -d / 2 + 1.5, w / 2, 22, 1.5)
      }
    }
    addVisual(this.visualRoot, "Mesh", kit.build(), solidMaterial(this.color))
    this.visualRoot.enabled = false
  }

  setVisible(visible: boolean): void {
    if (this.visualRoot) this.visualRoot.enabled = visible
  }
}
