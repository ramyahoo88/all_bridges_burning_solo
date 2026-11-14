# All Bridges Burning Solo Companion v0.10.4

This offline companion follows the November 2023 GMT Living Rules and Living Playbook, plus the boxed Solitaire Play Aid, for the single published campaign. It supports Reds, Senate, or Moderates as the lone human, and all three two-human combinations with the remaining faction run by the app. Bring the physical Event cards and boxed Solitaire Play Aid.

## Play

1. Open `All_Bridges_Burning_Solo.html` in a browser with JavaScript enabled.
2. Choose the humans, name the campaign, and copy the setup shown in the app. In physical deck mode, enter the two revealed card numbers. In app deck mode, pull the matching physical cards when the app reveals their numbers.
3. On Turn, check the estimated costs and available pieces, then Preview and Apply. Use the checkable or printable tabletop checklist to match the physical board.
4. When the app requests a tabletop procedure, resolve it from the card or play aid. Enter the final counts and tracks for affected spaces. Finish any free actions in their printed order before recording the parent Event. Leave the eligibility cylinder in the parent Event box.
5. Filter Board by occupied spaces, last step, nearby spaces, factions, or News. Correct a space from Board or the checklist. Undo and Redo show the physical adjustments.
6. Rename, duplicate, or export saved campaigns from Campaigns. Imports create copies. The app can resume a valid game when an unfinished form contains damaged fields.

Resume pending choices when upgrading from v0.9 or v0.10.x. Generate a fresh preview before applying a pending action. New campaigns use the printed Random Spaces Map. Older campaigns keep the published uniform-die option for space ties.

On Android, save the HTML to Downloads, then use a browser or file manager that opens local HTML with JavaScript. The chat preview, some Android file viewers, and some browser file origins handle storage or downloads differently. If your device cannot run or persist the downloaded file, open it on desktop or serve it over a local network while both devices are on that network. A physical Android device was unavailable for verification.

## Rebuild the exact HTML

Use Node.js 20 or later. Building and running the core test suite require zero npm dependencies.

```sh
node build.mjs
npm test
node test/stress.mjs 48
```

The build writes `All_Bridges_Burning_Solo.html` and prints its SHA-256. Compare it with `SHA256SUMS` or run `sha256sum -c SHA256SUMS` on a system with that command. An optional first argument sets the output path. The app itself uses zero network requests, external fonts, libraries, or image assets.

For a local HTTP origin during testing, run `python3 -m http.server 8000` in this directory and visit the HTML at `http://localhost:8000`. To share the local server with a phone on the same network, use the desktop's LAN IP instead of localhost. The server can run without internet.

To reproduce the interface checks, install Playwright for Python and its Chromium, then run `python3 test/browser.py`. To use an existing Chromium, pass `--chromium /path/to/chromium`. For the simulated DOM check, install LinkeDOM in an isolated directory and set `ABB_DOM_MODULE` to its absolute module path before running `node test/ui-sim.mjs`. Neither dependency is needed by the app or the build.

## Release documents

- [Rules and sources](docs/Rules_and_Sources.md)
- [Coverage](docs/Coverage.md)
- [Release notes](docs/Release_Notes.md)
- [Validation results](docs/Validation.md)
- [Audit handoff and follow-up](CLAUDE_AUDIT.md)
- [Claude audit of v0.10.1](docs/Claude_Audit_v0.10.1.md)
- [Astra audit of v0.10.2](docs/Astra_Audit_v0.10.2.md)
- [Astra second audit of v0.10.4](docs/Astra_Audit_v0.10.4.md) · five actionable issues, two rules questions, and reproducible evidence; application unchanged.
- [Astra comparison of the v0.10.5 candidates](docs/Astra_v0.10.5_Comparison.md)
- [Representative campaign saves](saves/)

All Bridges Burning is designed by V.P.J. Arponen and published by GMT Games. This independent companion uses the tabletop components. The source implements rules and contains original interface text, card identifiers, and card titles.
