# Astra audit of All Bridges Burning v0.10.2

Reviewed November 13, 2026 (America/Chicago).

**Assessment:** the offline companion has a sound build and recovery foundation, but nine reproducible defects remain. Prioritize the German combat error and imported-draft crash, then correct the movement and Command cases before treating the automation as rules-complete. This is a fidelity and software audit, not a bot balance study.

## Audited baseline and evidence

- Repository commit: [`0b57629bbe8ff5aaf3fb1ee4484533777d8c2249`](https://github.com/ramyahoo88/all_bridges_burning_solo/commit/0b57629bbe8ff5aaf3fb1ee4484533777d8c2249).
- Release: v0.10.2, including the merged Claude report and its follow-up fixes.
- Rebuilt HTML SHA-256: `f3237c8b44fb01dc906035b577c5e36f65e386566b9b55a2384f33ba7432b2eb`. The checked-in HTML rebuilt byte-identically.
- Existing automated suite: **132/132 passed**.
- Existing offline Chromium suite: **8/8 passed**, including all nine reference saves, six player configurations, pending decisions, preview reload, Undo/Redo, export/import, storage quota/recovery, and two-tab conflict handling. Chromium 153.0.8010.0, Linux, file URLs, network disabled.
- Existing stress harness: **288 campaigns**, seeds 700–747 for each of six configurations, **50,447 steps**, **2,337 save round trips**, no reported invariant or termination failures. Of these campaigns, 254 reached Phase II and 199 reached the final round.
- Additional audit checks: **12 rule/validation expectations fail**, covering the nine findings below. Three additional browser reproductions confirm F6, F8 and F9 in the delivered HTML. A keyboard-focus observation supports Q4.
- Scope: all source modules were inspected, with targeted execution of the cases below. Physical Android behavior and tabletop usability were not tested.

The stress harness usually Passes or Rallies with human factions, skips bot tabletop Events, and records human tabletop Events without simulating their physical choices. These campaigns establish stability under that harness. They do not establish win rates against competent players, complete Event coverage, or strategic strength.

The primary references remain the [November 2023 Living Rules](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingRules.pdf), [Living Playbook](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingPlaybook.pdf), [German flowchart](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBPAC2FlowchartsLivingOct-20.pdf), replacement bot cards and boxed aids listed in [Rules and sources](Rules_and_Sources.md). Event #10 was checked against its card image in the previously downloaded GMT-approved Vassal module. No component scans are added by this audit.

## Confirmed findings

High = wrong combat results or loss of access to a saved workspace. Medium = illegal or omitted play in a specific supported situation. Low = misleading display with a correct underlying draft.

| ID | Priority | Finding | Location in the audited commit |
|---|---|---|---|
| F1 | High | German attackers incorrectly lose a Troop after removing three enemy Cells. | `src/actions.js:196` |
| F2 | Medium | German March can move away from Russians, fail to approach distant Reds, or move without any enemy remaining. | `src/rounds.js:338` |
| F3 | Medium | Senate March/Train Attack tests only the largest proposed group and can reject a legal smaller group. | `src/bot-operations.js:288`, `:348` |
| F4 | Medium | Senate #59 ranks destinations before the prescribed group-selection priorities. | `src/bot-operations.js:301`, `:322` |
| F5 | Medium | Moderates Message can select a just-captured Active Cell for movement again. | `src/bot-operations.js:205`, `:223`, `:240` |
| F6 | Medium | Human Activism can concentrate activations while omitting other eligible spaces. | `src/human.js:222`, `src/ui-fields.js:70` |
| F7 | Medium | Event #10 loses its Vassalage effect when the Jaeger placement cannot occur. | `src/events.js:128` |
| F8 | High | Import accepts an invalid form that can make the app blank on the next reload. | `src/storage.js:70`, `src/ui-fields.js:160`, `src/ui.js:595` |
| F9 | Low | A staged cleared Issue displays its old resolved color after rerendering. | `src/ui-board.js:78` |

### F1 — German attacker attrition

Three German Troops attacking three Reds Cells with a roll of 3 leave **two** German Troops. The attack's prisoner and Terror outcomes otherwise execute normally. The extra loss comes from the explicit German branch of `engage()`.

The §3.2.4 attrition clause for every three removed enemy Cells applies to attacking Cells. The German flowchart invokes that combat procedure without adding this Troop loss. Remove the German-only deduction. Keep coverage for Reds/Senate Cell attrition and losses caused by defending German Troops.

This also affects Event-driven German Attacks that call the same function.

### F2 — German March destinations

Three constructed cases expose the same destination filter:

- With Germans in Karelia and the only enemy a Russian Troop in Helsinki, RNG state 2 produces Karelia → Kuopion lääni. The distance to the enemy grows from two to three.
- With Germans in Turku and Reds only in Vaasa, RNG state 0 produces Turku → Uusimaa. Distance remains three, although Varsinais-Suomi provides progress.
- With no Reds or Russians on the map, Germans still March.

The German flowchart's movement requirement is not represented by a two-level neighborhood rank. Form the enemy set from Reds and Russians, admit destinations that satisfy the flowchart, and randomize only among the legal candidates. If that set is empty, end the action without a move. Use the existing graph-distance helper and retain a documented interpretation if several separate enemy groups create competing directions.

### F3 — Smaller Senate groups never considered

For #59, put eight Senate Cells and four Moderates in Helsinki, and a Reds Cell in Turku. The bot considers moving five Senate Cells, sees that Helsinki would lose Senate Control, and returns `n:0`. Moving three to Uusimaa preserves Helsinki and approaches Turku.

The Train Attack version occurs with six Senate Cells, two Moderates and a Train in Helsinki, plus a Reds Cell in Uusimaa. The five-Cell proposal loses Control and is rejected, although a three- or four-Cell group can legally attack across that railway.

Both are covered by §§8.4.5–6. Generate the allowed group sizes and retain those satisfying origin protections, then apply the prescribed priorities. Do not equate failure of the maximum-size proposal with failure of the card.

### F4 — #59 group selection is reordered

Put four Senate Cells and a Jaeger in Häme, one Senate Cell in Tampere, and four Senate Cells in Uusimaa. A Limited #59 moves the ordinary Uusimaa group into Helsinki. The Capability group in Häme remains untouched, despite having a legal route toward an uncontrolled Town.

The leading `claim` field in the flattened ranking overrides the group priorities in §8.4.6. Keep group selection and destination selection as distinct stages. Preserve the priority for taking Town Control when choosing the selected group's destination. Audit #52 and #58 with the same separation, but this report's concrete ordering failure is #59.

### F5 — Captured Message Cell moves twice

Use these Moderates positions: one Underground Cell and the Personality in Helsinki, one Underground Cell in Tampere, one Underground Cell in Uusimaa. Place six Active Reds in Uusimaa and unheld News in Häme. Run #63.

The Tampere Cell attempts to bring News to Helsinki and is Captured in Uusimaa. The next Message selects that newly Active Cell instead of the original, unmoved Underground Cell. Uusimaa ends with an Underground Cell, while its Captured Cell should remain Active. The News remains in Uusimaa.

The function tracks arriving Cells only as a total, then selects an Active Cell without excluding previously moved Active arrivals. Track unmoved Cells by status through the Command, or assign transient identities to moving Cells and their News. The human Message implementation already has status-specific movement bookkeeping that can inform this repair. See §3.3.2.

### F6 — Uneven human Activism

With six Inactive Reds in Helsinki and one in Tampere, deselect Tampere in the activation form. A seeded roll of 3 activates three in Helsinki and none in Tampere. This reproduces through the real phone-width controls, Preview and Apply.

The engine distributes across the submitted subset rather than enforcing the §3.2.2 condition against all eligible spaces. Validate the distribution against the board. The interface should let the player choose activation order and how many activations to use without letting that choice waive the distribution rule. Do not simply require spending the entire roll, because the number activated is optional up to that result.

### F7 — Event #10 partial execution

In Phase II, with no Senate Cell on the map and German Vassalage at 3, a human executing unshaded #10 records the Event but leaves Vassalage at 3. No Jaeger can be placed, but the Vassalage increase remains possible.

The shared Capability branch returns early before applying the separate track effect. Apply each executable effect and return whether any effect occurred, consistent with §5.1 and the printed card. Keep the placement prompt when a human recipient has a real choice. Do not generalize this fix to ignore explicit bot Event eligibility gates.

### F8 — Invalid imported form makes startup fail

An otherwise valid campaign with this draft passes `decode()`:

```json
{"intent":{"type":"human","action":"limited","command":"Rally","rows":null}}
```

The import is saved successfully. Resume triggers `rows.map`, and reload produces an unhandled error during the initial render. Chromium shows no main heading or campaign controls. This blocks access to the workspace through the interface; the raw localStorage bytes remain present.

Validate or sanitize nested draft shapes before importing/saving, including `rows`, `special`, `recycle`, `plans` and cached action forms. A valid board with a damaged draft should be recoverable by discarding only that draft. Add a guarded startup recovery screen so a rendering error cannot hide all campaign/export tools.

### F9 — Cleared Issue is displayed as resolved

Start with the first Issue resolved Red. In Correct board, select Unresolved. The stored draft correctly contains `null`. Visit Guide, then reopen the correction. The dropdown displays Red Resolved again, while Preview would still apply the clearing.

`edit.issues?.[i] ?? g.issues[i]` treats an intentional null as a missing edit. Fall back only when no staged value exists. The browser reproduction verifies both the stored null and the contradictory displayed value.

## Code improvements

1. **Represent action candidates explicitly.** Keep legal group generation, group priority, destination priority and execution separate. F2–F4 show how a compact ranking array can silently change the published procedure. Structured candidates can also carry a reason for rejection into tests and the decision log.
2. **Share movement bookkeeping.** Use a Command-local ledger for unmoved Active/Inactive Cells, moved Capabilities and News. Reuse it in human and bot procedures, with focused assertions that a Cell is never selected twice. Keep detailed carrier/Train limitations documented until modeled.
3. **Validate at storage boundaries and recover locally.** Use small reusable validators for each saved form. Keep schema migration separate from validation, enforce collection limits before append, and round-trip everything the UI is allowed to save. The current decode limit of 250 campaigns is not enforced by `importCopies()` or creation, an additional low-frequency robustness gap to address in this work.
4. **Turn partial Event execution into a clear result.** Distinguish applied effects, an ineffective Event, and a required tabletop prompt. Early returns in a compound Event should not suppress an independent effect. Keep bot eligibility separate from effect execution.
5. **Add release CI and broaden scenario coverage.** Automate the deterministic build comparison and existing tests. Migrate the new audit cases into the ordinary suite as each fix lands. Add meaningful scenarios for Germany, captured carriers, constrained group sizes and malformed drafts. A separate future strategy harness should use purposeful human policies before drawing balance conclusions.

These changes fit the existing zero-runtime-dependency architecture. A framework migration is not needed to solve the findings.

## Quality-of-life recommendations

| ID | Improvement | Benefit and scope |
|---|---|---|
| Q1 | Show legal choices and running cost in Command forms. | Display available Cells/markers, applicable costs and reasons a destination is unavailable before Preview. Keep a tabletop-entry escape route for documented geometry limits. |
| Q2 | Add compact board filters and an adjacency view. | Offer occupied spaces, current faction, changed spaces, News and selected origin's neighbors. Keep empty spaces available for Rally. Match names with or without Finnish accents. The current phone Board can require a long scroll through all 13 cards. |
| Q3 | Add a tabletop checklist mode. | Show only required adjustments, allow optional check marks, and provide a print/copy view. Reset checklist marks on a new action or Undo. No additional mandatory confirmation step is needed. |
| Q4 | Preserve keyboard focus and reduce form jumps. | Chromium reports `document.activeElement.tagName === 'BODY'` after changing Command. Restore the corresponding field after rerender, retain expanded sections, and show errors near the relevant field. Test keyboard-only use. |
| Q5 | Make recovery and troubleshooting easier. | Add campaign rename/duplicate, last-save and last-export times, and an optional versioned support snapshot containing the current decision and seed. Exports already exist; these would make them easier to use at the table. |
| Q6 | Make the next victory check easier to read. | Show which thresholds each faction currently meets and a concise next-step reminder, with the special solo victory timing explained. Keep exact margins and endgame rules consistent with §7. |

Prioritize F8 and Q4 together, then the rules fixes, then Q1–Q3. Q5–Q6 are optional refinements after the regression suite is green.

## What should remain unchanged

- The deterministic preview/apply model, save exports, history and conflict warnings are useful foundations and passed the existing browser tests.
- The Playbook's worked Senate Train Attack supports the existing baseline-Strength calculation. Do not add another three-Cell bonus on top of the 7/5 bot baselines merely because the base-game table has one.
- The newly corrected #20 News protection and Moderates Agitation threshold have passing regression coverage. This audit did not identify a new defect in either fix.
- Keep the documented interpretations for underfunded Personality ransom and #7's final fallback visible. This audit supplies no new official ruling for them.

## Reproduction

Run from the repository root with Node.js 20 or later:

```sh
node build.mjs
sha256sum -c SHA256SUMS
node --test test/*.test.mjs
node test/stress.mjs 48
node --test audit/v0.10.2/regressions.test.mjs
```

The last command intentionally exits 1 on the audited release, with **12 failures**. They are new assertions about expected behavior, not failures from the existing 132-test suite. Two additional cases belong to F2 and one additional case belongs to F3, giving nine findings overall. The constructed positions pass the app's state validation; they are focused scenarios, not claims that the stress policies reached those positions.

With Python Playwright installed:

```sh
python3 test/browser.py --chromium /path/to/chromium
python3 audit/v0.10.2/ui-reproduce.py --chromium /path/to/chromium
```

For a constrained Chromium headless shell, add `--headless-shell`. The audit browser script accepts `--screenshots /path/to/output`. It demonstrates the audited defects and therefore needs conversion into repaired-behavior expectations when the fixes are implemented.

See [machine-readable evidence](../audit/v0.10.2/evidence.json), [new regression cases](../audit/v0.10.2/regressions.test.mjs), and [UI reproductions](../audit/v0.10.2/ui-reproduce.py). This audit branch adds evidence and recommendations only. The app source and shipped HTML are unchanged.
