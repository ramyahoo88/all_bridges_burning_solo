# Rules and sources

## Reference set

Reviewed November 13, 2026. Page references use the printed page numbers.

| Reference | Edition and role | Where to find it |
|---|---|---|
| Rules of Play | GMT Living Rules, November 2023. Baseline, including §8 and the setup on p. 32. | [GMT PDF](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingRules.pdf) |
| Playbook | GMT Living Playbook, November 2023. Examples on pp. 8–20 and 21–28. P. 26 includes a small image of the front of the Solitaire Play Aid. | [GMT PDF](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingPlaybook.pdf) |
| Faction and German flowcharts | English Living Flowcharts, listed November 2020. PDF metadata September 29, 2020. Also checked the GMT-hosted Spanish charts for the three factions, January 2021 PDF metadata. | [English flowcharts](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBPAC2FlowchartsLivingOct-20.pdf) · [Reds](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/Tablas_ABB_Rojos.pdf) · [Senate](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/Tablas_ABB_Senado.pdf) · [Moderates](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/Tablas_ABB_Moderados.pdf) |
| Official errata | GMT-linked official errata updated October 19, 2020. Compared the rules, printed map, and player aid corrections with the Living Rules. | [Official document](https://docs.google.com/document/d/1WHHFaf4bPh8prvNc9Fjos4-SgEk6cclajsMwy4mWO8A/edit) |
| Replacement bot cards | GMT download dated October 15, 2020 in PDF metadata. Sheet covers #49, #50, #53, #54, #55, #56, #59, and #62. The Living Rules describe all 17 cards. | [GMT PDF](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABB_CardEdits-download.pdf) |
| Map corrections | GMT map stickers accompanying the 2020 update. Checks POW timing, Russian box label, and removal of the extra Cell-flip instruction. | [GMT PDF](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABB_MapStickers-FINAL.pdf) |
| Printed map, 47-card set, and Sequence of Play/Attack sheet | GMT-approved Vassal module v1.2, October 8, 2020. Reviewed images for identifiers, titles, icons, and card sides. Used the printed map and updated rules when aids disagree. | [Vassal archive and approval note](https://vassalengine.org/wiki_old/wiki/Module:All_Bridges_Burning) |
| Boxed Solitaire Play Aid, front | Boxed English sheet, copyright 2019, from the 2020 printing. Verified against the user’s November 13, 2026 photo and cross-checked with the Living Playbook p. 26 and the Spanish Playbook p. 34. | [English Playbook](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABBLivingPlaybook.pdf) · [Spanish Playbook](https://gmtwebsiteassets.s3-us-west-2.amazonaws.com/AllBridgesBurning/ABB_Playbook_Spanish.pdf) |
| Boxed Solitaire Play Aid, reverse | Boxed English sheet, copyright 2019, from the 2020 printing. The user’s November 13, 2026 photo supplies the full reverse. Compared each entry with its printed Event and checked the designer’s worked examples. | [GMT listing](https://www.gmtgames.com/p-675-all-bridges-burning-red-revolt-and-white-guard-in-finland-1917-18.aspx) · [Part 1, March 9, 2020](https://insidegmt.com/all-bridges-burning-solitaire-system-part-1/) · [Part 2, August 25, 2020](https://insidegmt.com/all-bridges-burning-solitaire-system-part-2/) · [Part 3, September 1, 2020](https://insidegmt.com/all-bridges-burning-solitaire-system-part-3/) |
| Optional variants | Designer discussion and separate two-player variant are alternate rules. The app uses §8 configurations of the boxed campaign. | [Post-publication variants](https://insidegmt.com/all-bridges-burning-some-post-publication-rules-variants/) |

The authoritative files are referenced by URL. The release bundles no card art, scanned components, or full GMT rule text.

## Rule-to-code and test map

| Rule | Implementation | Verification examples |
|---|---|---|
| Setup, §§1.4–1.12 and 8.1.2 | `src/model.js`, `src/data.js`, `src/random.js` | Official placements, out-of-play units, Resources, Population, Control, year blocks |
| §§2.2–2.4 | `src/sequence.js`, `src/engine.js` | Both §2.2.5 examples, third actor, immediate Propaganda, 26/27 Cells, forced Reds eligibility |
| §§3.1–3.3 and 4.1–4.3 | `src/actions.js`, `src/human.js`, `src/engine.js` | Rally offsets and zero cost, Terror at 5/6, Personality ransom, Attack roll 3 and natural 6, Retreat attrition, paid boost, Message Capture, Publish 8, mid-Command payment |
| §3.4 and German Actions aid | `src/sequence.js`, `src/rounds.js` | German timing boundaries and campaign transitions |
| §§5.1–5.4, 8.1.4–8.1.7 | `src/events.js`, `src/bot-events.js`, `src/event-redeploy.js`, `src/bots.js`, `src/engine.js` | Train Pass, blocked Event, #18 ineffective, #20 News protection, #25 replacement limits, #27 and #41 Strength, saved #7/#28/#34 interruptions |
| §§6.1–6.5, 7.1–7.3, 8.1.8–9, 8.7 | `src/rounds.js`, `src/model.js` | Zero-Population Support, first-space Issue cost, Conscription, Old News, solo checks, foreign power tie, exact Agitation thresholds and Train placement |
| §§8.2–8.6 | `src/bot-rally.js`, `src/bot-operations.js`, `src/bots.js` | #54 Mikkelin, #58 Prepare then Attack, #59 gate, #60 Personality reinforcement, rejected cards, seeded ties, printed Random Spaces Map |
| Preview, save and correction | `src/engine.js`, `src/editor.js`, `src/storage.js`, `src/ui*.js` | Double-Apply prevention, rollback, migration, interrupted exports, quota, recovery, conflict and actual browser controls |

## Interpretations and open questions

| Point | Interpretation in v0.10.2 |
|---|---|
| Full Command without a Special Activity | It uses the Command box and becomes Ineligible. Both the printed map and the Playbook’s instruction to record the full Command support this reading. A one-space bot Command with no Special Activity uses the Limited box when available. |
| #50 and #56 Activism | The replacement cards and §7.2 use the sum of Vassalage and Polarization. #56 reuses its Phase I condition roll. In Phase II the Town Population condition has no die, so the app applies #50's activation check after the condition passes. Full #56 first chooses enemy flips or, if there are none and the last Campaign allows it, removes existing Active Cells before applying a successful activation. Limited #56 uses one option. #50 counts same-space calming and Agitation as two options for eligibility. |
| #59 green box | The October errata sheet repeats “OR” in the replacement card wording. The November 2023 Living Rules explicitly require both Attack gates to be absent. The app follows that reading. |
| #53 Senate Population | The printed replacement says Senate Town Population for the March threshold. The Living Rules say four Population and then target a Town. The app uses the Town Population threshold. |
| Senate #58 and #59 Prepare | Both try a pre-Command repair, then use Limited if repair is unavailable and the box is open. The explicit Prepare requirement and replacement #59 take precedence over the trailing Foreign Relations reference in §8.4.6. A rejected draw keeps its condition and deck rolls. A speculative repair and its tie roll apply only with an executable Command. |
| Reds Capability check | Per §8.1.4(3) and the October 19, 2020 official errata under Solitaire Player Aid Card, the Reds roll must exceed twice their current Capability count plus two. Count Capabilities on the map and in the Capabilities box. |
| Terror timing | The 2020 correction and the designer's two-space example support using the starting Polarization for all Terror removals. Raise the track after the Command’s removals. |
| Terror and Agitation costs | A Terror Command costs one Resource per selected space or Political Display. For Reds Activism Agitation (§3.2.2), one additional Resource clears all Terror in the selected space. During Propaganda Agitation (§6.4.2), clearing Terror costs one Resource per marker where the rule requires clearance. |
| Personality ransom with fewer than three Resources | The app interprets the ransom in §3.2.3 and on Event #20 as an effect triggered by removal. Transfer up to three of the Moderates' existing Resources, subject to the §1.5 track limits and §8.1.2 for a non-player Reds or Senate recipient. GMT's published example does not address a shortfall directly. |
| Victory threshold for Moderates | §7.2 and the faction chart allow equality between Issues + Networks + 1 and Polarization, even though §6.1’s shorthand calls for a positive margin. The app uses the explicit early threshold. Final power victory uses the nonpositive-margin rule in §7.3. |
| Random tie resolution | New campaigns use the printed two-die entries and arrows. Existing campaigns use the uniform die alternative in §8.6. For a tied Prepare border, use the end closer to a Train as its map location. If its ends are equally close, use the first space in the border ID. A tie remaining within the chosen space uses a uniform draw. |
| News, Personality, and stacked Cells | The board tracks holder faction and space. March, Train Attack and Retreat carry held News when no friendly Cell remains. In a partial move the app keeps one marker per available Cell at the origin and moves any excess with the departing group. Resolve exact carrier assignments and Capture ties using the tabletop workflow. |
| Retreat attrition | Under §3.2.4, count only enemy Cells removed from play toward the one-per-three attrition. Retreat relocates those Cells. German Troops still go to Available during Retreat and each causes its usual attrition. |
| Train positions | The app records Train type and space. Multiple rail exits within the same Province share a space-level model. Use the tabletop workflow for a choice that depends on the Train's printed slot. A human Train Attack can add Cells and Russian Troops already at the target. The two strongest Capabilities in that space apply by default. |
| Final Propaganda | Senate and Reds aim for exactly 5 combined Vassalage and Polarization. Moderates aim for Issues + Networks + 1 when they have 15+ Resources. Each skips the reduction if the target is unreachable. Senate may buy multiple reductions in one eligible space within its overall limit under §6.4.2. Reds and Moderates need one eligible unused space per step. |
| Moderates Opposition priority during Propaganda | In boxed Agitation step 2, shift an eligible space toward Neutral only as far as needed to bring Opposition + Administrations to 9 or less. A Population-2 step can bring the total from 10 to 8. Count the selected space as used, then continue the remaining priorities with other eligible spaces. |
| #5/#6/#9 shifts and #13 placement | The specific instruction supersedes §8.1.7 when the aid names direction and Population. #13 takes the largest Town Population gain. For an equal gain, prefer one Active Cell to two Inactive Cells. |
| #7 named factions and placement | The named human Reds choose their placement before the cube. The Moderates bot follows the three boxed placement tiers. If none applies, the app uses a random legal space under §5.1 and §8.1.6. A zero-Population space can then qualify if it lacks Active Support. |
| #10 placement | Apply the Rally targeting priorities to two direct Cell placements. Use separate qualifying spaces when possible. If only one space qualifies, place both there. |
| #20 removal | The second priority allows removing the last opposing military Cell or a Prepared marker when gaining Control is impossible. A last Moderates Cell carrying Personality may be removed when it gains Control because the card explicitly gives the ransom outcome. A last Moderates Cell holding News qualifies only if a Cell of the executing faction in the same Town can receive the News under §3.3.2. |
| #21 Administration source | The boxed bot instruction supplies the relocation option. Use an Available Administration first. Otherwise relocate one from Active Opposition while preserving existing Reds Control, using the §8.1.7 preference and the analogous #48 instruction. Place it directly without replacing two Cells. |
| #25 Senate replacements | The boxed instruction requires at least one possible replacement in a space with both factions. The printed unshaded Event then targets every Russian Troop in that space. Replace as many as there are Available Senate Cells and return any remaining Troops to Available under §1.4.2. Vassalage stays fixed. |
| #27 and #41 Attack Strength | Start at the bot baseline of 5 for Reds and 7 for Senate under §8.1.3. Both printed cards grant up to two free Strength as an Event modifier. Apply the full two before the other modifiers. #41 uses the aid's 3+ Senate Attack gate and separate 3+ German removal branch. |
| #28 Resources | Bot Moderates choose to add their own Resources before rolling. In the printed 10–14 gate, the 30 cap leaves room for every result, so the secondary enemy-reduction priority is never needed. The §6.5.1 release order and remaining-prisoner adjustment come first. |
| #29 Senate March | Pick the target and highest-Support adjacent Rally site, then March the resulting Senate group under the Event’s free March. The card has no explicit March group cap. |
| #39/#45 Issue protection | Opening with Limited closes the Event box. If a blocking opener is available but the entire mini-deck is ineffective, preserve the Issue and Pass. On #45, if a prior action already prevents a blocking opener, reserved Moderates may remove an Issue through the shaded side. Playbook p. 16 illustrates the blocking opener. |
| #40 casualty limit | Keep the normal Attack roll and automatic failure on 6, then limit casualties to half the friendly Cells rounded up. The boxed bot eligibility threshold is at least two opposing Cells or the named marker. An Administration is a legal final casualty once all defending Reds Cells are removed. |
| #42 redeployment | Test the hypothetical 3 without drawing dice. Maximize added Town Population and favor lower Support for tied gains. Use the minimum transfers needed to take those Towns. Preserve controlled Towns and enough Cells to retain Prepared and held News. Compare feasible allocations by how closely groups of 3+ Cells end with two Capabilities. Keep excess Capabilities with their donor if the recipient lacks room. |
| #45 Senate Vassalage | Lower German Vassalage first. In the last campaign with German Vassalage already zero, lower Russian Vassalage to give the Event a legal effect. |

## Source fingerprints

The following identify the reference bytes used during development.

| File | SHA-256 |
|---|---|
| English Living Rules | `dfb3b3031a8f6dd045b5a801a291d8289113945a244dddd684550d19d35ea9be` |
| English Living Playbook | `139fe0eacd6562b2fc73bd33d96b9e6013977cc3341138d088855f25a65603e7` |
| Living Flowcharts | `daec17c7d59fd255041ab16c59e7dd591f07b63b016570ea9aafbcf0e47f494e` |
| Replacement bot cards | `237b8ca179596125951b054541135eeb2e311c5d9d965808d8df2c8bbc9a2818` |
| Map stickers | `502ca36b874ef66bcd8e86d143e18fb2473ea8e16114df4105e26b473979f3a5` |
| Official errata, text export | `d44e727e7df2a9c67615b135a7283ce352736215f1ebe2653e11871918dcbee3` |
| Vassal v1.2 module | `d4bde30f44a38f16d8a31613ad473d60cfc8a8df7d5ba7d2f4dc838ff4067236` |
| Spanish Playbook | `d13b9f5371c7984bca90a8afc98596ffa56fe888dc030230d99171b69b8735ef` |
| Boxed Solitaire Play Aid front photo | `afda5bb61c24b96d38c77779711b490b49a05f9c9d42c4549737fefe67db6fcd` |
| Boxed Solitaire Play Aid reverse photo | `723857d0e654a537499593b107b574a727471c7a201d5370f184c24fa7618707` |
