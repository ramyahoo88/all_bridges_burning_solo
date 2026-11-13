# Validation · v0.10.1

Verified November 13, 2026. The delivered HTML was rebuilt from the source archive and compared byte for byte. Its SHA-256 is in `SHA256SUMS`. The previous audit handoff records the v0.10.0 baseline.

| Check | Environment | Result |
|---|---|---|
| Automated rules and storage | Node.js 24.22.1 using the modules in `src/` | 125 passed. Worked positions and expected outcomes cite the Rules, Playbook or designer examples in `test/rules.test.mjs`. Boxed-aid checks are in `test/solitaire-aid.test.mjs`. Storage checks are in `test/storage.test.mjs`. |
| Campaign consistency | 288 seeded headless campaigns, 48 per human/bot configuration | All terminated. 50,446 preview/apply steps and 2,337 save round trips. All previews preserved the original board and random state. |
| Simulated interface | Node.js with LinkeDOM, loading the exact embedded application script | Opening form, human Pass, bot preview, reopened pending preview, Apply, named Undo/Redo, and board correction passed. |
| Live browser | Chromium 153.0.8010.0 on Linux, Playwright using actual controls, `file://`, network disabled | All eight scripted suites passed, including the nine reference saves. Desktop viewport was 1280 × 920. Phone viewport was 393 × 852 with touch emulation. No external requests or page errors in the checked paths. |
| Physical Android and physical board | Android handset and physical copy unavailable in this session | Unchecked. No device, file-manager integration, or in-person tabletop claims. |

## Independent rule checks

The expected outcomes were drawn from cited procedures or worked examples. These include the two eligibility examples, the single-space Terror cap at the start of a two-space Command, Playbook p. 18 casualty and POW timing, p. 28 Prepare-before-Train-Attack strength, the §3.3.2 Capture example, and the §4.3.3 eight-Resource Publish example. Adjacent cases include a natural 6, no available pieces, human recycling, optional News after the last faction, Phase I ignoring the German symbol, an occupied Limited box, and an already ineffective Event.

The v0.10.1 regressions cover Retreat and German Troop attrition, carried News, stationary and Train Attack Strength, Reds Activism costs, #50 and #56 eligibility, rejected #59 draws, #10, #13, #21, #39, #40, #42, #45, tied Prepare borders, and Moderates final Agitation. The coverage and rule interpretation tables identify guided procedures and ambiguous text.

## Campaign consistency run

Seeds 700–747 per row, with a scripted mixture of human Pass, Rally, and selected Events. For the purposes of this consistency test, the harness bypassed or supplied no edits at unautomated physical prompts. It did not play those Events on behalf of the tabletop player. The batch checks reproducibility, valid state, progression, and termination. Its outcomes do not measure win rates or strategy balance, and they provide no independent evidence for the rules at those prompts.

| Human factions | Runs | Steps | Reached Phase II | Reached Propaganda 4 |
|---|---:|---:|---:|---:|
| Reds | 48 | 8,246 | 45 | 33 |
| Senate | 48 | 8,098 | 45 | 31 |
| Moderates | 48 | 9,613 | 48 | 47 |
| Reds + Senate | 48 | 5,620 | 24 | 3 |
| Reds + Moderates | 48 | 9,661 | 46 | 44 |
| Senate + Moderates | 48 | 9,208 | 46 | 41 |
| **Total** | **288** | **50,446** | **254** | **199** |

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

The browser test uses Chrome’s headless engine with phone and desktop viewport presets. Physical Android behavior, browser file association, and hardware touch interactions remain to be checked. The core storage tests inject quota and access failures with a local storage double. They also verify backup removal only when needed, recovery when the former backup fits, and the Web Locks queue.
