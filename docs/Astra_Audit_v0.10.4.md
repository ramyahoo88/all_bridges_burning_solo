# Astra audit 2 · All Bridges Burning v0.10.4

November 14, 2026. Independent rules, engine, storage and offline-browser audit. This branch adds documentation and evidence only. It does not change the application, rebuild its behavior, or merge the release.

## Verdict and exact scope

**The v0.10.4 integration preserves the earlier fixes, but important combat and bot-decision gaps remain.** Five actionable issues are reproduced below. F4 is a concrete instance of the already documented limitation on complex force splits; it is distinguished from the four other defects. Two further rule readings are left open rather than counted as confirmed defects.

Audited commit: [`b331ebab928d734d99cd086a30c4e944808eb066`](https://github.com/ramyahoo88/all_bridges_burning_solo/commit/b331ebab928d734d99cd086a30c4e944808eb066), on `release/v0.10.4`. Its tree is `dbd55d598ffe6bd7abfa6bbd657122c46baa9730`. At audit start, `main` remained v0.10.2 at `0b57629bbe8ff5aaf3fb1ee4484533777d8c2249`.

The shipped HTML rebuilds byte-identically with SHA-256:

```text
7de9a787f6529bf2b1b5fd950ea05d5a06d3d34a15d2256d49661688b0f5d08f
```

This review targets the official base campaign and its one-human/two-bot and two-human/one-bot configurations. It does not introduce variants, change difficulty, assess the hosted site, or estimate bot win rates. The findings do not establish that Gemini introduced these problems. The inspected combat and priority paths already existed in the repository before its v0.10.4 integration.

## Verification completed

| Check | Result |
|---|---|
| Deterministic build and checksum | Passed on Node.js 24.22.1. |
| Existing automated suite | **149/149 passed**, including the 132 v0.10.2 checks, twelve first-Astra-audit cases and five integration checks. |
| Existing offline Chromium suites | **10/10 passed**, including all nine reference saves, storage failure/conflict handling, phone controls and draft recovery. Chromium 153.0.8010.0, Linux, network disabled. |
| Existing simulated-DOM check | Passed opening, Pass, preview/reload, Apply, Undo/Redo and correction. |
| Seeded campaign consistency | **288/288 terminated**, seeds 700–747 in each of six configurations; 50,515 steps and 2,336 save round trips. 254 entered Phase II and 200 reached Propaganda 4. |
| New expected-behavior tests | **Nine failures and one passing control**, identifying F1–F5. These tests intentionally expose defects in unchanged v0.10.4. |
| Additional real-browser reproductions | F1 and F3 reproduced through Preview and Apply at 393 × 852. F5 reproduced through Import and Export all at 1280 × 920. No uncaught page errors or HTTP requests in these cases. |

The consistency harness mostly makes the human Pass or Rally and bypasses/supplies no tabletop edits at unautomated prompts. Its success demonstrates progression and state consistency, not complete rules fidelity, competitive play or balance. This explains why legal-looking but wrong combat outcomes can survive that suite. No physical Android device or tabletop session was tested.

Raw records are under [`audit/v0.10.4`](../audit/v0.10.4/): [baseline tests](../audit/v0.10.4/baseline-unit.txt), [baseline browser](../audit/v0.10.4/baseline-browser.txt), [campaign run](../audit/v0.10.4/baseline-stress.json), [new tests](../audit/v0.10.4/regressions.txt), [engine observations](../audit/v0.10.4/evidence.json), and [browser observations](../audit/v0.10.4/browser-evidence.json).

## Actionable findings

P1 identifies a material error in combat results. P2 identifies a priority, automation-coverage or recovery problem with a narrower trigger. The tests use valid piece pools and legal positions; no production function is replaced or mocked.

| ID | Priority | Finding | Locations in the audited source |
|---|---|---|---|
| F1 | P1 | Attrition against Germans exhausts participating Reds Cells before removing Russians. | `src/actions.js:237–248` |
| F2 | P2 | #52, #53 and #58 can apply destination preferences ahead of the card's group-selection priorities. | `src/bot-operations.js:298`, `310–313`, `344–379` |
| F3 | P1 | Bot Train Attacks omit friendly Capabilities already at the destination. | `src/bot-operations.js:361–379` |
| F4 | P2 · coverage | A full #59 March cannot send a second legal group from the same origin. | `src/bot-operations.js:325–340`; `src/actions.js:16–21` |
| F5 | P2 | Export all can produce a backup that the same app refuses to import. | `src/storage.js:23–30`, `68–74`; `src/ui.js:523–526`, `727–732` |

### F1 · German attrition removes the wrong participating pieces

In Helsinki, attack with three Reds Cells and two Russian Troops against three German Troops. A successful roll of 3 removes the Germans. Correct alternating attrition leaves **one Reds Cell and one Russian Troop**. The engine leaves **zero Reds Cells and two Russian Troops**. This can remove Reds Control and strip markers that require a surviving Cell.

The same fault occurs in human and bot combat. `attackerLoss(Math.min(troopsLost, attackCount))` spends all available Cell losses first; Russians only absorb a remainder after that. Replace this with an alternating ledger restricted to the participating attackers. Apply Cell-based attrition separately afterward. Cover exhausted Cell/Troop pools and nonparticipating pieces.

Authority: Living Rules §3.2.4 and the designer's [Attack + Coordinate example](https://insidegmt.com/all-bridges-burning-examples-of-play-to-keep-the-doctor-away-5-attack-coordinate/), which explicitly explains the alternating order. This is separate from the first audit's German-attacker attrition defect, whose fix still passes.

Reproduce: tests F1a/F1b, or import [`human-attrition.json`](../audit/v0.10.4/human-attrition.json), Resume, Preview action, and Apply. The [phone preview](../audit/v0.10.4/f1-phone-preview.png) shows the incorrect disappearance of all three Reds.

### F2 · The group-before-destination repair remains incomplete

Three distinct Limited Command positions reproduce this:

- **#58:** Three Senate Cells with a Cannon in Tampere and three without a Capability in Helsinki, each with three Reds. The engine attacks in Helsinki. The Capability group in Tampere has priority.
- **#52:** Three Reds with a Cannon in Häme and three without a Capability in Helsinki, each facing three Senate. The engine attacks in Helsinki and leaves the Capability group unused.
- **#53:** Four Reds and two Germans in Häme; four Reds in Uusimaa at Passive Support. Both origins can legally March. The engine moves Uusimaa → Helsinki for the Population gain, leaving the German-threatened group in place.

The two Attack cards place group criteria at the end of a single destination-ranking array. Reds March flattens all origins and likewise ranks the destination first. #59's new two-stage selector does not cover these paths.

Separate group selection from destination selection for all three cards. Apply the printed priorities in order and preserve random ties within each stage. Authority: Living Rules §§8.3.5, 8.3.6 and 8.4.5. Tests F2a–F2c assert which origin acts, independently of the resulting combat die.

### F3 · Bot Train Attacks can miss despite sufficient Strength

Senate has four Cells and a Train in Uusimaa. Helsinki contains one Senate Cell with a Jaeger, three Reds, a Reds Prepared marker, Commander and Cannon. #58 sends three Senate Cells and the Train into Helsinki and rolls 5.

The engine reports **Strength 4, miss**. Counting the Jaeger already present and its effect on the Train gives **Strength 7, hit**. In the reproduction, all three Reds incorrectly survive. A corresponding Reds case omits a destination Cannon and misses on a roll of 1 when it should hit.

`botAttack()` passes the moving group's `caps` array to `engage()` after moving. It never resolves the available attacking Capabilities from the resulting battle space. Human Train Attacks already handle this distinction. Reuse a battle-participation calculation that counts eligible local and arriving Capabilities, respects the two-Capability limit and records what was used. Authority: Living Rules §§3.2.4, 5.3 and 8.1.3.

Tests F3a/F3b cover both bots. Import [`bot-train.json`](../audit/v0.10.4/bot-train.json) to reproduce the Senate case through the actual mini-deck and interface. The [phone preview](../audit/v0.10.4/f3-phone-preview.png) shows a Jaeger and Train at the target alongside the incorrect Strength 4.

### F4 · Full March processes an origin only once

Put eleven Senate Cells, a Train and Jaeger in Uusimaa; Sabotage its Helsinki border. With no enemy pieces nearby, a full #59 successfully Prepares, then sends five Cells into Helsinki. It leaves six in Uusimaa and stops, despite a second group of five being able to reach Turku while retaining one Cell at the origin.

The engine records one destination and gains two Town Population. Two successive groups can reach distinct eligible Towns and gain three. `tracker.fromUsed` permanently excludes the source after the first move; group formation does not track the remaining unmoved pieces.

This is an automation-coverage limitation already foreshadowed by the release's advice to resolve complex force splits at the table. The interface does not detect this particular situation or explain the omitted second group. At minimum, flag it before Apply and offer the existing tabletop procedure. For full automation, track unused Cells by status and moved Capabilities, with tests against moving the same piece twice. Authority: Living Rules §§3.2.5 and 8.4.6. Test F4 fixes the legal second destination rather than assuming an arbitrary extra move.

### F5 · The backup contract fails below the campaign-count limit

The app allows up to 250 campaigns. A collection of 156 campaigns with thirty ordinary correction-history entries each encodes to **16,086,055 characters / 16,119,907 UTF-8 bytes**. `encode()` produces it, but `decode()` refuses it because of the 16-million-character cap.

The browser reproduction imports the same legal 80-campaign file twice. Each file is below the import limit. The resulting 160 campaigns exceed local-storage capacity, so the app correctly offers export as the way to preserve in-memory work. **Export all downloads 16,533,228 bytes successfully. Importing that exact file produces “Import failed. This save file is too large.”** Existing in-memory campaigns remain intact; the failure is the unusable collection backup. Individual exports still work.

Align export, collection growth and import limits, using one documented byte measure. Keep bounded parsing, but offer split backups or individual exports automatically when a collection cannot fit the import contract. Add an end-to-end export/import boundary test. A count-only limit cannot guarantee that history-bearing campaigns remain recoverable.

Test F5 fails on the unsupported round trip; the single-campaign control passes. [`browser.py`](../audit/v0.10.4/browser.py) regenerates the large fixtures temporarily, exercises real download/import controls, and preserves the [rejection screenshot](../audit/v0.10.4/f5-export-rejected.png). No multi-megabyte fixture is committed.

## Rules questions kept separate

**Q1 · Personality use when no political cube can be placed.** Both `human.js:103–109` and `bot-rally.js:155–166` make a successful `putCube()` a prerequisite for spending News. With all Issues resolved, or all six cubes already on the display, the bot retains News and makes no track change. The human form rejects the action. §§4.3.1 and 8.5.1 describe the News reward and accompanying cube, but the retrieved material does not explicitly settle this exhausted-display case. Clarify whether the cube is mandatory or an independently limited effect before changing this behavior. The observed outcomes are saved under Q1 in `evidence.json`.

**Q2 · Prisoner-triggered Polarization when Terror cannot be placed.** `actions.js:250–254` increases Polarization whenever prisoners are taken, even with two Terror markers already present. A reproduced attack takes Polarization from 3 to 4, leaves Terror at two and adds News. The designer's 2020 Attack article conditions the increase on placing Terror; the November 2023 rulebook's prisoner paragraph does not restate that condition explicitly. Reconcile the sources, including exhaustion of the attacker's Terror pool, before adding a normative regression. The current outcome is recorded under Q2. Neither question is included in the nine failing assertions above.

## Code improvements and quality of life

| Order | Recommendation | Purpose |
|---|---|---|
| 1 | Use one explicit battle-participation record for human and bot Attacks: Cell statuses, Russians, Capabilities, casualty allocation and resulting markers. | Prevent fixes from covering the human path while leaving the bot path inconsistent. Keep separate fixture expectations for both. |
| 2 | Use sequential card priorities and a shared movement ledger rather than a single combined rank or a used-origin flag. | Address F2/F4 while preserving the earlier Capture and smaller-group fixes. Avoid a large rewrite of unrelated Events. |
| 3 | Make exportability an invariant of every supported campaign collection. | Address F5; provide size-aware bulk export and readable guidance before a backup fails. |
| 4 | Add repository CI for exact HTML rebuild, all audit regressions after repair, and targeted offline-browser flows. | The reviewed tree has no checked-in CI workflow. Require each future contribution to identify its base SHA and verify against the entire retained suite. |
| 5 | Expand validation scenarios to meaningful human Attack, March, Message and timed Special Activity turns. | Existing progression runs concentrate on Pass/Rally. Keep completion metrics separate from any later strategic win-rate study. |

The v0.10.4 live estimates, filters, saved checklists, focus restoration and rename/duplicate controls passed the existing browser suites. Further interface work should be focused:

- **Show the Strength breakdown and participating pieces in an Attack preview.** A total alone hid F3 even though the Jaeger was visible in the same preview.
- **Show group priority separately from destination priority.** Include the printed priority number and why a group was skipped; this makes review at the table much faster.
- **Label Jaeger and Commander by faction in comparisons.** The phone preview currently says “Commander / Jaeger” for a Senate Capability and splits the word across lines. Stack long before/after values on narrow screens.
- **Detect unsupported force splits before committing a bot action.** Offer the existing tabletop mode with the remaining eligible group already identified.
- **Identify the campaign, card and app version on printed checklists, and make bulk-export size/status explicit.** These are small changes that improve tabletop use and recovery.

## Reproduction and handoff

From the repository root:

```sh
node build.mjs
sha256sum -c SHA256SUMS
npm test
node --test audit/v0.10.4/regressions.test.mjs
node audit/v0.10.4/observe.mjs
node test/stress.mjs 48
python3 test/browser.py --chromium /path/to/chromium --headless-shell
python3 audit/v0.10.4/browser.py --chromium /path/to/chromium
```

The independent regression command is expected to exit nonzero on this audited version. It is deliberately outside `npm test` until the fixes land. Python browser scripts need Playwright and a local Chromium binary; they are development dependencies only. The app remains self-contained and offline.

Use **v0.10.4 commit `b331ebab928d734d99cd086a30c4e944808eb066` as the repair base**, preserving the full existing suite, source files and nine reference saves. Repair F1–F3 before recommending routine play of the new release, then address F4/F5 and resolve the two source questions explicitly. Rebuild and version the changed HTML; this audit branch itself ships the unchanged v0.10.4 HTML.

Primary reference edition: GMT [Living Rules, November 2023](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingRules.pdf), checked against GMT's current [game listing](https://www.gmtgames.com/p-675-all-bridges-burning-red-revolt-and-white-guard-in-finland-1917-18.aspx), the retained Living Playbook, errata, replacement cards and earlier audit notes. Retained rules PDF SHA-256 is `dfb3b3031a8f6dd045b5a801a291d8289113945a244dddd684550d19d35ea9be`; Playbook is `139fe0eacd6562b2fc73bd33d96b9e6013977cc3341138d088855f25a65603e7`. The separate designer article is linked under F1. No full rulebook or component artwork is added to this repository.
