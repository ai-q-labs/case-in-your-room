import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

/**
 * Opening each clue the way a player does: look at it, pinch, read its description where it lies.
 *
 * For each clue the head is aimed at the clue's place in the room and the clue is pinched. Every clue now
 * stays where it is; its description and buttons appear just above it. The head then looks at the
 * description. Measured:
 *  - the clue does not move;
 *  - the description's bottom edge sits just above the clue's top as seen from the eye (never covering it),
 *    centred over it, facing the player, at the same apparent size as at 50 cm (shrunk only to fit the view);
 *  - how much of the view the description and buttons fill ("fill" = the largest |view coordinate| over all
 *    their corners; 1.0 = touching the view edge);
 *  - the arrows are put away and the counter stands above the description without overlapping it, looking
 *    at the clue and looking at the description, and is in view when the description is;
 *  - nothing solid (stand-in furniture, another clue) hides any part of the description, buttons or counter;
 *  - "Flip" next to "Close" for every clue but the footprints;
 *  - rays from the eye and from a right-hand position to each button reach that button first (no clue's
 *    pinch target, and not the counter, sits in the way);
 *  - Flip turns the clue over where it lies without sinking into what it rests on, and puts it back down;
 *  - Close counts it, and the counter goes back under the line of sight.
 */
const MAX_FILL = 0.92
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

        // ── Where the description sits, as the player saw it at the pinch ──
        const names: string[] = []
        let pts = ui.descriptionCorners(names)
        const mid = ui.centroid(pts)
        const toClue = rest.sub(eye).normalize()
        const upC = vec3.up().sub(toClue.uniformScale(toClue.y)).normalize()
        const elev = (p: vec3) => Math.atan2(p.sub(eye).dot(upC), p.sub(eye).dot(toClue)) / DEG
        const clueTop = Math.max(...clue.worldCorners().map(elev))
        const gapDeg = Math.min(...pts.map(elev)) - clueTop
        const side = new vec3(-toClue.z, 0, toClue.x).normalize()
        const dist = rest.sub(eye).length
        const off = Math.abs(mid.sub(rest).dot(side))
        const panelZ = ui.so("InspectInfo").getTransform().getWorldRotation().multiplyVec3(vec3.forward())
        const facing = panelZ.dot(eye.sub(mid).normalize())
        const k = ui.so("InspectInfo").getTransform().getWorldScale().x
        const flip = ui.hasFlip(c.so)
        ui.log(
          `${c.so}: ${dist.toFixed(0)} cm away, description ${mid.distance(eye).toFixed(0)} cm away at scale ${k.toFixed(2)} ` +
            `(same look as at 50 cm: ${(mid.distance(eye) / 50).toFixed(2)}), bottom ${gapDeg.toFixed(1)} deg above its top, ` +
            `centre ${off.toFixed(1)} cm to the side, facing (cos ${facing.toFixed(3)}), Flip ${ui.isShown("FlipButton")}, Close ${ui.isShown("CloseButton")}`,
        )
        if (gapDeg < 0.5 || gapDeg > 8) problems.push(`${c.so} description bottom ${gapDeg.toFixed(1)} deg above it (0.5-8: just above, never covering it)`)
        if (off > 0.1 * dist) problems.push(`${c.so} description centre ${off.toFixed(1)} cm to the side of it (max ${(0.1 * dist).toFixed(0)})`)
        if (facing < 0.98) problems.push(`${c.so} description not facing the player (cos ${facing.toFixed(3)})`)
        if (k > dist / 50 + 0.01) problems.push(`${c.so} description drawn bigger (${k.toFixed(2)}) than at 50 cm (${(dist / 50).toFixed(2)})`)
        if (ui.isShown("FlipButton") !== flip || !ui.isShown("CloseButton")) problems.push(`${c.so} should show ${flip ? "Flip and Close" : "Close only"}`)
        problems.push(...ui.counterProblems(ui.basis(), `${c.so}, looking at the clue`))
        const seen = ui.withCentres(pts.concat(ui.drawnCorners("CounterPanel", names)), names)
        problems.push(...ui.hiddenBy(eye, seen.pts, seen.names, ui.solids(c.so)).map((h) => `${c.so}: ${h}`))

        // ── Looking at the description: how much of the view it fills; the counter at the top ──
        ui.holdHead(ui.lookRot(mid.sub(eye).normalize()))
        await nextFrame()
        await nextFrame()
        names.length = 0
        pts = ui.descriptionCorners(names)
        const b = ui.basis()
        const fill = ui.fill(pts, b)
        const worst = new Map<string, number>()
        pts.forEach((p, i) => worst.set(names[i], Math.max(worst.get(names[i]) || 0, ui.fill([p], b))))
        const top = Array.from(worst.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3)
        const desc = ui.viewRect(pts, b)
        const counter = ui.viewRect(ui.drawnCorners("CounterPanel"), b)
        const counterFill = ui.fill(ui.drawnCorners("CounterPanel"), b)
        ui.log(
          `${c.so}: fill ${fill.toFixed(3)} (outermost ${top.map((e) => `${e[0]}=${e[1].toFixed(2)}`).join(", ")}); ` +
            `description ${ui.rectText(desc)}, counter ${ui.rectText(counter)}`,
        )
        if (fill > MAX_FILL) problems.push(`${c.so} description fills ${fill.toFixed(3)} of the view (max ${MAX_FILL})`)
        problems.push(...ui.counterProblems(b, `${c.so}, looking at the description`))
        if (counterFill > MAX_FILL) problems.push(`${c.so}: counter out at ${counterFill.toFixed(2)} of the view (max ${MAX_FILL})`)
        if (desc && counter && counter.y0 < desc.y1) problems.push(`${c.so}: counter not above the description`)

        // ── Nothing in the way of a pinch on the buttons ──
        problems.push(...(await ui.buttonRayProblems(probe, b, c.so)))

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
