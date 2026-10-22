import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

/**
 * From wherever the player stands, an open description and its buttons are never hidden by the furniture
 * (or another clue) and can be pinched (devpost/design-brief.md, "Changes during the build": "Clear line
 * of sight").
 *
 * Each clue is looked at from 8 directions around it: every 45 degrees, 120 cm away, the eyes 160 cm above
 * the floor (the eye height the room is built for). The head is aimed at the clue and the clue is pinched,
 * as a player does. Measured each time:
 *  - nothing solid (the stand-ins' boxes, the other clues' meshes) lies on the line from the eye to any
 *    corner or centre of the description, the buttons and the counter;
 *  - rays from the eye and from a right-hand position to each button reach that button first;
 *  - the arrows are put away and the counter does not overlap the description, looking at the clue and
 *    looking at the description; looking at the description, it and the counter are in view.
 * The stand-ins' boxes are first checked against the mesh actually drawn (same bounding box).
 * The last clue to be counted cannot be closed between views (closing it ends the search), so for its
 * views after the first the open description is placed again from the new eye, with the same call a
 * pinch makes.
 */
const RING_CM = 120
const MAX_FILL = 0.92
const DEG = Math.PI / 180

@component
export class InspectViewsScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("InspectViews")
    await sleep(1500)
    await ui.startGame()
    const probe = Physics.createGlobalProbe()
    const floorY = ui.so("CrimeScene").getTransform().getWorldPosition().y
    const eyeY = floorY + ui.main.eyeHeightCm
    const problems: string[] = []
    problems.push(...ui.standInBoxProblems())
    let pulledIn = 0
    let hiddenBefore = 0
    try {
      for (const c of CLUES) {
        const clue = ui.clue(c.so)
        const rest = clue.restPosition
        for (let a = 0; a < 8; a++) {
          const az = a * 45 * DEG
          const eye = new vec3(rest.x + RING_CM * Math.sin(az), eyeY, rest.z + RING_CM * Math.cos(az))
          const label = `${c.so} from ${a * 45} deg`
          ui.holdHead(ui.lookRot(rest.sub(eye).normalize()), eye)
          await nextFrame()
          await nextFrame()
          if (ui.eye.distance(eye) > 1) {
            problems.push(`${label}: could not hold the eye there (${ui.eye.distance(eye).toFixed(1)} cm off)`)
            continue
          }

          // Open it from here.
          if (ui.phase === "inspect") {
            if (!clue.inspected && ui.main.foundCount === CLUES.length - 1) {
              ;(ui.main as any).describeInPlace(clue, ui.eye)
            } else {
              await ui.close()
              await nextFrame()
            }
          }
          if (ui.phase === "explore") {
            // Delivered in the frame where the head is held (see inspect_fit).
            ;(ui.interactable(c.so) as any).onTriggerEndEvent.invoke({})
            await ui.waitUntil(`${label}: described`, () => ui.phase === "inspect" && ui.isShown("InspectInfo"), 2000)
          }
          await sleep(300) // let the panels lay out

          // ── Seen from here, at the pinch ──
          const names: string[] = []
          const desc = ui.descriptionCorners(names)
          const mid = ui.centroid(desc)
          const seen = ui.withCentres(desc.concat(ui.drawnCorners("CounterPanel", names)), names)
          const hidden = ui.hiddenBy(ui.eye, seen.pts, seen.names, ui.solids(c.so))
          problems.push(...hidden.map((h) => `${label}: ${h}`))
          problems.push(...ui.counterProblems(ui.basis(), `${label}, looking at the clue`))
          const near = mid.distance(ui.eye) < rest.distance(ui.eye) - 5
          if (near) {
            pulledIn++
            // Control: the same description pushed back to the clue's distance (it looks the same from the
            // eye, only farther) is what the Lens drew before this fix. Something must hide it there, or the
            // check above would pass whatever the Lens does.
            // The Lens measures how near along the description's facing direction; before, that was the clue's distance.
            const facing = ui.so("InspectInfo").getTransform().getWorldRotation().multiplyVec3(vec3.forward()).uniformScale(-1)
            const back = (rest.distance(ui.eye) / mid.sub(ui.eye).dot(facing)) * 0.999
            const old = seen.pts.map((p) => ui.eye.add(p.sub(ui.eye).uniformScale(back)))
            const wouldHide = ui.hiddenBy(ui.eye, old, seen.names, ui.solids(c.so)).length
            if (wouldHide > 0) hiddenBefore++
            ui.log(`${label}: at the clue's distance ${wouldHide} of ${old.length} points would be hidden`)
          }

          // ── Looking at the description ──
          ui.holdHead(ui.lookRot(mid.sub(ui.eye).normalize()), eye)
          await nextFrame()
          await nextFrame()
          const b = ui.basis()
          const fill = ui.fill(ui.descriptionCorners(), b)
          const counterFill = ui.fill(ui.drawnCorners("CounterPanel"), b)
          if (fill > MAX_FILL) problems.push(`${label}: description fills ${fill.toFixed(2)} of the view (max ${MAX_FILL})`)
          if (counterFill > MAX_FILL) problems.push(`${label}: counter out at ${counterFill.toFixed(2)} of the view (max ${MAX_FILL})`)
          problems.push(...ui.counterProblems(b, `${label}, looking at the description`))
          problems.push(...(await ui.buttonRayProblems(probe, b, label)))
          ui.log(
            `${label}: clue ${rest.distance(eye).toFixed(0)} cm away, description ${mid.distance(eye).toFixed(0)} cm away` +
              `${near ? " (brought in front of what is in the way)" : ""}, fill ${fill.toFixed(2)}, counter ${counterFill.toFixed(2)}, ` +
              `${hidden.length} hidden points`,
          )
        }
        await ui.close()
        await sleep(200)
      }
    } finally {
      ui.releaseHead()
    }
    ui.log(`${pulledIn} of ${CLUES.length * 8} views drew the description nearer than its clue; in ${hiddenBefore} of them it would have been hidden at the clue's distance`)
    expect(pulledIn > 0 && hiddenBefore > 0, "some view had something in the way that hid the description at the clue's distance (else this test checks nothing)").toBe(true)
    expect(problems.length, `inspect view problems: ${problems.join("; ")}`).toBe(0)
  }
}
