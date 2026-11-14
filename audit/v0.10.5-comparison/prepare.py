"""Prepare isolated comparison worktrees from the two v0.10.5 submissions."""
import argparse
from pathlib import Path
import re
import shutil
from stat import S_ISLNK
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
HTML = "All_Bridges_Burning_Solo.html"


def extract_notebook(source, target):
    (target / "src").mkdir(parents=True)
    raw = source.read_bytes()
    (target / HTML).write_bytes(raw)
    script = raw.decode("utf-8-sig").split("<script>", 1)[1].split("</script>", 1)[0]
    body = script.split("const modules={\n", 1)[1].split("\n};\nconst cache=Object.create(null);", 1)[0]
    modules = re.split(r'^"([a-z-]+\.js)": function\(require\) \{\n', body, flags=re.M)
    assert modules[0] == ""
    recovered = set()
    for name, module in zip(modules[1::2], modules[2::2]):
        end = re.search(r"\nreturn \{([\w,$ ]*)\};\n\},?\n?$", module)
        if end is None:
            raise ValueError(f"Unexpected module wrapper in {name}")
        exported = set(end[1].replace(" ", "").split(",")) - {""}
        code = re.sub(
            r'''^const \{([^}]+)\}=require\(['"]([^'"]+)['"]\);$''',
            lambda match: f"import {{{match[1]}}} from './{match[2]}';",
            module[:end.start()], flags=re.M
        )
        found = set()

        def restore_export(match):
            if match[2] in exported:
                found.add(match[2])
                return "export " + match[0]
            return match[0]

        code = re.sub(r"^(const|let|function|class)\s+([A-Za-z_$][\w$]*)", restore_export, code, flags=re.M)
        if found != exported:
            raise ValueError(f"Unexpected exports in {name}: {exported - found}")
        (target / "src" / name).write_text(code.rstrip()+"\n", encoding="utf-8")
        recovered.add(name)
    assert recovered == {source.name for source in (ROOT / "src").glob("*.js")}
    (target / "package.json").write_text('{"name":"notebook-audit","private":true,"type":"module","version":"0.10.5"}\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gemini", type=Path)
    parser.add_argument("notebook", type=Path)
    parser.add_argument("output", type=Path, help="New scratch directory")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True)
    gemini = output / "argon"
    gemini.mkdir()
    with ZipFile(args.gemini) as archive:
        for member in archive.infolist():
            if not (gemini / member.filename).resolve().is_relative_to(gemini) or S_ISLNK(member.external_attr >> 16):
                raise ValueError(f"Unexpected archive entry {member.filename!r}")
        archive.extractall(gemini)
    extract_notebook(args.notebook, output / "notebook")
    for label in ("argon", "notebook"):
        target = output / (label + "-verify")
        shutil.copytree(output / label, target)
        for folder in ("test", "audit", "saves"):
            shutil.copytree(ROOT / folder, target / folder, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
    print(output)


if __name__ == "__main__":
    main()
