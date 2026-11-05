"""Build DOCX and PDF copies of the synthetic sample syllabus and check extraction."""

from pathlib import Path

from docx import Document

from app.extract import extract_text, guess_title

SAMPLES = Path(__file__).resolve().parents[2] / "samples"


def main() -> None:
    source = SAMPLES / "EPI-501-syllabus.txt"
    lines = source.read_text(encoding="utf-8").splitlines()

    document = Document()
    document.add_heading(lines[0], level=1)
    for line in lines[1:]:
        document.add_paragraph(line)
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "Component", "Weight"
    table.cell(1, 0).text, table.cell(1, 1).text = "Final project", "30%"
    docx_path = SAMPLES / "EPI-501-syllabus.docx"
    document.save(docx_path)

    for path in (source, docx_path):
        result = extract_text(path.suffix, path.read_bytes())
        words = len(result.text.split())
        print(f"{path.name}: {words} words, title={guess_title(result.text, '?')!r}")


if __name__ == "__main__":
    main()
