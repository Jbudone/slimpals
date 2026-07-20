#!/usr/bin/env python3
"""
create_feature.py — Discovery & Initial Queue Seeding

Runs the grill_me intake prompt sequence, compiles the PRD, decomposes it
into milestone stubs, seeds the milestone_queue in project_state.json,
and triggers create_issue.py for the first milestone.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

AGENT_DIR = Path(__file__).parent.parent
LEDGER_PATH = AGENT_DIR / "ledger" / "project_state.json"
PROMPTS_DIR = AGENT_DIR / "prompts"
SKILLS_DIR = AGENT_DIR / "skills"
DOCS_DIR = AGENT_DIR.parent / "docs"
DOCS_DIR.mkdir(exist_ok=True)


def load_ledger() -> dict:
    with open(LEDGER_PATH) as f:
        return json.load(f)


def save_ledger(state: dict) -> None:
    with open(LEDGER_PATH, "w") as f:
        json.dump(state, f, indent=2)


def load_prompt(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    return path.read_text()


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def run_grill_me_intake() -> dict:
    """
    Displays the grill_me prompt and collects user answers interactively.
    Returns a dict with feature_title and prd_content.
    """
    prompt = load_prompt("grill_me")
    print("\n" + "=" * 70)
    print("INTAKE AGENT: Feature Definition Protocol")
    print("=" * 70)
    print(prompt)
    print("\n" + "=" * 70)
    print("Answer the questions above. When complete, enter your PRD below.")
    print("Paste your PRD markdown content, then enter END on a new line:")
    print("=" * 70 + "\n")

    lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        lines.append(line)

    prd_content = "\n".join(lines)

    title_match = re.search(r"^#\s+PRD:\s+(.+)$", prd_content, re.MULTILINE)
    feature_title = title_match.group(1).strip() if title_match else "Untitled Feature"

    return {"feature_title": feature_title, "prd_content": prd_content}


def save_prd(feature_title: str, prd_content: str) -> Path:
    slug = slugify(feature_title)
    prd_path = DOCS_DIR / f"prd-{slug}.md"
    prd_path.write_text(prd_content)
    print(f"\n[create_feature] PRD saved to: {prd_path}")
    return prd_path


def extract_milestones(prd_content: str, feature_title: str) -> list[dict]:
    """
    Parses the Architectural Milestone Breakdown section of the PRD.
    Falls back to default tiers if the section is absent.
    """
    milestones = []
    section_match = re.search(
        r"##\s+Architectural Milestone Breakdown\n(.*?)(?:\n##|\Z)",
        prd_content,
        re.DOTALL,
    )

    if section_match:
        section = section_match.group(1)
        tier_matches = re.findall(
            r"-\s+(Tier \d+\s*[—-]\s*[^:]+):\s*(.+)", section
        )
        for i, (slice_label, description) in enumerate(tier_matches, start=1):
            milestones.append(
                {
                    "id": f"{slugify(feature_title)}-slice-{i}",
                    "title": slice_label.strip(),
                    "description": description.strip(),
                    "type": "afk",
                    "blocked_by": [],
                    "user_stories": [],
                    "feature": feature_title,
                    "status": "queued",
                    "created_at": datetime.utcnow().isoformat(),
                }
            )

    if not milestones:
        print(
            "[create_feature] WARNING: No 'Architectural Milestone Breakdown' section found in PRD.\n"
            "  Milestones should be vertical slices (each one delivers a complete end-to-end behavior),\n"
            "  not horizontal layers (Data Model / API / UI / Tests).\n"
            "  Add a 'Architectural Milestone Breakdown' section to your PRD and re-run."
        )
        sys.exit(1)

    return milestones


def seed_milestone_queue(milestones: list[dict]) -> None:
    state = load_ledger()
    state["milestone_queue"].extend(milestones)
    save_ledger(state)
    print(f"[create_feature] Seeded {len(milestones)} milestones into queue.")
    for m in milestones:
        print(f"  {m['title']}: {m['description']}")


def trigger_create_issue() -> None:
    script = SKILLS_DIR / "create_issue.py"
    print("\n[create_feature] Triggering create_issue.py for first milestone...")
    result = subprocess.run([sys.executable, str(script)], check=False)
    if result.returncode != 0:
        print(f"[create_feature] create_issue.py exited with code {result.returncode}.")
        sys.exit(result.returncode)


def main() -> None:
    print("[create_feature] Starting feature intake workflow...")

    intake = run_grill_me_intake()
    feature_title = intake["feature_title"]
    prd_content = intake["prd_content"]

    save_prd(feature_title, prd_content)

    milestones = extract_milestones(prd_content, feature_title)
    seed_milestone_queue(milestones)

    state = load_ledger()
    if not state["milestone_queue"]:
        print("[create_feature] No milestones in queue after seeding. Exiting.")
        sys.exit(1)

    trigger_create_issue()
    print("\n[create_feature] Feature intake complete.")


if __name__ == "__main__":
    main()
