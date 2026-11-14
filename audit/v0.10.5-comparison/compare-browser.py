"""Reproduce failures in the supplied offline HTML with isolated browser contexts."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from time import perf_counter
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FLAGS = ["--no-sandbox", "--no-zygote", "--single-process", "--disable-gpu", "--disable-dev-shm-usage"]
spec = importlib.util.spec_from_file_location("reference_browser", ROOT / "test/browser.py")
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)


def open_candidate(playwright, work, label, chromium):
    browser = playwright.chromium.launch(executable_path=chromium, args=FLAGS)
    uri = (work / label / "All_Bridges_Burning_Solo.html").as_uri()
    return browser, ui.new_page(browser, uri)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path, help="Folder populated by prepare.py")
    parser.add_argument("--chromium", help="Path to Chromium, or use Playwright's installation")
    args = parser.parse_args()
    work = args.work.resolve()
    fixtures = work / "browser-fixtures"
    out = {}
    with sync_playwright() as playwright, tempfile.TemporaryDirectory(prefix="abb-candidate-audit-") as scratch:
        folder = Path(scratch)
        browser, (_, page, errors, requests) = open_candidate(playwright, work, "notebook", args.chromium)
        try:
            page.locator("#import-file").set_input_files(ROOT / "saves/01-senate-rally.json")
            expect(page.get_by_role("alert")).to_have_text("Import failed. MAX_SAVE_BYTES is not defined")
            import_error = page.get_by_role("alert").text_content()
            ui.button(page, "Create campaign").click()
            ui.saved(page)
            ui.go(page, "Campaigns")
            ui.button(page, "Export all").click()
            expect(page.get_by_role("alert")).to_have_text("splitCollection is not defined")
            out["notebookSaveControls"] = {"import":import_error,"exportAll":page.get_by_role("alert").text_content()}
            print("NotebookLM import and export errors reproduced", flush=True, file=sys.stderr)
            assert not errors and not requests, (errors, requests)
        finally:
            browser.close()

        browser, (_, page, errors, requests) = open_candidate(playwright, work, "argon", args.chromium)
        try:
            ui.import_save(page, fixtures / "march-source-destination.json")
            ui.button(page,"Resume").click()
            before = ui.state(page)["game"]
            page.locator('[data-action="preview"]').click()
            expect(page.get_by_role("alert")).to_contain_text("Record mixed or converging groups in the tabletop editor.")
            out["geminiMarch"] = {"error":page.get_by_role("alert").text_content(),"preservedOriginal":ui.state(page)["game"]==before}
            print("Gemini March preview error reproduced", flush=True, file=sys.stderr)
            assert not errors and not requests, (errors, requests)
        finally:
            browser.close()

        browser, (_, page, errors, requests) = open_candidate(playwright, work, "argon", args.chromium)
        try:
            data = (fixtures / "full-workspace.json").read_text()
            page.evaluate("([key, raw])=>localStorage.setItem(key, raw)", [ui.KEY, data])
            page.reload()
            latest = json.loads(data)["campaigns"][0]
            ui.import_save(page, fixtures / "earlier-campaign-export.json")
            db = json.loads(page.evaluate("key=>localStorage.getItem(key)", ui.KEY))
            replaced = next(c for c in db["campaigns"] if c["id"] == latest["id"])
            assert len(db["campaigns"]) == 250
            assert [latest["game"]["tracks"]["r"], replaced["game"]["tracks"]["r"]] == [12, 5]
            assert latest["draft"]["boardFilter"] == "recent changes"
            assert "boardFilter" not in replaced["draft"]
            out["geminiOldExport"] = {"resourcesBefore":12,"resourcesAfter":5,"campaigns":250,
                                      "importNotice":page.get_by_role("status").filter(has_text="Imported").text_content()}
            print("Gemini replaced the existing campaign with an older export", flush=True, file=sys.stderr)
            assert not errors and not requests, (errors, requests)
        finally:
            browser.close()

        subprocess.run(["node","audit/v0.10.4/make-fixtures.mjs",str(folder)],cwd=ROOT,check=True,capture_output=True)
        browser, (_, page, errors, requests) = open_candidate(playwright, work, "argon", args.chromium)
        try:
            for count in (80,160):
                page.locator("#import-file").set_input_files(folder / "eighty-campaigns.json")
                expect(page.locator(".campaign-row")).to_have_count(count,timeout=30000)
            expect(page.locator("#save-status")).to_have_text("Storage full · unsaved",timeout=30000)
            started = perf_counter()
            with page.expect_download(timeout=60000) as download:
                ui.button(page,"Export all").click(timeout=60000)
            exported = folder / "exported-all.json"
            download.value.save_as(exported)
            export_seconds = perf_counter() - started
            assert exported.stat().st_size > 16_000_000
            assert not errors and not requests, (errors, requests)
        finally:
            browser.close()

        browser, (_, page, errors, requests) = open_candidate(playwright, work, "argon", args.chromium)
        try:
            page.locator("#import-file").set_input_files(exported)
            expect(page.locator(".campaign-row")).to_have_count(160,timeout=45000)
            expect(page.get_by_role("status").filter(has_text="Imported 160 campaign copies.")).to_be_visible()
            out["geminiLargeBackup"] = {"bytes":exported.stat().st_size,"campaignsRestored":160,
                                       "exportSeconds":round(export_seconds,1),"localSaveStatus":page.locator("#save-status").text_content()}
            assert not errors and not requests, (errors, requests)
        finally:
            browser.close()

    print(json.dumps(out,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
