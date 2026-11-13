# Claude audit handoff · All Bridges Burning Solo Companion v0.10.0

Build date November 13, 2026. Audit the HTML in the source archive against the downloaded HTML. The file is `All_Bridges_Burning_Solo.html`, SHA-256 `6179a1cddf216650c6a0cf35ab8a4b735d57542aad945d636c6efc1918268691`. Build with `node build.mjs`, verify `sha256sum -c SHA256SUMS`, and run `node --test test/*.test.mjs`. `docs/Rules_and_Sources.md` provides the rule-to-code map and source fingerprints.

## Reproduce against the shipped UI

Use **Campaigns → Import save → Resume**. Each import is a new copy.

| Save | Reproduction and expected result |
|---|---|
| `saves/01-senate-rally.json` | Preview Senate bot twice, then refresh on the preview. The same #54 Rally adds one Inactive Senate Cell in Helsinki, 1 → 2, and leaves the space Uncontrolled. Apply, inspect Board, Undo, Redo, reload. Compare the condition roll with §8.4.1 and trace the Random Spaces Map from 51 (Vaasa) to Helsinki. |
| `saves/02-pending-event.json` | This v0.9 save holds a guided Reds #20 Event with no eligibility box taken. Helsinki has a staged change in the form. Edit the note and count, navigate away, export, import and resume. The form and random state should survive. Check that this existing tabletop procedure remains playable after import. Mark the Event ineffective to resume the Command priorities. |
| `saves/03-schema1-pending-event.json` | Import the older single-campaign wrapper. The same pending Event and Helsinki field should reopen. Export and verify schema 2. |
| `saves/04-prepare-train-attack.json` | Compare the Playbook pp. 27–28. Preview Senate Attack + Prepare. Repair the Tampere–Häme border before sending five Senate Cells and the Train into Tampere. Starting strength 7, Prepared −2, Train +1. The seeded Attack roll is 3. Inspect POW, Attrition, News, and Control changes. |
| `saves/05-pending-news.json` | Reds have taken one Limited Command. The staged extra Rally in Viipuri spends held News and one Resource. The original eligibility box remains. Refresh before and after Apply. |
| `saves/06-final-scoring.json` | Preview the last score check. All faction margins are nonpositive and the two foreign Vassalage values tie. The result should be no winner under §7.3. |
| `saves/07-pending-hennala.json` | Human Reds may release up to three Senate prisoners. Release one. Bot Senate retains its two Reds prisoners at Polarization 5. The four remaining prisoners raise Polarization to 7 before the seeded 4 raises Moderates Resources from 12 to 16. Only Moderates record the Event. Export/import before Apply, then Undo and Redo. Boxed #28 and §6.5.1. |
| `saves/08-pending-manifesto.json` | The bot placed a Moderates Cell in Tampere and awaits the human Reds placement. Helsinki is ineligible at Active Support. Keep the draft Häme choice, or select another eligible space and reopen. Apply to place the Cell, add the political cube, and record only the Moderates Event. Boxed #7 and §5.1. |
| `saves/09-upgrade-preview.json` | Resume the imported v0.9 open preview. Confirm the notice requests a fresh preview and there is no Apply button until you generate one. The human Pass and the seed survive. |

## Confirmed defects found during implementation

| Defect | Regression to rerun |
|---|---|
| Attack activated an uncommitted Inactive Cell in some mixed stacks | Natural-six and selected-attackers tests in `test/rules.test.mjs` |
| Declining a tagged bot Event could re-enter an earlier priority | Tagged Event with a Capability lookahead test |
| The last acting faction’s News follow-up could be rejected by state validation | Last eligible Limited Command with News test |
| Power reset used the same in-play total for German and Russian Troops | Russian post-Attack reset example and Pivotal Event test |
| Quota retry could delete an otherwise recoverable prior backup | Failed retry backup restoration test |
| Reload returned to form while a preview was open | Phone-width Chromium preview reload test |
| A Senate redeployment could spend a donor's starting Cells twice when capturing two Towns | Fixed-position #42 two-donor case in `test/solitaire-aid.test.mjs` |
| An older open preview could be recomputed under revised rules without a fresh review | Chromium upgrade preview case and save 09 |

The photos supplied both sides of the boxed aid. Source fingerprints and rule decisions are in `docs/Rules_and_Sources.md`. The photos can be supplied alongside the archive for the rules audit.

## Open rules questions

1. Review the boxed reverse beside the physical Event cards. Compare #10 and #13 placement, #20 and #21 removal or relocation, #27 and #41 the free strength modifier, #39 and #45 the failed blocking opener, #40 casualties, and #42 Capability allocation.
2. Check #42 where two Towns can be taken, where three Cells only suffice by losing an existing Town, and where two valid plans differ in Capability allocation. The test suite covers the Population and control gates. The aid's Capability tie-breaker is implemented as local allocation among the winning plan's donors and destinations.
3. Recheck #59’s pre-Command Prepare and Foreign Relations, #53’s Senate Population threshold, and end-of-game Agitation when several factions approach their victory thresholds.
4. Compare Train positions, rail-border geometry, and same-origin group splits with the physical board and §§3.2.4–5. The app models Trains by space. Use the tabletop workflow for a decision that depends on a specific rail slot.
5. Audit News carrier identity in crowded spaces and the choice between forced movement, handover, and Capture. The app stores a holder faction and space.
6. Check Android Downloads and a physical game through the first Propaganda Round. The verification used offline Chromium with phone and desktop viewports.

## Optional usability ideas

During a physical playtest, compare the existing checklist with a printable version or compact adjacency view if space lookup slows down play.
