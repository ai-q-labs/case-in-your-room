import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {UpdateDispatcher} from "Leaf.lspkg/Utils/common/UpdateDispatcher"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

// UIKit types above are used to measure plates and buttons by their layout size (see groupCorners).

/**
 * Opening each clue the way a player does: look at it, pinch, read its description where it lies.
 *
 * For each clue the head is aimed at the clue's place in the room and the clue is pinched. Every clue now
 * stays where it is; its description and buttons appear just above it. The head then looks at the
 * description. Measured:
 *  - the clue does not move;
 *  - the description's bottom edge sits just above the clue's top as seen from the eye (never covering it),
 *    centred over it, facing the player, at the same apparent size as at 50 cm (shrunk only to fit the view);
 *  - how much of the view the description and buttons fill ("fill" = the largest |normalized screen
 *    coordinate| over all their corners; 1.0 = touching the view edge);
 *  - "Flip" next to "Close" for every clue but the footprints;
 *  - rays from the eye and from a right-hand position to each button reach that button first (no clue's
 *    pinch target, and not the counter, sits in the way);
 *  - Flip turns the clue over where it lies without sinking into what it rests on, and puts it back down;
 *  - Close counts it.
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

interface Basis {
  eye: vec3
  fwd: vec3
  right: vec3
  up: vec3
}

@component
export class InspectFitScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("InspectFit")
    await sleep(1500)
    await ui.startGame()
    const camT = ui.cam.getTransform()
    // The preview re-poses the camera every frame, so the head is held each frame (as LEAF's IK head does).
    let hold: quat | null = null
    const unsubscribe = UpdateDispatcher.getInstance().onUpdate.add(() => {
      if (hold) camT.setWorldRotation(hold)
    })
    const look = (dir: vec3) => quat.lookAt(dir.uniformScale(-1), vec3.up())
    const angle = (a: vec3, b: vec3) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) / DEG
    const tanV = Math.tan(ui.cam.fov / 2)
    const tanH = tanV * ui.cam.aspect
    ui.log(`view: vertical fov ${(ui.cam.fov / DEG).toFixed(1)} deg, aspect ${ui.cam.aspect.toFixed(3)}`)
    const probe = Physics.createGlobalProbe()

    const problems: string[] = []
    try {
      for (const c of CLUES) {
        // Look at the clue's place, as a player does before pinching it.
        const clue = ui.clue(c.so)
        const rest = clue.restPosition
        const aim = rest.sub(ui.eye).normalize()
        hold = look(aim)
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
        let pts = this.groupCorners(ui, names)
        const mid = this.centroid(pts)
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
          `${c.so}: ${dist.toFixed(0)} cm away, description scale ${k.toFixed(2)} (same look as at 50 cm: ${(dist / 50).toFixed(2)}), ` +
            `bottom ${gapDeg.toFixed(1)} deg above its top, centre ${off.toFixed(1)} cm to the side, facing (cos ${facing.toFixed(3)}), ` +
            `Flip ${ui.isShown("FlipButton")}, Close ${ui.isShown("CloseButton")}`,
        )
        if (gapDeg < 0.5 || gapDeg > 8) problems.push(`${c.so} description bottom ${gapDeg.toFixed(1)} deg above it (0.5-8: just above, never covering it)`)
        if (off > 0.1 * dist) problems.push(`${c.so} description centre ${off.toFixed(1)} cm to the side of it (max ${(0.1 * dist).toFixed(0)})`)
        if (facing < 0.98) problems.push(`${c.so} description not facing the player (cos ${facing.toFixed(3)})`)
        if (k > dist / 50 + 0.01) problems.push(`${c.so} description drawn bigger (${k.toFixed(2)}) than at 50 cm (${(dist / 50).toFixed(2)})`)
        if (ui.isShown("FlipButton") !== flip || !ui.isShown("CloseButton")) problems.push(`${c.so} should show ${flip ? "Flip and Close" : "Close only"}`)

        // ── Looking at the description: how much of the view it fills ──
        hold = look(mid.sub(eye).normalize())
        await nextFrame()
        await nextFrame()
        names.length = 0
        pts = this.groupCorners(ui, names)
        const b = this.basis(ui)
        const fill = this.fill(pts, b, tanH, tanV)
        const worst = new Map<string, number>()
        pts.forEach((p, i) => worst.set(names[i], Math.max(worst.get(names[i]) || 0, this.fill([p], b, tanH, tanV))))
        const top = Array.from(worst.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3)
        ui.log(`${c.so}: fill ${fill.toFixed(3)} (outermost ${top.map((e) => `${e[0]}=${e[1].toFixed(2)}`).join(", ")})`)
        if (fill > MAX_FILL) problems.push(`${c.so} description fills ${fill.toFixed(3)} of the view (max ${MAX_FILL})`)

        // ── Nothing in the way of a pinch on the buttons ──
        const hand = b.eye.add(b.right.uniformScale(20)).add(b.up.uniformScale(-35)).add(b.fwd.uniformScale(25))
        for (const btn of flip ? ["FlipButton", "CloseButton"] : ["CloseButton"]) {
          const target = ui.world(btn)
          for (const [label, origin] of [["eye", b.eye], ["right hand", hand]] as [string, vec3][]) {
            const end = origin.add(target.sub(origin).normalize().uniformScale(target.sub(origin).length + 30))
            const hit = await this.cast(probe, origin, end)
            if (hit !== btn) problems.push(`${c.so}: ray from the ${label} to ${btn} hits ${hit || "nothing"} first`)
          }
        }

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
      }
    } finally {
      hold = null
      unsubscribe()
    }
    expect(problems.length, `inspect fit problems: ${problems.join("; ")}`).toBe(0)
  }

  private basis(ui: CaseRoomLeafInteractor): Basis {
    const t = ui.cam.getTransform()
    return {eye: t.getWorldPosition(), fwd: t.back, right: t.right, up: t.up}
  }

  /** Largest |normalized screen coordinate| over the points (1 = on the view edge; > 1 = outside). */
  private fill(pts: vec3[], b: Basis, tanH: number, tanV: number): number {
    let m = 0
    for (const p of pts) {
      const v = p.sub(b.eye)
      const z = v.dot(b.fwd)
      if (z <= 1e-3) return 99
      m = Math.max(m, Math.abs(v.dot(b.right) / (z * tanH)), Math.abs(v.dot(b.up) / (z * tanV)))
    }
    return m
  }

  /** Name of the nearest *Button ancestor of the first collider hit, "other:<name>" for any other collider, "" for none. */
  private async cast(probe: Probe, start: vec3, end: vec3): Promise<string> {
    let result: string | null = null
    probe.rayCast(start, end, (hit) => {
      if (!hit) {
        result = ""
        return
      }
      let o = hit.collider.getSceneObject()
      while (o && !o.name.endsWith("Button")) o = o.getParent()
      result = o ? o.name : `other:${hit.collider.getSceneObject().name}`
    })
    for (let i = 0; i < 30 && result === null; i++) await nextFrame()
    if (result === null) throw new Error("ray cast never returned")
    return result
  }

  /**
   * Corners of everything drawn for the description and its buttons. UIKit plates and buttons are drawn
   * by a shader on a placeholder mesh, so their AABB is not what you see (a plate's box measured 1.00 of
   * the view where the screenshot shows 0.77); they and text use the rectangle the layout gives them.
   */
  private groupCorners(ui: CaseRoomLeafInteractor, names: string[]): vec3[] {
    const out: vec3[] = []
    const rect = (o: SceneObject, w: number, h: number, cx: number = 0, cy: number = 0) => {
      const m = o.getTransform().getWorldTransform()
      for (const x of [cx - w / 2, cx + w / 2])
        for (const y of [cy - h / 2, cy + h / 2]) {
          out.push(m.multiplyPoint(new vec3(x, y, 0)))
          names.push(o.name)
        }
    }
    const visit = (o: SceneObject) => {
      if (!o.isEnabledInHierarchy) return
      const plate = o.getComponent(BackPlate.getTypeName()) as BackPlate
      const button = o.getComponent(Button.getTypeName()) as Button
      if (plate) rect(o, plate.size.x, plate.size.y)
      else if (button) rect(o, button.size.x, button.size.y)
      for (const t of o.getComponents("Component.Text") as Text[]) {
        if (t.text === "") continue // empty line: draws nothing
        const r = t.layoutRect
        rect(o, r.right - r.left, r.top - r.bottom, (r.left + r.right) / 2, (r.top + r.bottom) / 2)
      }
      for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
    }
    visit(ui.so("InspectInfo"))
    visit(ui.so("InspectFlipButtons"))
    visit(ui.so("InspectCloseButtons"))
    return out
  }

  private centroid(pts: vec3[]): vec3 {
    let sum = vec3.zero()
    for (const p of pts) sum = sum.add(p)
    return sum.uniformScale(1 / Math.max(1, pts.length))
  }
}
