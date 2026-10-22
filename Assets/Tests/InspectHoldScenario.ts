import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomLeafInteractor} from "./CaseRoomLeafInteractor"

/**
 * Visual-check helper (not a pass/fail test): Start, open one clue while looking straight ahead, and keep
 * it open for `hold_secs` so the preview can be captured. Parameters: clue (SceneObject name), hold_secs.
 */
@component
export class InspectHoldScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const ui = new CaseRoomLeafInteractor("InspectHold")
    const clue = config?.get("clue") ?? "Clue_Footprints"
    const holdSecs = parseFloat(config?.get("hold_secs") ?? "90")
    await sleep(1500)
    await ui.startGame()
    await ui.inspect(clue)
    ui.log(`${clue} open; holding ${holdSecs} s for a capture`)
    await sleep(holdSecs * 1000)
  }
}
