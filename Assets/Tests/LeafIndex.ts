import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {SmokeLeafScenario} from "./SmokeLeafScenario"
import {CaseRoomBasicFlowScenario} from "./CaseRoomBasicFlowScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {
      id: "smoke",
      typename: SmokeLeafScenario.getTypeName(),
    },
    {
      id: "basic_flow",
      typename: CaseRoomBasicFlowScenario.getTypeName(),
      parameters: {stop_after: "none"},
    },
  ]
}
