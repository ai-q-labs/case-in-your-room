import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

/**
 * Where the 5 clues sit relative to the player's view at the moment Start is pressed.
 *
 * Brief ("Where things go"): memo front-right ~1.2 m, footprints front-left ~1.5 m, broken glass
 * back-left ~1.2 m, torn photo back-right ~1.5 m. Changed in the build (design-brief.md, "Changes
 * during the build"): the stopped clock moved from directly behind to straight ahead on the front wall,
 * 3 m away and hung high (240 cm, 12-18 degrees above eye level: above the suspects' heads, which reach
 * about 11 degrees, when the line-up appears there), so that exactly one clue is in view at Start; it lights up first, once the
 * board has gone. The other four are found by looking around, led by the arrow.
 *
 * Bearings are horizontal angles from the flat viewing direction at Start: 0 = straight ahead,
 * + = to the player's right, +-180 = behind.
 */
const EXPECTED: {[so: string]: {bearing: [number, number]; dist: [number, number]}} = {
  Clue_Memo: {bearing: [20, 70], dist: [100, 140]},
  Clue_Footprints: {bearing: [-70, -20], dist: [125, 175]},
  Clue_StoppedClock: {bearing: [-5, 5], dist: [280, 320]},
  Clue_BrokenGlass: {bearing: [-160, -110], dist: [100, 140]},
  Clue_TornPhoto: {bearing: [110, 160], dist: [125, 175]},
}
const IN_VIEW_AT_START = "Clue_StoppedClock"
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

    // Press Start and record, every frame, when each clue lights up and whether the board is still there.
    const litAt = new Map<string, number>()
    const boardAtLit = new Map<string, boolean>()
    const t0 = getTime()
    await ui.tap("StartButton")
    while (getTime() - t0 < 4 && litAt.size < CLUES.length) {
      for (const c of CLUES) {
        if (!litAt.has(c.so) && ui.isRevealed(c.so)) {
          litAt.set(c.so, getTime() - t0)
          boardAtLit.set(c.so, ui.isShown("OpeningBoard"))
        }
      }
      await nextFrame()
    }
    expect(ui.phase, "phase after Start").toBe("explore")
    const order = CLUES.map((c) => c.so).sort((a, b) => (litAt.get(a) ?? 99) - (litAt.get(b) ?? 99))
    ui.log(`light-up order: ${order.map((so) => `${so} ${(litAt.get(so) ?? -1).toFixed(2)} s`).join(", ")}`)

    let inView = 0
    for (const c of CLUES) {
      const p = ui.clue(c.so).restPosition
      const d = p.sub(eye)
      const flat = new vec3(d.x, 0, d.z)
      const bearing = Math.atan2(flat.dot(right), flat.dot(f)) * RAD2DEG
      const elevation = Math.atan2(d.y, flat.length) * RAD2DEG
      const dist = flat.length
      const seen = this.inStartView(ui, p, eye, f)
      if (seen) inView++
      ui.log(
        `${c.so}: bearing ${bearing.toFixed(1)} deg (${bearing >= 0 ? "right" : "left"}, ${Math.abs(bearing) < 90 ? "front" : "back"}), ` +
          `elevation ${elevation.toFixed(1)} deg, distance ${dist.toFixed(1)} cm, in view at Start: ${seen}`,
      )
      const exp = EXPECTED[c.so]
      ui.between(`${c.so} bearing from the view at Start (deg)`, bearing, exp.bearing[0], exp.bearing[1])
      ui.between(`${c.so} horizontal distance from the player (cm)`, dist, exp.dist[0], exp.dist[1])
      expect(litAt.has(c.so), `${c.so} lit up after Start`).toBe(true)
    }

    // Exactly one clue in view at Start: the clock, and it is the first to light up, after the board has gone.
    expect(inView, "clues in view at Start").toBe(1)
    expect(this.inStartView(ui, ui.clue(IN_VIEW_AT_START).restPosition, eye, f), `${IN_VIEW_AT_START} in view at Start`).toBe(true)
    const outside = ui.clue(IN_VIEW_AT_START).worldCorners().filter((p) => !this.inStartView(ui, p, eye, f)).length
    expect(outside, `corners of ${IN_VIEW_AT_START} outside the view at Start (the whole clock is visible)`).toBe(0)
    expect(order[0], "first clue to light up").toBe(IN_VIEW_AT_START)
    expect(boardAtLit.get(IN_VIEW_AT_START), `opening board gone when ${IN_VIEW_AT_START} lights up`).toBe(false)

    // The brief's two front clues stay on the front side of the player.
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
