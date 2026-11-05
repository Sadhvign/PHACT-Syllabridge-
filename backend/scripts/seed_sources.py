"""Load the public ASPPH reference documents into the knowledge base and start a sync.

Run from backend/:  .\\.venv\\Scripts\\python.exe -m scripts.seed_sources
Sources that already exist are left unchanged.
"""

from pathlib import Path

from app import sources

DATA = Path(__file__).resolve().parents[2] / "ASPPH" / "Data"
# Text transcriptions of image-only sources, which the knowledge base can't read directly.
TRANSCRIBED = Path(__file__).resolve().parent / "transcribed"
WORKFORCE = "ASPPH Initiatives/Center for Public Health Workforce Development"
CPHWD = "ASPPH Center for Public Health Workforce Development"

CATALOG = [
    ("ceph-competencies", "CEPH Accreditation Criteria: Competencies", "Competency framework",
     "Council on Education for Public Health (CEPH)", "CEPH competency guidelines.pdf"),
    ("aspph-ai-framework", "ASPPH AI Framework", "AI in education guidance", "ASPPH",
     "ASPPH Initiatives/ASPPH AI Framework.pdf"),
    ("aspph-competency-mapping", "Competency Mapping", "Workforce development", CPHWD,
     f"{WORKFORCE}/Workforce Development/Competency Mapping.pdf"),
    ("aspph-leadership-report-2025", "Public Health Leadership Report 2025", "Workforce research",
     CPHWD, f"{WORKFORCE}/Workforce Development/Public+Health+Leadership+Report+2_2025_ASPPH.pdf"),
    ("aspph-workforce-development", "Workforce Development", "Workforce development", CPHWD,
     f"{WORKFORCE}/Workforce Development/Workforce Development - Association of Schools and "
     "Programs of Public Health (ASPPH).pdf"),
    ("aspph-workforce-research", "Workforce Research", "Workforce research", CPHWD,
     f"{WORKFORCE}/Workforce Research/Workforce Research - Association of Schools and Programs "
     "of Public Health (ASPPH).pdf"),
    ("governmental-ph-factsheet", "Governmental Public Health Workforce Fact Sheet",
     "Workforce research", CPHWD,
     f"{WORKFORCE}/Workforce Research/GovernmentalPublicHealth-Factsheet.pdf"),
    ("di-jta-factsheet", "Disease Intervention Job Task Analysis Fact Sheet", "Workforce research",
     CPHWD, f"{WORKFORCE}/Workforce Research/DI_JTA_fact_sheet_updated2026.pdf"),
    ("aspph-phig-shared-vision-2024", "Shared Vision and Unified Strategy 2024", "Partnerships",
     CPHWD, f"{WORKFORCE}/Partnerships/Shared+Vision+&+Unified+Strategy+2024_ASPPH_PHIG.pdf"),
    ("aspph-academic-practice", "Academic and Practice Partnerships", "Partnerships", CPHWD,
     f"{WORKFORCE}/Partnerships/Academic and Practice Partnerships - Association of Schools and "
     "Programs of Public Health (ASPPH).pdf"),
    ("aspph-applied-learning", "Applied Learning and Training", "Applied practice", CPHWD,
     f"{WORKFORCE}/Applied Practice/Applied Learning and Training - Association of Schools and "
     "Programs of Public Health (ASPPH).pdf"),
    ("aspph-credentialing-ce", "Credentialing and Continuing Education", "Continuing education",
     CPHWD, f"{WORKFORCE}/Continuing Education/Credentialing and Continuing Education - "
     "Association of Schools and Programs of Public Health (ASPPH).pdf"),
    ("aspph-disease-intervention", "Disease Intervention", "Continuing education", CPHWD,
     f"{WORKFORCE}/Continuing Education/Disease Intervention.pdf"),
    ("aspph-cdi-information", "CDI Information", "Continuing education", CPHWD,
     f"{WORKFORCE}/Continuing Education/CDI information.pdf"),
    ("chw-competencies", "Community Health Worker Competencies", "Competency framework",
     "Public competency framework", "Other Competencies/CHW competencies.pdf"),
    ("cph-exam-competencies", "CPH Exam Competencies", "Competency framework",
     "Public competency framework", "Other Competencies/CPH exam competencies.pdf"),
    ("sophe-ches-competencies", "SOPHE and CHES Competencies", "Competency framework",
     "Public competency framework", "Other Competencies/SOPHE and CHES competencies.pdf"),
    ("cdi-competency-domains", "Certified in Disease Intervention (CDI) Exam Domains",
     "Competency framework", "Public competency framework",
     TRANSCRIBED / "cdi-competency-domains.md"),
    ("lss-program-management", "Lean Six Sigma Program Management Principles",
     "Program management principles", "Public competency framework",
     TRANSCRIBED / "lss-program-management-principles.md"),
]


def main() -> None:
    added = 0
    for source_id, title, source_type, owner, relative in CATALOG:
        if sources.get_source(source_id):
            print(f"exists   {source_id}")
            continue
        path = relative if isinstance(relative, Path) else DATA / relative
        sources.publish(
            actor_id="seed-script",
            source_id=source_id,
            meta={"title": title, "sourceType": source_type, "owner": owner},
            file_name=path.name,
            body=path.read_bytes(),
        )
        added += 1
        print(f"added    {source_id}")
    state = sources.request_sync("seed-script")
    print(f"{added} source(s) added; active ingestion job: {state.get('activeJobId', 'none')}")


if __name__ == "__main__":
    main()
