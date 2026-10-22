import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {CaseRoomClue} from "./CaseRoomClue"
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
 * walks the room visiting the clues in the night's order, leaving glowing footprints.
 *
 * Owns: threads, footprint trail and the walking figure (all MeshBuilder geometry) and their
 * timing. Pushes captions out through callbacks; the main script decides what to show.
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

  private camT: Transform = null
  private boxMesh: RenderMesh
  private footMesh: RenderMesh
  private threads: Thread[] = []
  private threadRoot: SceneObject
  private guideRoot: SceneObject
  private trailRoot: SceneObject
  private walker: SceneObject
  private walkerMat: Material

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
    this.guideRoot = this.child("StartGuides")
    this.trailRoot = this.child("FootprintTrail")
    this.walker = this.child("CulpritFigure")
    this.walkerMat = glowMaterial(this.figureColor, 0)
    addVisual(this.walker, "Body", new MeshKit().lathe(FIGURE_PROFILE, 32).build(), this.walkerMat)
    this.walker.enabled = false

    this.createEvent("OnStartEvent").bind(() => {
      const cam = WorldCameraFinderProvider.getInstance().getComponent()
      this.camT = cam ? cam.getTransform() : null
    })
    this.createEvent("UpdateEvent").bind(() => this.updateWalk())
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
  walk(stops: ReplayStop[], startFloor: vec3, roomCenterFloor: vec3, hooks: WalkHooks): void {
    this.hooks = hooks
    this.fadeThreads(0.9)
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
      this.pathIndex++
      if (node.stop) {
        node.stop.clue.flashGlow()
        this.hooks.onCaption(node.stop.caption)
        this.dwell = this.dwellSec
      } else if (this.pathIndex >= this.path.length) {
        this.walking = false
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

  /**
   * A light trail from `from` (in view at Start) round the player to a clue that just lit up, so the eye
   * can find it. It spirals about the eye (radius going from |from| to the clue's), so it never crosses
   * the player's head; it grows, holds, then fades and is destroyed. `eye` / `fwd` = eye and flat
   * facing at Start.
   */
  guide(name: string, eye: vec3, fwd: vec3, from: vec3, to: vec3, holdSec: number = 2.0): void {
    const right = new vec3(-fwd.z, 0, fwd.x)
    const flatTo = new vec3(to.x - eye.x, 0, to.z - eye.z)
    const bearing = Math.atan2(flatTo.dot(right), flatTo.dot(fwd))
    const r0 = new vec3(from.x - eye.x, 0, from.z - eye.z).length
    const r1 = flatTo.length
    const n = Math.max(6, Math.ceil(Math.abs(bearing) / (10 * DEG)))
    const pts: vec3[] = []
    for (let i = 0; i <= n; i++) {
      const s = i / n
      const a = bearing * s
      const rad = r0 + (r1 - r0) * s
      const y = from.y + (to.y - from.y) * s * s * (3 - 2 * s)
      pts.push(new vec3(eye.x, y, eye.z).add(fwd.uniformScale(Math.cos(a) * rad)).add(right.uniformScale(Math.sin(a) * rad)))
    }

    const root = global.scene.createSceneObject(name)
    root.setParent(this.guideRoot)
    const mat = glowMaterial(this.threadColor, 0.95)
    const segs: {t: Transform; len: number}[] = []
    for (let i = 0; i < n; i++) {
      const so = global.scene.createSceneObject(`Seg${i}`)
      so.setParent(root)
      const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      rmv.mesh = this.boxMesh
      rmv.mainMaterial = mat
      const d = pts[i + 1].sub(pts[i])
      const len = d.length
      const dir = len > 1e-3 ? d.uniformScale(1 / len) : vec3.forward()
      const t = so.getTransform()
      t.setWorldPosition(pts[i])
      t.setWorldRotation(quat.lookAt(dir, Math.abs(dir.y) > 0.95 ? vec3.forward() : vec3.up()))
      t.setLocalScale(new vec3(0.6, 0.6, 0.01))
      segs.push({t, len})
    }
    animate({
      duration: 0.45 + (0.45 * Math.abs(bearing)) / Math.PI,
      easing: "ease-out-cubic",
      update: (k: number) =>
        segs.forEach((s, i) => s.t.setLocalScale(new vec3(0.6, 0.6, Math.max(0.01, s.len * Math.max(0, Math.min(1, k * n - i)))))),
      ended: () => {
        const ev = this.createEvent("DelayedCallbackEvent")
        ev.bind(() =>
          animate({
            duration: 0.8,
            easing: "linear",
            update: (k: number) => setGlow(mat, this.threadColor, 0.95 * (1 - k)),
            ended: () => root.destroy(),
          }),
        )
        ev.reset(holdSec)
      },
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
