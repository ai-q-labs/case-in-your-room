import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BRIEF, BriefSuspect, CaseRoomLeafInteractor, clueBySo, REPLAY_ORDER, SUSPECTS, unquote} from "./CaseRoomLeafInteractor"

/**
 * Done criterion 4 (devpost/design-brief.md):
 * Pressing a wrong suspect shows their speech bubble and an "Accuse this person" button. Pressing the
 * button breaks the glowing thread, shows "That doesn't match the clues", and lets the player choose
 * again. After 2 wrong accusations, the truth replay starts with the right culprit (Nora Vale).
 */
@component
export class Criterion4WrongAccuseScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("Criterion4")
    await sleep(1500)
    await ui.reachSuspects()
    const edgar = SUSPECTS[0]
    const nora = SUSPECTS[1]
    const iris = SUSPECTS[2]

    // ── Wrong accusation 1: Edgar Hale ──
    await this.selectAndCheck(ui, edgar)
    await this.accuseWrong(ui, edgar)
    // The player can choose again.
    await ui.waitUntil("back to choosing (phase suspects)", () => ui.phase === "suspects", 2000)
    expect(ui.isShown("AccuseButton"), "Accuse button hidden until a suspect is chosen again").toBe(false)
    expect(ui.isShown("AlibiBubble"), "alibi bubble hidden until a suspect is chosen again").toBe(false)
    SUSPECTS.forEach((s) => {
      expect(ui.isPinchable(s.so), `${s.name} pinchable again`).toBe(true)
      expect(ui.suspect(s.so).isSelected, `${s.name} not selected`).toBe(false)
    })
    ui.log("wrong 1 ok, choosing again")

    // ── Wrong accusation 2: Iris Bell (a new choice) ──
    await this.selectAndCheck(ui, iris)
    await this.accuseWrong(ui, iris)
    ui.log("wrong 2 ok, waiting for the replay")

    // ── After 2 wrong accusations the replay starts with the right culprit ──
    await ui.waitUntil(
      "replay threads drawn toward Nora Vale",
      () => ui.suspect(nora.so).isSelected && ui.children("Threads").length === 6,
      6000,
    )
    await sleep(800)
    expect(ui.suspect(edgar.so).isSelected, "Edgar not selected in the replay").toBe(false)
    expect(ui.suspect(iris.so).isSelected, "Iris not selected in the replay").toBe(false)
    const th = ui.children("Threads")
    const gap = ui.threadEnd(th[5]).distance(ui.world(nora.so))
    ui.between("replay thread reaches Nora Vale (gap, cm)", gap, 0, 12)
    await ui.waitUntil("culprit figure appears (phase replay)", () => ui.so("CulpritFigure").enabled && ui.phase === "replay", 6000)
    const fig = ui.world("CulpritFigure")
    const floorY = ui.world("CrimeScene").y
    ui.near("figure starts where Nora Vale stood (horizontal cm)", ui.horizontalDistance(fig, ui.world(nora.so)), 0, 1)
    ui.near("figure starts on the floor (cm)", fig.y - floorY, 0, 1)
    let first = ""
    await ui.waitUntil(
      "first replay caption",
      () => {
        first = ui.caption()
        return first !== ""
      },
      10000,
    )
    expect(first, "first replay caption (the culprit's first stop)").toBe(clueBySo(REPLAY_ORDER[0]).caption)
    expect(first.includes(nora.name.split(" ")[0]), "the replay names Nora").toBe(true)
    ui.log(`replay started with Nora Vale: "${first}"`)
  }

  /** Pinch a suspect: alibi bubble above them and the Accuse button at their feet. */
  private async selectAndCheck(ui: CaseRoomLeafInteractor, s: BriefSuspect): Promise<void> {
    await ui.select(s.so)
    expect(unquote(ui.text("AlibiText")), `${s.name} alibi (brief text)`).toBe(s.alibi)
    expect(ui.text("AccuseButtonLabel"), "Accuse button label").toBe(BRIEF.accuse)
    expect(ui.isPinchable("AccuseButton"), "Accuse button pinchable").toBe(true)
    SUSPECTS.forEach((k) => expect(ui.suspect(k.so).isSelected, `${k.name} selected?`).toBe(k.so === s.so))
    const inv = ui.so("SuspectLineup").getTransform().getInvertedWorldTransform()
    const local = SUSPECTS.map((k) => inv.multiplyPoint(ui.world(k.so)))
    const idx = SUSPECTS.indexOf(s)
    const bubble = inv.multiplyPoint(ui.world("AlibiBubble"))
    const button = inv.multiplyPoint(ui.world("AccusePanel"))
    let nearest = 0
    local.forEach((p, i) => {
      if (Math.abs(p.x - bubble.x) < Math.abs(local[nearest].x - bubble.x)) nearest = i
    })
    expect(nearest, `speech bubble sits over ${s.name}`).toBe(idx)
    expect(bubble.y > local[idx].y, `speech bubble above ${s.name}`).toBe(true)
    ui.near(`Accuse button under ${s.name} (x, cm)`, button.x - local[idx].x, 0, 0.5)
    expect(button.y < local[idx].y - 35, `Accuse button at ${s.name}'s feet`).toBe(true)
    expect(ui.inView(ui.world("AlibiBubble")), "speech bubble in view").toBe(true)
    expect(ui.inView(ui.world("AccusePanel")), "Accuse button in view").toBe(true)
  }

  /** Press Accuse on a wrong suspect: the thread stops short, fades, and the wrong caption shows. */
  private async accuseWrong(ui: CaseRoomLeafInteractor, s: BriefSuspect): Promise<void> {
    await ui.tap("AccuseButton")
    expect(ui.phase, "phase while accusing").toBe("accusing")
    const th = await ui.waitForThreads()
    const target = ui.world(s.so)
    const converge = th[5].getTransform().getWorldPosition()
    th.slice(0, 5).forEach((t, i) =>
      ui.near(`clue thread ${i} ends at the convergence point (cm)`, ui.threadEnd(t).distance(converge), 0, 1),
    )
    const end = ui.threadEnd(th[5])
    const align = end.sub(converge).normalize().dot(target.sub(converge).normalize())
    expect(align > 0.999, `last thread heads for ${s.name} (cos=${align.toFixed(5)})`).toBe(true)
    const gap = end.distance(target)
    ui.between(`thread breaks off just before ${s.name} (gap, cm)`, gap, 15, 60)
    await ui.waitUntil(`caption "${BRIEF.wrong}"`, () => ui.caption() === BRIEF.wrong, 6000)
    expect(ui.children("Threads").length, "broken thread faded out and removed").toBe(0)
    ui.log(`accused ${s.name}: thread stopped ${gap.toFixed(1)} cm short, caption "${ui.caption()}"`)
  }
}
