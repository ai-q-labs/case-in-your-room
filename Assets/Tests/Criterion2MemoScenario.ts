import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BRIEF, CaseRoomLeafInteractor, CLOSE, clueBySo, counter, unquote} from "./CaseRoomLeafInteractor"

function rgbDistance(a: vec4, b: vec4): number {
  return new vec3(a.x - b.x, a.y - b.y, a.z - b.z).length
}


/**
 * Done criterion 2 (devpost/design-brief.md):
 * Pressing the memo brings it to the player's hands with a description and 2 buttons ("Flip" and
 * "Put back"). Pressing "Flip" shows the time on its back. Pressing "Put back" returns the memo to its
 * place in the "inspected" color, and the counter shows "1 / 5".
 * Changed during the build (devpost/design-brief.md, "Changes during the build"): the memo no longer comes
 * to the hands. It stays on the desk, and its description and 2 buttons ("Flip" and "Close"), with the
 * counter above them, open in the middle of the view, facing the player. "Flip" turns it over where it lies
 * and shows the time on its back; "Close" leaves it in its place, turned face up again, in the "inspected"
 * color, and the counter shows "1 / 5".
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

    // ── Pinch the memo: it stays on the desk; the counter, description and 2 buttons open in the middle of the view ──
    await ui.inspect(SO)
    await sleep(300)
    ui.near("memo stays in its place (cm)", memoT.getWorldPosition().distance(homePos), 0, 0.5)
    ui.near("memo keeps its resting tilt (deg)", ui.quatAngleDeg(pivotT.getLocalRotation(), homePivotRot), 0, 1)
    expect(ui.text("InspectNameText"), "inspect name").toBe(brief.name)
    expect(unquote(ui.text("InspectDescriptionText")), "inspect description (brief front text)").toBe(brief.front)
    expect(ui.text("InspectBackText"), "no back text before Flip").toBe("")
    expect(ui.text("FlipButtonLabel"), "Flip label").toBe(BRIEF.flip)
    expect(ui.text("CloseButtonLabel"), "Close label").toBe(CLOSE)
    expect(ui.isPinchable("FlipButton"), "Flip pinchable").toBe(true)
    expect(ui.isPinchable("CloseButton"), "Close pinchable").toBe(true)
    // As the player sees it, in view coordinates (x right, y up; +-1 = the view's edges).
    const b = ui.basis()
    const xy = (name: string) => ui.viewXY(ui.world(name), b) ?? new vec2(99, 99)
    const group = ui.viewRect(ui.descriptionCorners().concat(ui.drawnCorners("CounterPanel")), b)
    const fill = ui.fill(ui.descriptionCorners().concat(ui.drawnCorners("CounterPanel")), b)
    expect(!!group, "the group is in front of the eyes").toBe(true)
    if (group) {
      ui.near("group centred left-right in the view", (group.x0 + group.x1) / 2, 0, 0.03)
      ui.near("group centred up-down in the view", (group.y0 + group.y1) / 2, 0, 0.03)
    }
    expect(fill <= 0.86, `the whole group within 85% of the view (${fill.toFixed(3)})`).toBe(true)
    expect(xy("CounterPanel").y > xy("InspectInfo").y, "counter above the description").toBe(true)
    expect(xy("InspectInfo").y > xy("CloseButton").y, "buttons under the description").toBe(true)
    expect(xy("FlipButton").x < xy("CloseButton").x, "Flip left of Close").toBe(true)
    ui.log(`described ok: group ${ui.rectText(group)}, fill ${fill.toFixed(3)}`)

    // ── Flip: turned over where it lies, the time on its back ──
    await ui.flip()
    expect(memo.isFlipped, "memo flipped").toBe(true)
    ui.near("memo turned over where it lies (deg)", ui.quatAngleDeg(homePivotRot, pivotT.getLocalRotation()), 180, 2)
    ui.near("memo still in its place after the turn (cm)", memoT.getWorldPosition().distance(homePos), 0, 0.5)
    ui.near("memo lands back on the desk after the turn (cm)", pivotT.getLocalPosition().length, 0, 0.2)
    const back = ui.text("InspectBackText")
    const briefBack = String(brief.back)
    expect(back.includes(briefBack), `back line shows the time "${briefBack}" (got "${back}")`).toBe(true)
    expect(back, "observed back line").toBe("On the back: 10:40")
    ui.log(`flip ok: "${back}"`)

    // ── Close: its place, face up again, the inspected color, counter 1 / 5 ──
    await ui.close()
    await sleep(450) // it turns face up again over 0.3 s
    expect(ui.phase, "phase after Close").toBe("explore")
    expect(ui.isShown("InspectInfo"), "description hidden after Close").toBe(false)
    expect(memo.inspected, "memo marked inspected").toBe(true)
    expect(memo.isFlipped, "memo face up again").toBe(false)
    ui.near("memo in its place: position error (cm)", memoT.getWorldPosition().distance(homePos), 0, 0.5)
    ui.near("memo in its place: rotation error (deg)", ui.quatAngleDeg(memoT.getWorldRotation(), homeRot), 0, 1)
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
    expect(ui.isShown("CounterPanel"), "counter shown").toBe(true)
    expect(ui.text("CounterText"), "counter text").toBe(counter(foundBefore + 1))
    expect(ui.text("CounterText"), "counter text (brief)").toBe("1 / 5")
    ui.log(`close ok -> ${ui.text("CounterText")}`)
  }
}
