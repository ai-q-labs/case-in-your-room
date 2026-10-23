import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * The suspects appear straight ahead of wherever the player faces at the moment the 5th clue is counted,
 * level, with the line-up's distance and fit unchanged (devpost/design-brief.md, "Changes during the
 * build": "Where the suspects appear").
 *
 * The real count first: 4 clues are found, then the 5th is opened and closed with the head facing F0 (90
 * degrees to the right of the facing at Start, where nothing stands in the way, tilted 20 degrees down as when looking at a clue); right after the
 * count the head turns another 90 degrees. The line-up must stand along F0, the facing at the count.
 * Then, from the same spot, the line-up is placed again for the 7 other facings (every 45 degrees) with the
 * call the count makes, and once more facing the clock's wall from 120 cm in front of it, where the wall
 * stands nearer than the line-up: there it must come in front of the wall, scaled to look the same.
 * Measured each time with the head level along the facing:
 *  - the line-up stands straight ahead (bearing within 1 degree) at eye height, facing the player;
 *  - all of it (figures by their vertices, name labels, the message while it shows) is within MAX_FILL of
 *    the view and reaches at least MIN_FILL (the same fit as lineup_fit);
 *  - nothing solid (stand-ins, clues) hides any part of it.
 * At the wall, as a control, the same line-up at its usual distance must be hidden by the wall.
 */
const MAX_FILL = 0.87
const MIN_FILL = 0.75
const DEG = Math.PI / 180

@component
export class LineupFacingScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("LineupFacing")
    await sleep(1500)
    await ui.startGame()
    const start = ui.flatLook
    const turn = (deg: number) => quat.angleAxis(-deg * DEG, vec3.up()).multiplyVec3(start).normalize()
    for (const c of CLUES.slice(0, CLUES.length - 1)) await ui.inspectAndClose(c.so)
    const last = CLUES[CLUES.length - 1].so
    const problems: string[] = []
    let usual = 0
    try {
      // ── The real count, facing F0 ──
      const f0 = turn(90)
      const pitched = (f: vec3, deg: number) => f.uniformScale(Math.cos(deg * DEG)).add(vec3.up().uniformScale(Math.sin(deg * DEG)))
      ui.holdHead(ui.lookRot(pitched(f0, -20)))
      await nextFrame()
      await nextFrame()
      ;(ui.interactable(last) as any).onTriggerEndEvent.invoke({})
      await ui.waitUntil(`${last} described`, () => ui.phase === "inspect", 2000)
      await sleep(300)
      ui.holdHead(ui.lookRot(pitched(f0, -20)))
      ;(ui.main as any).closeInspect() // what "Close" does, in the frame the head is held
      ui.holdHead(ui.lookRot(turn(180))) // and the head turns right after the count
      await ui.waitUntil("suspects shown", () => ui.phase === "suspects" && SUSPECTS.every((s) => ui.isPinchable(s.so)), 4000)
      await sleep(900) // the figures rise into place over 0.8 s
      usual = await this.measure(ui, f0, "facing F0 at the count (head turned 90 deg after)", problems)
      const eye = ui.eye

      // ── The other 7 facings, from the same spot ──
      for (let k = 1; k < 8; k++) {
        const f = turn(90 + k * 45)
        ;(ui.main as any).placeLineup(eye, f)
        await this.measure(ui, f, `facing F0 + ${k * 45} deg`, problems, usual)
      }

      // ── Facing the clock's wall from 120 cm in front of it ──
      const wall = ui.so("StandIn_ClockWall").getTransform()
      const out = wall.getWorldRotation().multiplyVec3(vec3.forward())
      const outFlat = new vec3(out.x, 0, out.z).normalize()
      const face = ui.standIn("StandIn_ClockWall").worldBoxes()[0].half.z
      const near = new vec3(wall.getWorldPosition().x, eye.y, wall.getWorldPosition().z).add(outFlat.uniformScale(face + 120))
      const toWall = outFlat.uniformScale(-1)
      ui.holdHead(ui.lookRot(toWall), near)
      await nextFrame()
      ;(ui.main as any).placeLineup(near, toWall)
      const dist = await this.measure(ui, toWall, "facing the wall from 120 cm", problems, usual)
      if (dist > usual - 5) problems.push(`facing the wall: the line-up stands ${dist.toFixed(1)} cm away, not in front of the wall (usual ${usual.toFixed(1)})`)
      // Control: pushed back to its usual distance (it looks the same from the eye), the wall hides it.
      const pts = this.lineupPoints(ui)
      const back = pts.map((p) => near.add(p.sub(near).uniformScale((usual / dist) * 0.999)))
      const wouldHide = ui.hiddenBy(near, back, back.map(() => "line-up"), ui.solids()).length
      ui.log(`facing the wall: at its usual ${usual.toFixed(1)} cm, ${wouldHide} of ${back.length} points would be hidden`)
      if (wouldHide === 0) problems.push("control: at its usual distance the wall hides nothing, so this case checks nothing")
    } finally {
      ui.releaseHead()
    }
    expect(problems.length, `line-up facing problems: ${problems.join("; ")}`).toBe(0)
  }

  /** Every drawn point of the line-up: the figures' vertices, the name labels, and the message while it shows. */
  private lineupPoints(ui: CaseRoomLeafInteractor): vec3[] {
    let pts: vec3[] = []
    for (const s of SUSPECTS) {
      const fig = ui.child(ui.so(s.so), "Figure")
      if (fig) pts = pts.concat(ui.meshPoints(fig))
      pts = pts.concat(ui.drawnCorners(`SuspectLabel_${s.key}`))
    }
    if (ui.isShown("CounterPanel")) pts = pts.concat(ui.drawnCorners("CounterPanel"))
    return pts
  }

  /** With the head level along `f`: where the line-up stands and how it fits. Returns its distance. */
  private async measure(ui: CaseRoomLeafInteractor, f: vec3, label: string, problems: string[], usual: number = 0): Promise<number> {
    ui.holdHead(ui.lookRot(f), ui.eye)
    await nextFrame()
    await nextFrame()
    const eye = ui.eye
    const lineup = ui.world("SuspectLineup")
    const d = new vec3(lineup.x - eye.x, 0, lineup.z - eye.z)
    const bearing = Math.acos(Math.max(-1, Math.min(1, d.normalize().dot(f)))) / DEG
    const z = ui.so("SuspectLineup").getTransform().getWorldRotation().multiplyVec3(vec3.forward())
    const facing = new vec3(z.x, 0, z.z).normalize().dot(d.normalize().uniformScale(-1))
    const scale = ui.so("SuspectLineup").getTransform().getWorldScale().x
    const pts = this.lineupPoints(ui)
    const fill = ui.fill(pts, ui.basis())
    const hidden = ui.hiddenBy(eye, pts, pts.map(() => "line-up"), ui.solids())
    ui.log(
      `${label}: ${d.length.toFixed(1)} cm away at scale ${scale.toFixed(2)}, bearing ${bearing.toFixed(2)} deg, ` +
        `${(lineup.y - eye.y).toFixed(1)} cm above the eyes, facing (cos ${facing.toFixed(3)}), fill ${fill.toFixed(3)}, ${hidden.length} hidden points`,
    )
    if (bearing > 1) problems.push(`${label}: line-up ${bearing.toFixed(2)} deg off straight ahead`)
    if (Math.abs(lineup.y - eye.y) > 1) problems.push(`${label}: line-up ${(lineup.y - eye.y).toFixed(1)} cm off eye height`)
    if (facing < 0.99) problems.push(`${label}: line-up not facing the player`)
    if (fill > MAX_FILL || fill < MIN_FILL) problems.push(`${label}: line-up fills ${fill.toFixed(3)} of the view (${MIN_FILL}-${MAX_FILL})`)
    if (hidden.length > 0) problems.push(`${label}: ${hidden.length} points of the line-up hidden (${hidden[0]})`)
    if (usual > 0 && scale > 0.999 && Math.abs(d.length - usual) > 1) problems.push(`${label}: line-up ${d.length.toFixed(1)} cm away (usual ${usual.toFixed(1)})`)
    return d.length
  }
}
