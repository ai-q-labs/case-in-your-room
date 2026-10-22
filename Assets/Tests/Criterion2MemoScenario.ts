import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BRIEF, CaseRoomLeafInteractor, clueBySo, counter, unquote} from "./CaseRoomLeafInteractor"

function rgbDistance(a: vec4, b: vec4): number {
  return new vec3(a.x - b.x, a.y - b.y, a.z - b.z).length
}

/**
 * Done criterion 2 (devpost/design-brief.md):
 * Pressing the memo brings it to the player's hands with a description and 2 buttons ("Flip" and
 * "Put back"). Pressing "Flip" shows the time on its back. Pressing "Put back" returns the memo to its
 * place in the "inspected" color, and the counter shows "1 / 5".
 * Deviation (devpost/design-brief.md, "Changes during the build"): the inspected clue is at most 11 cm,
 * held 50-60 cm in front at the distance where it, its description and its buttons fit the view.
 */
@component
export class Criterion2MemoScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("Criterion2")
    await sleep(1500)
    await ui.startGame()

    const SO = "Clue_Memo"
    const brief = clueBySo(SO)
    const memo = ui.clue(SO)
    const memoT = ui.so(SO).getTransform()
    const pivotT = ui.pivot(SO).getTransform()
    expect(memo.inspected, "memo not inspected before the test").toBe(false)

    // Its place in the room, and its colors, before pinching.
    const homePos = memoT.getWorldPosition()
    const homeRot = memoT.getWorldRotation()
    const homePivotRot = pivotT.getLocalRotation()
    const homePivotScale = pivotT.getLocalScale().x
    ui.near("memo place = its recorded rest position (cm)", homePos.distance(memo.restPosition), 0, 0.01)
    const parts = ui.parts(SO)
    expect(parts.length > 0, "memo has visible parts").toBe(true)
    const before = parts.map((p) => {
      const c = ui.colorOf(p)
      return new vec4(c.x, c.y, c.z, c.w)
    })
    const foundBefore = ui.main.foundCount

    // ── Pinch the memo: it comes to the hands with a description and 2 buttons ──
    await ui.inspect(SO)
    const held = memoT.getWorldPosition()
    ui.between("held memo distance ahead along the view (cm)", held.sub(ui.eye).dot(ui.look), 48.5, 61.5)
    ui.between("held memo height relative to the eyes (cm)", held.y - ui.eye.y, -40, 0)
    expect(ui.inView(held), "held memo in view").toBe(true)
    const heldSize = pivotT.getWorldScale().x * memo.maxDimensionCm
    // 2x capped at 11 cm, then the whole clue + description + buttons group may be shrunk to fit the view.
    const cap = Math.min(2 * memo.maxDimensionCm, 11)
    ui.between("held memo largest side (cm; 2x capped at 11 cm, shrunk to fit the view)", heldSize, 0.75 * cap, cap + 0.1)
    expect(ui.text("InspectNameText"), "inspect name").toBe(brief.name)
    expect(unquote(ui.text("InspectDescriptionText")), "inspect description (brief front text)").toBe(brief.front)
    expect(ui.text("InspectBackText"), "no back text before Flip").toBe("")
    expect(ui.text("FlipButtonLabel"), "Flip label").toBe(BRIEF.flip)
    expect(ui.text("PutBackButtonLabel"), "Put back label").toBe(BRIEF.putBack)
    expect(ui.isPinchable("FlipButton"), "Flip pinchable").toBe(true)
    expect(ui.isPinchable("PutBackButton"), "Put back pinchable").toBe(true)
    const info = ui.world("InspectInfo")
    const flipBtn = ui.world("FlipButton")
    const putBtn = ui.world("PutBackButton")
    expect(ui.inView(info), "description panel in view").toBe(true)
    expect(ui.inView(flipBtn), "Flip button in view").toBe(true)
    expect(ui.inView(putBtn), "Put back button in view").toBe(true)
    const hs = ui.screen(held)
    expect(ui.screen(info).y > hs.y, "description panel below the memo").toBe(true)
    expect(ui.screen(flipBtn).x > hs.x && ui.screen(putBtn).x > hs.x, "buttons beside (right of) the memo").toBe(true)
    ui.log(`held ok: ahead=${held.sub(ui.eye).dot(ui.look).toFixed(1)} cm, below eyes=${(ui.eye.y - held.y).toFixed(1)} cm, size=${heldSize.toFixed(2)} cm`)

    // ── Flip: the time on its back ──
    const heldPivotRot = pivotT.getLocalRotation()
    await ui.flip()
    expect(memo.isFlipped, "memo flipped").toBe(true)
    ui.near("memo spin on Flip (deg)", ui.quatAngleDeg(heldPivotRot, pivotT.getLocalRotation()), 180, 2)
    const back = ui.text("InspectBackText")
    const briefBack = String(brief.back)
    expect(back.includes(briefBack), `back line shows the time "${briefBack}" (got "${back}")`).toBe(true)
    expect(back, "observed back line").toBe("On the back: 10:40")
    ui.log(`flip ok: "${back}"`)

    // ── Put back: its place, the inspected color, counter 1 / 5 ──
    await ui.putBack()
    expect(ui.phase, "phase after Put back").toBe("explore")
    expect(memo.inspected, "memo marked inspected").toBe(true)
    ui.near("memo back at its place: position error (cm)", memoT.getWorldPosition().distance(homePos), 0, 0.5)
    ui.near("memo back at its place: rotation error (deg)", ui.quatAngleDeg(memoT.getWorldRotation(), homeRot), 0, 1)
    ui.near("memo back to its resting tilt (deg)", ui.quatAngleDeg(pivotT.getLocalRotation(), homePivotRot), 0, 1)
    ui.near("memo back to its resting scale", pivotT.getLocalScale().x, homePivotScale, 0.01)
    const tint = memo.inspectedTint
    parts.forEach((p, i) => {
      const after = ui.colorOf(p)
      const change = rgbDistance(after, before[i])
      const dBefore = rgbDistance(before[i], tint)
      const dAfter = rgbDistance(after, tint)
      expect(
        change > 0.05 && dAfter <= 0.5 * dBefore,
        `${p.name} changed to the inspected color (moved ${change.toFixed(3)}, distance to tint ${dBefore.toFixed(3)} -> ${dAfter.toFixed(3)})`,
      ).toBe(true)
    })
    ui.near("memo stops glowing once inspected", ui.glowLevel(SO), 0, 0.02)
    expect(ui.main.foundCount, "found count +1").toBe(foundBefore + 1)
    expect(ui.isShown("CounterPanel"), "counter shown again").toBe(true)
    expect(ui.text("CounterText"), "counter text").toBe(counter(foundBefore + 1))
    expect(ui.text("CounterText"), "counter text (brief)").toBe("1 / 5")
    ui.log(`put back ok -> ${ui.text("CounterText")}`)
  }
}
