import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {CaseRoomClue} from "./CaseRoomClue"
import {CaseRoomReplayModel, ModelRoom} from "./CaseRoomReplayModel"
import {
  addVisual,
  DEG,
  FIGURE_PROFILE,
  flatForward,
  glowMaterial,
  MeshKit,
  pitchQuat,
  setGlow,
  shoeOutline,
  yawQuat,
} from "./CaseRoomMeshes"

export interface ReplayStop {
  clue: CaseRoomClue
  caption: string
}

export interface WalkHooks {
  onCaption: (text: string) => void
  onFinished: (figureTop: vec3) => void
}

interface Thread {
  so: SceneObject
  mat: Material
}

/**
 * CaseRoomReplay — the "one spatial moment": clues float up and gather in front of the player,
 * glowing threads converge on the named suspect, and (if right) the culprit's translucent figure
 * walks the room visiting the clues in the night's order, leaving glowing footprints. While she walks,
 * a model of the whole room stands straight ahead (CaseRoomReplayModel), seen from above, where a small
 * figure walks the same path at the same moments, so the whole walk can be followed without turning.
 *
 * Owns: threads, footprint trail, the walking figure and the room model (all MeshBuilder geometry) and
 * their timing. Pushes captions out through callbacks; the main script decides what to show.
 * Must not: decide right/wrong, count accusations, or create UI text.
 */
@component
export class CaseRoomReplay extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaseRoomReplay – gather, threads and the culprit walk</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input("vec3", "{0.72,0.9,1.0}")
  @hint("Color of the glowing threads")
  @widget(new ColorWidget())
  threadColor: vec3

  @input("vec3", "{1.0,0.74,0.88}")
  @hint("Color of the walking translucent figure")
  @widget(new ColorWidget())
  figureColor: vec3

  @input("vec3", "{0.62,0.96,1.0}")
  @hint("Color of the glowing footprints left on the floor")
  @widget(new ColorWidget())
  footprintColor: vec3

  @input
  @hint("Walking speed of the figure in cm per second")
  @widget(new SliderWidget(30, 250, 5))
  walkSpeedCm: number = 95

  @input
  @hint("Seconds the figure pauses at each clue (caption time)")
  @widget(new SliderWidget(0.5, 8, 0.1))
  dwellSec: number = 3.4

  @input
  @hint("Distance in front of the player where the clues gather, in cm")
  @widget(new SliderWidget(60, 200, 1))
  gatherDistanceCm: number = 120

  @input
  @hint("Size of each gathered clue in cm (keep the row of 5 inside the view)")
  @widget(new SliderWidget(5, 25, 0.5))
  gatherSizeCm: number = 11

  @input
  @hint("How far above eye level the clues float when they gather, in cm")
  @widget(new SliderWidget(-30, 40, 1))
  gatherHeightCm: number = 14
  @ui.group_end

  @ui.separator
  @ui.group_start("Room model straight ahead during the walk")
  @input
  @hint("Distance from the eyes to the centre of the room model, in cm")
  @widget(new SliderWidget(40, 150, 1))
  modelDistanceCm: number = 70

  @input
  @hint("The model's floor is tilted toward the player so it is seen as from this many degrees above")
  @widget(new SliderWidget(20, 80, 1))
  modelLookDownDeg: number = 50

  @input
  @hint("Share of the view (edge to edge) the model may use to the left, right and top")
  @widget(new SliderWidget(0.5, 1, 0.01))
  modelViewFill: number = 0.85

  @input
  @hint("Lowest the model may reach, in degrees below a level gaze (the captions sit below this)")
  @widget(new SliderWidget(-15, 0, 0.5))
  modelBottomDeg: number = -5

  @input
  @hint("Each clue in the model is drawn at least this big (cm at the room's scale), so it can be told apart")
  @widget(new SliderWidget(15, 90, 1))
  modelClueMinCm: number = 45
  @ui.group_end

  private camT: Transform = null
  private cam: Camera = null
  private boxMesh: RenderMesh
  private footMesh: RenderMesh
  private threads: Thread[] = []
  private threadRoot: SceneObject
  private trailRoot: SceneObject
  private walker: SceneObject
  private walkerMat: Material
  private model: CaseRoomReplayModel

  // Walk state
  private walking = false
  private path: {pos: vec3; stop: ReplayStop | null}[] = []
  private pathIndex = 0
  private dwell = 0
  private sinceStep = 0
  private stepSide = 1
  private hooks: WalkHooks = null

  onAwake(): void {
    this.boxMesh = new MeshKit().box(0, 0, 0.5, 0.5, 0.5, 0.5).build() // unit box from z=0 to z=1
    this.footMesh = new MeshKit().flatXY(shoeOutline(24, 9), 0.1, 0.2).build()
    this.threadRoot = this.child("Threads")
    this.trailRoot = this.child("FootprintTrail")
    this.walker = this.child("CulpritFigure")
    this.walkerMat = glowMaterial(this.figureColor, 0)
    const figureMesh = new MeshKit().lathe(FIGURE_PROFILE, 32).build()
    addVisual(this.walker, "Body", figureMesh, this.walkerMat)
    this.walker.enabled = false
    this.model = new CaseRoomReplayModel(this.sceneObject, figureMesh, this.footMesh, this.figureColor, this.footprintColor)

    this.createEvent("OnStartEvent").bind(() => {
      const cam = WorldCameraFinderProvider.getInstance().getComponent()
      this.cam = cam
      this.camT = cam ? cam.getTransform() : null
    })
    this.createEvent("UpdateEvent").bind(() => {
      this.updateWalk()
      if (this.model.shown && this.walker.enabled) this.model.follow(this.walker.getTransform())
      this.model.update(getDeltaTime())
    })
  }

  /**
   * Step 1 of an accusation: gather the clues in front of the player and draw threads to `target`.
   * If `correct` is false the last thread breaks just before the person and everything fades back.
   */
  accuse(clues: CaseRoomClue[], target: vec3, correct: boolean, done: () => void): void {
    if (!this.camT) {
      done()
      return
    }
    const eye = this.camT.getWorldPosition()
    const fwd = flatForward(this.camT)
    const right = new vec3(-fwd.z, 0, fwd.x)
    const center = eye.add(fwd.uniformScale(this.gatherDistanceCm)).add(new vec3(0, this.gatherHeightCm, 0))
    const spacing = this.gatherSizeCm + 2
    const slots: vec3[] = clues.map((_c, i) => {
      const o = i - (clues.length - 1) / 2
      return center.add(right.uniformScale(o * spacing)).add(fwd.uniformScale(-Math.abs(o) * 2))
    })
    clues.forEach((c, i) => {
      c.setInteractive(false)
      c.flashGlow()
      const toEye = eye.sub(slots[i])
      c.moveTo(slots[i], quat.lookAt(new vec3(toEye.x, 0, toEye.z).normalize(), vec3.up()), this.gatherSizeCm, 1.2, 1.3)
    })
    const converge = center.add(target.sub(center).uniformScale(0.4))
    this.delay(1.4, () => {
      slots.forEach((s) => this.growThread(s, converge, 0.8))
      this.delay(0.85, () => {
        const toTarget = target.sub(converge)
        const full = toTarget.length
        const end = correct ? full - 8 : Math.max(10, full - 30)
        this.growThread(converge, converge.add(toTarget.normalize().uniformScale(end)), 0.7)
        if (correct) {
          this.delay(1.6, done)
        } else {
          this.delay(1.3, () => {
            this.fadeThreads(0.8)
            clues.forEach((c) => c.returnToRest(1.1))
            this.delay(1.2, done)
          })
        }
      })
    })
  }

  /**
   * Step 2 (right answer only): the threads fade, clues fly home, and the culprit's figure walks
   * from `startFloor` to each stop in order, then back to the start.
   */
  walk(stops: ReplayStop[], startFloor: vec3, roomCenterFloor: vec3, hooks: WalkHooks, room: ModelRoom): void {
    this.hooks = hooks
    this.fadeThreads(0.9)
    if (this.camT && this.cam) {
      this.model.show(room, this.camT.getWorldPosition(), flatForward(this.camT), this.cam, {
        distanceCm: this.modelDistanceCm,
        lookDownDeg: this.modelLookDownDeg,
        fill: this.modelViewFill,
        bottomDeg: this.modelBottomDeg,
        clueMinCm: this.modelClueMinCm,
      })
    }
    for (const s of stops) s.clue.returnToRest(1.3)
    this.path = []
    for (const s of stops) {
      const rest = s.clue.restPosition
      const p = new vec3(rest.x, startFloor.y, rest.z)
      let d = new vec3(roomCenterFloor.x - p.x, 0, roomCenterFloor.z - p.z)
      const dist = d.length
      d = dist > 1e-3 ? d.uniformScale(1 / dist) : vec3.zero()
      this.path.push({pos: p.add(d.uniformScale(Math.min(45, dist * 0.4))), stop: s})
    }
    this.path.push({pos: startFloor, stop: null})
    this.pathIndex = 0
    this.dwell = 0
    this.sinceStep = 0
    const wt = this.walker.getTransform()
    wt.setWorldPosition(startFloor)
    this.walker.enabled = true
    animate({
      duration: 0.8,
      easing: "ease-out-cubic",
      update: (k: number) => setGlow(this.walkerMat, this.figureColor, 0.5 * k),
    })
    this.delay(1.0, () => (this.walking = true))
  }

  private updateWalk(): void {
    if (!this.walking || this.pathIndex >= this.path.length) return
    const dt = getDeltaTime()
    if (this.dwell > 0) {
      this.dwell -= dt
      return
    }
    const wt = this.walker.getTransform()
    const pos = wt.getWorldPosition()
    const target = this.path[this.pathIndex].pos
    const to = new vec3(target.x - pos.x, 0, target.z - pos.z)
    const dist = to.length
    const step = this.walkSpeedCm * dt
    if (dist <= step) {
      wt.setWorldPosition(target)
      const node = this.path[this.pathIndex]
      const reached = this.pathIndex
      this.pathIndex++
      if (node.stop) {
        node.stop.clue.flashGlow()
        this.model.arrive(reached)
        this.hooks.onCaption(node.stop.caption)
        this.dwell = this.dwellSec
      } else if (this.pathIndex >= this.path.length) {
        this.walking = false
        this.model.hide(0.6)
        if (this.camT) {
          const eye = this.camT.getWorldPosition()
          wt.setWorldRotation(yawQuat(Math.atan2(eye.x - target.x, eye.z - target.z)))
        }
        this.hooks.onFinished(target.add(new vec3(0, 168, 0)))
      }
      return
    }
    const dir = to.uniformScale(1 / dist)
    wt.setWorldPosition(pos.add(dir.uniformScale(step)))
    wt.setWorldRotation(yawQuat(Math.atan2(dir.x, dir.z)))
    this.sinceStep += step
    if (this.sinceStep >= 32) {
      this.sinceStep = 0
      this.dropFootprint(pos, dir)
    }
  }

  private dropFootprint(pos: vec3, dir: vec3): void {
    this.stepSide = -this.stepSide
    const side = new vec3(-dir.z, 0, dir.x).uniformScale(7 * this.stepSide)
    const so = global.scene.createSceneObject("Footprint")
    so.setParent(this.trailRoot)
    // Outline toes are +Y; pitch -90 lays it face-up with toes toward -Z, then yaw -Z onto dir.
    const rot = yawQuat(Math.atan2(-dir.x, -dir.z)).multiply(pitchQuat(-90 * DEG))
    const mat = glowMaterial(this.footprintColor, 0.65)
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.footMesh
    rmv.mainMaterial = mat
    const t = so.getTransform()
    t.setWorldPosition(pos.add(side).add(new vec3(0, 0.6, 0)))
    t.setWorldRotation(rot)
    this.model.addFootprint(t.getWorldPosition(), rot)
  }

  private growThread(from: vec3, to: vec3, duration: number): void {
    const so = global.scene.createSceneObject("Thread")
    so.setParent(this.threadRoot)
    const mat = glowMaterial(this.threadColor, 0.95)
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.boxMesh
    rmv.mainMaterial = mat
    const d = to.sub(from)
    const len = d.length
    const t = so.getTransform()
    t.setWorldPosition(from)
    const dir = len > 1e-3 ? d.uniformScale(1 / len) : vec3.forward()
    const up = Math.abs(dir.y) > 0.95 ? vec3.forward() : vec3.up()
    t.setWorldRotation(quat.lookAt(dir, up))
    this.threads.push({so, mat})
    animate({
      duration,
      easing: "ease-out-cubic",
      update: (k: number) => t.setLocalScale(new vec3(0.7, 0.7, Math.max(0.01, len * k))),
    })
  }

  private fadeThreads(duration: number): void {
    const list = this.threads
    this.threads = []
    animate({
      duration,
      easing: "linear",
      update: (k: number) => {
        for (const th of list) setGlow(th.mat, this.threadColor, 0.95 * (1 - k))
      },
      ended: () => {
        for (const th of list) th.so.destroy()
      },
    })
  }

  private child(name: string): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(this.sceneObject)
    return so
  }

  private delay(seconds: number, fn: () => void): void {
    const ev = this.createEvent("DelayedCallbackEvent")
    ev.bind(fn)
    ev.reset(seconds)
  }
}
