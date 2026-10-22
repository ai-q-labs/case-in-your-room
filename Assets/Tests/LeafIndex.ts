import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {SmokeLeafScenario} from "./SmokeLeafScenario"
import {CaseRoomBasicFlowScenario} from "./CaseRoomBasicFlowScenario"
import {Criterion1OpeningScenario} from "./Criterion1OpeningScenario"
import {Criterion2MemoScenario} from "./Criterion2MemoScenario"
import {Criterion3SuspectsScenario} from "./Criterion3SuspectsScenario"
import {Criterion4WrongAccuseScenario} from "./Criterion4WrongAccuseScenario"
import {Criterion5RightAccuseScenario} from "./Criterion5RightAccuseScenario"
import {IkInspectReachScenario} from "./IkInspectReachScenario"
import {SuspectHitboxScenario} from "./SuspectHitboxScenario"

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
    {
      id: "criterion_4",
      typename: Criterion4WrongAccuseScenario.getTypeName(),
    },
    {
      id: "criterion_5",
      typename: Criterion5RightAccuseScenario.getTypeName(),
    },
    {
      id: "ik_inspect_reach",
      typename: IkInspectReachScenario.getTypeName(),
      // An unreachable / out-of-view IK press fails at the call site instead of being simulated.
      parameters: {__leaf__diagnostic_policy: "fail-fast"},
    },
    {
      id: "suspect_hitbox",
      typename: SuspectHitboxScenario.getTypeName(),
    },
  ]
}
