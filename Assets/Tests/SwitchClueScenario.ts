import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BRIEF, CaseRoomLeafInteractor, clueBySo, counter} from "./CaseRoomLeafInteractor"

/**
 * Going from clue to clue without closing each description (devpost/design-brief.md, "Changes during the
 * build"): pinching another clue while a description is open closes the open one first, and that counts
 * exactly like pressing Close (the counter goes up once per clue, the clue turns to the inspected color and
 * face up again). The counter stays in view while a description is open. Pinching a clue that is already
 * counted reopens its description without counting it again; if the close it causes was the 5th clue, the
 * suspects come next and nothing else opens.
 */
@component
export class SwitchClueScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("SwitchClue")
    await sleep(1500)
    await ui.startGame()

    // Open the memo and turn it over, then go straight to the broken glass.
    await ui.inspect("Clue_Memo")
    expect(ui.counterShown(), "counter in view while a description is open").toBe(counter(0))
    expect(ui.isPinchable("Clue_Memo"), "the open clue itself is not pinchable").toBe(false)
    expect(ui.isPinchable("Clue_BrokenGlass"), "the other clues stay pinchable").toBe(true)
    await ui.flip()
    expect(ui.clue("Clue_Memo").isFlipped, "memo turned over").toBe(true)

    // Each step: pinch the next clue while the previous one is open; the count expected afterwards.
    // The memo is pinched a second time: it reopens, and neither reopening nor closing it counts again.
    const steps: [string, string, number][] = [
      ["Clue_BrokenGlass", "Clue_Memo", 1],
      ["Clue_TornPhoto", "Clue_BrokenGlass", 2],
      ["Clue_Memo", "Clue_TornPhoto", 3],
      ["Clue_Footprints", "Clue_Memo", 3],
      ["Clue_StoppedClock", "Clue_Footprints", 4],
    ]
    for (const [next, prev, n] of steps) {
      await ui.tap(next)
      await ui.waitUntil(
        `${next} open after pinching it over ${prev}`,
        () => ui.phase === "inspect" && ui.text("InspectNameText") === clueBySo(next).name,
        2000,
      )
      await sleep(450) // the previous clue turns face up again over 0.3 s
      const p = ui.clue(prev)
      expect(p.inspected, `${prev} counted when ${next} was pinched`).toBe(true)
      expect(p.isFlipped, `${prev} face up again`).toBe(false)
      ui.near(`${prev} stops glowing once counted`, ui.glowLevel(prev), 0, 0.02)
      expect(ui.main.foundCount, `found count after pinching ${next}`).toBe(n)
      expect(ui.counterShown(), `counter shows ${counter(n)} while ${next} is open`).toBe(counter(n))
      expect(ui.isShown("FlipButton"), `${next}: Flip shown`).toBe(ui.hasFlip(next))
      expect(ui.isPinchable(prev), `${prev} pinchable again`).toBe(true)
      ui.log(`${prev} -> ${next}: ${ui.counterShown()}`)
    }

    // Pinch the memo (already counted) while the clock is open: the clock is the 5th, so the suspects come
    // next and the memo does not open.
    await ui.tap("Clue_Memo")
    await ui.waitUntil("counter shows the suspects text", () => ui.counterShown() === BRIEF.suspectsAppeared, 3000)
    expect(ui.main.foundCount, "all 5 counted, each once").toBe(5)
    expect(ui.isShown("InspectInfo"), "no description open").toBe(false)
    expect(ui.phase === "suspects" || ui.phase === "accusing", `phase after the 5th clue (got ${ui.phase})`).toBe(true)
    await ui.waitForSuspects()
    ui.log("5th clue counted by pinching another clue -> suspects")
  }
}
