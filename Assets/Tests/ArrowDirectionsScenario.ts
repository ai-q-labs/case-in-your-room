import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {UpdateDispatcher} from "Leaf.lspkg/Utils/common/UpdateDispatcher"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor} from "./CaseRoomLeafInteractor"

const DEG = Math.PI / 180

/**
 * The two direction arrows (devpost/design-brief.md, "Changes during the build"): one arrow for turning
 * left or right, a separate one for looking up or down, and a ring-shaped turn-around arrow when the clue
 * is behind the player, so "behind you" can't be read as "below you".
 *
 * All clues but the stopped clock (high on the front wall) are found first, so the arrows lead to the clock.
 * The head is then turned all the way round and tilted down and up; at every pose both arrows are checked
 * against the clock's direction, measured independently (CaseRoomLeafInteractor.arrowProblems).
 * Then the case from the playtest: the clock straight behind at the height the player looks at.
 */
@component
export class ArrowDirectionsScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("ArrowDirections")
    await sleep(1500)
    await ui.startGame()
    for (const so of ["Clue_Memo", "Clue_Footprints", "Clue_BrokenGlass", "Clue_TornPhoto"]) await ui.inspectAndClose(so)
    const clock = ui.clue("Clue_StoppedClock").restPosition

    const camT = ui.cam.getTransform()
    let hold: quat | null = null
    const unsubscribe = UpdateDispatcher.getInstance().onUpdate.add(() => {
      if (hold) camT.setWorldRotation(hold)
    })
    const eye = ui.eye
    const toClock = clock.sub(eye)
    const ahead = new vec3(toClock.x, 0, toClock.z).normalize()
    const clockElev = Math.atan2(toClock.y, Math.sqrt(toClock.x * toClock.x + toClock.z * toClock.z)) / DEG
    // A gaze `yaw` degrees to the right of the clock and `pitch` degrees above level.
    const gaze = (yaw: number, pitch: number) => {
      const flat = quat.angleAxis(-yaw * DEG, vec3.up()).multiplyVec3(ahead)
      return flat.uniformScale(Math.cos(pitch * DEG)).add(vec3.up().uniformScale(Math.sin(pitch * DEG)))
    }
    const pose = async (yaw: number, pitch: number) => {
      hold = quat.lookAt(gaze(yaw, pitch).uniformScale(-1), vec3.up())
      for (let i = 0; i < 3; i++) await nextFrame()
    }

    const problems: string[] = []
    const seen = new Set<string>()
    try {
      for (const yaw of [0, 25, 60, 120, 155, 180, 205, 240, 300, 335]) {
        for (const pitch of [-30, 0, 15, 40]) {
          await pose(yaw, pitch)
          const label = `gaze ${yaw} deg right of the clock, ${pitch} deg up`
          problems.push(...ui.arrowProblems(label))
          seen.add(`${ui.hud.turnCue}/${ui.hud.tiltCue}`)
          ui.log(`${label}: "${ui.hud.turnCue}" / "${ui.hud.tiltCue}" (clock ${ui.hud.targetYawDeg.toFixed(1)} deg right, ${ui.hud.targetPitchDeg.toFixed(1)} deg up)`)
        }
      }
      ui.log(`cues seen: ${Array.from(seen).join(", ")}`)

      // The playtest case: the clock straight behind, at the height the player looks at.
      await pose(180, clockElev)
      ui.log(`clock straight behind at gaze height: "${ui.hud.turnCue}" (${ui.arrowShown("TurnArrow") ? ui.arrowIcon("TurnArrow") : "hidden"}) / "${ui.hud.tiltCue}" (${ui.arrowShown("TiltArrow") ? ui.arrowIcon("TiltArrow") : "hidden"})`)
      const turnIcon = ui.arrowIcon("TurnArrow")
      expect(ui.hud.turnCue === "turn-left" || ui.hud.turnCue === "turn-right", `straight behind: turn-around cue (got "${ui.hud.turnCue}")`).toBe(true)
      expect(ui.arrowShown("TurnArrow") && turnIcon.indexOf("360") === 0, `straight behind: drawn as the ring-shaped turn-around arrow (got ${turnIcon})`).toBe(true)
      expect(ui.arrowShown("TiltArrow"), "straight behind at gaze height: no up/down arrow, so nothing points down").toBe(false)
      // Behind and below: two separate arrows, the ring and a down arrow.
      await pose(180, clockElev + 30)
      expect(ui.hud.tiltCue === "down" && (ui.hud.turnCue === "turn-left" || ui.hud.turnCue === "turn-right"), `behind and below: ring + down arrow (got "${ui.hud.turnCue}" / "${ui.hud.tiltCue}")`).toBe(true)
      // Straight ahead but above: only the up arrow.
      await pose(0, clockElev - 30)
      expect(ui.hud.turnCue === "none" && ui.hud.tiltCue === "up", `ahead and above: up arrow only (got "${ui.hud.turnCue}" / "${ui.hud.tiltCue}")`).toBe(true)
      // The two arrows sit side by side next to the counter. Measured in the counter panel's own plane: the
      // panel follows the preview's head, not the head this test holds, so it is off this test's screen.
      await pose(60, clockElev + 30)
      const panelT = ui.so("CounterPanel").getTransform()
      const at = (name: string) => {
        const d = ui.world(name).sub(panelT.getWorldPosition())
        return new vec2(d.dot(panelT.right), d.dot(panelT.up))
      }
      const t = at("TurnArrow")
      const v = at("TiltArrow")
      const n = at("CounterText")
      ui.log(`in the counter panel (cm): left/right arrow (${t.x.toFixed(1)}, ${t.y.toFixed(1)}), up/down arrow (${v.x.toFixed(1)}, ${v.y.toFixed(1)}), counter (${n.x.toFixed(1)}, ${n.y.toFixed(1)})`)
      expect(t.x < v.x && v.x < n.x, "left/right arrow, then up/down arrow, then the counter").toBe(true)
      ui.near("arrows on one row with the counter (cm)", Math.max(Math.abs(t.y - n.y), Math.abs(v.y - n.y)), 0, 0.5)
      ui.between("gap between the two arrows (cm, centre to centre)", v.x - t.x, 3, 6)
    } finally {
      hold = null
      unsubscribe()
    }
    expect(problems.length, `arrow problems: ${problems.join("; ")}`).toBe(0)
    for (const cue of ["left", "right", "turn-left", "turn-right"]) {
      expect(Array.from(seen).some((s) => s.split("/")[0] === cue), `left/right cue "${cue}" came up`).toBe(true)
    }
    for (const cue of ["none", "up", "down"]) {
      expect(Array.from(seen).some((s) => s.split("/")[1] === cue), `up/down cue "${cue}" came up`).toBe(true)
    }
  }
}
