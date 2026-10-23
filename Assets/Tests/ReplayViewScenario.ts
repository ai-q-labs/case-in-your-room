import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor, SUSPECTS} from "./CaseRoomLeafInteractor"

/**
 * Visual-check helper (not a pass/fail test): find all clues, accuse Nora, and end as soon as the replay
 * shows its `captions`-th caption, so the preview can be captured while the replay goes on.
 */
@component
export class ReplayViewScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const ui = new CaseRoomLeafInteractor("ReplayView")
    const want = parseInt(config?.get("captions") ?? "2")
    await sleep(1500)
    await ui.reachSuspects()
    await ui.select(SUSPECTS[1].so)
    await ui.tap("AccuseButton")
    const seen: string[] = []
    await ui.waitUntil(
      `caption ${want} of the replay`,
      () => {
        const c = ui.caption()
        if (ui.phase === "replay" && c !== "" && seen[seen.length - 1] !== c) seen.push(c)
        return seen.length >= want
      },
      60000,
    )
    ui.log(`at caption ${want}: "${seen[seen.length - 1]}"`)
  }
}
