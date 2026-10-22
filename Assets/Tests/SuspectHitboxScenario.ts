import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * Suspect pinch targets after the spacing change (brief: targets <= 40 cm wide, 45 cm apart; built:
 * 40 cm apart). Checks, on the live line-up, that each target is narrower than the spacing
 * (<= 35 cm, leaving >= 5 cm between neighbours) and that aiming anywhere across the line-up — including
 * the visible edge of each figure — can only ever hit the suspect actually aimed at.
 *
 * Aiming is measured with physics rays against the same colliders SIK targets, swept across the
 * line-up at bust height every 1 cm, from the eye and from a typical right-hand position.
 */
const MAX_TARGET_CM = 35
const MIN_GAP_CM = 5
const FIGURE_HALF_CM = 15.5 // CaseRoomSuspect.figureWidthCm 31 / 2: the visible edge of each figure

@component
export class SuspectHitboxScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("SuspectHitbox")
    await sleep(1500)
    await ui.reachSuspects()
    await sleep(300)

    // ── Nothing from the room shows through a suspect when the line-up appears straight ahead ──
    // (the figures are translucent; the clock on the front wall once showed through Nora's chest)
    const screenRect = (pts: vec3[]) => {
      const s = pts.map((p) => ui.screen(p))
      return {x0: Math.min(...s.map((v) => v.x)), x1: Math.max(...s.map((v) => v.x)), y0: Math.min(...s.map((v) => v.y)), y1: Math.max(...s.map((v) => v.y))}
    }
    const corners = (o: SceneObject) => {
      const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const lo = v.worldAabbMin()
      const hi = v.worldAabbMax()
      const out: vec3[] = []
      for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) out.push(new vec3(x, y, z))
      return out
    }
    for (const s of SUSPECTS) {
      const body = ui.child(ui.child(ui.so(s.so), "Figure"), "Body")
      expect(!!body, `${s.so} has a Figure/Body visual`).toBe(true)
      const fig = screenRect(corners(body))
      for (const c of CLUES) {
        const pts = ui.clue(c.so).worldCorners()
        if (!pts.every((p) => p.sub(ui.eye).dot(ui.look) > 0)) continue // behind or beside the player
        const r = screenRect(pts)
        const overlap = r.x0 < fig.x1 && fig.x0 < r.x1 && r.y0 < fig.y1 && fig.y0 < r.y1
        if (overlap) ui.log(`${c.so} overlaps ${s.so} on screen: clue y ${r.y0.toFixed(3)}..${r.y1.toFixed(3)}, figure y ${fig.y0.toFixed(3)}..${fig.y1.toFixed(3)}`)
        expect(overlap, `${c.so} shows through ${s.so} when the line-up appears straight ahead`).toBe(false)
      }
    }

    const lt = ui.so("SuspectLineup").getTransform()
    const toLocal = lt.getInvertedWorldTransform()
    const toWorld = lt.getWorldTransform()

    // ── Collider sizes and spacing, read from the live objects ──
    const centersX: number[] = []
    let bustY = 0
    SUSPECTS.forEach((s) => {
      const so = ui.so(s.so)
      const col = so.getComponent("Physics.ColliderComponent") as ColliderComponent
      expect(!!col, `${s.so} has a pinch-target collider`).toBe(true)
      const width = (col.shape as BoxShape).size.x * so.getTransform().getWorldScale().x
      const local = toLocal.multiplyPoint(so.getTransform().getWorldPosition())
      centersX.push(local.x)
      bustY = local.y
      ui.log(`${s.so}: target width ${width.toFixed(1)} cm, center x ${local.x.toFixed(1)} cm`)
      ui.between(`${s.so} pinch target width (cm)`, width, 1, MAX_TARGET_CM)
    })
    for (let i = 1; i < centersX.length; i++) {
      const spacing = centersX[i] - centersX[i - 1]
      const wPrev = this.width(ui, SUSPECTS[i - 1].so)
      const wNext = this.width(ui, SUSPECTS[i].so)
      const gap = spacing - (wPrev + wNext) / 2
      ui.log(`${SUSPECTS[i - 1].so} -> ${SUSPECTS[i].so}: spacing ${spacing.toFixed(1)} cm, empty gap ${gap.toFixed(1)} cm`)
      ui.between(`empty gap between ${SUSPECTS[i - 1].so} and ${SUSPECTS[i].so} (cm)`, gap, MIN_GAP_CM, 100)
    }

    // ── Aim sweep across the line-up at bust height ──
    const eye = ui.eye
    const camT = ui.cam.getTransform()
    const hand = eye.add(camT.right.uniformScale(20)).add(camT.up.uniformScale(-35)).add(ui.look.uniformScale(25))
    const origins: [string, vec3][] = [["eye", eye], ["right hand", hand]]
    const probe = Physics.createGlobalProbe()
    for (const [label, origin] of origins) {
      const spans = SUSPECTS.map(() => ({min: 999, max: -999}))
      let wrong = 0
      let edgeMisses = 0
      for (let x = -70; x <= 70; x += 1) {
        const target = toWorld.multiplyPoint(new vec3(x, bustY, 0))
        const end = origin.add(target.sub(origin).normalize().uniformScale(400))
        const hitName = await this.cast(probe, origin, end)
        const hitIdx = SUSPECTS.findIndex((s) => s.so === hitName)
        const nearest = this.nearest(centersX, x)
        if (hitIdx >= 0) {
          spans[hitIdx].min = Math.min(spans[hitIdx].min, x)
          spans[hitIdx].max = Math.max(spans[hitIdx].max, x)
          if (hitIdx !== nearest) {
            wrong++
            ui.log(`[${label}] WRONG: aiming at x=${x} hit ${hitName}, nearest is ${SUSPECTS[nearest].so}`)
          }
        }
        if (Math.abs(x - centersX[nearest]) <= FIGURE_HALF_CM && hitIdx !== nearest) {
          edgeMisses++
          ui.log(`[${label}] aiming at x=${x} (on ${SUSPECTS[nearest].so}'s figure) hit ${hitName || "nothing"}`)
        }
      }
      SUSPECTS.forEach((s, i) =>
        ui.log(`[${label}] ${s.so} is hit from x=${spans[i].min} to x=${spans[i].max} (${spans[i].max - spans[i].min + 1} cm)`),
      )
      expect(wrong, `[${label}] aims that select a suspect other than the one aimed at`).toBe(0)
      expect(edgeMisses, `[${label}] aims on a visible figure (incl. its edge) that miss that figure`).toBe(0)
      // Sampling is every 1 cm, so a span of W cm shows up as W or W+1 samples.
      SUSPECTS.forEach((s, i) =>
        ui.between(`[${label}] ${s.so} aimable span (cm)`, spans[i].max - spans[i].min + 1, 1, MAX_TARGET_CM + 1),
      )
      for (let i = 1; i < SUSPECTS.length; i++) {
        const empty = spans[i].min - spans[i - 1].max - 1
        ui.log(`[${label}] empty aim gap ${SUSPECTS[i - 1].so} -> ${SUSPECTS[i].so}: ${empty} cm`)
        ui.between(`[${label}] empty aim gap ${SUSPECTS[i - 1].so} -> ${SUSPECTS[i].so} (cm)`, empty, MIN_GAP_CM - 1, 100)
      }
    }
  }

  private width(ui: CaseRoomLeafInteractor, so: string): number {
    const o = ui.so(so)
    const col = o.getComponent("Physics.ColliderComponent") as ColliderComponent
    return (col.shape as BoxShape).size.x * o.getTransform().getWorldScale().x
  }

  private nearest(centers: number[], x: number): number {
    let best = 0
    centers.forEach((c, i) => {
      if (Math.abs(x - c) < Math.abs(x - centers[best])) best = i
    })
    return best
  }

  /** Name of the nearest Suspect_* ancestor of the first collider hit, "other:<name>" for any other collider, "" for none. */
  private async cast(probe: Probe, start: vec3, end: vec3): Promise<string> {
    let result: string | null = null
    probe.rayCast(start, end, (hit) => {
      if (!hit) {
        result = ""
        return
      }
      let o = hit.collider.getSceneObject()
      while (o && !o.name.startsWith("Suspect_")) o = o.getParent()
      result = o ? o.name : `other:${hit.collider.getSceneObject().name}`
    })
    for (let i = 0; i < 30 && result === null; i++) await nextFrame()
    if (result === null) throw new Error("ray cast never returned")
    return result
  }
}
