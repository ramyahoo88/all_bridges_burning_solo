"""Exercise the delivered HTML in Chromium. No network is used by the app."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from time import perf_counter

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
KEY = "abb-companion.campaigns"
BACKUP = KEY + ".backup"
REJECTED = KEY + ".rejected"
FILES = ROOT / "saves"


def button(page, name):
    return page.get_by_role("button", name=name, exact=True)


def data(page, path):
    return page.locator(f'[data-bind="{path}"]')


def saved(page):
    expect(page.locator("#save-status")).to_have_text("Saved on this device")


def state(page):
    payload = json.loads(page.evaluate("(key)=>localStorage.getItem(key)", KEY))
    return next(x for x in payload["campaigns"] if x["id"] == payload["active"])


def go(page, tab):
    page.locator("nav").get_by_role("button", name=tab, exact=True).click()


def confirm_preview(page, label):
    button(page, label).click()
    expect(page.locator("#preview-panel")).to_be_visible()
    button(page, "Apply").click()
    saved(page)


def import_save(page, source):
    go(page, "Campaigns")
    page.locator("#import-file").set_input_files(source)
    expect(page.get_by_role("status").filter(has_text="Imported")).to_be_visible()
    saved(page)


def export_active(page):
    go(page, "Campaigns")
    with page.expect_download() as info:
        page.locator(".campaign-row").filter(has=button(page, "Resume")).get_by_role("button", name="Export", exact=True).click()
    return Path(info.value.path()).read_bytes()


def setup(page, seed=4, factions=("r",), mode="physical"):
    data(page, "new.name").fill("Browser campaign")
    data(page, "new.seed").fill(str(seed))
    data(page, "new.mode").select_option(mode)
    for f in ("r", "s", "m"):
        page.locator(f'[data-list="new.humans"][value="{f}"]').set_checked(f in factions)
    button(page, "Create campaign").click()
    saved(page)
    if mode == "physical":
        data(page, "intent.current").select_option("3")
        data(page, "intent.upcoming").select_option("4")
    confirm_preview(page, "Preview opening setup")
    confirm_preview(page, "Preview card start")


def new_page(browser, uri, *, mobile=False):
    settings = {
        "viewport": {"width": 393 if mobile else 1280, "height": 852 if mobile else 920},
        "is_mobile": mobile,
        "has_touch": mobile,
        "offline": True,
        "accept_downloads": True,
    }
    context = browser.new_context(**settings)
    page = context.new_page()
    page.set_default_timeout(5000)
    problems = []
    page.on("pageerror", lambda error: problems.append(str(error)))
    http = []
    page.on("request", lambda request: http.append(request.url) if request.url.startswith(("http:", "https:")) else None)
    page.goto(uri)
    expect(page.locator("main h1")).to_have_text("Campaigns")
    return context, page, problems, http


def vertical_slice(browser, uri, screenshots):
    ctx, page, errors, requests = new_page(browser, uri, mobile=True)
    setup(page)
    button(page, "Pass").click()
    confirm_preview(page, "Preview Pass")
    assert state(page)["game"]["tracks"]["r"] == 6
    before = state(page)["game"]
    button(page, "Preview Senate bot").click()
    expect(page.locator("#preview-panel h2")).to_have_text("Senate · Rally")
    expect(page.locator("#preview-panel")).to_contain_text("Inactive Senate")
    assert state(page)["game"] == before
    saved(page)
    page.reload()
    expect(page.locator("#preview-panel h2")).to_have_text("Senate · Rally")
    assert state(page)["game"] == before
    if screenshots:
        page.screenshot(path=str(screenshots / "phone-preview.png"), full_page=True)
    button(page, "Apply").click()
    assert button(page, "Apply").count() == 0
    saved(page)
    after = state(page)["game"]
    assert after["board"]["hel"]["sI"] == 2
    expect(page.locator("#tabletop-checklist")).to_contain_text("Helsinki")
    go(page, "Board")
    expect(page.locator(".space-card").filter(has_text="Helsinki")).to_contain_text("2 inactive")
    go(page, "Turn")
    button(page, "Undo · Senate · Rally").click()
    saved(page)
    assert state(page)["game"] == before
    button(page, "Redo · Senate · Rally").click()
    saved(page)
    assert state(page)["game"] == after
    page.reload()
    assert state(page)["game"] == after
    expect(page.locator("main h1")).to_have_text("Moderates · bot turn")
    go(page, "Board")
    page.locator(".space-card").filter(has_text="Helsinki").get_by_role("button", name="Correct", exact=True).click()
    data(page, "edit.spaces.hel.sI").fill("1")
    page.set_viewport_size({"width": 852, "height": 393})
    expect(data(page, "edit.spaces.hel.sI")).to_have_value("1")
    page.set_viewport_size({"width": 393, "height": 852})
    go(page, "Guide")
    go(page, "Board")
    page.locator(".space-card").filter(has_text="Helsinki").get_by_role("button", name="Correct", exact=True).click()
    expect(data(page, "edit.spaces.hel.sI")).to_have_value("1")
    button(page, "Preview correction").click()
    expect(page.locator("#preview-panel")).to_contain_text("Inactive Senate")
    button(page, "Apply").click()
    saved(page)
    assert state(page)["game"]["board"]["hel"]["sI"] == 1
    assert state(page)["game"]["rng"] == after["rng"]
    assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS phone file:// offline · setup, human, bot, deterministic preview reload, Apply, board, Undo/Redo, correction")


def imports(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri)
    import_save(page, FILES / "02-pending-event.json")
    button(page, "Resume").click()
    expect(page.locator("main h1")).to_contain_text("Tokoi")
    expect(data(page, "intent.edit.spaces.hel.sI")).to_have_value("0")
    data(page, "intent.note").fill("Physical resolution underway")
    data(page, "intent.edit.spaces.hel.sI").fill("1")
    original = export_active(page)
    assert json.loads(original)["campaigns"][0]["draft"]["intent"]["note"] == "Physical resolution underway"
    import_save(page, {"name": "round-trip.json", "mimeType": "application/json", "buffer": original})
    button(page, "Resume").click()
    expect(data(page, "intent.note")).to_have_value("Physical resolution underway")
    expect(data(page, "intent.edit.spaces.hel.sI")).to_have_value("1")
    page.reload()
    expect(data(page, "intent.note")).to_have_value("Physical resolution underway")
    import_save(page, FILES / "03-schema1-pending-event.json")
    button(page, "Resume").click()
    expect(data(page, "intent.edit.spaces.hel.sI")).to_have_value("0")
    migrated = json.loads(export_active(page))
    assert migrated["schema"] == 2 and migrated["campaigns"][0]["game"]["interrupt"]["kind"] == "manual"
    go(page, "Campaigns")
    page.locator("#import-file").set_input_files({"name": "broken.json", "mimeType": "application/json", "buffer": b"{"})
    expect(page.get_by_role("alert")).to_contain_text("Import failed")
    assert len(json.loads(page.evaluate("(key)=>localStorage.getItem(key)", KEY))["campaigns"]) == 3
    import_save(page, FILES / "05-pending-news.json")
    button(page, "Resume").click()
    expect(data(page, "intent.use")).to_be_checked()
    expect(data(page, "intent.rows.0.id")).to_have_value("vii")
    confirm_preview(page, "Preview extra Command")
    assert state(page)["game"]["news"] == []
    assert state(page)["game"]["tracks"]["r"] == 3
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS desktop file:// offline · pending Event export/import/reload, schema migration, corrupt import, pending News")


def aid_events(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri, mobile=True)
    import_save(page, FILES / "07-pending-hennala.json")
    button(page, "Resume").click()
    expect(page.locator("main h1")).to_contain_text("Hennala")
    data(page, "intent.count").fill("2")
    original = export_active(page)
    exported = json.loads(original)["campaigns"][0]
    assert exported["game"]["interrupt"]["event"] == 28
    assert exported["draft"]["intent"]["count"] == 2
    import_save(page, {"name": "hennala.json", "mimeType": "application/json", "buffer": original})
    button(page, "Resume").click()
    expect(data(page, "intent.count")).to_have_value("2")
    page.reload()
    expect(data(page, "intent.count")).to_have_value("2")
    before = state(page)["game"]
    button(page, "Preview changes").click()
    expect(page.locator("#preview-panel")).to_contain_text("Moderates Resources")
    assert state(page)["game"] == before
    page.reload()
    expect(page.locator("#preview-panel")).to_be_visible()
    assert state(page)["game"] == before
    button(page, "Apply").click()
    saved(page)
    after = state(page)["game"]
    assert [after["tracks"][k] for k in ("rPow", "sPow", "pol", "m")] == [2, 1, 6, 16]
    assert after["actions"] == [{"f": "m", "action": "event"}]
    expect(page.locator("#tabletop-checklist")).to_contain_text("Senate prisoners")
    page.get_by_role("button", name="Undo ·", exact=False).click()
    saved(page)
    assert state(page)["game"] == before
    page.get_by_role("button", name="Redo ·", exact=False).click()
    saved(page)
    assert state(page)["game"] == after

    import_save(page, FILES / "08-pending-manifesto.json")
    button(page, "Resume").click()
    expect(data(page, "intent.space")).to_have_value("ham")
    assert data(page, "intent.space").locator("option[value='hel']").count() == 0
    data(page, "intent.space").select_option("poh")
    go(page, "Board")
    go(page, "Turn")
    expect(data(page, "intent.space")).to_have_value("poh")
    confirm_preview(page, "Preview Event resolution")
    assert state(page)["game"]["board"]["poh"]["rI"] == 1
    assert state(page)["game"]["actions"] == [{"f": "m", "action": "event"}]

    import_save(page, FILES / "09-upgrade-preview.json")
    button(page, "Resume").click()
    expect(page.get_by_role("status").filter(has_text="Review a fresh preview")).to_be_visible()
    assert button(page, "Apply").count() == 0
    assert state(page)["game"]["actions"] == [{"f": "r", "action": "pass"}]
    confirm_preview(page, "Preview Senate bot")
    assert state(page)["game"]["actions"][1]["f"] == "s"
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS phone file:// offline · Hennala preview/reload/Apply/Undo/Redo, saved Manifesto choice, v0.9 preview refresh")


def reference_saves(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri)

    def resume(filename):
        import_save(page, FILES / filename)
        button(page, "Resume").click()
        return state(page)["game"]

    def preview_text():
        return page.locator("#preview-panel").text_content()

    before = resume("01-senate-rally.json")
    button(page, "Preview Senate bot").click()
    first = preview_text()
    page.reload()
    assert preview_text() == first
    assert state(page)["game"] == before
    assert "51" in first and "Helsinki" in first
    button(page, "Apply").click()
    saved(page)
    assert state(page)["game"]["board"]["hel"]["sI"] == 2

    for filename in ("02-pending-event.json", "03-schema1-pending-event.json"):
        before = resume(filename)
        original = json.loads(export_active(page))["campaigns"][0]
        assert original["game"]["rng"] == before["rng"]
        assert original["draft"]["intent"]["edit"]["spaces"]["hel"]["sI"] == 0
        go(page, "Turn")
        page.get_by_label("Event has no effect", exact=False).check()
        button(page, "Preview continuation").click()
        expect(page.locator("#preview-panel h2")).to_have_text("Reds · Rally")
        button(page, "Apply").click()
        saved(page)
        after = state(page)["game"]
        assert {"f": "r", "action": "event"} not in after["actions"]
        assert after["board"]["hel"]["sI"] == before["board"]["hel"]["sI"]

    resume("04-prepare-train-attack.json")
    button(page, "Preview Senate bot").click()
    expect(page.locator("#preview-panel h2")).to_have_text("Senate · Attack + Prepare")
    assert "Strength 6; hits" in preview_text()
    button(page, "Apply").click()
    saved(page)
    after = state(page)["game"]
    assert not after["sabotage"]
    assert after["board"]["tam"]["caps"]["s"] == ["train"]
    assert [after["board"]["tam"][k] for k in ("rI", "sI", "sA", "sTerror")] == [0, 3, 1, 1]
    assert after["tracks"]["rPow"] == 1
    assert after["news"] == [{"id": 1, "space": "tam", "owner": None}]

    resume("05-pending-news.json")
    confirm_preview(page, "Preview extra Command")
    after = state(page)["game"]
    assert after["tracks"]["r"] == 3 and after["board"]["vii"]["rI"] == 1
    assert after["actions"] == [{"f": "r", "action": "limited"}]

    resume("06-final-scoring.json")
    confirm_preview(page, "Preview Victory or Reset")
    assert state(page)["game"]["result"]["winner"] is None

    resume("07-pending-hennala.json")
    expect(data(page, "intent.count")).to_have_value("1")
    confirm_preview(page, "Preview changes")
    after = state(page)["game"]
    assert [after["tracks"][k] for k in ("rPow", "sPow", "pol", "m")] == [2, 2, 7, 16]
    assert after["actions"] == [{"f": "m", "action": "event"}]

    before = resume("08-pending-manifesto.json")
    assert before["board"]["tam"]["mI"] == 2
    assert data(page, "intent.space").locator("option[value='hel']").count() == 0
    confirm_preview(page, "Preview Event resolution")
    after = state(page)["game"]
    assert after["board"]["ham"]["rI"] == 1 and after["tracks"]["sC"] == 1
    assert after["actions"] == [{"f": "m", "action": "event"}]

    after = resume("09-upgrade-preview.json")
    expect(page.get_by_role("status").filter(has_text="Review a fresh preview")).to_be_visible()
    assert button(page, "Apply").count() == 0
    assert after["tracks"]["r"] == 6 and "spaceRolls" not in after
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS all nine reference campaign saves through import, preview and continuation")


def train_attack(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri, mobile=True)
    campaign = json.loads((FILES / "04-prepare-train-attack.json").read_text())
    entry = campaign["campaigns"][0]
    entry["draft"] = {}
    game = entry["game"]
    game["sabotage"] = []
    game["eligible"], game["actions"], game["ineligible"] = ["r", "s", "m"], [], None
    game["rng"] = 0
    ham, tam = (game["board"][id] for id in ("ham", "tam"))
    ham.update(sI=0, rI=1, caps={"r": ["train"], "s": []})
    tam.update(rI=2, sI=1, rPrep=0, caps={"r": ["cannon"], "s": []})
    game["news"] = [{"id": 1, "space": "ham", "owner": "r"}]
    import_save(page, {"name": "train-attack.json", "mimeType": "application/json",
                       "buffer": json.dumps(campaign).encode()})
    button(page, "Resume").click()
    data(page, "intent.command").select_option("Attack")
    expect(data(page, "intent.rows.0.from")).to_have_value("tam")
    data(page, "intent.rows.0.from").select_option("ham")
    data(page, "intent.rows.0.to").select_option("tam")
    data(page, "intent.rows.0.capCounts.train").fill("1")
    data(page, "intent.rows.0.localCount").fill("2")
    saved(page)
    page.reload()
    expect(data(page, "intent.rows.0.localCount")).to_have_value("2")
    button(page, "Preview changes").click()
    assert "Strength 3" in page.locator("#preview-panel").text_content()
    assert state(page)["game"]["news"][0]["space"] == "ham"
    button(page, "Apply").click()
    saved(page)
    after = state(page)["game"]
    assert after["board"]["tam"]["caps"]["r"] == ["cannon", "train"]
    assert after["news"] == [{"id": 1, "space": "tam", "owner": "r"}]
    assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS phone file:// offline · Train Attack controls, local Cells, Capabilities and carried News")


def recovery(browser, uri, screenshots):
    ctx, page, errors, requests = new_page(browser, uri, mobile=True)
    setup(page)
    go(page, "Campaigns")
    button(page, "New campaign").click()
    data(page, "new.name").fill("Quota test campaign")
    page.evaluate("""() => {
      const native = Storage.prototype.setItem;
      window.abbFail = 'quota';
      Storage.prototype.setItem = function(key, value) {
        if (window.abbFail && key.endsWith('campaigns'))
          throw new DOMException('injected', window.abbFail === 'quota' ? 'QuotaExceededError' : 'SecurityError');
        return native.call(this, key, value);
      };
    }""")
    button(page, "Create campaign").click()
    expect(page.locator("#save-status")).to_have_text("Storage full · unsaved")
    expect(page.get_by_role("alert")).to_contain_text("Storage is full")
    first = page.locator('[data-action="preview"]')
    first.scroll_into_view_if_needed()
    assert first.evaluate("(e)=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e}")
    if screenshots:
        page.screenshot(path=str(screenshots / "phone-storage-full.png"), full_page=True)
    assert json.loads(export_active(page))["campaigns"][0]["name"] == "Quota test campaign"
    page.evaluate("window.abbFail = 'blocked'")
    button(page, "Retry save").click()
    expect(page.locator("#save-status")).to_contain_text("Storage unavailable")
    page.evaluate("window.abbFail = null")
    button(page, "Retry save").click()
    saved(page)
    assert state(page)["name"] == "Quota test campaign"
    main = page.evaluate("(key)=>localStorage.getItem(key)", KEY)
    page.evaluate("([key,backup,main])=>{localStorage.setItem(backup,main);localStorage.setItem(key,'invalid primary')}", [KEY, BACKUP, main])
    page.reload()
    expect(page.locator("#save-status")).to_have_text("Recovery needed")
    with page.expect_download() as info:
        button(page, "Export unreadable original").click()
    assert Path(info.value.path()).read_text() == "invalid primary"
    button(page, "Restore previous save").click()
    saved(page)
    assert page.evaluate("(key)=>localStorage.getItem(key)", REJECTED) == "invalid primary"
    expect(button(page, "Export unreadable original")).to_be_visible()
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS phone controls · quota, unavailable writes, export unsaved work, recover a corrupt primary, archived bytes and notice hit test")


def tabs(browser, uri):
    ctx, p1, errors, requests = new_page(browser, uri)
    setup(p1)
    p2 = ctx.new_page()
    p2.goto(uri)
    expect(p2.locator("main h1")).to_have_text("Reds · your turn")
    button(p1, "Pass").click()
    confirm_preview(p1, "Preview Pass")
    expect(p2.locator("#save-status")).to_have_text("Other tab has newer data")
    data(p2, "intent.rows.0.id").select_option("vii")
    assert json.loads(export_active(p2))["campaigns"][0]["draft"]["intent"]["rows"][0]["id"] == "vii"
    assert state(p1)["game"]["tracks"]["r"] == 6
    go(p2, "Campaigns")
    button(p2, "Load newer local save").click()
    button(p2, "Confirm").click()
    button(p2, "Resume").click()
    expect(p2.locator("main h1")).to_have_text("Senate · bot turn")
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS two live file:// tabs · stale save warning and explicit reload")


def configurations(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri)
    for factions in [("r",), ("s",), ("m",), ("r","s"), ("r","m"), ("s","m")]:
        page.evaluate('localStorage.clear()')
        page.reload()
        setup(page, factions=factions, mode="digital")
        g = state(page)["game"]
        assert g["humans"] == list(factions)
        assert g["stage"] == "turn"
        expect(page.locator(".event-pair")).to_be_visible()
        assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS app-deck setup through real controls for all six published configurations")


def quality_of_life(browser, uri, screenshots):
    ctx, page, errors, requests = new_page(browser, uri, mobile=True)
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    setup(page)
    expect(page.locator("#command-summary")).to_contain_text("Estimated cost 1")
    data(page, "intent.rows.0.id").select_option("vaa")
    offset = data(page, "intent.rows.0.offset")
    offset.fill("2")
    expect(page.locator("#command-summary")).to_contain_text("Estimated cost 3")
    expect(offset).to_be_focused()
    offset.fill("0")
    data(page, "intent.rows.0.id").select_option("tam")
    recycling = page.locator('details[data-detail-key="intent-recycle"]')
    recycling.locator("summary").click()
    command = data(page, "intent.command")
    command.focus()
    command.press("ArrowDown")
    expect(command).to_have_value("Activism")
    expect(command).to_be_focused()
    assert recycling.evaluate("el => el.open")
    command.select_option("Rally")
    if screenshots:
        page.locator("#action-card").screenshot(path=str(screenshots / "phone-command.png"))

    go(page, "Board")
    expect(page.locator(".space-card")).to_have_count(13)
    page.get_by_role("button", name="Occupied", exact=False).click()
    assert 0 < page.locator(".space-card").count() < 13
    button(page, "Nearby").click()
    data(page, "boardNear").select_option("ham")
    expect(page.locator(".space-card").filter(has_text="Tampere")).to_contain_text("Adjacent · Rail")
    button(page, "All (13)").click()
    data(page, "boardFilter").fill("hame")
    expect(page.locator(".space-card")).to_have_count(1)
    expect(page.locator(".space-card")).to_contain_text("Häme")
    data(page, "boardFilter").fill("")
    data(page, "boardFaction").select_option("news")
    expect(page.locator(".space-card")).to_have_count(0)
    data(page, "boardFaction").select_option("all")

    for name in ["Helsinki", "Tampere"]:
        card = page.locator(".space-card").filter(has=page.get_by_role("heading", name=name, exact=True))
        card.get_by_role("button", name="Correct", exact=True).click()
        data(page, "edit.spaces." + ("hel" if name == "Helsinki" else "tam") + ".rI").fill("3")
        confirm_preview(page, "Preview correction")
    page.get_by_role("button", name="Last step", exact=False).click()
    expect(page.locator(".space-card")).to_have_count(1)
    expect(page.locator(".space-card")).to_contain_text("Tampere")
    go(page, "Turn")
    receipt = page.locator("#tabletop-checklist")
    checks = receipt.locator("input[data-check-item]")
    assert checks.count() > 1
    checks.first.check()
    expect(receipt).to_contain_text("Checked 1 of")
    saved(page)
    page.reload()
    expect(checks.first).to_be_checked()
    button(page, "Check all").click()
    assert checks.count() == receipt.locator("input[data-check-item]:checked").count()
    track_details = receipt.locator('details[data-detail-key="receipt-tracks"]')
    track_details.evaluate("el => { el.open = false; }")
    page.evaluate("""window.print = () => {
      window.abbPrinted = document.querySelector('#tabletop-checklist').open &&
        document.querySelector('[data-detail-key="receipt-tracks"]').open;
    }""")
    button(page, "Print checklist").click()
    assert page.evaluate("window.abbPrinted")
    assert not track_details.evaluate("el => el.open")
    page.emulate_media(media="print")
    expect(receipt).to_be_visible()
    expect(page.locator(".turn-main .context")).to_be_hidden()
    page.emulate_media(media="screen")
    page.get_by_role("button", name="Undo · Board correction", exact=True).click()
    expect(receipt.locator("input[data-check-item]:checked")).to_have_count(0)

    go(page, "Campaigns")
    button(page, "Rename").click()
    data(page, "rename.name").fill("Winter campaign")
    button(page, "Save name").click()
    button(page, "Duplicate").click()
    expect(page.locator(".campaign-row")).to_have_count(2)
    saved(page)
    assert state(page)["name"] == "Winter campaign (Copy)"
    exported = json.loads(export_active(page))["campaigns"][0]
    assert exported["name"] == "Winter campaign (Copy)"
    saved(page)
    page.reload()
    go(page, "Campaigns")
    expect(page.locator("#backup-state")).to_contain_text("Last saved")
    expect(page.locator("#backup-state")).to_contain_text("Last exported")
    assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS phone controls · live estimates, focus, board filters, saved checklist, print, history, rename and duplicate")


def recover_draft(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri)
    corpus = json.loads((FILES / "05-pending-news.json").read_text())
    original = corpus["campaigns"][0]
    original["draft"]["intent"]["rows"] = None
    raw = json.dumps(corpus)
    import_save(page, {"name": "unfinished-form.json", "mimeType": "application/json", "buffer": raw.encode()})
    expect(page.get_by_role("status").filter(has_text="Damaged form fields were cleared")).to_be_visible()
    button(page, "Resume").click()
    expect(page.locator("main h1")).to_contain_text("News")
    assert state(page)["game"] == original["game"]
    page.evaluate("([key, raw]) => localStorage.setItem(key, raw)", [KEY, raw])
    page.reload()
    expect(page.locator("main h1")).to_contain_text("News")
    expect(page.get_by_role("status").filter(has_text="Damaged form fields were cleared")).to_be_visible()
    assert page.evaluate("key => localStorage.getItem(key)", KEY) == raw

    before = original["game"].copy()
    before["issues"] = ["r", None, None]
    before["tracks"]["rIssue"] = 1
    original.update(game=before, draft={})
    import_save(page, {"name": "resolved-issue.json", "mimeType": "application/json", "buffer": json.dumps(corpus).encode()})
    button(page, "Resume").click()
    go(page, "Board")
    button(page, "Correct board").click()
    details = page.locator('details[data-detail-key="edit-markers"]')
    details.locator("summary").click()
    issue = data(page, "edit.issues.0")
    expect(issue).to_have_value("r")
    issue.select_option("")
    go(page, "Board")
    button(page, "Correct board").click()
    details.locator("summary").click()
    expect(issue).to_have_value("")
    confirm_preview(page, "Preview correction")
    assert state(page)["game"]["issues"] == [None, None, None]
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS malformed draft import and startup recovery, preserved pending game, and cleared Issue after navigation")


def repair_fixtures(kind, directory):
    subprocess.run(["node", str(ROOT / "test/repair-fixtures.mjs"), kind, str(directory)], check=True)


def march_continuation(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri, mobile=True)
    with tempfile.TemporaryDirectory(prefix="abb-march-") as temp:
        directory = Path(temp)
        repair_fixtures("march", directory)
        import_save(page, directory / "march.json")
    button(page, "Resume").click()
    expect(page.get_by_role("status").filter(has_text="Review a fresh preview")).to_be_visible()
    before = state(page)
    assert not button(page, "Apply").count()
    button(page, "Preview Senate bot").click()
    expect(page.locator("#preview-panel h2")).to_have_text("Senate · March + Prepare")
    decision_log = page.locator('#preview-panel details[data-detail-key="preview-log"]')
    if not decision_log.evaluate("(details)=>details.open"):
        decision_log.locator("summary").click()
    expect(decision_log).to_contain_text("Uusimaa → Helsinki")
    saved(page)
    page.reload()
    expect(page.locator("#preview-panel h2")).to_have_text("Senate · March + Prepare")
    assert state(page)["game"] == before["game"]
    button(page, "Apply").click()
    saved(page)
    board = state(page)["game"]["board"]
    assert [board["hel"]["sA"], board["hel"]["sI"], board["uus"]["sA"], board["uus"]["sI"]] == [3, 0, 1, 3]
    assert board["uus"]["caps"]["s"] == ["train"] and board["hel"]["caps"]["s"] == []
    assert not state(page)["game"]["sabotage"]
    expect(page.locator("#tabletop-checklist")).to_contain_text("Senate March")
    expect(page.locator("#tabletop-checklist")).to_contain_text(f"v{VERSION}")
    page.locator('[data-action="undo"]').click()
    saved(page)
    assert state(page)["game"] == before["game"]
    page.get_by_text("Tabletop resolution option", exact=True).click()
    page.get_by_label("Resolve a bot Command using the boxed card").check()
    button(page, "Preview Senate bot").click()
    expect(page.locator("#preview-panel h2")).to_contain_text("#59 March")
    button(page, "Apply").click()
    saved(page)
    guided = state(page)["game"]
    assert guided["interrupt"]["scope"] == "bot-command"
    assert guided["board"] == before["game"]["board"]
    assert guided["sabotage"] == before["game"]["sabotage"]
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS #59 continuation, v0.10.6 preview refresh, reload, Apply, Undo and tabletop mode")


def import_at_capacity(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri)
    with tempfile.TemporaryDirectory(prefix="abb-capacity-") as temp:
        directory = Path(temp)
        repair_fixtures("capacity", directory)
        raw = (directory / "full.json").read_text()
        page.evaluate("([key,raw])=>localStorage.setItem(key,raw)", [KEY, raw])
        page.reload()
        go(page, "Campaigns")
        expect(page.locator(".campaign-row")).to_have_count(250)
        page.locator("#import-file").set_input_files(directory / "older.json")
        expect(page.locator("#error-note")).to_contain_text("250 campaigns")
        expect(page.locator(".campaign-row")).to_have_count(250)
        assert page.evaluate("key=>localStorage.getItem(key)", KEY) == raw
        current = json.loads(raw)["campaigns"][0]
        row = page.locator(".campaign-row").filter(has=page.get_by_text("Existing campaign", exact=True))
        with page.expect_download() as export:
            row.get_by_role("button", name="Export", exact=True).click()
        exported = json.loads(Path(export.value.path()).read_bytes())["campaigns"][0]
        assert exported["id"] == current["id"]
        assert exported["game"]["tracks"]["r"] == 12
        assert exported["draft"]["boardFilter"] == "Häme"
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print("PASS a same-ID older export preserves the current campaign and draft at the 250-campaign limit")


def split_backups(browser, uri):
    ctx, page, errors, requests = new_page(browser, uri)
    with tempfile.TemporaryDirectory(prefix="abb-backup-") as temp:
        directory = Path(temp)
        repair_fixtures("backups", directory)
        source = directory / "campaigns.json"
        original = json.loads(source.read_text())["campaigns"]
        for total in (80,160):
            page.locator("#import-file").set_input_files(source)
            expect(page.locator(".campaign-row")).to_have_count(total,timeout=30000)
        expect(page.locator("#save-status")).to_have_text("Storage full · unsaved",timeout=30000)
        started = perf_counter()
        button(page, "Export all").click()
        expect(button(page, "Download part 1 of 2")).to_be_visible()
        preparation = perf_counter() - started
        exported = []
        payload = []
        for part in (1,2):
            with page.expect_download() as download:
                button(page, f"Download part {part} of 2").click()
            path = directory / download.value.suggested_filename
            download.value.save_as(path)
            assert path.stat().st_size <= 16_000_000
            exported.append(path)
            payload.extend(json.loads(path.read_text())["campaigns"])
        for actual, expected in zip(payload,original*2,strict=True):
            assert {k:v for k,v in actual.items() if k!="id"} == {k:v for k,v in expected.items() if k!="id"}
        assert len({campaign["id"] for campaign in payload}) == 160

        # Reload clears the unsaved collection. Restore each downloaded file through the app.
        page.reload()
        expect(page.locator(".campaign-row")).to_have_count(0)
        count=0
        for path in exported:
            count += len(json.loads(path.read_text())["campaigns"])
            page.locator("#import-file").set_input_files(path)
            expect(page.locator(".campaign-row")).to_have_count(count,timeout=30000)
        assert count == 160
        expect(page.locator("#save-status")).to_have_text("Storage full · unsaved",timeout=30000)
        first = page.locator(".campaign-row").filter(has=page.get_by_text("Häme and Tampere", exact=True)).first
        with page.expect_download() as download:
            first.get_by_role("button",name="Export",exact=True).click()
        restored = json.loads(Path(download.value.path()).read_bytes())["campaigns"][0]
        assert restored["draft"]["boardFilter"] == "Häme"
        assert restored["undo"] == original[0]["undo"]
        total_bytes = sum(path.stat().st_size for path in exported)
    assert not errors and not requests, (errors, requests)
    ctx.close()
    print(f"PASS exported and restored 160 campaigns in two JSON files ({total_bytes:,} bytes), prepared in {preparation:.2f} s")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", type=Path, default=ROOT / "All_Bridges_Burning_Solo.html")
    parser.add_argument("--chromium", help="Chromium executable. Defaults to Playwright Chromium.")
    parser.add_argument("--headless-shell", action="store_true", help="Use single-process flags for a constrained headless shell.")
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--case", choices=["all", "vertical", "imports", "aid-events", "reference-saves", "train-attack", "recovery", "tabs", "configs", "quality-of-life", "recover-draft", "march-continuation", "import-at-capacity", "split-backups"], default="all")
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    flags = ["--no-sandbox"]
    if args.headless_shell:
        flags += ["--no-zygote", "--single-process", "--disable-gpu", "--disable-dev-shm-usage"]
    suite = {
        "vertical": lambda browser, uri: vertical_slice(browser, uri, args.screenshots),
        "imports": imports,
        "aid-events": aid_events,
        "reference-saves": reference_saves,
        "train-attack": train_attack,
        "recovery": lambda browser, uri: recovery(browser, uri, args.screenshots),
        "tabs": tabs,
        "configs": configurations,
        "quality-of-life": lambda browser, uri: quality_of_life(browser, uri, args.screenshots),
        "recover-draft": recover_draft,
        "march-continuation": march_continuation,
        "import-at-capacity": import_at_capacity,
        "split-backups": split_backups,
    }
    uri = args.html.resolve().as_uri()
    with sync_playwright() as playwright:
        # Separate launches also work with a Chromium shell limited to one process.
        for case, run in suite.items():
            if args.case not in ("all", case):
                continue
            browser = playwright.chromium.launch(executable_path=args.chromium, args=flags)
            try:
                run(browser, uri)
                print("Chromium", browser.version, flush=True)
            finally:
                browser.close()


if __name__ == "__main__":
    main()
