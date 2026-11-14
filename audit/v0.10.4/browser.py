"""Reproduce second-audit failures through the unchanged offline HTML controls."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("baseline_browser", ROOT / "test/browser.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

def load_fixture(page, path):
    base.go(page, "Campaigns")
    page.locator("#import-file").set_input_files(path)
    expect(page.get_by_role("status").filter(has_text="Imported")).to_be_visible(timeout=30000)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chromium", default="/tmp/chromium")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = {"cases": []}
    with tempfile.TemporaryDirectory(prefix="abb-audit2-") as temp:
        directory = Path(temp)
        subprocess.run(["node", "audit/v0.10.4/make-fixtures.mjs", temp], cwd=ROOT, check=True, capture_output=True)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, args=[
                "--no-sandbox", "--no-zygote", "--single-process", "--disable-gpu", "--disable-dev-shm-usage"])
            evidence["chromium"] = browser.version
            uri = (ROOT / "All_Bridges_Burning_Solo.html").as_uri()
            try:
                context, page, errors, requests = base.new_page(browser, uri, mobile=True)
                for filename, code, match in [
                    ("human-attrition.json", "F1", "Strength 5; hits"),
                    ("bot-train.json", "F3", "Strength 4; misses"),
                ]:
                    load_fixture(page, directory / filename)
                    base.saved(page)
                    base.button(page, "Resume").click()
                    page.locator('[data-action="preview"]').click()
                    expect(page.locator("#preview-panel")).to_contain_text(match)
                    page.locator("#preview-panel").screenshot(path=str(args.output / (code.lower()+"-phone-preview.png")))
                    base.button(page, "Apply").click()
                    base.saved(page)
                    b = base.state(page)["game"]["board"]["hel"]
                    observed = {key: b[key] for key in ("rI", "rA", "u", "g")}
                    if code == "F1":
                        assert observed == {"rI": 0, "rA": 0, "u": 2, "g": 0}
                    else:
                        assert observed["rI"] + observed["rA"] == 3
                    evidence["cases"].append({"id": code, "preview": match, "afterHelsinki": observed})
                assert not errors, errors
                assert not requests, requests
                context.close()
            finally:
                browser.close()
            # A fresh process avoids the one-context constraints of this shell build.
            browser = playwright.chromium.launch(executable_path=args.chromium, args=[
                "--no-sandbox", "--no-zygote", "--single-process", "--disable-gpu", "--disable-dev-shm-usage"])
            try:
                context, page, errors, requests = base.new_page(browser, uri)
                load_fixture(page, directory / "eighty-campaigns.json")
                expect(page.locator(".campaign-row")).to_have_count(80)
                load_fixture(page, directory / "eighty-campaigns.json")
                expect(page.locator(".campaign-row")).to_have_count(160)
                expect(page.locator("#save-status")).to_have_text("Storage full · unsaved", timeout=30000)
                with page.expect_download(timeout=30000) as download:
                    base.button(page, "Export all").click()
                export = directory / "exported-all.json"
                download.value.save_as(export)
                size = export.stat().st_size
                assert size > 16_000_000
                page.locator("#import-file").set_input_files(export)
                expect(page.locator("#error-note")).to_have_text("Import failed. This save file is too large.")
                expect(page.locator(".campaign-row")).to_have_count(160)
                page.locator("#error-note").screenshot(path=str(args.output / "f5-export-rejected.png"))
                evidence["cases"].append({"id": "F5", "campaigns": 160, "exportBytes": size,
                    "result": "Export All downloaded successfully; importing that exact file was rejected."})
                assert not errors, errors
                assert not requests, requests
                context.close()
            finally:
                browser.close()
    (args.output / "browser-evidence.json").write_text(json.dumps(evidence, indent=2)+"\n")
    print(json.dumps(evidence, indent=2))

if __name__ == "__main__":
    main()
