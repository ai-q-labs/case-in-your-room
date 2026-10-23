import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, clueBySo, CLUES, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * Video helper (not a pass/fail test): plays the whole game once at a viewer's pace for the demo recording.
 * Like a player following the arrow, it goes next to the unfound clue nearest to where it looks (the clock
 * ahead first), turning the head smoothly to it before the pinch; each description and its back stay up
 * long enough to read; one wrong accusation shows the broken thread, then the right one plays the replay
 * and the truth.
 * Parameters: start "hand" waits on the opening board until a person presses Start in the preview (so a
 * recording can begin on the board), "auto" presses it after 6 s; pace multiplies every pause (1 = the
 * timing the video script assumes).
 */
@component
export class DemoPlaythroughScenario extends Scenario {
  private ui: CaseRoomLeafInteractor
  private pace = 1

  async run(config?: ScenarioConfig): Promise<void> {
    this.ui = new CaseRoomLeafInteractor("Demo")
    this.pace = parseFloat(config?.get("pace") ?? "1")
    const byHand = (config?.get("start") ?? "hand") === "hand"
    const ui = this.ui
    await sleep(1500)

    // Opening board, held straight ahead so nothing but this script moves the head during the recording.
    await ui.waitUntil("opening board", () => ui.phase === "intro" && ui.isShown("OpeningBoard"), 5000)
    ui.holdHead(ui.lookRot(ui.world("OpeningBoard").sub(ui.eye).normalize()))
    if (byHand) {
      ui.log("waiting for Start to be pressed in the preview")
      await ui.waitUntil("Start pressed by hand", () => ui.phase !== "intro", 600000)
    } else {
      await this.pause(6000)
      await ui.tap("StartButton")
    }
    // From here the script alone poses the head: with the preview's device tracking on, the Lens reads the
    // preview's own head when a clue is pinched and opens the description where that head looks.
    const tracking = ui.cam.getSceneObject().getComponent("Component.DeviceTracking") as DeviceTracking
    if (tracking) tracking.enabled = false
    const t0 = getTime()
    ui.log(`${this.clock(t0)} Start; device tracking ${tracking ? "turned off" : "not found"}`)
    await this.pause(3800) // the 5 clues light up one at a time, "Look around you"

    // The clues, around the room, in the order the arrow leads
    for (let n = 0; n < CLUES.length; n++) {
      const so = this.nearestUnfound()
      await this.turnTo(ui.clue(so).restPosition, 1400)
      await this.pause(500)
      await ui.inspect(so)
      await nextFrame()
      ui.log(`${this.clock(t0)} ${so} open; ${this.framing(so)}`)
      await this.pause(2600)
      // Turn over only the clues with something written on the back (the memo and the photo).
      if (ui.hasFlip(so) && clueBySo(so).back !== null) {
        await ui.flip()
        ui.log(`${this.clock(t0)} ${so} flipped; ${this.framing(so)}`)
        await this.pause(2400)
      }
      await ui.close()
      await this.pause(900)
    }

    // The line-up appears where the player faces; look at it level.
    await ui.waitForSuspects()
    const middle = SUSPECTS.map((s) => ui.world(s.so)).reduce((a, b) => a.add(b)).uniformScale(1 / SUSPECTS.length)
    await this.turnTo(middle, 1200)
    ui.log(`${this.clock(t0)} line-up`)
    await this.pause(2500)

    // One wrong accusation
    const edgar = SUSPECTS[0].so
    await this.turnTo(ui.world(edgar), 700, 0.35)
    await ui.select(edgar)
    await this.pause(2600)
    await ui.tap("AccuseButton")
    await ui.waitUntil("wrong accusation caption", () => ui.caption() === "That doesn't match the clues", 8000)
    ui.log(`${this.clock(t0)} wrong accusation`)
    await this.pause(2500)

    // The right one: gather, threads, replay, truth
    const nora = SUSPECTS[1].so
    await this.turnTo(ui.world(nora), 700, 0.35)
    await ui.select(nora)
    await this.pause(2200)
    await ui.tap("AccuseButton")
    ui.log(`${this.clock(t0)} right accusation`)
    await this.turnTo(middle, 900)
    // The replay plays on a model of the room; watch it, then the truth.
    await ui.waitUntil("replay model", () => ui.phase === "replay" && !!findSceneObjectByName("ReplayModel"), 15000)
    await this.turnTo(ui.world("ReplayModel"), 1200)
    ui.log(`${this.clock(t0)} replay`)
    await ui.waitUntil("truth panel", () => ui.isShown("TruthPanel"), 90000)
    await this.turnTo(ui.world("TruthPanelUI"), 1000)
    ui.log(`${this.clock(t0)} truth`)
    await this.pause(8000)
    // The head stays held on the truth (releasing it would jump the view at the end of the recording).
    ui.log(`${this.clock(t0)} end`)
  }

  /** Turn the head toward `p` over `ms` (eased), `share` of the way from where it looks now. */
  private async turnTo(p: vec3, ms: number, share: number = 1): Promise<void> {
    const ui = this.ui
    const from = ui.cam.getTransform().getWorldRotation()
    const full = ui.lookRot(p.sub(ui.eye).normalize())
    const to = quat.slerp(from, full, share)
    const t0 = getTime()
    const dur = (ms * this.pace) / 1000
    for (let s = 0; s < 1; ) {
      s = Math.min(1, (getTime() - t0) / dur)
      ui.holdHead(quat.slerp(from, to, s * s * (3 - 2 * s)))
      await nextFrame()
    }
  }

  /** The unfound clue closest to the viewing direction (the rule the HUD arrow follows). */
  private nearestUnfound(): string {
    const ui = this.ui
    let best = ""
    let bestDot = -2
    for (const c of CLUES) {
      if (ui.clue(c.so).inspected) continue
      const dot = ui.clue(c.so).restPosition.sub(ui.eye).normalize().dot(ui.look)
      if (dot > bestDot) {
        bestDot = dot
        best = c.so
      }
    }
    return best
  }

  /** Whether the clue and its open description (with buttons) are inside the view, for the log. */
  private framing(so: string): string {
    const ui = this.ui
    const r = ui.viewRect(ui.descriptionCorners(), ui.basis())
    const fits = !!r && r.x0 >= -1 && r.x1 <= 1 && r.y0 >= -1 && r.y1 <= 1
    return `clue in view ${ui.inView(ui.world(so))}, description in view ${fits} (${ui.rectText(r)})`
  }

  private async pause(ms: number): Promise<void> {
    await sleep(ms * this.pace)
  }

  private clock(t0: number): string {
    const s = getTime() - t0
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`
  }
}
