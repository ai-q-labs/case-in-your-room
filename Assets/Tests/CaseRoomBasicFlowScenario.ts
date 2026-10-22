import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"

/**
 * Basic-flow check for "Case in Your Room" (build stage 1): drives the whole game once with
 * LEAF's scripted SIK interactor, by SceneObject name, and logs each step.
 * Start -> inspect/flip/put back all 5 clues -> 2 wrong accusations -> replay -> truth.
 * Per-criterion tests come in a later stage; this one proves the flow end to end.
 * Parameter stop_after ("none" | "start" | "inspect_memo" | "suspects" | "select" | "gather") ends the run
 * early and leaves the Lens in that state, for screenshots while building.
 */
@component
export class CaseRoomBasicFlowScenario extends Scenario {
  private interactor: DefaultLeafInteractor

  async run(config?: ScenarioConfig): Promise<void> {
    const stopAfter = config?.get("stop_after") ?? "none"
    this.interactor = new DefaultLeafInteractor()
    await sleep(1500)

    // Opening board
    expect(this.text("BoardTitleText")).toBe("Case in Your Room")
    expect(this.isShown("OpeningBoard")).toBe(true)
    await this.tap("StartButton")
    await sleep(800)
    expect(this.isShown("OpeningBoard")).toBe(false)
    expect(this.text("CounterText")).toBe("0 / 5")
    expect(this.isShown("CounterPanel")).toBe(true)
    expect(this.text("CaptionText")).toBe("Look around you")
    this.log("start ok")
    await sleep(2200) // let all 5 clues light up
    if (stopAfter === "start") return

    const clues: [string, string][] = [
      ["Clue_Memo", "10:40"],
      ["Clue_Footprints", "Nothing on the back."],
      ["Clue_StoppedClock", "Nothing on the back."],
      ["Clue_BrokenGlass", "Nothing on the back."],
      ["Clue_TornPhoto", "...ra, my only heir"],
    ]
    for (let i = 0; i < clues.length; i++) {
      const [name, back] = clues[i]
      await this.tap(name)
      await sleep(900)
      expect(this.isShown("InspectInfo")).toBe(true)
      expect(this.isShown("FlipButton")).toBe(true)
      expect(this.text("InspectDescriptionText").length).toBeGreaterThan(5)
      if (stopAfter === "inspect_memo") return
      await this.tap("FlipButton")
      await sleep(700)
      expect(this.text("InspectBackText").includes(back)).toBe(true)
      await this.tap("PutBackButton")
      await sleep(1000)
      expect(this.text("CounterText")).toBe(`${i + 1} / 5`)
      this.log(`${name} ok -> ${this.text("CounterText")}`)
    }

    // Suspects appear after 5 / 5
    await sleep(1300)
    expect(this.text("CounterText")).toBe("The suspects have appeared")
    expect(this.isShown("SuspectLabel_NoraVale")).toBe(true)
    await sleep(2600)
    expect(this.isShown("CounterPanel")).toBe(false)
    this.log("suspects ok")
    if (stopAfter === "suspects") return

    // Wrong accusation 1
    await this.tap("Suspect_EdgarHale")
    await sleep(500)
    expect(this.text("AlibiText")).toBe("\"I was in the greenhouse until eleven.\"")
    expect(this.isShown("AccuseButton")).toBe(true)
    if (stopAfter === "select") return
    await this.tap("AccuseButton")
    if (stopAfter === "gather") {
      await sleep(300) // return right away; the gather + threads play over the next ~3.5 s
      return
    }
    await sleep(5200)
    expect(this.text("CaptionText")).toBe("That doesn't match the clues")
    this.log("wrong 1 ok")

    // Wrong accusation 2 -> replay with the right culprit
    await this.tap("Suspect_IrisBell")
    await sleep(500)
    expect(this.text("AlibiText")).toBe("\"I went to bed at half past ten.\"")
    await this.tap("AccuseButton")
    await sleep(5200)
    expect(this.text("CaptionText")).toBe("That doesn't match the clues")
    this.log("wrong 2 ok, waiting for replay")

    // Replay: captions in order, then the truth
    const seen: string[] = []
    for (let t = 0; t < 600 && !this.isShown("TruthPanel"); t++) {
      const c = this.isShown("CaptionPanel") ? this.text("CaptionText") : ""
      if (c && seen[seen.length - 1] !== c) {
        seen.push(c)
        this.log(`caption: ${c}`)
      }
      await sleep(100)
    }
    expect(this.isShown("TruthPanel")).toBe(true)
    expect(this.text("TruthText")).toBe(
      "Sensing she was about to be cut out of the will, Nora Vale put something in his tea.",
    )
    expect(seen.indexOf("10:40. Nora comes in through the kitchen-side door.") >= 0).toBe(true)
    expect(seen.indexOf("10:45. He falls, and the clock stops.") >= 0).toBe(true)
    this.log("truth ok")
  }

  private async tap(name: string): Promise<void> {
    const target = findInteractablesByName(name, undefined, true)[0]
    if (!target) throw new Error(`Interactable "${name}" not found or not enabled`)
    await this.interactor.trigger(target)
    await sleep(150)
  }

  private text(name: string): string {
    const so = findSceneObjectByName(name)
    if (!so) throw new Error(`SceneObject "${name}" not found`)
    return (so.getComponent("Component.Text") as Text).text
  }

  private isShown(name: string): boolean {
    const so = findSceneObjectByName(name)
    return !!so && so.isEnabledInHierarchy
  }

  private log(msg: string): void {
    print(`[BasicFlow] ${msg}`)
  }
}
