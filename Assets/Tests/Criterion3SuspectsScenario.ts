import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BRIEF, CaseRoomLeafInteractor, CLUES, counter, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * Done criterion 3 (devpost/design-brief.md):
 * Walking in the direction of the arrow to find the remaining clues and inspecting and putting back
 * all of them changes the counter from "5 / 5" to "The suspects have appeared". The 3 suspects line
 * up straight ahead, and the counter and arrow disappear.
 * Approved deviation: suspect spacing 40 cm (brief: about 45 cm).
 */
@component
export class Criterion3SuspectsScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("Criterion3")
    await sleep(1500)
    await ui.startGame()

    // ── Every clue: the arrow points at a clue not yet found; inspect and put back ──
    for (let i = 0; i < CLUES.length; i++) {
      const c = CLUES[i]
      await sleep(100) // let the arrow update after the last put back
      expect(ui.counterShown(), `counter before ${c.so}`).toBe(counter(i))
      expect(ui.isShown("DirectionArrow"), `arrow shown before ${c.so}`).toBe(true)
      const unfound = CLUES.filter((k) => !ui.clue(k.so).inspected)
      const err = Math.min(...unfound.map((k) => ui.arrowErrorDeg(ui.clue(k.so).restPosition)))
      ui.between(`arrow points at a clue not yet found before ${c.so} (deg)`, err, 0, 3)
      if (i < CLUES.length - 1) {
        await ui.inspectAndPutBack(c.so)
        continue
      }
      // Last clue: watch the counter text change.
      await ui.inspect(c.so)
      await ui.tap("PutBackButton")
      const seen: string[] = []
      let arrowOffWhen5 = false
      await ui.waitUntil(
        `counter shows "${BRIEF.suspectsAppeared}"`,
        () => {
          const t = ui.counterShown()
          if (t && seen[seen.length - 1] !== t) {
            seen.push(t)
            if (t === counter(5)) arrowOffWhen5 = !ui.so("DirectionArrow").enabled
          }
          return t === BRIEF.suspectsAppeared
        },
        5000,
      )
      ui.log(`counter sequence after the last put back: ${seen.join(" -> ")}`)
      expect(seen.join(" -> "), "counter goes 5 / 5 -> suspects text").toBe(`${counter(5)} -> ${BRIEF.suspectsAppeared}`)
      expect(arrowOffWhen5, "arrow hidden once all 5 are found").toBe(true)
    }
    expect(ui.main.foundCount, "all 5 found").toBe(5)

    // ── The 3 suspects line up straight ahead ──
    await ui.waitForSuspects()
    expect(ui.phase, "phase").toBe("suspects")
    const lineup = ui.world("SuspectLineup")
    ui.between("line-up bearing from the view direction (deg)", ui.bearingDeg(lineup), 0, 2)
    ui.near("line-up horizontal distance (cm; brief about 2 m)", ui.horizontalDistance(lineup, ui.eye), 200, 3)
    ui.near("line-up height relative to the eyes (cm; brief: eye height)", lineup.y - ui.eye.y, 0, 3)
    const lineupZ = ui.so("SuspectLineup").getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, 1))
    const toEye = ui.eye.sub(lineup)
    const facing = new vec3(lineupZ.x, 0, lineupZ.z).normalize().dot(new vec3(toEye.x, 0, toEye.z).normalize())
    expect(facing > 0.99, `line-up faces the player (cos=${facing.toFixed(4)})`).toBe(true)

    const local = SUSPECTS.map((s) => ui.so(s.so).getTransform().getLocalPosition())
    ui.near("spacing Edgar -> Nora (cm; approved 40)", local[1].x - local[0].x, 40, 0.5)
    ui.near("spacing Nora -> Iris (cm; approved 40)", local[2].x - local[1].x, 40, 0.5)
    ui.near("in a row: same height (Edgar vs Iris)", local[0].y - local[2].y, 0, 0.5)
    ui.near("in a row: same depth (Edgar vs Iris)", local[0].z - local[2].z, 0, 0.5)
    const bearings = SUSPECTS.map((s) => ui.signedBearingDeg(ui.world(s.so)))
    expect(bearings[0] < bearings[1] && bearings[1] < bearings[2], `left-to-right order Edgar, Nora, Iris (bearings ${bearings.map((b) => b.toFixed(1)).join(", ")})`).toBe(true)
    SUSPECTS.forEach((s) => {
      expect(ui.inView(ui.world(s.so)), `${s.name} in view`).toBe(true)
      const fig = ui.child(ui.so(s.so), "Figure")
      expect(!!fig && fig.isEnabledInHierarchy, `${s.name} figure visible`).toBe(true)
      expect(ui.isPinchable(s.so), `${s.name} pinchable`).toBe(true)
      expect(ui.isShown(`SuspectLabel_${s.key}`), `${s.name} label shown`).toBe(true)
      expect(ui.text(`SuspectName_${s.key}`), `${s.name} name label`).toBe(s.name)
      expect(ui.text(`SuspectRole_${s.key}`), `${s.name} role label`).toBe(s.role)
      const col = ui.so(s.so).getComponent("Physics.ColliderComponent") as ColliderComponent
      const w = (col.shape as BoxShape).size.x
      expect(w <= 40, `${s.name} pinch target width ${w} cm is at most 40 cm`).toBe(true)
      expect(w < local[1].x - local[0].x, `${s.name} pinch target narrower than the spacing (no overlap)`).toBe(true)
    })

    // ── Counter and arrow gone ──
    expect(ui.isShown("CounterPanel"), "counter hidden").toBe(false)
    expect(ui.so("DirectionArrow").enabled, "arrow hidden").toBe(false)
    ui.log(`line-up ok: bearing=${ui.bearingDeg(lineup).toFixed(2)} dist=${ui.horizontalDistance(lineup, ui.eye).toFixed(1)} bearings=${bearings.map((b) => b.toFixed(1)).join("/")}`)
  }
}
