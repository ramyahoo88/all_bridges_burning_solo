# Reproduce the v0.10.5 comparison

Run from the repository root on the comparison branch. Use the two original uploads, Node.js 20 or later, and Playwright with Chromium for browser checks. The candidate HTML files remain byte-identical copies in the scratch directory.

```sh
python3 audit/v0.10.5-comparison/prepare.py /path/to/All_Bridges_Burning_Source_v0.10.5.zip /path/to/all-bridges-burning-solo-v0.10.5.txt /tmp/abb-candidates
mkdir /tmp/abb-candidates/browser-fixtures
node audit/v0.10.5-comparison/compare-edge-cases.mjs . /tmp/abb-candidates/browser-fixtures
node audit/v0.10.5-comparison/compare-edge-cases.mjs /tmp/abb-candidates/argon-verify
node audit/v0.10.5-comparison/compare-edge-cases.mjs /tmp/abb-candidates/notebook-verify
python3 audit/v0.10.5-comparison/compare-browser.py /tmp/abb-candidates --chromium /path/to/chromium
```

For the original tests, enter `argon-verify` or `notebook-verify` under that scratch directory. These copies include the v0.10.4 reference tests, fixtures and saves recovered from this branch.

```sh
node --test test/rules.test.mjs test/solitaire-aid.test.mjs test/storage.test.mjs audit/v0.10.2/regressions.test.mjs
node --test audit/v0.10.4/regressions.test.mjs
node test/stress.mjs 48
```

Use `test/browser.py --html /path/to/candidate.html --chromium /path/to/chromium --headless-shell --case reference-saves` for the existing save replay. Run the ten `--case` values separately to record failures without stopping subsequent suites. The supplied Gemini tests can be run from the extracted `argon` directory with `npm test` and `node --test audit/v0.10.4/regressions.test.mjs`.

In the legacy test copies, Gemini's three `Strength 5; hits` string assertions and the browser's `Strength 6; hits` assertion can accept an optional parenthesized modifier breakdown between the strength and the semicolon. This checks the same die outcome, number and resulting board. The NotebookLM diagnostic simply adds `MAX_SAVE_BYTES` and `splitCollection` to the destructuring of `require("storage.js")` in its bundled `ui.js` module.

`compare-browser.py` asserts the observed failure messages and state changes to reproduce the defects in the original files. Its large-backup case generates the fixture from the earlier audit and measures elapsed export time. The fresh browser context imports the downloaded bytes. [Findings and interpretation](../../docs/Astra_v0.10.5_Comparison.md)
