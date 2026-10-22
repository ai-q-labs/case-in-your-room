import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {UpdateDispatcher} from "Leaf.lspkg/Utils/common/UpdateDispatcher"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {CaseRoomLeafInteractor, CLUES} from "./CaseRoomLeafInteractor"

// UIKit types above are used to measure plates and buttons by their layout size (see groupCorners).

/**
 * Opening a clue the way a player does: look at it, pinch, follow it to the hands, read it.
 *
 * For each clue the head is aimed at the clue's place in the room, the clue is pinched, and the head
 * then follows the clue at a human turn rate (at most HEAD_DEG_PER_S). Once it is held, the head rests
 * in a level gaze in the same facing. A clue described in place (footprints) does not move: the head
 * looks at its description, which must sit just above it, face the player, and count when closed. Measured:
 *  - the rise: time, the fastest angular speed of the clue as seen from the eye, and the share of
 *    frames in which the following head still has the clue in view;
 *  - at open: how much of the view the clue, its description and its buttons fill ("fill" = the largest
 *    |normalized screen coordinate| over all their corners; 1.0 = touching the view edge);
 *  - how many cm the player could step toward the held clue before something leaves the view.
 */
const HEAD_DEG_PER_S = 60
const MAX_RISE_DEG_PER_S = 60
const MIN_IN_VIEW = 0.95
const MAX_FILL = 0.92
const DEG = Math.PI / 180

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

    const problems: string[] = []
    try {
      for (const c of CLUES) {
        // Look at the clue's place, as a player does before pinching it.
        const rest = ui.clue(c.so).restPosition
        const aim = rest.sub(ui.eye).normalize()
        hold = look(aim)
        await nextFrame()
        await nextFrame()
        ui.log(`${c.so}: looking at it (pitch ${(Math.asin(aim.y) / DEG).toFixed(1)} deg, aim error ${angle(ui.look, aim).toFixed(2)} deg)`)
        expect(angle(ui.look, aim) < 1, `${c.so}: head aimed at the clue before the pinch`).toBe(true)

        // ── The rise, with the head following the clue ──
        const eye = ui.eye
        const wrapper = ui.so(c.so).getTransform()
        let prev = wrapper.getWorldPosition().sub(eye).normalize()
        let head = aim
        let peak = 0
        let framesInView = 0
        let frames = 0
        const t0 = getTime()
        // The preview re-poses the camera between frames and SIK delivers a scripted pinch a few frames
        // later, so the Lens would read the un-held head. Deliver the pinch's trigger-end now, in the frame
        // where the head is held. (SIK targeting of clues is covered by criterion_2 and ik_inspect_reach.)
        ;(ui.interactable(c.so) as any).onTriggerEndEvent.invoke({})
        while (!(ui.phase === "inspect" && ui.isShown("InspectInfo"))) {
          if (getTime() - t0 > 5) throw new Error(`${c.so}: never arrived in the hands`)
          await nextFrame()
          const dt = getDeltaTime()
          const p = wrapper.getWorldPosition()
          const dir = p.sub(eye).normalize()
          if (dt > 0) peak = Math.max(peak, angle(dir, prev) / dt)
          prev = dir
          frames++
          if (ui.inView(p)) framesInView++
          // Turn the head toward the clue, no faster than a person comfortably turns.
          const gap = angle(head, dir)
          const step = HEAD_DEG_PER_S * dt
          head = gap <= step ? dir : quat.slerp(quat.quatIdentity(), quat.rotationFromTo(head, dir), step / gap).multiplyVec3(head)
          hold = look(head)
        }
        const riseS = getTime() - t0
        const inView = frames > 0 ? framesInView / frames : 1

        // ── At open: a held clue -> the head rests level, in the facing it had at the pinch.
        // A clue described in place (footprints) -> the head looks at its description. ──
        const inPlace = ui.isInPlace(c.so)
        if (!inPlace) hold = look(new vec3(aim.x, 0, aim.z).normalize())
        await sleep(400) // let the panels lay out
        const names: string[] = []
        let pts = this.groupCorners(ui, c.so, names)
        if (inPlace) {
          const mid = this.centroid(pts)
          hold = look(mid.sub(eye).normalize())
          await nextFrame()
          await nextFrame()
          names.length = 0
          pts = this.groupCorners(ui, c.so, names)
          // Stays where it lies, with its description just above it, facing the player.
          const moved = wrapper.getWorldPosition().distance(rest)
          // As the player saw it at the pinch: angles above the line of sight to the clue.
          const toClue = rest.sub(eye).normalize()
          const upC = vec3.up().sub(toClue.uniformScale(toClue.y)).normalize()
          const elev = (p: vec3) => Math.atan2(p.sub(eye).dot(upC), p.sub(eye).dot(toClue)) / DEG
          const clueTop = Math.max(...ui.clue(c.so).worldCorners().map(elev))
          const gapDeg = Math.min(...pts.map(elev)) - clueTop
          // Left-right offset of the description from the clue, as the player sees it (not toward / away).
          const side = new vec3(-toClue.z, 0, toClue.x).normalize()
          const off = Math.abs(mid.sub(rest).dot(side))
          const panelZ = ui.so("InspectInfo").getTransform().getWorldRotation().multiplyVec3(vec3.forward())
          const facing = panelZ.dot(eye.sub(mid).normalize())
          ui.log(
            `${c.so} in place: moved ${moved.toFixed(2)} cm, description bottom ${gapDeg.toFixed(1)} deg above its top as seen from the eye, ` +
              `centre ${off.toFixed(1)} cm to the side of it, facing the eye (cos ${facing.toFixed(3)}), Flip shown ${ui.isShown("FlipButton")}`,
          )
          if (moved > 0.5) problems.push(`${c.so} moved ${moved.toFixed(2)} cm (should stay where it lies)`)
          if (gapDeg < 0.5 || gapDeg > 8) problems.push(`${c.so} description bottom ${gapDeg.toFixed(1)} deg above it (0.5-8: just above, never covering it)`)
          if (off > 10) problems.push(`${c.so} description centre ${off.toFixed(1)} cm to the side of it (max 10)`)
          if (facing < 0.98) problems.push(`${c.so} description not facing the player (cos ${facing.toFixed(3)})`)
          if (ui.isShown("FlipButton") || !ui.isShown("CloseButton")) problems.push(`${c.so} should show Close only, not Flip / Put back`)
        }
        const b = this.basis(ui)
        const fill = this.fill(pts, b, tanH, tanV)
        // Which parts reach furthest out (for the report).
        const worst = new Map<string, number>()
        pts.forEach((p, i) => worst.set(names[i], Math.max(worst.get(names[i]) || 0, this.fill([p], b, tanH, tanV))))
        const top = Array.from(worst.entries())
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
        // Per-axis extent of the group in normalized view coordinates (-1..1), for the report.
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9
        for (const p of pts) {
          const v = p.sub(b.eye)
          const z = v.dot(b.fwd)
          x0 = Math.min(x0, v.dot(b.right) / (z * tanH))
          x1 = Math.max(x1, v.dot(b.right) / (z * tanH))
          y0 = Math.min(y0, v.dot(b.up) / (z * tanV))
          y1 = Math.max(y1, v.dot(b.up) / (z * tanV))
        }
        ui.log(`${c.so}: group spans x ${x0.toFixed(2)}..${x1.toFixed(2)}, y ${y0.toFixed(2)}..${y1.toFixed(2)} of the view`)
        const partY = new Map<string, number[]>()
        pts.forEach((p, i) => {
          const v = p.sub(b.eye)
          const y = v.dot(b.up) / (v.dot(b.fwd) * tanV)
          const r = partY.get(names[i]) || [9, -9]
          partY.set(names[i], [Math.min(r[0], y), Math.max(r[1], y)])
        })
        ui.log(`${c.so}: part y ranges ${Array.from(partY.entries()).map((e) => `${e[0]} ${e[1][0].toFixed(2)}..${e[1][1].toFixed(2)}`).join(", ")}`)
        const held = wrapper.getWorldPosition().sub(b.eye)
        const heldDist = held.length
        // Step toward the held clue (horizontally, the way WASD walks) until something leaves the view.
        const walk = new vec3(held.x, 0, held.z).normalize()
        let stepCm = -1
        for (let m = 0; m <= 45; m++) {
          if (this.fill(pts, {...b, eye: b.eye.add(walk.uniformScale(m))}, tanH, tanV) > 1) {
            stepCm = m
            break
          }
        }
        ui.log(
          `${c.so}: rise ${riseS.toFixed(2)} s, peak ${peak.toFixed(0)} deg/s, in view of the following head ${framesInView}/${frames} frames; ` +
            `held ${heldDist.toFixed(1)} cm from the eye; fill ${fill.toFixed(3)} (outermost ${top.map((e) => `${e[0]}=${e[1].toFixed(2)}`).join(", ")}); ` +
            `${stepCm < 0 ? "still fits after stepping 45 cm closer" : `leaves the view after stepping ${stepCm} cm closer`}`,
        )
        // Collected, not thrown, so every clue is measured before the verdict.
        if (peak > MAX_RISE_DEG_PER_S) problems.push(`${c.so} rises at ${peak.toFixed(0)} deg/s (max ${MAX_RISE_DEG_PER_S})`)
        if (inView < MIN_IN_VIEW) problems.push(`${c.so} in view of the following head ${(inView * 100).toFixed(0)}% of the rise (min ${MIN_IN_VIEW * 100}%)`)
        if (fill > MAX_FILL) problems.push(`${c.so} fills ${fill.toFixed(3)} of the view at open (max ${MAX_FILL})`)
        if (!inPlace && (heldDist < 35 || heldDist > 60)) problems.push(`${c.so} held ${heldDist.toFixed(1)} cm from the eye (35-60)`)

        // Put back (or Close); after the 5th clue the game moves on to the suspects, so wait for "not inspecting".
        const counted = ui.main.foundCount
        await ui.tap(inPlace ? "CloseButton" : "PutBackButton")
        await ui.waitUntil(`${c.so} back in its place`, () => ui.phase !== "inspect" && ui.phase !== "intro", 6000)
        if (ui.main.foundCount !== counted + 1) problems.push(`${c.so} did not count (${counted} -> ${ui.main.foundCount})`)
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

  /**
   * Corners of everything drawn for the held clue, its description panel and its buttons. The clue's own
   * meshes use their world AABB. UIKit plates and buttons are drawn by a shader on a placeholder mesh, so
   * their AABB is not what you see (a plate's box measured 1.00 of the view where the screenshot shows
   * 0.77); they and text use the rectangle the layout gives them instead.
   */
  private groupCorners(ui: CaseRoomLeafInteractor, clueSo: string, names: string[]): vec3[] {
    const out: vec3[] = []
    const glowOn = ui.glowLevel(clueSo) > 0.01
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
      if (o.name === "Glow" && !glowOn) return // halo at zero intensity draws nothing on an additive display
      const plate = o.getComponent(BackPlate.getTypeName()) as BackPlate
      const button = o.getComponent(Button.getTypeName()) as Button
      if (plate) rect(o, plate.size.x, plate.size.y)
      else if (button) rect(o, button.size.x, button.size.y)
      else {
        for (const v of o.getComponents("Component.RenderMeshVisual") as RenderMeshVisual[]) {
          const lo = v.worldAabbMin()
          const hi = v.worldAabbMax()
          if (hi.sub(lo).length < 1e-3) continue // no mesh: its box sits at the origin
          for (const x of [lo.x, hi.x])
            for (const y of [lo.y, hi.y])
              for (const z of [lo.z, hi.z]) {
                out.push(new vec3(x, y, z))
                names.push(o.name)
              }
        }
      }
      for (const t of o.getComponents("Component.Text") as Text[]) {
        if (t.text === "") continue // empty line: draws nothing
        const r = t.layoutRect
        rect(o, r.right - r.left, r.top - r.bottom, (r.left + r.right) / 2, (r.top + r.bottom) / 2)
      }
      for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
    }
    if (!ui.isInPlace(clueSo)) visit(ui.so(clueSo)) // a clue described in place stays on the floor, out of the group
    visit(ui.so("InspectInfo"))
    visit(ui.so("InspectButtons"))
    visit(ui.so("InspectCloseButtons"))
    return out
  }

  private centroid(pts: vec3[]): vec3 {
    let sum = vec3.zero()
    for (const p of pts) sum = sum.add(p)
    return sum.uniformScale(1 / Math.max(1, pts.length))
  }
}
