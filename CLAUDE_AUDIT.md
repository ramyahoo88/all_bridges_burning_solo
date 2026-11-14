# Audit handoff · All Bridges Burning Solo Companion v0.10.4

Build with `node build.mjs`, verify `sha256sum -c SHA256SUMS`, and run `npm test`. The checksum corresponds to the checked-in `All_Bridges_Burning_Solo.html`. [Rules and sources](docs/Rules_and_Sources.md) lists the rule mappings and source fingerprints.

Claude's [v0.10.1 report](docs/Claude_Audit_v0.10.1.md) preserves the independent findings and that release's checksum. The original v0.10.0 handoff is in the repository history at `57a99a0`.

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

## Regression checks from earlier releases

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

## v0.10.1 audit follow-up

| Finding | Status in v0.10.2 |
|---|---|
| #20 News and Moderates Agitation | Fixed and covered by regression tests. |
| #25 Russian Troops | The printed card targets all Troops in the selected space. The aid requires at least one replacement. §1.4.2 governs any excess Troops. |
| #27 and #41 Attack Strength | Both printed cards grant the additional free Strength. Tests cover a seeded roll and the resulting Strength. |
| #7 last placement fallback | Use the card's mandatory placement and the general non-player tie procedure after the three listed aid tiers are exhausted. |
| Underfunded Personality ransom | Transfer up to three existing Resources. This reading treats payment as a consequence of removal. A direct ruling on the shortfall remains unavailable. |

The prior Event, Capability allocation and Senate Command decisions are recorded in [Rules and sources](docs/Rules_and_Sources.md). The reference saves and browser suite can be reused on this release.

## v0.10.2 audit follow-up

The v0.10.4 integration passes all twelve cases from the [Astra audit](docs/Astra_Audit_v0.10.2.md) and retains the earlier rules and save checks. See the [validation report](docs/Validation.md) for the results from the combined build.

## Open playtest checks

1. Compare Train slots, rail-border geometry and complex group splits with the physical board and §§3.2.4–5. Use tabletop entry for choices tied to a printed rail slot.
2. Check particular News carriers in crowded spaces during movement, handover and Capture. The app tracks News by holder faction and space.
3. Check Android Downloads and play through the first Propaganda Round on a physical board. Browser verification used Linux Chromium with phone and desktop viewports.

During a physical playtest, try the printable checklist and Nearby Board filter. Check whether they reduce the time spent matching the physical board.
