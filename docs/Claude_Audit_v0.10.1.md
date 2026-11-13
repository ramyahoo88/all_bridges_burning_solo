# Claude audit · All Bridges Burning Solo Companion v0.10.1

Audited November 13, 2026 against commit `57a99a0`. Reviewer: Claude (Anthropic). This file records findings for follow-up review. It changes no code.

## Summary

- Reproducibility checks all pass.
- The core rules match the GMT Living Rules where checked.
- The boxed Solitaire Play Aid matches on both sides, entry by entry, with the exceptions below.
- **One confirmed bug** (#20 can remove a held News marker).
- **One likely deviation** (Moderates bot Agitation step 2 overshoots).
- **One open card question** (#25).
- Some documentation housekeeping.

## 1. Reproducibility

| Check | Result |
|---|---|
| `node build.mjs` | Byte-identical to the shipped HTML. SHA-256 `a11ae4bf828d5adaf1ef74cf016f785a6c5245879221d1bc14c7b7b55a34ea05` matches `SHA256SUMS`. |
| `node --test test/*.test.mjs` | 125/125 pass on Node 22.23.4. The docs cite Node 24, so it also works on Node 22. |
| `node test/stress.mjs 48` | 288 campaigns. Totals match `test-results/stress.json` exactly: 50,446 steps, 254 reached Phase II, 199 reached the final Propaganda round. |
| `python3 test/browser.py` | 8/8 Chromium suites pass, including all nine reference saves. |
| Offline | The HTML contains no `fetch`, `XMLHttpRequest`, external URLs, `<link>`, `@import`, `eval` or `new Function`. |

## 2. Core rules confirmed against the Living Rules (Nov 2023)

These match the Living Rules:

- **Rally:** the Cell count formula and Offsets. The space limit is the greater of 2 and Polarization for Reds and Senate. Moderates have no space limit and get the whole-Command discount above Polarization 5.
- **March:** 1 Resource per 3 Cells (rounded up) entering a space.
- **Activism:** flips one enemy Cell per Active friendly Cell plus one per two Inactive. A Command either calms or flips, not both. Reds Agitation inside Activism pays 1 to clear all Terror, per the §3.2.2 wording "an additional Resource for each".
- **Terror:**
  - Removes up to 2 pieces at Polarization 6 or more.
  - Never removes a last Cell that would take a Capability or Prepared marker with it.
  - Raises Polarization by 1 per marker placed.
  - Removing a Political Display cube costs 1.
- **Attack:**
  - Defending Cells and Troops are removed alternately, starting with a Cell, and every second Cell goes to prison.
  - Attrition is one attacker per German Troop removed and one per three enemy Cells removed.
  - Jaeger counts 2, Commander 1, and Cannon or Train 2 when a Jaeger is present. At most two Capabilities count per side.
  - Russian Troops count 2 at Russian Vassalage 2 or more. Attacking Germans have a minimum Strength of 2.
- **Victory:**
  - The §7.2 thresholds and §7.3 margins are right.
  - §7.1 ties go to Non-players, then Moderates, then Senate.
  - If no margin is positive, the higher-Vassalage Power wins, and a Vassalage tie means nobody wins.
- **Solitaire:**
  - §8.1.3: Non-players spend no Resources and Offset for free. Non-player Moderates track Resources only for victory and gain +1 when they Pass.
  - §8.7: a solo human cannot win early.

**Documentation note on the Terror cost difference:** Activism Agitation charges 1 Resource for all Terror, while Propaganda Agitation charges 1 per marker (§6.4.2). Both follow their own text. Add a line to `docs/Rules_and_Sources.md` so a future audit does not "fix" one to match the other.

## 3. Boxed Solitaire Play Aid (both sides, from the user's photos)

### Confirmed matches

- **Random Spaces Map:** every number and the whole arrow loop match `RANDOM_SPACES` in `src/random.js`. The loop runs Political Display → Helsinki → Uusimaa → Mikkelin → Viipuri → Karelia → Kuopio → Tampere → Häme → Oulu → Vaasa → Pohjanmaa → Varsinais-Suomi → Turku → Political Display.
- **Agitation priorities:**
  - Senate: steps (1) and (2).
  - Reds: steps (1) through (4), including the Administration build order (2+ Reds Cells and no Senate, then 3+ Reds Cells).
  - Moderates: steps (1), (3) and (4).
- **Other front-side rules:** Prisoners of War (release all at Polarization 6+). A Politics cube tie goes to a Non-player. Capability placement follows the stated order: Jaeger, then Trains, then other Capabilities.
- **Capability check, step 3:** the aid prints "1d6 (Reds +2) > 2x held Capabilities", which reads as if Reds add 2 to the roll. The app adds 2 to the target instead. The official errata (10/19/2020) confirms the app: "the +2 Reds should be added to twice the number of Capabilities that they hold." **Cite this errata line in `docs/Rules_and_Sources.md`**, because the printed aid reads the other way.
- **Reverse-side events:** #4, #5, #6, #8, #9, #10, #11 (3–4 is German Vassalage **−1**, which the code has right), #12, #13, #18, #19, #21, #24, #28, #29, #32, #34–#40, #42 and #43 match their printed conditions and priorities.
- **Resolved with the physical cards:**
  - **#44:** the Reds shaded text is "If any Reds in Helsinki, shift Helsinki one level towards Active Opposition ~or~ Reds free Rally there". The `hasReds` check is right.
  - **#45:** the shaded text is "The kingmakers: Remove a Resolved Issue marker". With the blue Moderates instruction symbol and the aid's "Play/Pass to play", the Moderates bot removing an Issue is faithful.
  - **#20:** the unshaded text is "Remove a Prepared marker or a Cell (never a Cell that would remove a marker) from a Town. If Personality removed, Moderates transfer 3 Resources to executing Faction." The Town restriction and the Personality ransom are both right.

## 4. Findings to fix or decide

### 4.1 BUG: #20 can remove a held News marker (confirmed)

The card forbids removing "a Cell that would remove a marker." `removable()` in `src/bot-events.js` ends with:

```js
return !newsAt(g,id,side).length||side==='m'&&allowPersonality;
```

For Moderates this skips the News check entirely, not only for the Personality. If the last Moderates Cell holds News and the executing faction has no Cell in that space, `cleanSpace` cannot transfer the News, so the marker leaves the map.

Reproduction (run from the repo root):

```js
import {botEvent} from './src/bot-events.js';
import {position} from './test/fixtures.mjs';
const g=position({phase:1,humans:['s']});
Object.assign(g.board.tam,{admin:1,mI:1});
g.news=[{id:1,space:'tam',owner:'m'}];
const log=[];
botEvent(g,'r',20,'light',log,{drawLimited:()=>null});
console.log(g.board.tam.mI, g.news); // 0 []  — News marker removed
```

**Expected:** that Cell is not a legal #20 target. When the executing faction does have a Cell there, the News transfers to it, which is fine.

**Suggested fix:** pass the executing faction `f` into `removable()`. Keep the Personality exemption, but still reject the Cell when `newsAt(g,id,side).length && !cells(b,f)`. Add a regression test.

### 4.2 LIKELY DEVIATION: Moderates bot Agitation step 2 overshoots

The aid says: "If Oppose+Admins 10+, shift toward Neutral as able **until Oppose+Admins is 9 or less**." `botAgitate` in `src/rounds.js` sets each chosen space to `support=0`, so it can pass the stopping point.

- **Example:** Oppose+Admins is 10 and the chosen space is Helsinki at Active Opposition (4 points). One level reaches 8, which meets the condition, but the app goes to Neutral and leaves 6. That costs the Reds 2 extra points.
- The app's own human Moderates Agitation allows partial shifts (`steps ≤ |support|`), so stopping partway is legal.
- The release notes call the full shift deliberate ("Chosen Opposition spaces shift all the way to Neutral"), but the aid's stopping point favours stopping once the total reaches 9.
- **Suggested fix:** shift one level at a time in the chosen space and stop once `score(g).opp <= 9`.

### 4.3 OPEN: #25 Senate, number of Russian Troops replaced

The aid says "Play if able to replace **a** Russian cube where Reds and Senate." `disarm()` replaces **every** Russian Troop in the space. It also sets `u=0` even when fewer Senate Cells are Available than Troops, so the excess Troops are removed with nothing replacing them. **Check the physical #25 card text.**

### 4.4 MINOR: #7 Moderates Cell fallback

The aid's last tier is "(3) In a random 1+ Pop space". The ranking in `manifest()` falls back to a 0-Population space when no 1+ Population space qualifies. This only happens in a rare edge case.

### 4.5 CONFIRM: #27 and #41 bot Attack Strength

The aid says "Strength 5 +/- modifiers". The app also adds the card's free +2. This is already listed as an interpretation. Confirm against the physical card text.

### 4.6 OPEN RULES QUESTION: Personality ransom below 3 Resources

§3.2.3 says Terror cannot remove the Personality "without the Moderates transferring three Resources." `cleanSpace` transfers `min(Resources, 3)` and removes the Personality anyway. A stricter reading would make that Terror target illegal when Moderates have fewer than 3 Resources. The same question applies to the #20 ransom.

### 4.7 Documentation housekeeping

- Add the retreat-attrition reading (retreating Cells are not "removed" for the per-3-Cells attrition) to the interpretations table in `docs/Rules_and_Sources.md`. Today it appears only in the release notes.
- `CLAUDE_AUDIT.md` is still the v0.10.0 handoff, with the old hash `6179a1cd…`. Its open questions list #10, #13, #21, #40 and #42, which v0.10.1 reports as fixed. Mark those items resolved or replace the file with a v0.10.1 handoff.

## 5. Not verified

- Physical Android behaviour and a live tabletop session.
- Event cards not shown in photos. Only #20, #44 and #45 were checked against the physical cards.
