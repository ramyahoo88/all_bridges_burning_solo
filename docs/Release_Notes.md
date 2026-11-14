# Release notes · v0.10.6

## Changes since v0.10.4

This build integrates the combat and interface improvements from Gemini's v0.10.5 submission into the v0.10.4 source, with additional repairs from the [comparison audit](Astra_v0.10.5_Comparison.md).

- When German defenders inflict attrition, alternate participating Reds Cells and Russian Troops while both are available. The bot chooses the group first on #52, #53, and #58. Bot Train Attacks count eligible pieces at the destination, and Attack previews explain each Strength modifier.
- A full #59 can send multiple groups from one origin and bring groups from different origins into the same destination. The bot may use original pieces from a space that received arrivals earlier in the Command. Each piece moves at most once.
- **Export all** splits a large workspace into numbered JSON files using UTF-8 sizes. Imports create new campaign copies and stop before changing the workspace if the combined count would exceed 250. Import accepts individual files up to 64 MB. Restored collections can exceed a browser's local storage quota. Export any progress marked unsaved before closing the app.
- The tabletop checklist identifies the campaign and uses the faction's Capability names.
- The app allows the Personality News effect when no political cube can be placed. Imprisonment increases Polarization when it also places a Terror marker. The [rules notes](Rules_and_Sources.md) record both readings and their sources.

Schema 2 and the reference saves carry forward. Generate a fresh preview for any pending action from an earlier app version.

## v0.10.4 integration

November 13, 2026. This build integrates Gemini's v0.10.3 changes onto the v0.10.2 repository and addresses the nine findings in the [Astra audit](Astra_Audit_v0.10.2.md).

## Changes since the v0.10.2 repository build

- German attackers keep their Troops after removing enemy Cells. German March chooses a route that reduces the distance to the nearest Reds or Russians and stays in place when neither is present.
- Senate March and Train Attack consider legal groups of three to five Cells. Card #59 selects a group before choosing its destination. A Moderates Cell stays ineligible to Message again after arriving, including when it was Captured or a Special Activity later Activates it.
- Human Activism can limit the number of Cells it Activates while distributing them as required. Unshaded #10 raises German Vassalage even when the Jaeger cannot be placed.
- Save recovery clears damaged form fields and preserves valid game progress. The Issue editor displays an explicitly cleared Issue as Unresolved. Create, duplicate, and import share the same campaign limit used when opening saved workspaces.
- The interface updates Command and Agitation estimates during edits, preserves keyboard focus and expanded sections, and adds Board filters, a printable checklist, campaign renaming and duplication, save and export times, and victory thresholds.
- Generate a fresh preview for actions saved by an earlier version, including Gemini's v0.10.3. Campaign files retain schema 2.

## Changes since v0.10.1

- Event #20 protects held News when removing its last Moderates carrier would leave no eligible recipient. The News transfers when a Cell of the executing faction is present.
- Moderates Agitation step 2 stops shifting as soon as Opposition + Administrations is 9 or less. Remaining eligible spaces proceed to the later priorities.
- Event #25 explains in the action log when Russian Troops return to Available because the Senate replacement pool has run out. The printed card and §1.4.2 support the existing outcome. The printed #27 and #41 cards also confirm their free +2 Strength modifier.
- The [rules notes](Rules_and_Sources.md) record the Reds Capability erratum, Terror costs, Retreat attrition and rulings for #7 and an underfunded Personality ransom.

Pending decisions from v0.9 and v0.10.x are supported. Generate a fresh preview for a pending action on upgrade. Save format remains schema 2.

## Changes since v0.10.0

- Retreating enemy Cells cause no Cell attrition. German Troops removed during a Retreat still count toward attrition. Held News travels with departing Cells when the remaining group cannot carry it.
- A human Train Attack can include local Cells and Russian Troops. A stationary Attack uses the strongest two Capabilities when none are selected. A Train Attack counts Capabilities at the target after movement.
- Reds can use a full Activism Command to flip or calm and then Agitate in the same space. The space selection costs one Resource, with the additional costs for Agitation and any Resolved Issues. An Agitation with no effect is rejected.
- Senate #56 checks its Phase II activation roll and removes only previously Active Cells when calming. The Reds #50 final Campaign can combine calming and Agitation in the same space under a full Command. #59 requires successful pre-Command Prepare for a full March, and an impossible March leaves speculative repair and rolls unapplied.
- #10 places the two Moderates Cells by Rally priorities. #13 picks the largest Town Population gain. #21 preserves the donor's Reds Control when it relocates an Administration. #42 preserves controlled Towns and donor markers, and weighs Capability allocation across feasible redeployments.
- Moderates final Agitation spends qualifying spaces on Polarization only if the threshold is reachable. Tied Prepare borders use the campaign's configured space tie procedure.
- The boxed thresholds for #40 and the Issue protection for #39 and #45 have regression tests. See [Rules and sources](Rules_and_Sources.md) for the event rulings.

## Changes in v0.10.0

- Added the bot Event instructions from the reverse of the boxed Solitaire Play Aid. The bot checks printed Pass and play conditions, executes the specified effects, and records its reason and targets in the preview.
- Automated the bot Reds step of Red Revolt, including the Helsinki priority. Capability placement and final Propaganda priorities now use the readable front of the aid.
- New campaigns roll the printed Random Spaces Map for ties between eligible spaces. Existing campaigns keep the seeded uniform-die option in §8.6.
- Hennala pauses for any human release decision before tallying Polarization and rolling Resources. The Manifesto pauses for a human Reds placement. Political Arrests can pause for human Senate Crackdown. These choices survive reload, export, and import.
- An open preview from an earlier app version returns to the saved choices on resume. Generate a fresh preview to apply the updated rules. Applied history and pending tabletop choices remain readable in the current save schema.

## Known limits

The board tracks spaces, piece facing, and each News holder by faction and space. Use the physical aid for exact rail slots, complex force splits, and particular carriers within a stack. Human Event sides, some unmarked bot Event sides, and Coordinate may prompt for a tabletop result. The source archive lists the interpretations used for abbreviated or conflicting Event instructions.

The release ran in offline Chromium on Linux at desktop and phone widths. Physical Android and in-person tabletop play are unverified.
