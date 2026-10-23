import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, clueBySo, REPLAY_ORDER, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * The whole replay can be followed without turning the head (devpost/design-brief.md, "Changes during
 * the build": "Replay at a glance").
 *
 * Nora is accused, and for the whole replay the head is held level, looking straight ahead where the
 * suspects stood (where the player looks when accusing). Measured:
 *  - when the walk starts, a strip stands straight ahead: 5 small copies of the clues, left to right in
 *    the order the figure visits them, a small figure and the line of its way so far;
 *  - the whole strip stays within MAX_FILL of the view and never overlaps the caption;
 *  - each time a caption shows, that clue's copy lights up (>= 0.5 within 0.3 s) together with the real
 *    clue, and the small figure stands at that copy;
 *  - the small figure only ever moves left to right;
 *  - the strip is gone within 1 s of the truth showing (the truth appears above the real figure, where
 *    the strip was). The real figure's walk itself is checked by criterion_5.
 */
const MAX_FILL = 0.85

@component
export class ReplayStripScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("ReplayStrip")
    await sleep(1500)
    await ui.reachSuspects()
    const nora = SUSPECTS[1]
    const lineup = ui.world("SuspectLineup")
    ui.holdHead(ui.lookRot(new vec3(lineup.x - ui.eye.x, 0, lineup.z - ui.eye.z).normalize()))
    const problems: string[] = []
    try {
      await ui.select(nora.so)
      await ui.tap("AccuseButton")
      await ui.waitUntil("the walk starts with the strip ahead", () => ui.phase === "replay" && !!findSceneObjectByName("ReplayStrip"), 8000)
      await sleep(1000) // the copies slide into the row over 0.9 s

      // ── The strip: copies in the visiting order, left to right ──
      const strip = ui.so("ReplayStrip")
      const toStrip = () => strip.getTransform().getInvertedWorldTransform()
      const ids = REPLAY_ORDER.map((so) => ui.clue(so).info.id)
      const copyName = (i: number) => `StripCopy_${ids[i]}`
      const local = (name: string) => toStrip().multiplyPoint(ui.world(name))
      const xs = ids.map((_id, i) => local(copyName(i)).x)
      ui.log(`copies left to right: ${ids.map((id, i) => `${id} ${xs[i].toFixed(1)}`).join(", ")} (cm along the strip)`)
      for (let i = 1; i < xs.length; i++) if (xs[i] <= xs[i - 1]) problems.push(`${copyName(i)} not right of ${copyName(i - 1)}`)
      for (const n of ["StripFigure", "StripPath"]) if (!ui.isShown(n)) problems.push(`${n} not shown`)
      const glow = (i: number) => {
        const model = ui.child(ui.so(copyName(i)), "Model")
        const g = model ? ui.child(model, "Glow") : null
        return g ? ui.colorOf(g).w : -1
      }

      // Everything drawn in the strip (the AABB corners of each mesh).
      const stripCorners = (): vec3[] => {
        const out: vec3[] = []
        const visit = (o: SceneObject) => {
          const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
          if (v && o.isEnabledInHierarchy) {
            const lo = v.worldAabbMin()
            const hi = v.worldAabbMax()
            for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) out.push(new vec3(x, y, z))
          }
          for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
        }
        visit(strip)
        return out
      }

      // ── Follow the walk ──
      let lastX = -1e9
      let backwards = 0
      let worstFill = 0
      const seen: string[] = []
      let truthAt = -1
      while (true) {
        const s = findSceneObjectByName("ReplayStrip")
        if (ui.isShown("TruthPanel") && truthAt < 0) truthAt = getTime()
        if (truthAt >= 0) {
          if (!s) break
          if (getTime() - truthAt > 1) {
            problems.push("the strip is still there 1 s after the truth shows")
            break
          }
          await nextFrame()
          continue
        }
        if (ui.phase !== "replay") {
          await nextFrame()
          continue
        }
        const fx = local("StripFigure").x
        if (fx < lastX - 0.01) backwards++
        lastX = Math.max(lastX, fx)
        const caption = ui.caption()
        if (caption !== "" && seen[seen.length - 1] !== caption) {
          seen.push(caption)
          const i = seen.length - 1
          const b = ui.basis()
          const pts = stripCorners()
          const fill = ui.fill(pts, b)
          worstFill = Math.max(worstFill, fill)
          const cr = ui.viewRect(ui.drawnCorners("CaptionPanel"), b)
          const sr = ui.viewRect(pts, b)
          if (cr && sr && ui.overlaps(cr, sr)) problems.push(`strip (${ui.rectText(sr)}) overlaps the caption (${ui.rectText(cr)})`)
          // Its copy and the real clue light up together; the small figure stands at the copy.
          let copyPeak = 0
          let realPeak = 0
          const t0 = getTime()
          while (getTime() - t0 < 0.3) {
            copyPeak = Math.max(copyPeak, glow(i))
            realPeak = Math.max(realPeak, ui.glowLevel(REPLAY_ORDER[i]))
            await nextFrame()
          }
          const at = local("StripFigure").x - xs[i]
          ui.log(
            `caption ${i + 1} "${caption}": copy ${ids[i]} glow ${copyPeak.toFixed(2)}, real clue ${realPeak.toFixed(2)}, ` +
              `small figure ${at.toFixed(2)} cm from the copy; strip fill ${fill.toFixed(3)}, strip ${ui.rectText(sr)}, caption ${ui.rectText(cr)}`,
          )
          if (caption !== clueBySo(REPLAY_ORDER[i]).caption) problems.push(`caption ${i + 1} is "${caption}"`)
          if (copyPeak < 0.5) problems.push(`copy ${ids[i]} did not light up with its caption (peak ${copyPeak.toFixed(2)})`)
          if (realPeak < 0.5) problems.push(`real ${REPLAY_ORDER[i]} did not light up with its caption (peak ${realPeak.toFixed(2)})`)
          if (Math.abs(at) > 1) problems.push(`small figure ${at.toFixed(2)} cm from copy ${ids[i]} at its caption`)
          continue
        }
        await nextFrame()
      }
      ui.log(`strip: worst fill ${worstFill.toFixed(3)}, small figure went backwards ${backwards} times, ${seen.length} captions`)
      if (seen.length !== REPLAY_ORDER.length) problems.push(`${seen.length} captions seen (expected ${REPLAY_ORDER.length})`)
      if (worstFill > MAX_FILL) problems.push(`the strip reaches ${worstFill.toFixed(3)} of the view (max ${MAX_FILL})`)
      if (backwards > 0) problems.push(`the small figure moved right to left ${backwards} times`)
    } finally {
      ui.releaseHead()
    }
    expect(problems.length, `replay strip problems: ${problems.join("; ")}`).toBe(0)
  }
}
