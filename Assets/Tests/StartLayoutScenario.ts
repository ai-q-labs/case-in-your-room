import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

/**
 * Where the 5 clues sit relative to the player's view at the moment Start is pressed (brief, "Where
 * things go"): memo front-right ~1.2 m, footprints front-left ~1.5 m, clock directly behind ~2 m,
 * broken glass back-left ~1.2 m, torn photo back-right ~1.5 m.
 *
 * Bearings are horizontal angles from the flat viewing direction at Start: 0 = straight ahead,
 * + = to the player's right, ±180 = behind. Memo and footprints must be on the front side.
 */
const EXPECTED: {[so: string]: {bearing: [number, number]; dist: [number, number]}} = {
  Clue_Memo: {bearing: [20, 70], dist: [100, 140]},
  Clue_Footprints: {bearing: [-70, -20], dist: [125, 175]},
  Clue_StoppedClock: {bearing: [160, 200], dist: [180, 220]},
  Clue_BrokenGlass: {bearing: [-160, -110], dist: [100, 140]},
  Clue_TornPhoto: {bearing: [110, 160], dist: [125, 175]},
}
const RAD2DEG = 180 / Math.PI

@component
export class StartLayoutScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("StartLayout")
    await sleep(1500)
    await ui.waitUntil("opening board shown in phase intro", () => ui.phase === "intro" && ui.isShown("OpeningBoard"), 5000)

    // The view at the moment Start is pressed.
    const eye = ui.eye
    const f = ui.flatLook
    const right = new vec3(-f.z, 0, f.x)
    ui.log(`start view: eye=${eye.toString()} flatLook=${f.toString()}`)

    // Press Start and watch the light trails every frame until they are gone.
    const guides = new Map<string, {start: vec3; end: vec3; minEyeCm: number; seenAt: number; goneAt: number}>()
    const t0 = getTime()
    await ui.tap("StartButton")
    while (getTime() - t0 < 8) {
      for (const c of CLUES) {
        const name = `StartGuide_${c.so}`
        const g = findSceneObjectByName(name)
        const rec = guides.get(name)
        if (!g || isNull(g)) {
          if (rec && rec.goneAt < 0) rec.goneAt = getTime() - t0
          continue
        }
        const segs: SceneObject[] = []
        for (let i = 0; i < g.getChildrenCount(); i++) segs.push(g.getChild(i))
        if (segs.length === 0) continue
        const start = segs[0].getTransform().getWorldPosition()
        const end = segs[segs.length - 1].getTransform().getWorldTransform().multiplyPoint(new vec3(0, 0, 1))
        let minEye = 1e9
        for (const s of segs) minEye = Math.min(minEye, s.getTransform().getWorldPosition().sub(eye).length)
        minEye = Math.min(minEye, end.sub(eye).length)
        if (!rec) guides.set(name, {start, end, minEyeCm: minEye, seenAt: getTime() - t0, goneAt: -1})
        else {
          rec.end = end
          rec.minEyeCm = Math.min(rec.minEyeCm, minEye)
        }
      }
      await nextFrame()
    }
    expect(ui.phase, "phase after Start").toBe("explore")

    for (const c of CLUES) {
      const name = `StartGuide_${c.so}`
      const g = guides.get(name)
      expect(!!g, `${name}: a light trail appeared after Start`).toBe(true)
      const rest = ui.clue(c.so).restPosition
      ui.log(
        `${name}: appeared at ${g.seenAt.toFixed(2)} s, gone at ${g.goneAt.toFixed(2)} s, starts in view ${this.inStartView(ui, g.start, eye, f)}, ` +
          `ends ${g.end.sub(rest).length.toFixed(1)} cm from the clue, closest to the eye ${g.minEyeCm.toFixed(0)} cm`,
      )
      expect(this.inStartView(ui, g.start, eye, f), `${name}: starts inside the view at Start`).toBe(true)
      ui.between(`${name}: end distance from the clue (cm)`, g.end.sub(rest).length, 0, 2)
      ui.between(`${name}: closest approach to the eye (cm)`, g.minEyeCm, 60, 1000)
      expect(g.goneAt > 0, `${name}: faded and removed within 8 s`).toBe(true)
    }

    for (const c of CLUES) {
      const p = ui.clue(c.so).restPosition
      const d = p.sub(eye)
      const flat = new vec3(d.x, 0, d.z)
      const bearing = Math.atan2(flat.dot(right), flat.dot(f)) * RAD2DEG
      const elevation = Math.atan2(d.y, flat.length) * RAD2DEG
      const dist = flat.length
      const exp = EXPECTED[c.so]
      // Clock is "directly behind": fold -180..-160 onto 180..200 so one range covers both sides.
      const b = c.so === "Clue_StoppedClock" && bearing < 0 ? bearing + 360 : bearing
      ui.log(
        `${c.so}: bearing ${bearing.toFixed(1)} deg (${bearing >= 0 ? "right" : "left"}, ${Math.abs(bearing) < 90 ? "front" : "back"}), ` +
          `elevation ${elevation.toFixed(1)} deg, distance ${dist.toFixed(1)} cm, in view at Start: ${this.inStartView(ui, p, eye, f)}`,
      )
      ui.between(`${c.so} bearing from the view at Start (deg)`, b, exp.bearing[0], exp.bearing[1])
      ui.between(`${c.so} horizontal distance from the player (cm)`, dist, exp.dist[0], exp.dist[1])
    }

    // The brief's two front clues: in front of the player (positive along the view), not behind.
    for (const so of ["Clue_Memo", "Clue_Footprints"]) {
      const d = ui.clue(so).restPosition.sub(eye)
      expect(new vec3(d.x, 0, d.z).dot(f) > 0, `${so} is on the front side of the player at Start`).toBe(true)
    }
  }

  /** Inside the camera's view for a player standing at `eye` and facing `flat` (level gaze). */
  private inStartView(ui: CaseRoomLeafInteractor, p: vec3, eye: vec3, flat: vec3): boolean {
    const right = new vec3(-flat.z, 0, flat.x)
    const v = p.sub(eye)
    const z = v.dot(flat)
    if (z <= 0) return false
    const tanV = Math.tan(ui.cam.fov / 2)
    return Math.abs(v.dot(right)) <= z * tanV * ui.cam.aspect && Math.abs(v.y) <= z * tanV
  }
}
