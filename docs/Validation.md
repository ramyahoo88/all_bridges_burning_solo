# Validation · v0.10.4

Verified November 13, 2026. The release test rebuilds the checked-in HTML byte for byte and checks its SHA-256 against `SHA256SUMS`.

Gemini's v0.10.3 archive rebuilt to `12ac592cc0269727fa6cd8e0b91dd7aeed0485a4d4f2af8c0ca4e0db9a659449` and passed its 134 tests and the 12 Astra cases. The repository's v0.10.2 suite recorded 23 failures on that archive. They covered Retreat, carried News, local Train Attack participants, Reds Agitation, bot cards #50, #56 and #59, Event priorities and #42 redeployment. The v0.10.4 integration starts from v0.10.2 and preserves those tests, the reference saves, and the prior audit reports.

| Check | Environment | Result |
|---|---|---|
| Automated rules, storage and build | Node.js 24.22.1 | 149 passed, including all 132 v0.10.2 tests, all 12 Astra cases and five added checks. |
| Campaign consistency | 288 seeded headless campaigns, 48 per human/bot configuration | All terminated. 50,515 preview/apply steps and 2,336 save round trips. All previews preserved the original board and random state. |
| Simulated interface | Node.js with LinkeDOM, loading the exact embedded application script | Opening form, human Pass, bot preview, reopened pending preview, Apply, named Undo/Redo, and board correction passed. |
| Live browser | Chromium 153.0.8010.0 on Linux, Playwright, `file://`, network disabled | All ten scripted suites passed, including continuation of the nine reference saves. Desktop viewport was 1280 × 920. Phone viewport was 393 × 852 with touch emulation. |

## Independent rule checks

The expected outcomes were drawn from cited procedures or worked examples. These include the two eligibility examples, the single-space Terror cap at the start of a two-space Command, Playbook p. 18 casualty and POW timing, p. 28 Prepare-before-Train-Attack strength, the §3.3.2 Capture example, and the §4.3.3 eight-Resource Publish example. Adjacent cases include a natural 6, no available pieces, human recycling, optional News after the last faction, Phase I ignoring the German symbol, an occupied Limited box, and an already ineffective Event.

The v0.10.2 regressions cover #20 both with and without a Cell to receive News, the last placement tier of #7, #25 with one or zero Senate Cells Available, #27 and #41 Strength, an underfunded Personality ransom, and the Moderates Opposition stop with other spaces still eligible for Politics. The new checks include an optional Activism limit, a Cell Activated by Publish during Message, recovery of valid form fields, and the campaign limit.

## Campaign consistency run

Seeds 700–747 per row, with a scripted mixture of human Pass, Rally, and selected Events. For the purposes of this consistency test, the harness bypassed or supplied no edits at unautomated physical prompts. It did not play those Events on behalf of the tabletop player. The batch checks reproducibility, valid state, progression, and termination. Its outcomes do not measure win rates or strategy balance, and they provide no independent evidence for the rules at those prompts.

| Human factions | Runs | Steps | Reached Phase II | Reached Propaganda 4 |
|---|---:|---:|---:|---:|
| Reds | 48 | 8,350 | 45 | 35 |
| Senate | 48 | 8,113 | 45 | 31 |
| Moderates | 48 | 9,616 | 48 | 47 |
| Reds + Senate | 48 | 5,574 | 24 | 2 |
| Reds + Moderates | 48 | 9,676 | 46 | 44 |
| Senate + Moderates | 48 | 9,186 | 46 | 41 |
| **Total** | **288** | **50,515** | **254** | **200** |

The machine-readable summary is in `test-results/stress.json`.

## Live browser checks

- Physical-deck setup through a human and both bot turns during development. The release script checks the phone-width setup, human Pass, Senate bot preview, random-state-preserving reload, Apply, board inspection, named Undo and Redo, reload, and correction. Resizing to landscape and navigating among tabs preserve an unfinished correction.
- Pending Event export and import through actual controls, including field values, note, and phase; schema 1 import and re-export as schema 2; corrupt import preserves the campaign list; pending News can reopen and resolve.
- The phone-width Event suite exported and imported an unfinished #28, reloaded its preview, applied it once, and checked Undo and Redo. It also retained a changed #7 location across tabs and required a fresh preview for the imported v0.9 draft.
- All nine reference campaign files were imported and checked against their expected continuations. These cover a repeatable Senate Rally, both pending Event schemas, Prepare before a Train Attack, extra News Rally, final scoring, both delegated Event decisions, and rejection of a stale v0.9 preview.
- A phone-width human Train Attack accepted local attackers, used the target's Capabilities, and moved held News with the departing group. The draft survived reload.
- Injected QuotaExceededError and a blocked write through the real interface. The app distinguished memory-only progress, exported it, and saved after retry. A corrupt primary was exportable and recoverable from the previous save. At phone width, hit-testing confirmed the storage notice leaves the preview control clickable.
- Two real tabs detected a stale save. The older tab retained and exported its local draft, the newer save survived, and an explicit reload opened the newer turn.
- Setup via the app deck passed for all six published human/bot configurations.
- A phone-width suite checked live cost edits, keyboard focus, expanded sections, Board filters, checklist state after reload and undo, print-mode visibility, renaming, duplication, and save and export timestamps.
- Malformed-form tests imported and reopened a pending News decision, checked that the game remained intact and that startup preserved the original saved bytes, and cleared an Issue across navigation and Apply.

The browser test uses Chrome’s headless engine with phone and desktop viewport presets. Physical Android behavior, browser file association, and hardware touch interactions remain to be checked. The core storage tests inject quota and access failures with a local storage double. They also verify backup removal only when needed, recovery when the former backup fits, and the Web Locks queue.
