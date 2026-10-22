import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BRIEF, CaseRoomLeafInteractor, clueBySo, CLUES, REPLAY_ORDER, SUSPECTS, unquote} from "./CaseRoomLeafInteractor"

interface Stop {
  caption: string
  figure: vec3
  /** Lens time the caption first showed. */
  t: number
  /** Peak glow of each clue within 0.3 s of the caption (the halo updates on the frame after the flash). */
  glow: number[]
}

/**
 * Done criterion 5 (devpost/design-brief.md), first-try path:
 * Accusing the right suspect makes the clues glow, float up and gather straight ahead. Then the
 * person's translucent figure visits the clue locations in order, with glowing footprints and
 * captions. When the figure comes back to the front, the one-sentence truth appears above it.
 */
@component
export class Criterion5RightAccuseScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("Criterion5")
    await sleep(1500)
    await ui.reachSuspects()
    const nora = SUSPECTS[1]
    const rest = CLUES.map((c) => ui.clue(c.so).restPosition)
    const eyeY = ui.eye.y
    CLUES.forEach((c) => ui.near(`${c.so} not glowing before the accusation`, ui.glowLevel(c.so), 0, 0.02))

    // ── Accuse Nora Vale on the first try ──
    await ui.select(nora.so)
    expect(unquote(ui.text("AlibiText")), "Nora's alibi").toBe(nora.alibi)
    await ui.tap("AccuseButton")
    expect(ui.phase, "phase after accusing").toBe("accusing")

    // The clues glow...
    await ui.waitUntil("all 5 clues glow", () => CLUES.every((c) => ui.glowLevel(c.so) >= 0.6), 500)
    ui.log(`glow levels right after Accuse: ${CLUES.map((c) => ui.glowLevel(c.so).toFixed(2)).join(", ")}`)

    // ...float up and gather straight ahead (the move takes 1.3 s).
    await sleep(1450)
    const eye = ui.eye
    const gathered = CLUES.map((c) => ui.world(c.so))
    let cx = 0
    let cy = 0
    let cz = 0
    gathered.forEach((p, i) => {
      const so = CLUES[i].so
      expect(ui.inView(p), `${so} gathered in view`).toBe(true)
      ui.between(`${so} gathered height above the eyes (cm)`, p.y - eye.y, 5, 30)
      ui.between(`${so} gathered horizontal distance (cm)`, ui.horizontalDistance(p, eye), 100, 130)
      if (rest[i].y < eyeY) expect(p.y - rest[i].y > 10, `${so} floated up from ${rest[i].y.toFixed(0)} to ${p.y.toFixed(0)}`).toBe(true)
      ui.near(`${so} at the same height as the first gathered clue (cm)`, p.y - gathered[0].y, 0, 1)
      for (let j = 0; j < i; j++) {
        expect(p.distance(gathered[j]) >= 10, `${so} and ${CLUES[j].so} gathered apart (${p.distance(gathered[j]).toFixed(1)} cm)`).toBe(true)
      }
      cx += p.x / gathered.length
      cy += p.y / gathered.length
      cz += p.z / gathered.length
    })
    const centroid = new vec3(cx, cy, cz)
    ui.between("gathered clues centred straight ahead (bearing, deg)", ui.bearingDeg(centroid), 0, 2)
    ui.log(`gathered: centroid bearing ${ui.bearingDeg(centroid).toFixed(2)} deg, ${ui.horizontalDistance(centroid, eye).toFixed(1)} cm ahead, ${(cy - eye.y).toFixed(1)} cm above the eyes`)

    // Glowing threads join them and converge on Nora.
    const th = await ui.waitForThreads()
    th.slice(0, 5).forEach((t, i) =>
      ui.near(`thread ${i} starts at gathered ${CLUES[i].so} (cm)`, t.getTransform().getWorldPosition().distance(gathered[i]), 0, 1.5),
    )
    const gap = ui.threadEnd(th[5]).distance(ui.world(nora.so))
    ui.between("last thread reaches Nora Vale (gap, cm)", gap, 0, 12)

    // ── The translucent figure walks ──
    await ui.waitUntil("culprit figure appears (phase replay)", () => ui.so("CulpritFigure").enabled && ui.phase === "replay", 6000)
    const tWalk = getTime()
    const startFig = ui.world("CulpritFigure")
    const floorY = ui.world("CrimeScene").y
    ui.near("figure starts where Nora Vale stood (horizontal cm)", ui.horizontalDistance(startFig, ui.world(nora.so)), 0, 1)
    await ui.waitUntil(
      "gathered clues flew back to their places",
      () => CLUES.every((c, i) => ui.world(c.so).distance(rest[i]) < 0.5),
      2500,
    )
    await sleep(300)
    const body = ui.child(ui.so("CulpritFigure"), "Body")
    expect(!!body, "figure body").toBe(true)
    const bodyMat = (body.getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial
    expect(bodyMat.mainPass.blendMode === BlendMode.Add, "figure drawn additive (see-through)").toBe(true)
    ui.between("figure opacity (translucent)", bodyMat.mainPass.baseColor.w, 0.2, 0.8)

    // Follow the walk: record each caption with where the figure is.
    const stops: Stop[] = []
    await ui.waitUntil(
      "truth panel after the walk",
      () => {
        const c = ui.caption()
        const now = getTime()
        if (c !== "" && (stops.length === 0 || stops[stops.length - 1].caption !== c)) {
          stops.push({caption: c, figure: ui.world("CulpritFigure"), t: now, glow: CLUES.map(() => 0)})
          ui.log(`caption ${stops.length}: "${c}"`)
        }
        const last = stops[stops.length - 1]
        if (last && now - last.t <= 0.3) last.glow = last.glow.map((g, k) => Math.max(g, ui.glowLevel(CLUES[k].so)))
        return ui.isShown("TruthPanel")
      },
      90000,
    )
    const replaySec = getTime() - tWalk
    ui.log(`walk + truth took ${replaySec.toFixed(1)} s`)

    // Visits the clue locations in the brief's order, each clue glowing as the figure arrives.
    expect(stops.map((s) => s.caption).join(" | "), "captions in the brief's replay order").toBe(
      REPLAY_ORDER.map((so) => clueBySo(so).caption).join(" | "),
    )
    stops.forEach((s, i) => {
      const so = REPLAY_ORDER[i]
      const idx = CLUES.indexOf(clueBySo(so))
      let nearest = 0
      CLUES.forEach((_c, k) => {
        if (ui.horizontalDistance(s.figure, rest[k]) < ui.horizontalDistance(s.figure, rest[nearest])) nearest = k
      })
      ui.log(`stop ${i + 1} ${so}: figure ${ui.horizontalDistance(s.figure, rest[idx]).toFixed(1)} cm from it, its glow peak ${s.glow[idx].toFixed(2)}`)
      expect(CLUES[nearest].so, `figure is at ${so} when its caption shows`).toBe(so)
      ui.between(`figure distance to ${so} (horizontal cm)`, ui.horizontalDistance(s.figure, rest[idx]), 0, 50)
      expect(s.glow[idx] >= 0.5, `${so} glows as the figure arrives (peak ${s.glow[idx].toFixed(2)} within 0.3 s)`).toBe(true)
    })

    // Glowing footprints on the floor.
    const prints = ui.children("FootprintTrail")
    expect(prints.length >= 10, `footprints left on the floor (${prints.length})`).toBe(true)
    prints.forEach((p, i) => {
      ui.near(`footprint ${i} on the floor (cm above floor)`, p.getTransform().getWorldPosition().y - floorY, 0.6, 1)
      const m = (p.getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial
      expect(m.mainPass.blendMode === BlendMode.Add && m.mainPass.baseColor.w >= 0.5, `footprint ${i} glows`).toBe(true)
    })

    // Back at the front, the truth above it.
    expect(ui.phase, "phase at the end").toBe("ended")
    const fig = ui.world("CulpritFigure")
    ui.near("figure came back to where Nora Vale stood (horizontal cm)", ui.horizontalDistance(fig, ui.world(nora.so)), 0, 1)
    ui.between("figure back at the front (bearing, deg)", ui.bearingDeg(fig), 0, 3)
    expect(ui.caption(), "captions hidden for the truth").toBe("")
    expect(ui.text("TruthText"), "truth sentence").toBe(BRIEF.truth)
    const truth = ui.world("TruthPanelUI")
    const figTop = fig.add(new vec3(0, 168, 0))
    ui.near("truth in the figure's direction (bearing difference, deg)", ui.signedBearingDeg(truth) - ui.signedBearingDeg(fig), 0, 2)
    ui.near("truth about 1.5 m in front (horizontal cm)", ui.horizontalDistance(truth, ui.eye), 150, 3)
    ui.between("truth a little above eye height (cm)", truth.y - ui.eye.y, 0, 40)
    expect(ui.inView(truth), "truth panel centre in view").toBe(true)
    expect(ui.screen(truth).y < ui.screen(figTop).y, "truth appears above the figure (screen)").toBe(true)
    ui.log(`truth ok: ${prints.length} footprints, truth screen y ${ui.screen(truth).y.toFixed(3)} vs figure top ${ui.screen(figTop).y.toFixed(3)}`)
  }
}
