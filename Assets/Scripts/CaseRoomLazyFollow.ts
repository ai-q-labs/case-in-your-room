import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

/**
 * CaseRoomLazyFollow — keeps this SceneObject slightly below the line of sight, at a set distance,
 * and slowly catches up when the head turns (lazy follow; never locked to the head).
 *
 * Used by the counter/arrow HUD and the caption panel. The object's +Z faces the user.
 * Must not: hold game state.
 */
@component
export class CaseRoomLazyFollow extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomLazyFollow – slow head follow</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Distance in front of the eyes, in cm")
  @widget(new SliderWidget(40, 250, 1))
  distanceCm: number = 100

  @input
  @hint("How far below the line of sight, in cm")
  @widget(new SliderWidget(0, 60, 0.5))
  dropCm: number = 20

  @input
  @hint("Catch-up speed (higher follows faster; low values feel lazy)")
  @widget(new SliderWidget(0.3, 10, 0.1))
  followSpeed: number = 2.0
  @ui.group_end

  private camT: Transform = null
  private snapNext = true

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      const cam = WorldCameraFinderProvider.getInstance().getComponent()
      this.camT = cam ? cam.getTransform() : null
    })
    this.createEvent("UpdateEvent").bind(() => this.follow())
  }

  /** Jump straight to the target pose on the next frame (e.g. when the panel is first shown). */
  snap(): void {
    this.snapNext = true
  }

  private follow(): void {
    if (!this.camT) return
    const eye = this.camT.getWorldPosition()
    const fwd = this.camT.back
    const up = this.camT.up
    const target = eye.add(fwd.uniformScale(this.distanceCm)).sub(up.uniformScale(this.dropCm))
    const t = this.sceneObject.getTransform()
    const k = this.snapNext ? 1 : 1 - Math.exp(-this.followSpeed * getDeltaTime())
    this.snapNext = false
    const pos = vec3.lerp(t.getWorldPosition(), target, k)
    t.setWorldPosition(pos)
    const toEye = eye.sub(pos)
    if (toEye.length > 1e-3) {
      const want = quat.lookAt(toEye.normalize(), up)
      t.setWorldRotation(quat.slerp(t.getWorldRotation(), want, k))
    }
  }
}
