---
status: approved
---

# Design brief: Case in Your Room (working title, default)

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

A one-player murder mystery for glasses. A crime scene is laid over the player's room. The player walks around, finds and inspects 4 to 5 clues, then names the culprit among 3 suspects. A correct answer shows the truth. Play time is 2 to 3 minutes. For people who like murder mysteries and puzzle games. The case is newly written and uses no real people's names, company names or trademarks. The whole game, start to ending, must fit in a demo video under 3 minutes.

## The one spatial moment
Right after the player names a suspect. The player stands in the middle of the room and has just pinched one suspect. The clues they inspected around the room (the memo on the desk, the footprints on the floor, the clock and so on) glow and float up, get joined by glowing threads, and converge in one line on the translucent figure of the person they named. If the answer is right, that person's movements through the room on the night of the crime are replayed in order, with translucent footprints and short captions, and finally the one-sentence truth appears in front of the player. "The clues I walked around to collect connect into one answer, inside my own room."

## Why it belongs on glasses
- Uses: draws in the world (the crime scene sits around the player at real scale) and leaves your body free (walk, turn around, look down and up to find clues).
- Why it's better than the phone or laptop version: on a screen the scene stays behind a small window. Here the clues sit at real places around the player, finding them means physically turning, looking down and looking up, and the culprit's path is replayed through the player's own space.

## Product or overlay
- Type: product: the virtual crime scene is the experience.
- What the real version would sense: the floor and desk surfaces of the room ("if a floor or desk surface is found, place things to match it").
- Stand-in for the preview: no surface detection. Everything is placed at fixed positions relative to where the player stands when the game starts. The Lens brings its own real-size virtual desk (top at 75 cm), chair (seat at 45 cm) and a wall section for the clock, so clues sit on something (default).

## Where things live
- Layout: centered on the player's position at start, laid out in a circle around them. The room's shape is unknown.
- Every object is sized to be "hard to find without looking around, but fully visible at a glance once found", because the view of the glasses is narrow.
- Where the user is looking during the main task: around the room on a ring 1 to 2 m away, turning, looking down and looking up; then straight ahead at the suspects.
- Clue 1, Memo: front-right, about 1.2 m away, desk height (about 75 cm from the floor), postcard size (about 15 cm).
- Clue 2, Footprints: front-left, about 1.5 m away, on the floor, a row of 3 shoeprints (about 90 cm long in total). Found by looking down.
- Clue 3, Stopped clock: directly behind, about 2 m away, on a wall at eye height (about 160 cm), about 30 cm across. Found by turning around.
- Clue 4, Broken glass: back-left, about 1.2 m away, on a chair seat (about 45 cm high), about 15 cm.
- Clue 5, Torn photo: back-right, about 1.5 m away, a little above head height (about 190 cm), about 25 cm. Found by looking up.
- Pinch target for each clue is larger than it looks (about 30 cm across).
- Inspected clue: comes to the player's hands, about 50 cm in front at chest height, at 2x size, with 1 to 2 lines of description below it and 2 buttons beside it.
- Opening board: straight ahead, about 1.2 m away, at eye height, about 60 cm wide. Same look as the truth panel.
- Counter ("0 / 5") and direction arrow: just below the line of sight, about 1 m away, text about 3 cm tall. The arrow sits right next to the counter and points to clues not yet found. Follows the head slowly (lazy follow); never locked to the head.
- Suspects (3): appear straight ahead of wherever the player is facing at that moment, about 2 m away, in a row at eye height. Translucent figures from the chest up, about 70 cm tall and about 35 cm wide (slimmer than real shoulders so neighbors don't overlap). Spacing about 45 cm center to center so all 3 are in view at once (the learner first said 70 cm, but at 2 m the usable width is about 1.4 m, and the learner's goal is that all 3 fit in view). Each figure's pinch target is at most 40 cm wide and the 3 targets never overlap, so the player can't press the wrong person. Each has a name and a one-word role at their feet.
- Truth sentence: above the named suspect, about 1.5 m in front, a little above eye height, on a panel about 60 cm wide.
- Replay captions: a little below the line of sight, about 1.2 m away, slowly following the direction of the face.

## Hands and input
- No gaze (head direction), no long press, no wrist rotation, no drag and no slider. Everything is "pinch to press" and buttons.
- Aim at a clue: when the hand ray hits it, its glow gets stronger and a name tag appears ("Memo", "Stopped clock" and so on), using the button's hovered look. If that isn't available, show the tag when the player is within 1.5 m.
- Pinch a clue (with the hand ray from far away, or directly when within reach): the clue comes to the player's hands at 2x size with 1 to 2 lines of description and 2 buttons.
  - "Flip" button: the clue spins around to show its back. Only 2 clues have something on the back (memo: a time; photo: part of a name). The others show "Nothing on the back."
  - "Put back" button: the clue returns to its place and changes to the "inspected" color. The counter goes up by 1.
- Pinch a suspect (each target at most 40 cm wide, no overlap with neighbors): their outline glows, a speech bubble shows their one-line alibi, and an "Accuse this person" button appears at their feet. Pinching another suspect switches to them (this replaces cancel).
- "Accuse this person" button: confirms the accusation.
- Targets are big and highlight when aimed at.
- Voice (if any) and the button that does the same job: none.

## When things show
- Opening board: shown at launch and stays until "Start" is pressed (never hidden on a timer). Fades out over 0.5 s when "Start" is pressed. Contents, top to bottom: title; 2 to 3 lines about the case; 1 line on how to play ("Aim at a glowing object with the ray from your hand and pinch") with a small pinching-hand icon; "Start" button.
- Right after "Start": the 5 clues light up one at a time, each with a small sound, so the player learns there are clues all around. At the same time a caption "Look around you" shows just below the line of sight for 3 s, then hides.
- Clues not yet found: glow faintly.
- Counter: appears as "0 / 5" right after "Start". Goes up by 1 each time a clue is put back, and grows and glows once at that moment. At "5 / 5" it changes to "The suspects have appeared". It hides together with the arrow once the 3 suspects appear. Not shown during the replay.
- Suspects: appear only after all 5 clues have been inspected and put back.
- Wrong accusation: the glowing thread breaks off just before the person and fades, the caption "That doesn't match the clues" appears, and the player can choose again. After 2 wrong accusations, the replay plays with the right culprit and the game ends (keeps play time at 2 to 3 minutes).
- Right accusation, the replay (about 30 s in total; the player only watches):
  1. The player is looking at the named person straight ahead. The clues from around the room glow, float up and gather in front of the player, so all of them are in view without turning the head. Glowing threads join them and converge on the named person.
  2. The person's translucent figure starts walking. At that moment the gathered clues fly back to their original places. The figure visits the clue locations in the order of that night, and each clue glows when the figure arrives at it (the figure never walks to an empty spot). The player turns their whole body to follow. Glowing footprints stay on the floor, so the figure can be found again if lost.
  3. Captions show a little below the line of sight, about 1.2 m away, slowly following the face.
  4. When the figure comes back to the front, the one-sentence truth appears above it.
- If something needs attention out of view: the arrow next to the counter, plus the small sound when each clue lights up at the start.

## Case content (default story outline, approved by the learner with their corrections)
Newly written. No real people, companies, places or trademarks.

- Opening text: "Last night, the master of this house was found collapsed in this room. Inspect the 5 clues left here, then name the culprit among the 3 suspects."
- Suspects (name / role / alibi):
  - Edgar Hale / Gardener / "I was in the greenhouse until eleven."
  - Nora Vale / Niece / "At that time I was in the kitchen."
  - Iris Bell / Secretary / "I went to bed at half past ten."
- Culprit: Nora Vale.
- Clues (front / back):
  1. Memo: a summons the master wrote to Nora (the note itself doesn't name her). Front: "The study, tonight. We need to talk about the will." / back: "10:40". Reading it, Nora guessed ahead of time that she was about to be cut out of the will.
  2. Footprints: "Small, narrow prints with a pointed heel, coming in through the kitchen-side door. Not a gardener's boot." / no back
  3. Stopped clock: "Knocked off the wall when he fell. It stopped at 10:45." / no back
  4. Broken glass: "His glass. It smells of kitchen tea, not his usual brandy." / no back
  5. Torn photo: "A family portrait, torn in half." / back: "...ra, my only heir"
- How it is solved: the footprints rule out the gardener and come from the kitchen side; the photo's back ("...ra") points to Nora, not Iris; Nora's kitchen alibi points the same way as the kitchen-side footprints and the kitchen tea in his glass, instead of clearing her; the memo (10:40) and the clock (10:45) set the time.
- Replay captions, in the order the figure visits:
  1. Footprints: "10:40. Nora comes in through the kitchen-side door."
  2. Memo: "The 10:40 note calling her here. She already knew it was about the will."
  3. Broken glass: "She hands him tea from the kitchen in his glass."
  4. Torn photo: "He tells her he will change his will, and tears her photo."
  5. Stopped clock: "10:45. He falls, and the clock stops."
- Truth sentence: "Sensing she was about to be cut out of the will, Nora Vale put something in his tea."
- On-screen language: English (default).

## Done criteria
Each one can be checked in Lens Studio's preview.
1. At launch, a board with the title, the case description and a "Start" button appears straight ahead. Pressing "Start" hides the board, the 5 clues light up one at a time, and "0 / 5" with an arrow appears at the bottom of the view.
2. Pressing the memo brings it to the player's hands with a description and 2 buttons ("Flip" and "Put back"). Pressing "Flip" shows the time on its back. Pressing "Put back" returns the memo to its place in the "inspected" color, and the counter shows "1 / 5".
3. Walking in the direction of the arrow to find the remaining clues and inspecting and putting back all of them changes the counter from "5 / 5" to "The suspects have appeared". The 3 suspects line up straight ahead, and the counter and arrow disappear.
4. Pressing a wrong suspect shows their speech bubble and an "Accuse this person" button. Pressing the button breaks the glowing thread, shows "That doesn't match the clues", and lets the player choose again. After 2 wrong accusations, the truth replay starts with the right culprit.
5. Accusing the right suspect makes the clues glow, float up and gather straight ahead. Then the person's translucent figure visits the clue locations in order, with glowing footprints and captions. When the figure comes back to the front, the one-sentence truth appears above it.

## Out of scope
- Highlighting and alibis triggered by gaze (head direction): replaced by "hand ray hits" and "press".
- Pinch and hold for 1 s to confirm: replaced by the "Accuse this person" button.
- Rotating a clue by moving the hand while pinching: replaced by the "Flip" button.
- Turning the left palm up to show inspected clues on the hand: removed.
- Placing clues on real floors and desks found in the room (the preview can't detect surfaces).
- Saving progress between sessions.

## Risks and open questions
- Snapping clues to real surfaces in the player's room: feel unproven (only real glasses can tell).
- Counter just below the line of sight at about 1 m with 3 cm text: whether it is noticed and readable on real glasses is feel unproven.
- The clock and the suspects at about 2 m are past the display's focus plane (about 1 m); readability of their names and text on real glasses is feel unproven.
- Translucent figures, glowing threads and footprints on an additive display: they need light, bright colors, since dark shades turn transparent.
- Before publishing, search the title "Case in Your Room" and the 3 names (Edgar Hale / Nora Vale / Iris Bell) to make sure they don't match existing works or characters.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources

## Changes during the build
The approved brief above is kept as it was approved. These are the values that changed while building, and why. Everything else follows the brief. Playtest quotes are translated from Japanese.

| What | Brief | Built | Why |
|---|---|---|---|
| Suspect spacing (center to center) | about 45 cm | 40 cm | In Lens Studio's preview the view is only about 117 cm wide at 2 m, so at 45 cm the outer suspects were cut off. |
| Suspect figure width | about 35 cm | 31 cm | Narrower to match the tighter spacing. |
| Suspect pinch target | at most 40 cm wide, never overlapping | 32 cm wide, 8 cm deep; measured aimable span 33-34 cm with a 7 cm empty gap between neighbours | Kept narrower than the spacing so a slightly-off pinch never picks the neighbour. Measured with rays swept every 1 cm across the line-up, from the eye and from a right-hand position: no aim ever selected a suspect other than the one aimed at (LEAF test `suspect_hitbox`). A 24 cm deep target had widened the outer suspects to 40 cm for oblique rays, so it was made thin. |
| Inspecting a clue | pressing a clue brings it to the player's hands, about 50 cm in front at chest height, at 2x size, with 1 to 2 lines of description below it and 2 buttons beside it | no clue comes to the hands. Every clue stays where it lies. Its name, description and buttons appear just above it as the player sees it (2 degrees above its top edge, so they never cover it), facing the player, scaled to look as big as they would 50 cm away (shrunk only if they would overfill the view of a player looking at them). | Three playtests. In the first, a low clue (the glass on the chair) shot up to the hands and was lost from sight for a moment, and the description ran off the view when the player stepped closer; the move was slowed to a followable pace and the group shrunk to fit. In the second, the footprints were left on the floor with their description above them, and that worked: "the footprints did not move". In the third, the player asked for every clue to work that way: "none of them needs to leave the place it was put, the broken glass and the rest included." It also keeps the room intact while the player reads (LEAF test `inspect_fit`: no clue moves, the description sits 0.5-8 degrees above it, faces the player, fills at most 92% of the view, and rays from the eye and the hand reach each button first). |
| Buttons | "Flip" and "Put back", beside the clue | "Flip" and "Close" side by side under the description, 9 x 4 cm each at the look of 50 cm, faces 1.6 cm apart, no backing plate; the footprints (nothing to turn over) get "Close" alone. "Close" is the one new on-screen word not in the brief. | Nothing is taken from its place anymore, so there is nothing to put back. Closing counts toward "N / 5" the first time, like "Put back" did. The descriptions sit 1.2-3 m away, so the buttons are pressed with the hand's ray; the LEAF IK body presses "Flip" and then "Close" on the memo that way, and pressing "Close" never also presses "Flip" (LEAF test `ik_inspect_reach`). The 4 cm size and 1.6 cm gap come from the earlier IK test, where 2.8 cm buttons 0.8 cm apart let one press hit both. |
| What "Flip" shows | the clue spins to show its back | the clue turns over where it lies (180 degrees around its own upright axis, lifting off its face by half its width on the way so it never sinks into the desk, chair or wall, then landing back in its place), and the back's text ("10:40", "...ra, my only heir", or "Nothing on the back.") appears as a line in the description. Closing turns it face up again. | The back's text sits in the description, which already uses a type size made for reading; text drawn on the small 3D back was not tried. The memo lies flat on the desk, so a plain spin would pass through the desktop (LEAF test `inspect_fit` measures that no clue goes past its resting back face while turning over). |
| Light-up sound | a small sound for each clue | one soft chime per clue, rising in pitch in the order the clues light up, not positional | The scene has no audio listener for spatial sound. The chimes are generated locally (no samples). |
| Stopped clock (clue 3) | directly behind, about 2 m away, on a wall at eye height (about 160 cm); found by turning around | straight ahead on the front wall, 3 m away, hung at 240 cm (12-18 degrees above eye level). It is the one clue in view at Start and lights up first, once the board has gone; the other 4 stay where the brief puts them and the arrow leads to them. | In the playtest, nothing was in view at Start and all the clues seemed to be behind the player. Measured from the view at Start, the clues were where the brief puts them: memo +45 degrees (front right), footprints -45 degrees (front left), clock 180, broken glass -135, torn photo +135 (+ is to the right). But the two front clues sit 34 and 47 degrees below eye level, outside the preview's view (about 16 degrees to each side, 18 up or down), so none of the 5 was in view. Searching the room stays the core of the game, so only one clue was moved, and a wall clock facing the player is a natural thing to see first. It hangs high because the suspects line up 2 m straight ahead later: at eye height the clock showed through Nora's translucent figure, which also read as a hint. The suspects' heads reach about 11 degrees above eye level, and the view reaches about 18 (LEAF tests `start_layout` and `suspect_hitbox`, which checks that no clue shows through a suspect). A light trail from the front to each clue was tried first and dropped: the player asked for something in view instead. |
| Direction arrow | the arrow sits right next to the counter and points to clues not yet found | two arrows next to the counter, one for left/right and one for up/down. Left/right: a straight arrow, or, when the clue is behind (more than 90 degrees to the side), a ring-shaped "turn around" arrow showing which way to turn. Up/down: a straight arrow. Each hides while the clue is within 10 degrees in its direction (with a 2-degree dead band so it does not flicker). Both lead to the clue not yet found that is nearest to where the player looks. They are put away while a description is open (see "Counter and arrows while a description is open"). | Playtest: "the left/right arrow and the up/down arrow should be separate; I can't tell whether it means behind or below." A single arrow turned to point down for both. The turn-around arrow is a ring, so it can't be read as "down" (LEAF test `arrow_directions`: the head is turned all the way round and tilted down and up, and at every pose both arrows match the clue's direction; with the clock straight behind at the height the player looks, only the ring shows). Icons: Google Material Symbols `arrow_forward`, `arrow_upward` and `360` (Apache License 2.0); `360_mirrored.png` is `360` flipped left to right. |
| Going to the next clue | (not covered) one clue at a time: "Put back" before the next | pinching another clue while a description is open closes the open one first and counts it exactly like "Close" (the counter goes up, the clue turns to the inspected color and face up again). Pinching a clue that is already counted reopens its description without counting it again. | Playtest: "having to close the description before I can press the next item is a hassle." (LEAF test `switch_clue`.) |
| Counter and arrows while a description is open | the counter and arrow sit just below the line of sight, about 1 m away, and follow the head slowly | while a description is open, the arrows are put away and the counter (the number alone) stands just above the description, in its plane, at its usual look (as big as it would be 1 m away), so it can never cover the text or the buttons, wherever the player looks. Read straight on, it sits in the upper part of the view (from 54-62% to 69-79% of the way from the centre to the top edge). When the description closes it goes back under the line of sight, with the arrows. | Playtest: "the arrows and the 0/5 sit over the items and come in front, so sometimes I can't read the text." The counter followed the head about 11 degrees below the line of sight, which is where the buttons and the lower lines are when the player looks at the description. (LEAF tests `inspect_fit` and `inspect_views`: no arrow shows, and the counter's area of the view never overlaps the description's, looking at the clue or at the description.) |
| Clear line of sight to a description | (not covered) | the description, buttons and counter are drawn at the clue's distance unless something solid (the stand-in desk, chair or wall section, or another clue) stands inside the pyramid from the eyes through them; then they are drawn 5 cm in front of the nearest such point and scaled down by the same amount, so they look exactly the same (same place in the view, same apparent size). Never nearer than 35 cm. | Playtest: "from some angles the chair is in front and I can't see the item's description." Seen from behind the chair, its backrest stood between the eyes and the space above the glass; behind the wall section, the wall hid the clock's. (LEAF test `inspect_views`: each clue looked at from 8 directions, 120 cm away, eyes 160 cm above the floor; no part of the description, buttons or counter is hidden by any solid, and rays from the eye and from the hand reach each button first. 16 of the 40 views brought the description forward; in 13 of them it would have been hidden at the clue's distance.) |
| Suspect line-up distance | straight ahead, about 2 m away | at least 2 m, and farther when needed so that all of it (the figures, the names under them, and every place the alibi bubble and the Accuse button can take) fills at most 85% of the view of a player looking level at it, the same rule as the description's fit. With the current layout that is 2.32 m. "The suspects have appeared" now shows above the figures, where an alibi bubble appears later, and goes away when a suspect is chosen (or after 2.5 s), instead of under the line of sight. | Playtest: "when the last 3 people appear it fills the screen too much and I can't see the text below; it could zoom out a little and show everything." At 2 m the line-up reaches about 98% of the view (85% measured at 2.32 m, scaled to 2 m), and the message under the line of sight sat on the names. (LEAF test `lineup_fit`: looking level at it, the outermost part is at 85.0% of the view while the message shows and with each suspect selected, and the message overlaps no figure or name; `criterion_3`.) |
| Replay at a glance | the gathered clues fly back to their places and the figure visits them in the night's order; "the player turns their whole body to follow" | the same walk, plus a strip straight ahead (1.2 m away, from just below eye level to about 7 degrees above it, with the captions below): as the clues fly home, each leaves a small copy (7.5 cm; the footprints 9.4 cm, lying along the row) that slides into a row in the order the figure visits them. A small copy of the figure (9 cm) walks along the row in step with the real one, drawing a glowing line behind it, and each copy lights up at the same moment as its real clue. When the figure is back and the truth appears, the strip shrinks away. Turning to follow the real figure is now optional. | Playtest: "when the culprit is known at the end and moves around to every item, zooming out automatically until all the items are in view would let me see everything without moving the mouse or cursor." On the glasses the view is the player's own eyes, so nothing can zoom out; the aim taken from it is "the whole replay can be followed without turning the head". A small map of the room in front of the player was weighed instead: it keeps where things happened, but with clues all around, the map needs about 30 cm to keep 5 copies recognisable, which does not fit beside the captions in the narrow view, and it has to be read and turned in the head. The strip keeps the row the player has just seen the clues gather into, and puts them in the order the captions tell them. This departs from the brief's "turns their whole body to follow": following the figure through the room stays for a player who turns, but is no longer needed to follow the story. (LEAF test `replay_strip`: the head held level, straight ahead, for the whole replay; the copies stand in the visiting order; at each caption the matching copy and the real clue both light up and the small figure stands at that copy; it never walks backwards; the strip stays within 85% of the view (measured 73%) and never overlaps the caption; it is gone within 1 s of the truth. `criterion_5` still checks the real walk.) |
