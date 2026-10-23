import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

/**
 * From wherever the player stands, an open description group (counter, description, buttons) opens in the
 * middle of the view, is never hidden by the furniture or a clue, and can be pinched
 * (devpost/design-brief.md, "Changes during the build": "Inspecting a clue" and "Clear line of sight").
 *
 * Each clue is looked at from 8 directions around it: every 45 degrees, 120 cm away, the eyes 160 cm above
 * the floor (the eye height the room is built for). The head is aimed at the clue and the clue is pinched,
 * as a player does. One more view stands 40 cm in front of the clock's wall, looking level at the wall, and
 * pinches the clock above: there the wall stands nearer than the 50 cm the group opens at.
 * Measured each time, with the head as at the pinch:
 *  - the group is centred in the view and fills at most MAX_FILL of it;
 *  - nothing solid (the stand-ins' boxes, the clues' meshes) lies on the line from the eye to any corner or
 *    centre of the group;
 *  - rays from the eye and from a right-hand position to each button reach that button first;
 *  - the arrows are put away and the counter does not overlap the description.
 * At the wall, the group must come nearer than 50 cm, and (control) the same group at 50 cm must be hidden
 * by the wall, or this test would pass whatever the Lens does.
 * The stand-ins' boxes are first checked against the mesh actually drawn (same bounding box).
 * The last clue to be counted cannot be closed between views (closing it ends the search), so for its views
 * after the first the open group is placed again from the new eye, with the same call a pinch makes.
 */
const RING_CM = 120
const MAX_FILL = 0.86 // the Lens aims at 0.85
const OPEN_AT_CM = 50
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
    let hiddenAt50 = 0

    /** Hold the head at `eye` looking along `gaze`, open `so`'s group from there and measure it. */
    const view = async (so: string, eye: vec3, gaze: vec3, label: string): Promise<void> => {
      const clue = ui.clue(so)
      ui.holdHead(ui.lookRot(gaze), eye)
      await nextFrame()
      await nextFrame()
      if (ui.eye.distance(eye) > 1) {
        problems.push(`${label}: could not hold the eye there (${ui.eye.distance(eye).toFixed(1)} cm off)`)
        return
      }
      if (ui.phase === "inspect") {
        if (!clue.inspected && ui.main.foundCount === CLUES.length - 1) {
          ;(ui.main as any).describeInPlace(clue, ui.eye, ui.look)
        } else {
          await ui.close()
          await nextFrame()
        }
      }
      if (ui.phase === "explore") {
        // Delivered in the frame where the head is held (see inspect_fit).
        ;(ui.interactable(so) as any).onTriggerEndEvent.invoke({})
        await ui.waitUntil(`${label}: described`, () => ui.phase === "inspect" && ui.isShown("InspectInfo"), 2000)
      }
      await sleep(300) // let the panels lay out

      const names: string[] = []
      const group = ui.descriptionCorners(names).concat(ui.drawnCorners("CounterPanel", names))
      const b = ui.basis()
      const r = ui.viewRect(group, b)
      const fill = ui.fill(group, b)
      const seen = ui.withCentres(group, names)
      const hidden = ui.hiddenBy(ui.eye, seen.pts, seen.names, ui.solids())
      problems.push(...hidden.map((h) => `${label}: ${h}`))
      if (!r || Math.abs((r.x0 + r.x1) / 2) > 0.03 || Math.abs((r.y0 + r.y1) / 2) > 0.03) problems.push(`${label}: group not in the middle of the view (${ui.rectText(r)})`)
      if (fill > MAX_FILL) problems.push(`${label}: group fills ${fill.toFixed(3)} of the view (max ${MAX_FILL})`)
      problems.push(...ui.counterProblems(b, label))
      problems.push(...(await ui.buttonRayProblems(probe, b, label)))
      // How near it was drawn, along the way it faces.
      const facing = ui.so("InspectInfo").getTransform().getWorldRotation().multiplyVec3(vec3.forward()).uniformScale(-1)
      const depth = ui.world("InspectInfo").sub(ui.eye).dot(facing)
      let note = ""
      if (depth < OPEN_AT_CM - 1) {
        pulledIn++
        // Control: the same group pushed back to 50 cm (it looks the same from the eye, only farther).
        const back = (OPEN_AT_CM / depth) * 0.999
        const old = seen.pts.map((p) => ui.eye.add(p.sub(ui.eye).uniformScale(back)))
        const wouldHide = ui.hiddenBy(ui.eye, old, seen.names, ui.solids()).length
        if (wouldHide > 0) hiddenAt50++
        note = ` (brought in; at ${OPEN_AT_CM} cm ${wouldHide} of ${old.length} points would be hidden)`
      }
      ui.log(`${label}: clue ${clue.restPosition.distance(eye).toFixed(0)} cm away, group ${depth.toFixed(1)} cm away${note}, fill ${fill.toFixed(2)}, ${hidden.length} hidden points`)
    }

    try {
      for (const c of CLUES) {
        const rest = ui.clue(c.so).restPosition
        for (let a = 0; a < 8; a++) {
          const az = a * 45 * DEG
          const eye = new vec3(rest.x + RING_CM * Math.sin(az), eyeY, rest.z + RING_CM * Math.cos(az))
          await view(c.so, eye, rest.sub(eye).normalize(), `${c.so} from ${a * 45} deg`)
        }
        if (c.so === "Clue_StoppedClock") {
          // Close in front of the wall, looking level at it, pinching the clock above.
          const wall = ui.so("StandIn_ClockWall").getTransform()
          const out = wall.getWorldRotation().multiplyVec3(vec3.forward()) // the wall's front faces the room
          const front = ui.standIn("StandIn_ClockWall").worldBoxes()[0]
          const faceDist = front.half.z
          const eye = new vec3(wall.getWorldPosition().x, eyeY, wall.getWorldPosition().z).add(new vec3(out.x, 0, out.z).normalize().uniformScale(faceDist + 40))
          await view(c.so, eye, new vec3(-out.x, 0, -out.z).normalize(), `${c.so}, 40 cm in front of the wall, looking at the wall`)
        }
        await ui.close()
        await sleep(200)
      }
    } finally {
      ui.releaseHead()
    }
    ui.log(`${pulledIn} views brought the group nearer than ${OPEN_AT_CM} cm; in ${hiddenAt50} of them it would have been hidden at ${OPEN_AT_CM} cm`)
    expect(pulledIn > 0 && hiddenAt50 > 0, "some view had something in the way that hid the group at 50 cm (else this test checks nothing)").toBe(true)
    expect(problems.length, `inspect view problems: ${problems.join("; ")}`).toBe(0)
  }
}
