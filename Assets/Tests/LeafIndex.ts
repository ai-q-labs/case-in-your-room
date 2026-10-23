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
import {StartLayoutScenario} from "./StartLayoutScenario"
import {InspectFitScenario} from "./InspectFitScenario"
import {InspectHoldScenario} from "./InspectHoldScenario"
import {ArrowDirectionsScenario} from "./ArrowDirectionsScenario"
import {SwitchClueScenario} from "./SwitchClueScenario"
import {InspectViewsScenario} from "./InspectViewsScenario"
import {LineupFitScenario} from "./LineupFitScenario"
import {ReplayModelScenario} from "./ReplayModelScenario"
import {LineupFacingScenario} from "./LineupFacingScenario"
import {ReplayViewScenario} from "./ReplayViewScenario"
import {DemoPlaythroughScenario} from "./DemoPlaythroughScenario"

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
    {
      id: "start_layout",
      typename: StartLayoutScenario.getTypeName(),
    },
    {
      id: "inspect_fit",
      typename: InspectFitScenario.getTypeName(),
    },
    {
      id: "arrow_directions",
      typename: ArrowDirectionsScenario.getTypeName(),
    },
    {
      id: "switch_clue",
      typename: SwitchClueScenario.getTypeName(),
    },
    {
      id: "inspect_views",
      typename: InspectViewsScenario.getTypeName(),
    },
    {
      id: "lineup_fit",
      typename: LineupFitScenario.getTypeName(),
    },
    {
      id: "lineup_facing",
      typename: LineupFacingScenario.getTypeName(),
    },
    {
      id: "replay_model",
      typename: ReplayModelScenario.getTypeName(),
    },
    {
      id: "inspect_hold",
      typename: InspectHoldScenario.getTypeName(),
      // Visual-check helper, not a pass/fail test: opens one clue and keeps it open for a capture.
      parameters: {clue: "Clue_Footprints", hold_secs: "90"},
    },
    {
      id: "replay_view",
      typename: ReplayViewScenario.getTypeName(),
      // Visual-check helper, not a pass/fail test: ends at the given caption while the replay goes on.
      parameters: {captions: "2"},
    },
    {
      id: "demo_playthrough",
      typename: DemoPlaythroughScenario.getTypeName(),
      // Video helper, not a pass/fail test: plays the whole game at a viewer's pace for the demo recording.
      // Log level ERROR keeps LEAF's on-screen log strip out of the recording.
      parameters: {start: "hand", pace: "1", __leaf__log_level: "ERROR"},
    },
  ]
}
