"""Observe the v0.10.2 audit cases in the shipped offline HTML.

Requires the same Python Playwright installation as test/browser.py.
These observations deliberately demonstrate the old defects; they are not a
passing acceptance suite for a repaired release.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("abb_browser", ROOT / "test/browser.py")
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def fixture(kind):
    source = """
import {position} from './test/fixtures.mjs';
import {newCampaign,encodeCampaign} from './src/storage.js';
import {roll} from './src/random.js';
const kind=process.argv[1],g=position();
if(kind==='issues'){g.issues=['r',null,null];g.tracks.rIssue=1;}
if(kind==='activism'){
  g.board.hel.rI=6;g.board.tam.rI=1;
  g.rng=[...Array(1000).keys()].find(rng=>roll({rng},[])===3);
}
const c=newCampaign(kind,g);
if(kind==='malformed') c.draft={intent:{type:'human',action:'limited',command:'Rally',rows:null}};
process.stdout.write(encodeCampaign(c));
"""
    return subprocess.check_output(["node", "--input-type=module", "-e", source, kind], cwd=ROOT)


def open_fixture(page, kind):
    helpers.import_save(page, {"name": kind + ".json", "mimeType": "application/json", "buffer": fixture(kind)})
    helpers.button(page, "Resume").click()


def capture(page, folder, name):
    if folder:
        page.screenshot(path=str(folder / (name + ".png")), full_page=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chromium")
    parser.add_argument("--headless-shell", action="store_true")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    flags = ["--no-sandbox"]
    if args.headless_shell:
        flags += ["--no-zygote", "--single-process", "--disable-gpu", "--disable-dev-shm-usage"]
    observations = []
    with sync_playwright() as pw:
        for kind in ("issues", "activism", "malformed"):
            browser = pw.chromium.launch(executable_path=args.chromium, args=flags)
            ctx, page, errors, requests = helpers.new_page(browser, (ROOT / "All_Bridges_Burning_Solo.html").as_uri(), mobile=True)
            try:
                open_fixture(page, kind)
                if kind == "issues":
                    helpers.go(page, "Board")
                    capture(page, args.screenshots, "phone-board")
                    helpers.button(page, "Correct board").click()
                    page.get_by_text("News, Sabotage, Issues, and Capabilities box", exact=True).click()
                    field = helpers.data(page, "edit.issues.0")
                    field.select_option("")
                    helpers.saved(page)
                    assert helpers.state(page)["draft"]["edit"]["issues"][0] is None
                    helpers.go(page, "Guide")
                    helpers.go(page, "Board")
                    helpers.button(page, "Correct board").click()
                    page.get_by_text("News, Sabotage, Issues, and Capabilities box", exact=True).click()
                    shown = helpers.data(page, "edit.issues.0").input_value()
                    capture(page, args.screenshots, "issue-draft-reopened")
                    observations.append({"id": "F9", "storedDraft": None, "displayedValue": shown, "reproduced": shown == "r"})
                elif kind == "activism":
                    helpers.data(page, "intent.command").select_option("Activism")
                    focused = page.evaluate("document.activeElement.tagName")
                    page.locator('[data-list="intent.rows.0.sites"][value="tam"]').uncheck()
                    helpers.button(page, "Preview changes").click()
                    capture(page, args.screenshots, "activism-preview")
                    helpers.button(page, "Apply").click()
                    helpers.saved(page)
                    g = helpers.state(page)["game"]
                    observations.append({"id": "F6", "helsinkiActive": g["board"]["hel"]["rA"], "tampereActive": g["board"]["tam"]["rA"], "reproduced": g["board"]["hel"]["rA"] == 3 and g["board"]["tam"]["rA"] == 0})
                    observations.append({"id": "Q4", "focusAfterCommandChange": focused})
                else:
                    helpers.saved(page)
                    assert helpers.state(page)["draft"]["intent"]["rows"] is None
                    page.reload()
                    capture(page, args.screenshots, "malformed-draft-reload")
                    headings = page.locator("main h1").count()
                    observations.append({"id": "F8", "headingsAfterReload": headings, "pageErrors": list(errors), "reproduced": headings == 0 and bool(errors)})
                assert not requests, requests
                if kind != "malformed":
                    assert not errors, errors
                print("Chromium", browser.version, kind, flush=True)
            finally:
                browser.close()
    print(json.dumps(observations, indent=2))
    assert all(x.get("reproduced", True) for x in observations)


if __name__ == "__main__":
    main()
