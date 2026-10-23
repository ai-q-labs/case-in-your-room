import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, CLUES, clueBySo, REPLAY_ORDER, STAND_INS, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * The whole replay can be watched without turning the head, on a model of the room straight ahead
 * (devpost/design-brief.md, "Changes during the build": "Replay on a room model").
 *
 * Nora is accused, and for the whole replay the head is held level, looking straight ahead where the
 * suspects stood (where the player looks when accusing). Measured:
 *  - the model holds the room: the 3 stand-ins, the 5 clues and the player's marker, each where it is in
 *    the real room (in the room's own frame), and keeps the room's directions;
 *  - it is seen from above (MIN_LOOK_DOWN..MAX_LOOK_DOWN degrees between the line of sight and its floor);
 *  - every drawn part stays within MAX_FILL of the view and never overlaps the caption;
 *  - every frame of the walk, the small figure stands where the real one stands (in the room's frame), so it
 *    walks the same path, in the same order, at the same moments; the model's footprints match the real ones;
 *  - at each caption, that clue's copy in the model and the real clue light up together (>= 0.5 within 0.3 s);
 *  - the model is gone within 1 s of the truth showing. The real figure's walk is checked by criterion_5.
 */
const MAX_FILL = 0.86 // the Lens aims at 0.85
const MIN_LOOK_DOWN = 40
const MAX_LOOK_DOWN = 60
const SAME_PLACE_CM = 4 // room cm: one frame of walking (95 cm/s) is about 3 cm
const DEG = Math.PI / 180

@component
export class ReplayModelScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("ReplayModel")
    await sleep(1500)
    await ui.reachSuspects()
    const nora = SUSPECTS[1]
    const lineup = ui.world("SuspectLineup")
    ui.holdHead(ui.lookRot(new vec3(lineup.x - ui.eye.x, 0, lineup.z - ui.eye.z).normalize()))
    const problems: string[] = []
    try {
      await ui.select(nora.so)
      await ui.tap("AccuseButton")
      await ui.waitUntil("the walk starts with the room model ahead", () => ui.phase === "replay" && !!findSceneObjectByName("ReplayModel"), 8000)
      await nextFrame()
      const roomT = ui.so("CrimeScene").getTransform()
      const toRoom = () => roomT.getInvertedWorldTransform()
      const modelRoom = ui.so("ModelRoom")
      const local = (name: string) => ui.so(name).getTransform().getLocalPosition()
      const flat = (v: vec3) => new vec3(v.x, 0, v.z)

      // ── The model holds the room, each thing where it is in the real room ──
      for (const n of STAND_INS) {
        const d = local(`ModelFurniture_${n}`).distance(toRoom().multiplyPoint(ui.world(n)))
        if (d > 0.5) problems.push(`model ${n} ${d.toFixed(1)} cm (room) from where it is in the room`)
      }
      for (const c of CLUES) {
        const id = ui.clue(c.so).info.id
        const d = local(`ModelClue_${id}`).distance(toRoom().multiplyPoint(ui.clue(c.so).restPosition))
        if (d > 0.5) problems.push(`model ${c.so} ${d.toFixed(1)} cm (room) from where it lies`)
      }
      const me = flat(local("ModelPlayer")).distance(flat(toRoom().multiplyPoint(ui.eye)))
      if (me > 1) problems.push(`player's marker ${me.toFixed(1)} cm (room) from where the player stands`)
      for (const n of ["ModelBase", "ModelFigure", "ModelTrail"]) if (!ui.isShown(n)) problems.push(`${n} not shown`)

      // Keeps the room's directions: the model's "ahead" (room +Z, flattened) points the same way as the room's.
      const mt = modelRoom.getTransform()
      const modelZ = flat(mt.getWorldRotation().multiplyVec3(vec3.forward())).normalize()
      const roomZ = flat(roomT.getWorldRotation().multiplyVec3(vec3.forward())).normalize()
      const turn = Math.acos(Math.max(-1, Math.min(1, modelZ.dot(roomZ)))) / DEG
      if (turn > 2) problems.push(`model turned ${turn.toFixed(1)} deg from the room`)
      // Seen from above: the angle between the line of sight to the model's centre and its floor.
      const centre = ui.world("ReplayModel")
      const toCentre = centre.sub(ui.eye).normalize()
      const floorUp = mt.getWorldRotation().multiplyVec3(vec3.up())
      const lookDown = Math.asin(Math.abs(toCentre.dot(floorUp))) / DEG
      ui.log(
        `model: ${centre.distance(ui.eye).toFixed(1)} cm away, scale 1:${(1 / mt.getWorldScale().x).toFixed(1)}, ` +
          `seen ${lookDown.toFixed(1)} deg from above, turned ${turn.toFixed(1)} deg from the room`,
      )
      if (lookDown < MIN_LOOK_DOWN || lookDown > MAX_LOOK_DOWN) problems.push(`model seen ${lookDown.toFixed(1)} deg from above (${MIN_LOOK_DOWN}-${MAX_LOOK_DOWN})`)

      // Everything drawn in the model: each mesh's own box, turned with it.
      const modelCorners = (): vec3[] => {
        const out: vec3[] = []
        const visit = (o: SceneObject) => {
          const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
          if (v && o.isEnabledInHierarchy) {
            const m = o.getTransform().getWorldTransform()
            const lo = v.localAabbMin()
            const hi = v.localAabbMax()
            for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) out.push(m.multiplyPoint(new vec3(x, y, z)))
          }
          for (let i = 0; i < o.getChildrenCount(); i++) visit(o.getChild(i))
        }
        visit(ui.so("ReplayModel"))
        return out
      }
      const copyGlow = (so: string) => {
        const copy = ui.so(`ModelClue_${ui.clue(so).info.id}`)
        const model = ui.child(copy, "Model")
        const g = model ? ui.child(model, "Glow") : null
        return g ? ui.colorOf(g).w : -1
      }

      // ── Follow the walk ──
      let worstFill = 0
      let worstGap = 0
      let frames = 0
      const seen: string[] = []
      let truthAt = -1
      while (true) {
        if (ui.isShown("TruthPanel") && truthAt < 0) {
          truthAt = getTime()
          const real = ui.children("FootprintTrail")
          const mini = ui.children("ModelTrail")
          ui.log(`footprints: ${real.length} in the room, ${mini.length} in the model`)
          if (mini.length !== real.length) problems.push(`${mini.length} footprints in the model, ${real.length} in the room`)
          real.forEach((p, i) => {
            if (!mini[i]) return
            const d = mini[i].getTransform().getLocalPosition().distance(toRoom().multiplyPoint(p.getTransform().getWorldPosition()))
            if (d > 0.5) problems.push(`model footprint ${i} ${d.toFixed(1)} cm (room) from the real one`)
          })
        }
        if (truthAt >= 0) {
          if (!findSceneObjectByName("ReplayModel")) break
          if (getTime() - truthAt > 1) {
            problems.push("the model is still there 1 s after the truth shows")
            break
          }
          await nextFrame()
          continue
        }
        if (ui.phase !== "replay" || !findSceneObjectByName("ReplayModel")) {
          await nextFrame()
          continue
        }
        // The small figure stands where the real one does (in the room's frame).
        const gap = flat(local("ModelFigure")).distance(flat(toRoom().multiplyPoint(ui.world("CulpritFigure"))))
        worstGap = Math.max(worstGap, gap)
        frames++
        const caption = ui.caption()
        if (caption !== "" && seen[seen.length - 1] !== caption) {
          seen.push(caption)
          const i = seen.length - 1
          const b = ui.basis()
          const pts = modelCorners()
          const fill = ui.fill(pts, b)
          worstFill = Math.max(worstFill, fill)
          const mr = ui.viewRect(pts, b)
          const cr = ui.viewRect(ui.drawnCorners("CaptionPanel"), b)
          if (mr && cr && ui.overlaps(mr, cr)) problems.push(`model (${ui.rectText(mr)}) overlaps the caption (${ui.rectText(cr)})`)
          let copyPeak = 0
          let realPeak = 0
          const t0 = getTime()
          while (getTime() - t0 < 0.3) {
            copyPeak = Math.max(copyPeak, copyGlow(REPLAY_ORDER[i]))
            realPeak = Math.max(realPeak, ui.glowLevel(REPLAY_ORDER[i]))
            await nextFrame()
          }
          ui.log(
            `caption ${i + 1} "${caption}": model copy glow ${copyPeak.toFixed(2)}, real clue ${realPeak.toFixed(2)}, ` +
              `small figure ${gap.toFixed(1)} cm (room) from the real one; model fill ${fill.toFixed(3)} at ${ui.rectText(mr)}, caption ${ui.rectText(cr)}`,
          )
          if (caption !== clueBySo(REPLAY_ORDER[i]).caption) problems.push(`caption ${i + 1} is "${caption}"`)
          if (copyPeak < 0.5) problems.push(`model copy of ${REPLAY_ORDER[i]} did not light up with its caption (peak ${copyPeak.toFixed(2)})`)
          if (realPeak < 0.5) problems.push(`real ${REPLAY_ORDER[i]} did not light up with its caption (peak ${realPeak.toFixed(2)})`)
          continue
        }
        await nextFrame()
      }
      ui.log(`model: worst fill ${worstFill.toFixed(3)}; small figure at most ${worstGap.toFixed(1)} cm (room) from the real one over ${frames} frames; ${seen.length} captions`)
      if (seen.length !== REPLAY_ORDER.length) problems.push(`${seen.length} captions seen (expected ${REPLAY_ORDER.length})`)
      if (worstFill > MAX_FILL) problems.push(`the model reaches ${worstFill.toFixed(3)} of the view (max ${MAX_FILL})`)
      if (worstGap > SAME_PLACE_CM) problems.push(`the small figure was ${worstGap.toFixed(1)} cm (room) from the real one`)
      if (frames < 100) problems.push(`only ${frames} frames of the walk were measured`)
    } finally {
      ui.releaseHead()
    }
    expect(problems.length, `replay model problems: ${problems.join("; ")}`).toBe(0)
  }
}
