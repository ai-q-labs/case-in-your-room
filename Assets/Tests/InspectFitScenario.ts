import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

/**
 * Opening each clue the way a player does: look at it, pinch, read its description.
 *
 * For each clue the head is aimed at the clue's place in the room and the clue is pinched. Every clue stays
 * where it is; the counter, its description and buttons open as one group in the middle of the view
 * (devpost/design-brief.md, "Changes during the build": "Inspecting a clue"). Measured, with the head as at
 * the pinch:
 *  - the clue does not move;
 *  - the group is centred in the view, faces the player, looks as big as at 50 cm (drawn at most 50 cm
 *    away), and fills at most MAX_FILL of the view ("fill" = the largest |view coordinate| over all its
 *    corners; 1.0 = touching the view edge);
 *  - the arrows are put away and the counter stands above the description without overlapping it;
 *  - nothing solid (stand-in furniture, a clue, the floor) hides any part of the group;
 *  - "Flip" next to "Close" for every clue but the footprints;
 *  - rays from the eye and from a right-hand position to each button reach that button first;
 *  - turning the head 30 degrees leaves the group where it opened;
 *  - Flip turns the clue over where it lies without sinking into what it rests on, and puts it back down;
 *  - Close counts it, and the counter goes back under the line of sight.
 */
const MAX_FILL = 0.86 // the Lens aims at 0.85
const DEG = Math.PI / 180
/** Where each clue's support is (brief, "Where things live"): desk / chair seat below, wall behind, or none. */
const SUPPORT: Record<string, "below" | "behind" | "none"> = {
  Clue_Memo: "below",
  Clue_Footprints: "below",
  Clue_StoppedClock: "behind",
  Clue_BrokenGlass: "below",
  Clue_TornPhoto: "none",
}

@component
export class InspectFitScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("InspectFit")
    await sleep(1500)
    await ui.startGame()
    const angle = (a: vec3, b: vec3) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) / DEG
    ui.log(`view: vertical fov ${(ui.cam.fov / DEG).toFixed(1)} deg, aspect ${ui.cam.aspect.toFixed(3)}`)
    const probe = Physics.createGlobalProbe()

    const problems: string[] = []
    problems.push(...ui.standInBoxProblems())
    try {
      for (const c of CLUES) {
        // Look at the clue's place, as a player does before pinching it.
        const clue = ui.clue(c.so)
        const rest = clue.restPosition
        const aim = rest.sub(ui.eye).normalize()
        ui.holdHead(ui.lookRot(aim))
        await nextFrame()
        await nextFrame()
        expect(angle(ui.look, aim) < 1, `${c.so}: head aimed at the clue before the pinch`).toBe(true)
        const eye = ui.eye
        const wrapper = ui.so(c.so).getTransform()
        const pivotT = ui.pivot(c.so).getTransform()
        const restPivot = pivotT.getLocalRotation()

        // The preview re-poses the camera between frames and SIK delivers a scripted pinch a few frames
        // later, so the Lens would read the un-held head. Deliver the pinch's trigger-end now, in the frame
        // where the head is held. (SIK targeting of clues is covered by criterion_2 and ik_inspect_reach.)
        ;(ui.interactable(c.so) as any).onTriggerEndEvent.invoke({})
        await ui.waitUntil(`${c.so} described`, () => ui.phase === "inspect" && ui.isShown("InspectInfo"), 2000)
        await sleep(400) // let the panels lay out
        const moved = wrapper.getWorldPosition().distance(rest)
        const turned = ui.quatAngleDeg(pivotT.getLocalRotation(), restPivot)
        if (moved > 0.5 || turned > 1) problems.push(`${c.so} moved ${moved.toFixed(2)} cm / turned ${turned.toFixed(1)} deg (should stay where it lies)`)

        // ── Where the group opens, as the player sees it at the pinch ──
        const names: string[] = []
        const desc = ui.descriptionCorners(names)
        const counterPts = ui.drawnCorners("CounterPanel", names)
        const group = desc.concat(counterPts)
        const b = ui.basis()
        const r = ui.viewRect(group, b)
        const fill = ui.fill(group, b)
        const mid = ui.centroid(desc)
        const panelZ = ui.so("InspectInfo").getTransform().getWorldRotation().multiplyVec3(vec3.forward())
        const facing = panelZ.dot(eye.sub(mid).normalize())
        const k = ui.so("InspectInfo").getTransform().getWorldScale().x
        const depth = ui.so("InspectInfo").getTransform().getWorldPosition().sub(eye).dot(panelZ.uniformScale(-1))
        const flip = ui.hasFlip(c.so)
        const worst = new Map<string, number>()
        group.forEach((p, i) => worst.set(names[i], Math.max(worst.get(names[i]) || 0, ui.fill([p], b))))
        const top = Array.from(worst.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3)
        ui.log(
          `${c.so}: ${rest.distance(eye).toFixed(0)} cm away; group ${depth.toFixed(1)} cm away at scale ${k.toFixed(3)} ` +
            `(look of 50 cm: ${(depth / 50).toFixed(3)}), at ${ui.rectText(r)}, fill ${fill.toFixed(3)} ` +
            `(outermost ${top.map((e) => `${e[0]}=${e[1].toFixed(2)}`).join(", ")}), facing (cos ${facing.toFixed(3)}), ` +
            `Flip ${ui.isShown("FlipButton")}, Close ${ui.isShown("CloseButton")}`,
        )
        if (!r || Math.abs((r.x0 + r.x1) / 2) > 0.03 || Math.abs((r.y0 + r.y1) / 2) > 0.03) problems.push(`${c.so} group not in the middle of the view (${ui.rectText(r)})`)
        if (fill > MAX_FILL) problems.push(`${c.so} group fills ${fill.toFixed(3)} of the view (max ${MAX_FILL})`)
        if (facing < 0.98) problems.push(`${c.so} group not facing the player (cos ${facing.toFixed(3)})`)
        if (depth > 50.5) problems.push(`${c.so} group drawn ${depth.toFixed(1)} cm away (at most 50)`)
        if (Math.abs(k - depth / 50) > 0.02 * (depth / 50)) problems.push(`${c.so} group at scale ${k.toFixed(3)}, not the look of 50 cm (${(depth / 50).toFixed(3)})`)
        if (ui.isShown("FlipButton") !== flip || !ui.isShown("CloseButton")) problems.push(`${c.so} should show ${flip ? "Flip and Close" : "Close only"}`)
        problems.push(...ui.counterProblems(b, c.so))
        const dr = ui.viewRect(desc, b)
        const cr = ui.viewRect(counterPts, b)
        if (dr && cr && cr.y0 < dr.y1) problems.push(`${c.so}: counter not above the description`)
        const seen = ui.withCentres(group, names)
        problems.push(...ui.hiddenBy(eye, seen.pts, seen.names, ui.solids()).map((h) => `${c.so}: ${h}`))

        // ── Nothing in the way of a pinch on the buttons ──
        problems.push(...(await ui.buttonRayProblems(probe, b, c.so)))

        // ── It stays where it opened when the head turns ──
        const infoAt = ui.world("InspectInfo")
        const counterAt = ui.world("CounterPanel")
        ui.holdHead(ui.lookRot(quat.angleAxis(-30 * DEG, vec3.up()).multiplyVec3(aim)))
        for (let i = 0; i < 10; i++) await nextFrame()
        const drift = Math.max(ui.world("InspectInfo").distance(infoAt), ui.world("CounterPanel").distance(counterAt))
        if (drift > 0.5) problems.push(`${c.so} group moved ${drift.toFixed(2)} cm when the head turned`)
        ui.holdHead(ui.lookRot(aim))
        await nextFrame()
        await nextFrame()

        // ── Flip: turned over where it lies, without sinking into what it rests on ──
        // What it rests on, from the brief: the memo on the desk and the glass on the chair seat (below them),
        // the clock on the wall (behind its back face); the photo hangs free. Sinking = going past that side.
        if (flip) {
          const support = SUPPORT[c.so]
          const n = support === "below" ? vec3.up() : pivotT.getWorldRotation().multiplyVec3(vec3.forward())
          const behind = (o: vec3) => Math.min(...clue.worldCorners().map((p) => p.sub(o).dot(n)))
          const restBack = behind(rest)
          let deepest = restBack
          await ui.tap("FlipButton")
          const t0 = getTime()
          while (getTime() - t0 < 0.7) {
            deepest = Math.min(deepest, behind(rest))
            await nextFrame()
          }
          const sink = support === "none" ? 0 : restBack - deepest
          const after = wrapper.getWorldPosition().distance(rest) + pivotT.getLocalPosition().length
          ui.log(
            `${c.so}: Flip turned it ${ui.quatAngleDeg(pivotT.getLocalRotation(), restPivot).toFixed(1)} deg, ` +
              `${support === "none" ? "rests on nothing" : `reached ${(restBack - deepest).toFixed(2)} cm past its resting ${support === "below" ? "bottom" : "back face"}`}, ` +
              `${after.toFixed(2)} cm off its place after; back line "${ui.text("InspectBackText")}"`,
          )
          if (Math.abs(ui.quatAngleDeg(pivotT.getLocalRotation(), restPivot) - 180) > 2) problems.push(`${c.so} Flip did not turn it over`)
          if (sink > 1) problems.push(`${c.so} sinks ${sink.toFixed(2)} cm into what it rests on while turning over`)
          if (after > 0.5) problems.push(`${c.so} not back in its place after Flip (${after.toFixed(2)} cm)`)
          if (ui.text("InspectBackText") === "") problems.push(`${c.so} no back line after Flip`)
        }

        // ── Close counts it; after the 5th clue the game moves on to the suspects ──
        const counted = ui.main.foundCount
        await ui.tap("CloseButton")
        await ui.waitUntil(`${c.so} closed`, () => ui.phase !== "inspect" && ui.phase !== "intro", 2000)
        await sleep(400)
        if (ui.main.foundCount !== counted + 1) problems.push(`${c.so} did not count (${counted} -> ${ui.main.foundCount})`)
        if (ui.quatAngleDeg(pivotT.getLocalRotation(), restPivot) > 1) problems.push(`${c.so} not face up again after Close`)
        if (ui.hud.isPinned) problems.push(`${c.so}: counter still standing where the description was after Close`)
      }
    } finally {
      ui.releaseHead()
    }
    expect(problems.length, `inspect fit problems: ${problems.join("; ")}`).toBe(0)
  }
}
