# Validation · v0.10.6

The release test rebuilds the checked-in HTML byte for byte and checks its SHA-256 against `SHA256SUMS`. The v0.10.6 SHA-256 is `b841addd3e13bc5029b186d307e99ac184c580f25a356d6721be1b105e938dc0`.

The repair starts from the verified v0.10.4 source and retains all 149 tests and nine reference saves. The [second audit](Astra_Audit_v0.10.4.md) and [candidate comparison](Astra_v0.10.5_Comparison.md) describe the conditions that prompted these changes.

| Check | Environment | Result |
|---|---|---|
| Automated rules, storage and build | Node.js 24.22.1 | 170 passed, including the 149 v0.10.4 tests, ten independent second-audit checks, and eleven new regression checks. |
| Campaign consistency | 288 seeded headless campaigns, 48 per human/bot configuration | All terminated. 50,779 preview/apply steps and 2,350 save round trips. All previews preserved the original board and random state. |
| Simulated interface | Node.js with LinkeDOM, loading the exact embedded application script | Opening form, human Pass, bot preview, reopened pending preview, Apply, named Undo/Redo, and board correction passed. |
| Live browser | Chromium 153.0.8010.0 on Linux, Playwright, `file://`, network disabled | All thirteen scripted suites passed, including continuation of the nine reference saves. Desktop viewport was 1280 × 920. Phone viewport was 393 × 852 with touch emulation. |

## Independent rule checks

The expected outcomes were drawn from cited procedures or worked examples. These include the two eligibility examples, the single-space Terror cap at the start of a two-space Command, Playbook p. 18 casualty and POW timing, p. 28 Prepare-before-Train-Attack strength, the §3.3.2 Capture example, and the §4.3.3 eight-Resource Publish example. Adjacent cases include a natural 6, no available pieces, human recycling, optional News after the last faction, Phase I ignoring the German symbol, an occupied Limited box, and an already ineffective Event.

The v0.10.2 and v0.10.4 checks include #20 News retention, an underfunded Personality ransom, the Moderates Opposition target, a Cell Activated by Publish during Message, and recovery of valid form fields. The new checks cover alternating German attrition, local Train Attack participants, the group priorities on #52, #53 and #58, #59 multi-group March, Personality with an exhausted Display, imprisonment when Terror cannot be placed, large backups, and preservation of saved progress at the campaign limit.

## Campaign consistency run

Seeds 700–747 per row use a scripted mixture of human Pass, Rally, and selected Events. The harness bypasses or supplies no edits at unautomated physical prompts. The batch checks reproducibility, state validity, progression, and termination under this test policy.

| Human factions | Runs | Steps | Reached Phase II | Reached Propaganda 4 |
|---|---:|---:|---:|---:|
| Reds | 48 | 8,614 | 45 | 38 |
| Senate | 48 | 8,113 | 45 | 31 |
| Moderates | 48 | 9,610 | 48 | 47 |
| Reds + Senate | 48 | 5,574 | 24 | 2 |
| Reds + Moderates | 48 | 9,682 | 46 | 44 |
| Senate + Moderates | 48 | 9,186 | 46 | 41 |
| **Total** | **288** | **50,779** | **254** | **203** |

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
- The #59 suite continued the original Uusimaa group after another group arrived. It verified normal Preview and tabletop mode, invalidated a v0.10.5 preview, reloaded the new preview, and checked Apply and Undo.
- At 250 campaigns, importing an older same-ID save preserved the current campaign, staged draft, and exact local storage bytes.
- Exported and reimported 160 campaigns with 30 history entries each. The UTF-8 backup totaled 16,533,400 bytes across two files and prepared in 0.57 seconds in the recorded browser run. The UI reported the browser quota and retained the imported histories in memory.

The browser test uses Chrome’s headless engine with phone and desktop viewport presets. Physical Android behavior, browser file association, and hardware touch interactions remain to be checked. The core storage tests inject quota and access failures with a local storage double. They also verify backup removal only when needed, recovery when the former backup fits, and the Web Locks queue.
