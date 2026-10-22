import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {SmokeLeafScenario} from "./SmokeLeafScenario"
import {CaseRoomBasicFlowScenario} from "./CaseRoomBasicFlowScenario"
import {Criterion1OpeningScenario} from "./Criterion1OpeningScenario"
import {Criterion2MemoScenario} from "./Criterion2MemoScenario"
import {Criterion3SuspectsScenario} from "./Criterion3SuspectsScenario"

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
    {
      id: "criterion_1",
      typename: Criterion1OpeningScenario.getTypeName(),
    },
    {
      id: "criterion_2",
      typename: Criterion2MemoScenario.getTypeName(),
    },
    {
      id: "criterion_3",
      typename: Criterion3SuspectsScenario.getTypeName(),
    },
  ]
}
