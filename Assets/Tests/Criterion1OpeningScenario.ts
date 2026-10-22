import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {CaseRoomOpeningBoardUI} from "../Scripts/CaseRoomOpeningBoardUI"
import {BRIEF, CaseRoomLeafInteractor, CLUES, counter} from "./CaseRoomLeafInteractor"

/**
 * Done criterion 1 (devpost/design-brief.md):
 * At launch, a board with the title, the case description and a "Start" button appears straight ahead.
 * Pressing "Start" hides the board, the 5 clues light up one at a time, and "0 / 5" with an arrow
 * appears at the bottom of the view.
 */
@component
export class Criterion1OpeningScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new CaseRoomLeafInteractor("Criterion1")
    await sleep(1500)

    // ── At launch: the board, its texts and the Start button ──
    expect(ui.phase, "phase at launch").toBe("intro")
    expect(ui.isShown("OpeningBoard"), "opening board shown at launch").toBe(true)
    expect(ui.text("BoardTitleText"), "board title").toBe(BRIEF.title)
    expect(ui.text("BoardCaseText"), "board case description").toBe(BRIEF.opening)
    expect(ui.text("BoardHowToText"), "board how-to-play line").toBe(BRIEF.howToPlay)
    expect(ui.isShown("StartButton"), "Start button shown").toBe(true)
    expect(ui.isPinchable("StartButton"), "Start button pinchable").toBe(true)
    expect(ui.text("StartButtonLabel"), "Start button label").toBe(BRIEF.start)

    // Straight ahead: centred in view, about 1.2 m ahead, at eye height, facing the player.
    const board = ui.world("OpeningBoardUI")
    ui.between("board bearing from the view direction (deg)", ui.bearingDeg(board), 0, 2)
    ui.near("board horizontal distance (cm)", ui.horizontalDistance(board, ui.eye), 120, 3)
    ui.near("board height relative to the eyes (cm)", board.y - ui.eye.y, 0, 3)
    expect(ui.inView(board), "board centre in view").toBe(true)
    const bs = ui.screen(board)
    ui.near("board centre screen x", bs.x, 0.5, 0.03)
    ui.near("board centre screen y", bs.y, 0.5, 0.05)
    const boardZ = ui.so("OpeningBoardUI").getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, 1))
    const toEye = ui.eye.sub(board)
    const facing = new vec3(boardZ.x, 0, boardZ.z).normalize().dot(new vec3(toEye.x, 0, toEye.z).normalize())
    expect(facing > 0.99, `board faces the player (cos=${facing.toFixed(4)})`).toBe(true)
    expect(CLUES.every((c) => !ui.isRevealed(c.so)), "no clue visible before Start").toBe(true)
    expect(ui.isShown("CounterPanel"), "counter hidden before Start").toBe(false)
    ui.log(`board ok: bearing=${ui.bearingDeg(board).toFixed(2)} dist=${ui.horizontalDistance(board, ui.eye).toFixed(1)} screen=(${bs.x.toFixed(3)},${bs.y.toFixed(3)})`)

    // ── Press Start; watch the board fade and the clues light up ──
    // Time from the press itself: the scripted tap returns a few frames after Start fires (0.13-0.22 s
    // measured), which made the 0.5 s fade read as 0.28-0.37 s.
    const boardUI = ui.so("OpeningBoardUI").getComponent(CaseRoomOpeningBoardUI.getTypeName()) as CaseRoomOpeningBoardUI
    let pressedAt = -1
    boardUI.onStart.add(() => {
      if (pressedAt < 0) pressedAt = getTime()
    })
    await ui.tap("StartButton")
    expect(pressedAt >= 0, "Start fired").toBe(true)
    const t0 = pressedAt
    const revealAt: number[] = CLUES.map(() => -1)
    const glowPeak: number[] = CLUES.map(() => 0)
    // Brief: "the 5 clues light up one at a time, each with a small sound". The sound itself can't be
    // heard here; the closest observable state is the clue's AudioComponent playing once it is lit.
    const chimes = CLUES.map((c) => ui.so(c.so).getComponent("Component.AudioComponent") as AudioComponent)
    const chimed: boolean[] = CLUES.map(() => false)
    let revealedAtFirstPoll = -1
    let boardHiddenAt = -1
    while (getTime() - t0 < 5) {
      const now = getTime()
      CLUES.forEach((c, i) => {
        if (revealAt[i] < 0 && ui.isRevealed(c.so)) revealAt[i] = now
        if (revealAt[i] >= 0 && now - revealAt[i] <= 0.3) glowPeak[i] = Math.max(glowPeak[i], ui.glowLevel(c.so))
        if (chimes[i] && chimes[i].isPlaying()) chimed[i] = true
      })
      if (revealedAtFirstPoll < 0) revealedAtFirstPoll = revealAt.filter((t) => t >= 0).length
      if (boardHiddenAt < 0 && !ui.isShown("OpeningBoard")) boardHiddenAt = now
      const lastPeakDone = revealAt[CLUES.length - 1] >= 0 && now - revealAt[CLUES.length - 1] > 0.3
      if (boardHiddenAt >= 0 && lastPeakDone) break
      await nextFrame()
    }
    ui.log(
      `reveal times after Start (s): ${revealAt.map((t) => (t < 0 ? "never" : (t - t0).toFixed(2))).join(", ")}; ` +
        `glow peaks: ${glowPeak.map((g) => g.toFixed(2)).join(", ")}; board hidden at ${(boardHiddenAt - t0).toFixed(2)} s`,
    )

    // Start hides the board.
    expect(boardHiddenAt >= 0, "board hidden after Start").toBe(true)
    ui.between("board hide time after Start (s, brief: fades over 0.5 s)", boardHiddenAt - t0, 0.3, 1.0)
    expect(ui.phase, "phase after Start").toBe("explore")

    // The 5 clues light up one at a time.
    expect(revealedAtFirstPoll <= 1, `at most 1 clue lit right after Start (got ${revealedAtFirstPoll})`).toBe(true)
    CLUES.forEach((c, i) => {
      expect(revealAt[i] >= 0, `${c.so} lit up`).toBe(true)
      expect(glowPeak[i] >= 0.6, `${c.so} glow flash when lit (peak ${glowPeak[i].toFixed(2)})`).toBe(true)
      expect(ui.isPinchable(c.so), `${c.so} pinchable`).toBe(true)
      expect(!!chimes[i] && !!chimes[i].audioTrack, `${c.so} has a chime`).toBe(true)
      expect(chimed[i], `${c.so} chime played when lit`).toBe(true)
      if (i > 0) ui.between(`gap between ${CLUES[i - 1].so} and ${c.so} lighting up (s)`, revealAt[i] - revealAt[i - 1], 0.3, 1.0)
    })

    // "0 / 5" with an arrow at the bottom of the view.
    await nextFrame()
    expect(ui.isShown("CounterPanel"), "counter panel shown").toBe(true)
    expect(ui.text("CounterText"), "counter text").toBe(counter(0))
    expect(ui.isShown("DirectionArrow"), "direction arrow shown").toBe(true)
    const cs = ui.screen(ui.world("CounterText"))
    const as = ui.screen(ui.world("DirectionArrow"))
    expect(ui.inView(ui.world("CounterText")), "counter in view").toBe(true)
    expect(ui.inView(ui.world("DirectionArrow")), "arrow in view").toBe(true)
    ui.between("counter screen y (bottom half of the view)", cs.y, 0.5, 1.0)
    ui.between("arrow screen y (bottom half of the view)", as.y, 0.5, 1.0)
    ui.near("arrow sits next to the counter (screen y difference)", as.y - cs.y, 0, 0.05)
    const arrowErr = Math.min(...CLUES.map((c) => ui.arrowErrorDeg(ui.clue(c.so).restPosition)))
    ui.between("arrow points at a clue not yet found (angle error, deg)", arrowErr, 0, 3)
    ui.log(`hud ok: counter screen=(${cs.x.toFixed(3)},${cs.y.toFixed(3)}) arrow screen=(${as.x.toFixed(3)},${as.y.toFixed(3)}) arrowErr=${arrowErr.toFixed(2)}`)
  }
}
