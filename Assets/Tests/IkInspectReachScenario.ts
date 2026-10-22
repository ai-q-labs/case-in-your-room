import {DiagnosticRecorder} from "Leaf.lspkg/Diagnostic/DiagnosticRecorder"
import {createIKInteractor} from "Leaf.lspkg/Interactors/interactor/ik/visualizer/BitmojiAvatar"
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {CaseRoomLeafInteractor, counter} from "./CaseRoomLeafInteractor"

/** Log every IK diagnostic recorded so far (the manager only prints its report when a run finishes cleanly). */
function logDiagnostics(ui: CaseRoomLeafInteractor, stage: string): void {
  const entries = DiagnosticRecorder.getInstance().getAll()
  ui.log(`IK diagnostics ${stage}: ${entries.length}`)
  entries.forEach((e) =>
    ui.log(`  [${e.timestamp.toFixed(2)}s] ${e.diagnostic.severity} ${e.diagnostic.category}: ${e.diagnostic.message}`),
  )
}

/**
 * Run an IK press and, every frame while it runs, record how close the right index fingertip gets to the
 * button and whether SIK ever reports the button as hovered. Evidence only; asserts nothing.
 */
async function tracePress(ui: CaseRoomLeafInteractor, target: Interactable, label: string, press: Promise<void>): Promise<void> {
  let done = false
  let failure: unknown = null
  press.then(
    () => (done = true),
    (e) => {
      failure = e
      done = true
    },
  )
  const hand = SIK.HandInputData.getHand("right")
  const center = target.getSceneObject().getTransform().getWorldPosition()
  let minTip = 1e9
  let hovered = false
  let tracked = false
  let frames = 0
  const t0 = getTime()
  while (!done) {
    const tip = hand.indexTip ? hand.indexTip.position : null
    if (tip) minTip = Math.min(minTip, tip.distance(center))
    if (target.hoveringInteractor !== 0) hovered = true
    if (hand.isTracked()) tracked = true
    frames++
    await nextFrame()
  }
  ui.log(
    `${label}: press took ${(getTime() - t0).toFixed(2)} s over ${frames} frames; IK hand tracked: ${tracked}; ` +
      `closest right index fingertip ${minTip.toFixed(1)} cm from the button centre; SIK hover on the button: ${hovered}`,
  )
  if (failure) throw failure
}

/**
 * Reachability check for the inspect panel: with the memo held ~50 cm in front, an IK arm (shoulder ->
 * elbow -> wrist -> fingers, head tracking) presses "Flip" and then "Put back" the way a real user would.
 * Setup (Start, pinching the memo from across the room) uses the scripted interactor.
 *
 * No fallback: the IK interactor is created without the scripted SIK fallback, and the LeafIndex entry
 * sets __leaf__diagnostic_policy = fail-fast, so an unreachable / out-of-view / non-converging press
 * fails this scenario instead of being completed by simulated input. A far-field (ray) route is
 * asserted against explicitly, because these buttons are meant to be within arm's reach.
 */
@component
export class IkInspectReachScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("IkReach")
    const ik = createIKInteractor({body: {fallback: undefined}})
    await sleep(1500)
    const settled = await Promise.race([ik.ready.then(() => true), sleep(15000).then(() => false)])
    ui.log(`IK avatar load ${settled ? "settled" : "still pending after 15 s (continuing with bare IK hands)"}`)
    ui.log(`diagnostic policy: ${DiagnosticRecorder.getInstance().policy}`)

    await ui.startGame()
    await ui.inspect("Clue_Memo")
    const memoT = ui.so("Clue_Memo").getTransform()
    const home = ui.clue("Clue_Memo").restPosition

    // ── Flip, pressed by the IK right hand ──
    const flip = ui.interactable("FlipButton")
    const flipPos = flip.getSceneObject().getTransform().getWorldPosition()
    const flipFar = ik.right.isIndirect(flip)
    ui.log(
      `FlipButton ${flipPos.sub(ui.eye).dot(ui.look).toFixed(1)} cm ahead, ${(ui.eye.y - flipPos.y).toFixed(1)} cm below the eyes; ` +
        `IK route: ${flipFar ? "far-field ray (indirect)" : "direct reach"}`,
    )
    const cols = flip.colliders
    ui.log(
      `FlipButton colliders: ${cols.length}; ` +
        cols
          .map((c) => {
            const s = c.shape as BoxShape
            const sz = s && s.size ? s.size : null
            return `${c.getSceneObject().name} enabled=${c.enabled} box=${sz ? `${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)}` : "n/a"} worldScale=${c.getTransform().getWorldScale().x.toFixed(2)}`
          })
          .join("; "),
    )
    const plate = ui.so("InspectButtons").getComponent(Interactable.getTypeName()) as Interactable
    ui.log(`targetingPriority: FlipButton=${flip.targetingPriority}, InspectButtons plate=${plate ? plate.targetingPriority : "no interactable"}`)
    expect(flipFar, "Flip reachable directly by the right arm (not routed far-field)").toBe(false)
    await tracePress(ui, flip, "IK Flip", ik.trigger(flip, "right"))
    logDiagnostics(ui, "after the IK Flip press")
    await ui.waitUntil("Flip pressed by the IK hand: back text shown", () => ui.text("InspectBackText") !== "", 2000)
    expect(ui.text("InspectBackText").includes("10:40"), `back text after IK Flip: "${ui.text("InspectBackText")}"`).toBe(true)
    expect(ui.clue("Clue_Memo").isFlipped, "memo flipped by the IK press").toBe(true)
    await sleep(800)

    // ── Put back, pressed by the IK right hand ──
    const putBack = ui.interactable("PutBackButton")
    const putFar = ik.right.isIndirect(putBack)
    ui.log(`PutBackButton IK route: ${putFar ? "far-field ray (indirect)" : "direct reach"}`)
    expect(putFar, "Put back reachable directly by the right arm (not routed far-field)").toBe(false)
    // Count Flip activations while the hand reaches for Put back (the buttons are stacked 0.8 cm apart).
    let countFlip = false
    let flipDuringPutBack = 0
    flip.onTriggerEnd.add(() => {
      if (countFlip) flipDuringPutBack++
    })
    countFlip = true
    await tracePress(ui, putBack, "IK Put back", ik.trigger(putBack, "right"))
    countFlip = false
    ui.log(`Flip activations while pressing Put back: ${flipDuringPutBack}`)
    logDiagnostics(ui, "after the IK Put back press")
    await ui.waitUntil(
      "Put back pressed by the IK hand: memo home and counter 1 / 5",
      () => ui.phase === "explore" && ui.counterShown() === counter(1),
      3000,
    )
    ui.near("memo back at its place (cm)", memoT.getWorldPosition().distance(home), 0, 0.5)

    logDiagnostics(ui, "at the end")
    expect(flipDuringPutBack, "reaching for Put back must not also press Flip").toBe(0)
  }
}
