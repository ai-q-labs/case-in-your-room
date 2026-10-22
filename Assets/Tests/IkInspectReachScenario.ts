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
 * Reachability check for the description buttons: with the memo's description open just above it on the
 * desk (~1.2 m away), an IK body (head aim, shoulder -> elbow -> wrist -> fingers) presses "Flip" and then
 * "Close" the way a real user would. At that distance the press goes by the hand's ray (far field); the
 * route is logged. Setup (Start, pinching the memo) uses the scripted interactor.
 *
 * No fallback: the IK interactor is created without the scripted SIK fallback, and the LeafIndex entry
 * sets __leaf__diagnostic_policy = fail-fast, so an unreachable / out-of-view / non-converging press
 * fails this scenario instead of being completed by simulated input.
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
    await sleep(400)
    const memoT = ui.so("Clue_Memo").getTransform()
    const home = ui.clue("Clue_Memo").restPosition

    // ── Flip, pressed by the IK right hand ──
    const flip = ui.interactable("FlipButton")
    const flipPos = flip.getSceneObject().getTransform().getWorldPosition()
    ui.log(
      `FlipButton ${flipPos.sub(ui.eye).length.toFixed(1)} cm from the eye, ${(ui.eye.y - flipPos.y).toFixed(1)} cm below the eyes; ` +
        `IK route: ${ik.right.isIndirect(flip) ? "far-field ray (indirect)" : "direct reach"}`,
    )
    await tracePress(ui, flip, "IK Flip", ik.trigger(flip, "right"))
    logDiagnostics(ui, "after the IK Flip press")
    await ui.waitUntil("Flip pressed by the IK hand: back text shown", () => ui.text("InspectBackText") !== "", 2000)
    expect(ui.text("InspectBackText").includes("10:40"), `back text after IK Flip: "${ui.text("InspectBackText")}"`).toBe(true)
    expect(ui.clue("Clue_Memo").isFlipped, "memo flipped by the IK press").toBe(true)
    await sleep(800)

    // ── Close, pressed by the IK right hand ──
    const close = ui.interactable("CloseButton")
    ui.log(`CloseButton IK route: ${ik.right.isIndirect(close) ? "far-field ray (indirect)" : "direct reach"}`)
    // Count Flip activations while the hand aims at Close (the two buttons sit side by side, 1.6 cm apart at 50 cm's look).
    let countFlip = false
    let flipDuringClose = 0
    flip.onTriggerEnd.add(() => {
      if (countFlip) flipDuringClose++
    })
    countFlip = true
    await tracePress(ui, close, "IK Close", ik.trigger(close, "right"))
    countFlip = false
    ui.log(`Flip activations while pressing Close: ${flipDuringClose}`)
    logDiagnostics(ui, "after the IK Close press")
    await ui.waitUntil(
      "Close pressed by the IK hand: description closed and counter 1 / 5",
      () => ui.phase === "explore" && ui.counterShown() === counter(1),
      3000,
    )
    ui.near("memo still in its place (cm)", memoT.getWorldPosition().distance(home), 0, 0.5)

    logDiagnostics(ui, "at the end")
    expect(flipDuringClose, "pressing Close must not also press Flip").toBe(0)
  }
}
