import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"

// Smoke test: proves LEAF runs in this project before the Lens itself is built.
@component
export class SmokeLeafScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(500)

    const camera = findSceneObjectByName("Camera Object")
    expect(camera).toBeTruthy()
    expect(camera.enabled).toBe(true)

    const sik = findSceneObjectByName("SpectaclesInteractionKit")
    expect(sik).toBeTruthy()
    expect(sik.enabled).toBe(true)
  }
}
