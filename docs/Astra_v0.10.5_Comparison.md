# All Bridges Burning v0.10.5 candidate comparison

Reviewed November 13, 2026 against the v0.10.4 source at `b331ebab928d734d99cd086a30c4e944808eb066` and the second audit at `f842ea23c7f5c58dc1aa7498ddac8ef81f86ea11`.

**Both candidates pass the ten engine checks from the second audit. Gemini delivered the more complete web app, including working save import and export, combat breakdowns, and a reproducible build. Each candidate has a release blocker.** Gemini can interrupt a legal #59 bot March and replace newer campaign progress during import. NotebookLM's uploaded HTML fails on save import and Export all.

The module diffs place both candidates on the v0.10.4 implementation, which includes the repairs that were missing from Gemini's earlier v0.10.3 archive. NotebookLM changed five JavaScript modules, including the version bump. Gemini supplied a broader engine and interface update. The review tests the original supplied HTML for each candidate. NotebookLM's unit tests use the JavaScript extracted from its HTML module wrappers.

| Input | SHA-256 |
|---|---|
| Gemini `All_Bridges_Burning_Source_v0.10.5.zip` | `9681317142bb1582abc5712c4698d14a7b4f7d6666d80018914d18426fdc9fd6` |
| Gemini HTML from the archive | `4e3720b379cbca524f854c299edd73a755e356dcb5e5f430d189cda8ff846e2b` |
| NotebookLM `all-bridges-burning-solo-v0.10.5.txt`, containing the HTML | `6940967f3e2e70b6fe314c6d2a12355cf9d6c7e5e4919e018673e5fb63c806a1` |

## Test results

| Check | Gemini | NotebookLM |
|---|---|---|
| Rebuild and checksum | Byte-identical rebuild matches the supplied checksum. | Self-contained HTML supplied as text. |
| Included automated tests | 14/14 across the three project tests and eleven audit tests. | The upload contains the HTML. I recovered its 20 JavaScript modules for the shared tests below. |
| Original v0.10.4 rules, storage and first audit tests | 145/148 unchanged. All 148 pass when three assertions accept the new Strength breakdown and retain their original numeric and board expectations. | 148/148 unchanged. |
| Independent second audit suite | 10/10, including the backup size control. | 10/10. The backup test exercises the storage module directly. |
| Previous offline Chromium suites | 9/10 unchanged. The nine-save suite passes after its assertion accepts the combat breakdown. | 5/10 unchanged. Five suites are blocked by save import. A temporary diagnostic copy with two binding fixes passes 10/10, including all nine saves. |
| Campaign consistency | 288/288 completed in 50,666 steps, with 2,345 save round trips. | 288/288 completed in 50,670 steps, with 2,344 save round trips. |

Node.js 24.22.1. Chromium 153.0.8010.0, Linux, offline `file://`, desktop and emulated phone layouts. The campaign check used seeds 700–747 for each of the six human and bot configurations. It checks progression, state validity, repeatable previews and save round trips. Manual decisions use the existing simplified test policy. These results measure software behavior under those tests. Android hardware and competitive play remain untested.

Gemini added a CI file that runs the rebuild and its included tests. Its archive contains a reduced suite compared with the repository and has no reference saves. Its replacement builder writes to a fixed filename, so the retained release test that requests a separate output path fails with ENOENT even though the direct rebuild matches. Keep the repository builder contract, all existing tests and the nine saves when integrating any changes.

## Failures reproduced outside the audit fixtures

### Gemini can stop #59 while moving an available group

Four Senate Cells and a Train start in Mikkelin lääni, with four other Senate Cells in Uusimaa. The bot draws #59 as a full Command, repairs the Häme border, and selects three Cells to move from Mikkelin lääni into Uusimaa. The four original Uusimaa Cells still include a legal group that could move toward Helsinki. Candidate selection recognizes those unmoved pieces, but the movement guard rejects their origin because Uusimaa already received a different group. The offline app reports the error before opening a preview, and the original saved position stays intact. Ordinary Preview and tabletop mode hit the same guard. See `botMarch()` in `src/bot-operations.js` and the `tracker.toUsed.has(from)` guard in `src/actions.js`.

Preserve group selection by unmoved pieces and allow a space to receive one group and release different pieces. Test the legal move from Mikkelin lääni to Uusimaa followed by three original Uusimaa Cells moving to Helsinki. Confirm that every Cell and Capability moves at most once in the Command. Check both ordinary Preview and the existing tabletop mode on the same position. GMT Living Rules §§3.2.5 and 8.4.6. [Living Rules](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingRules.pdf)

### Gemini can replace a newer campaign when an import exceeds the count limit

`importCopies()` switches to replacement when the combined count would exceed 250 and every incoming ID already exists. I used a valid 250-campaign workspace with one campaign's older export. The current campaign had 12 Reds Resources and a staged Board filter. Import replaced them with 5 Resources and an empty draft, while reporting `Imported 1 campaign copy.` The imported campaign kept the existing ID. The app persisted the older state to local storage. The normal import limit in v0.10.4 and NotebookLM rejects this operation and preserves the current campaign.

Keep the documented copy behavior and reject imports without room. Any future restore-over-existing action needs its own clearly labeled confirmation and account of which campaign it will replace. An ID match identifies the campaign and cannot establish that the backup is newer. See `src/storage.js`, `importCopies()`.

Gemini does solve the original large-backup reproduction. Its real Export all downloaded a 16,533,228-byte file, and the same build accepted all 160 campaigns from it in a fresh browser context. The export took 10.3 seconds on this run. The workspace exceeded the browser's local storage quota, so the restored collection remained in memory. The current splitter repeatedly serializes every accumulated campaign. Serializing each campaign once would reduce export time and provide an accurate byte count for each part.

### NotebookLM's save controls reference names missing from the interface module

`MAX_SAVE_BYTES` and `splitCollection()` are exported by `storage.js`, but `ui.js` does not load either name. A normal Rally save produced `Import failed. MAX_SAVE_BYTES is not defined`. In a new campaign, Export all produced `splitCollection is not defined`. Individual campaign export and local saves passed their existing checks.

Adding only those two names to the bundled UI module's `require("storage.js")` binding allowed all ten existing browser suites to pass on a scratch copy. That diagnostic has a different hash from the uploaded file. The underlying splitter also measures JavaScript string length while the file picker enforces a UTF-8 byte limit. With a reduced limit of 206,396 to isolate the algorithm, a valid collection with Finnish characters was emitted as one 206,904-byte part. Apply one byte measure at both the export and import boundaries.

### NotebookLM can omit a legal converging March group

The second March fixture gives the Senate a group in Mikkelin lääni and a group in Karelia, with every Town except Helsinki already controlled. Both groups can move closer to Helsinki through Uusimaa. The original build and Gemini move three Cells from each origin, bringing Uusimaa to six Senate Cells. NotebookLM moves the first three and leaves all four Cells in Karelia. Its `legalMarchDestinations()` excludes every destination that already received a group. The play note in §8.4.6 allows groups to share a destination. [Living Rules](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingRules.pdf)

## Rule interpretations and repair target

Gemini also chose answers to the two open rules questions. Moderates can use News when no political cube can be placed, and imprisonment increases Polarization only when it also places Terror. NotebookLM retains the v0.10.4 outcomes. Treat those changes as explicit interpretations in the release notes. The designer's Attack article supports the Terror stacking limit case. The prior audit identified the exhausted Terror supply and exhausted Political Display as cases where the published wording leaves room for interpretation. [Designer’s Attack example](https://insidegmt.com/all-bridges-burning-examples-of-play-to-keep-the-doctor-away-5-attack-coordinate/) · [Second audit](Astra_Audit_v0.10.4.md)

Start the integration from v0.10.4, keep the existing repository tests, and bring over the combat and bot priority fixes along with Gemini's Strength explanations. The release review should require the two new March positions, preservation of existing progress at the campaign limit, a real import and export of a large collection, and the complete nine-save replay. Keep save schema 2 and advance the app version for the combined build so that saved previews from either submitted version are rebuilt.

The [evidence](../audit/v0.10.5-comparison/evidence.json) records test totals and exact observed outcomes. The [reproduction instructions](../audit/v0.10.5-comparison/README.md) include the engine and Chromium checks.
