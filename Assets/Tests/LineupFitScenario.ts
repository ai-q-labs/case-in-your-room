import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, SUSPECTS, ViewBasis, ViewRect} from "./CaseRoomLeafInteractor"

/**
 * The suspect line-up, down to the text under the figures, fits the view with a margin on every side, the
 * same idea as the description's fit (devpost/design-brief.md, "Changes during the build": "Suspect
 * line-up distance"); the "suspects have appeared" message stands above the figures, clear of the names.
 *
 * After the 5th clue the head is held level, looking at the line-up's centre, as a player looks at it.
 * Measured in view coordinates (1 = the edge of the view) while the message shows, then with each suspect
 * selected in turn (alibi bubble and Accuse button shown):
 *  - every drawn part (the figures' meshes, the name labels, the message, the bubble, the Accuse button)
 *    stays within MAX_FILL of the view on all four sides;
 *  - the outermost part reaches at least MIN_FILL (the line-up stands no farther than it needs to);
 *  - the message overlaps no figure and no name label.
 */
const MAX_FILL = 0.87 // the Lens aims at 0.85 (lineupViewFill); 0.02 for rounding
const MIN_FILL = 0.75

interface Part {
  name: string
  pts: vec3[]
}

@component
export class LineupFitScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("LineupFit")
    await sleep(1500)
    await ui.startGame()
    await ui.findRemainingClues()
    await ui.waitUntil(
      "suspects shown with the message above them",
      () => ui.phase === "suspects" && ui.hud.isPinned && ui.isShown("CounterPanel") && SUSPECTS.every((s) => ui.isPinchable(s.so)),
      4000,
    )
    const lineup = ui.world("SuspectLineup")
    const flat = new vec3(lineup.x - ui.eye.x, 0, lineup.z - ui.eye.z).normalize()
    ui.holdHead(ui.lookRot(flat))
    await sleep(900) // the figures rise into place over 0.8 s
    const problems: string[] = []
    let outermost = 0
    // A figure is measured by its mesh's vertices (a box around a round bust would stick out at the corners).
    const figure = (so: string): vec3[] => {
      const out: vec3[] = []
      const fig = ui.child(ui.so(so), "Figure")
      if (!fig) return out
      for (let i = 0; i < fig.getChildrenCount(); i++) {
        const o = fig.getChild(i)
        const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
        if (!v || !v.mesh) continue
        const m = o.getTransform().getWorldTransform()
        const xyz = v.mesh.extractVerticesForAttribute("position")
        for (let k = 0; k + 2 < xyz.length; k += 3) out.push(m.multiplyPoint(new vec3(xyz[k], xyz[k + 1], xyz[k + 2])))
      }
      return out
    }
    const measure = (state: string, parts: Part[], b: ViewBasis) => {
      const fills = parts.map((p) => ({name: p.name, fill: ui.fill(p.pts, b)}))
      fills.sort((x, y) => y.fill - x.fill)
      outermost = Math.max(outermost, fills[0].fill)
      ui.log(`${state}: outermost ${fills.slice(0, 3).map((f) => `${f.name} ${f.fill.toFixed(3)}`).join(", ")}`)
      for (const f of fills) if (f.fill > MAX_FILL) problems.push(`${state}: ${f.name} at ${f.fill.toFixed(3)} of the view (max ${MAX_FILL})`)
    }
    try {
      const b = ui.basis()
      const dist = ui.horizontalDistance(lineup, b.eye)
      ui.log(`line-up ${dist.toFixed(1)} cm away, ${(lineup.y - b.eye.y).toFixed(1)} cm above the eyes`)
      const base: Part[] = []
      for (const s of SUSPECTS) {
        base.push({name: `${s.name} figure`, pts: figure(s.so)})
        base.push({name: `${s.name} label`, pts: ui.drawnCorners(`SuspectLabel_${s.key}`)})
      }
      if (base.some((p) => p.pts.length === 0)) problems.push(`nothing measured for ${base.filter((p) => p.pts.length === 0).map((p) => p.name).join(", ")}`)

      // ── While the message shows ──
      const message = ui.drawnCorners("CounterPanel")
      measure("message shown", base.concat([{name: "message", pts: message}]), b)
      const m = ui.viewRect(message, b)
      ui.log(`message "${ui.text("CounterText")}" at ${ui.rectText(m)}`)
      for (const p of base) {
        const r = ui.viewRect(p.pts, b)
        if (m && r && ui.overlaps(m, r)) problems.push(`message (${ui.rectText(m)}) overlaps ${p.name} (${ui.rectText(r)})`)
      }

      // ── Each suspect selected: the alibi bubble above, the Accuse button below ──
      for (const s of SUSPECTS) {
        await ui.select(s.so)
        await sleep(200)
        if (ui.isShown("CounterPanel")) problems.push(`${s.name} selected: the message still shows`)
        const parts = base.concat([
          {name: "alibi bubble", pts: ui.drawnCorners("AlibiBubble")},
          {name: "Accuse button", pts: ui.drawnCorners("AccusePanel")},
        ])
        measure(`${s.name} selected`, parts, ui.basis())
        const accuse: ViewRect | null = ui.viewRect(ui.drawnCorners("AccusePanel"), ui.basis())
        ui.log(`${s.name} selected: Accuse button at ${ui.rectText(accuse)}`)
      }
    } finally {
      ui.releaseHead()
    }
    ui.log(`outermost part over all states: ${outermost.toFixed(3)} of the view`)
    if (outermost < MIN_FILL) problems.push(`the line-up only reaches ${outermost.toFixed(3)} of the view (min ${MIN_FILL}): farther than it needs to be`)
    expect(problems.length, `line-up fit problems: ${problems.join("; ")}`).toBe(0)
  }
}
