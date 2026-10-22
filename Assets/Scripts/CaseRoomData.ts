/**
 * CaseRoomData — the case content for "Case in Your Room" (from devpost/design-brief.md).
 *
 * Owns: every on-screen English string and the case facts (clues, suspects, culprit,
 * replay order). Pure data, no scene access. Strings are dictated by the approved brief,
 * so they are constants here, not Inspector opinions.
 * Must not: touch the scene, hold runtime state.
 */

export type ClueId = "memo" | "footprints" | "clock" | "glass" | "photo"

export interface ClueInfo {
  id: ClueId
  /** Name tag shown when the hand ray hits the clue. */
  name: string
  /** 1-2 line description shown under the clue while inspecting. */
  description: string
  /** Text on the back, or null when the back is empty. */
  backText: string | null
  /** Caption shown when the replay figure reaches this clue. */
  replayCaption: string
  /** Not something you pick up: it stays where it is and its description shows just above it. */
  inPlace?: boolean
}

export interface SuspectInfo {
  name: string
  role: string
  alibi: string
  isCulprit: boolean
}

export const CLUES: Record<ClueId, ClueInfo> = {
  memo: {
    id: "memo",
    name: "Memo",
    description: "\"The study, tonight. We need to talk about the will.\"",
    backText: "10:40",
    replayCaption: "The 10:40 note calling her here. She already knew it was about the will.",
  },
  footprints: {
    id: "footprints",
    name: "Footprints",
    description:
      "Small, narrow prints with a pointed heel, coming in through the kitchen-side door. Not a gardener's boot.",
    backText: null,
    replayCaption: "10:40. Nora comes in through the kitchen-side door.",
    inPlace: true,
  },
  clock: {
    id: "clock",
    name: "Stopped clock",
    description: "Knocked off the wall when he fell. It stopped at 10:45.",
    backText: null,
    replayCaption: "10:45. He falls, and the clock stops.",
  },
  glass: {
    id: "glass",
    name: "Broken glass",
    description: "His glass. It smells of kitchen tea, not his usual brandy.",
    backText: null,
    replayCaption: "She hands him tea from the kitchen in his glass.",
  },
  photo: {
    id: "photo",
    name: "Torn photo",
    description: "A family portrait, torn in half.",
    backText: "...ra, my only heir",
    replayCaption: "He tells her he will change his will, and tears her photo.",
  },
}

/**
 * The order the clues light up after Start. The stopped clock is the one clue in view at Start
 * (straight ahead on the front wall), so it lights up first; the rest are found with the arrow.
 */
export const REVEAL_ORDER: ClueId[] = ["clock", "memo", "footprints", "photo", "glass"]

/** The order the culprit's figure visits the clues during the replay (the night's order). */
export const REPLAY_ORDER: ClueId[] = ["footprints", "memo", "glass", "photo", "clock"]

/** Left-to-right order of the suspect line-up. */
export const SUSPECTS: SuspectInfo[] = [
  {name: "Edgar Hale", role: "Gardener", alibi: "\"I was in the greenhouse until eleven.\"", isCulprit: false},
  {name: "Nora Vale", role: "Niece", alibi: "\"At that time I was in the kitchen.\"", isCulprit: true},
  {name: "Iris Bell", role: "Secretary", alibi: "\"I went to bed at half past ten.\"", isCulprit: false},
]

export const CULPRIT_INDEX = 1

export const TEXT = {
  title: "Case in Your Room",
  opening:
    "Last night, the master of this house was found collapsed in this room. " +
    "Inspect the 5 clues left here, then name the culprit among the 3 suspects.",
  howToPlay: "Aim at a glowing object with the ray from your hand and pinch",
  start: "Start",
  lookAround: "Look around you",
  flip: "Flip",
  putBack: "Put back",
  close: "Close", // not in the brief: the one button under a clue described in place (footprints)
  nothingOnBack: "Nothing on the back.",
  backPrefix: "On the back: ",
  suspectsAppeared: "The suspects have appeared",
  accuse: "Accuse this person",
  wrong: "That doesn't match the clues",
  truth: "Sensing she was about to be cut out of the will, Nora Vale put something in his tea.",
}

export const TOTAL_CLUES = 5

export function counterText(found: number): string {
  return `${found} / ${TOTAL_CLUES}`
}
