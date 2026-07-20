#!/usr/bin/env python3
"""
create_issue.py — Just-In-Time Scoping & Test Matrix Definition

Reads the topmost milestone from milestone_queue, runs plan_refinement to
validate codebase state, generates a refined issue markdown file, and sets
the active_issue block in the ledger.
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
ISSUES_DIR = AGENT_DIR / "issues"
CONFIG_PATH = AGENT_DIR / "config" / "mcp_browser_config.json"
ISSUES_DIR.mkdir(exist_ok=True)

PROJECT_ROOT = AGENT_DIR.parent


def load_mcp_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def get_frontend_url() -> str:
    try:
        cfg = load_mcp_config()
        return cfg.get("environment", {}).get("frontend_url", "http://localhost:5173")
    except Exception:
        return "http://localhost:5173"


def load_ledger() -> dict:
    with open(LEDGER_PATH) as f:
        return json.load(f)


def save_ledger(state: dict) -> None:
    with open(LEDGER_PATH, "w") as f:
        json.dump(state, f, indent=2)


def load_prompt(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    return path.read_text()


def pop_next_milestone(state: dict) -> dict | None:
    queued = [m for m in state["milestone_queue"] if m.get("status") == "queued"]
    if not queued:
        return None
    return queued[0]


def run_git_command(args: list[str]) -> str:
    result = subprocess.run(
        ["git"] + args,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def run_plan_refinement(milestone: dict) -> dict:
    """
    Executes git diff analysis and validates codebase state against milestone
    assumptions. Returns a refinement report dict.
    """
    print("\n[create_issue] Running plan_refinement protocol...")
    print(load_prompt("plan_refinement"))

    fetch_output = run_git_command(["fetch", "origin"])
    status_output = run_git_command(["status", "--short"])
    log_output = run_git_command(["log", "--oneline", "origin/master..HEAD"])
    diff_stat = run_git_command(["diff", "origin/master...HEAD", "--stat"])

    print(f"\n[create_issue] Git status:\n{status_output or '(clean)'}")
    print(f"\n[create_issue] Commits ahead of origin/master:\n{log_output or '(none)'}")
    print(f"\n[create_issue] Diff stat vs origin/master:\n{diff_stat or '(no diff)'}")

    changed_files: list[str] = []
    if diff_stat:
        for line in diff_stat.splitlines():
            match = re.match(r"^\s*(.+?)\s+\|", line)
            if match:
                changed_files.append(match.group(1).strip())

    discrepancies: list[str] = []
    verified_target_files: list[str] = []

    tier = milestone.get("tier", 1)
    if tier == 1:
        candidates = ["shared/schema.ts"]
        for migrations_dir in (PROJECT_ROOT / "drizzle").glob("*.sql") if (PROJECT_ROOT / "drizzle").exists() else []:
            candidates.append(str(migrations_dir.relative_to(PROJECT_ROOT)))
    elif tier == 2:
        candidates = list(
            str(p.relative_to(PROJECT_ROOT))
            for p in (PROJECT_ROOT / "server" / "routes").rglob("*.ts")
        ) if (PROJECT_ROOT / "server" / "routes").exists() else ["server/routes/"]
    elif tier == 3:
        candidates = list(
            str(p.relative_to(PROJECT_ROOT))
            for p in (PROJECT_ROOT / "src" / "components").rglob("*.svelte")
        ) if (PROJECT_ROOT / "src" / "components").exists() else ["src/components/"]
    else:
        candidates = ["tests/"]

    for candidate in candidates[:10]:
        full_path = PROJECT_ROOT / candidate
        if full_path.exists():
            verified_target_files.append(candidate)

    for changed in changed_files:
        if any(changed.startswith(t.rstrip("/")) for t in verified_target_files):
            discrepancies.append(
                f"File '{changed}' was modified by a preceding commit not yet "
                f"reflected in the milestone plan."
            )

    return {
        "git_status": status_output,
        "commits_ahead": log_output,
        "diff_stat": diff_stat,
        "changed_files": changed_files,
        "verified_target_files": verified_target_files,
        "discrepancies": discrepancies,
    }


def build_walkthrough_steps(milestone: dict) -> list[str]:
    tier = milestone.get("tier", 1)
    feature = milestone.get("feature", "the feature")

    frontend_url = get_frontend_url()
    api_url = "http://localhost:3000"
    try:
        cfg = load_mcp_config()
        api_url = cfg.get("environment", {}).get("api_url", api_url)
    except Exception:
        pass

    steps_by_tier = {
        1: [
            "Verify the database migration runs without error: `npm run db:migrate`",
            "Confirm the new schema appears in `shared/schema.ts`",
            "Check that the server starts without type errors: `npm run typecheck`",
        ],
        2: [
            f"Navigate to {api_url}/api/health and confirm 200 OK",
            "Use the browser devtools Network tab to confirm new API routes appear",
            "Trigger the new endpoint with a valid request and verify the response shape",
            "Trigger the endpoint with an invalid request and verify proper error handling",
        ],
        3: [
            f"Navigate to {frontend_url} and confirm no JS errors in the console",
            "Navigate to the view affected by this milestone",
            "Interact with the new UI element and confirm expected state transitions",
            f"Verify the view renders correctly on mobile (375px) and desktop (1280px)",
        ],
        4: [
            "Run `npm test` and confirm all tests pass",
            "Run `npm run check` and confirm no lint errors",
            "Run `npm run typecheck` and confirm no type errors",
        ],
    }
    return steps_by_tier.get(tier, [f"Verify {feature} works as expected"])


def build_regression_components(milestone: dict) -> list[str]:
    tier = milestone.get("tier", 1)
    components: list[str] = []

    if (PROJECT_ROOT / "src" / "components").exists():
        svelte_files = list((PROJECT_ROOT / "src" / "components").rglob("*.svelte"))
        for f in svelte_files[:8]:
            components.append(str(f.relative_to(PROJECT_ROOT)))

    if tier == 3 and (PROJECT_ROOT / "src" / "pages").exists():
        page_files = list((PROJECT_ROOT / "src" / "pages").rglob("*.svelte"))
        for f in page_files[:4]:
            components.append(str(f.relative_to(PROJECT_ROOT)))

    return components


def generate_issue_file(milestone: dict, refinement: dict) -> Path:
    issue_id = milestone["id"]
    issue_path = ISSUES_DIR / f"{issue_id}.md"

    target_files = refinement["verified_target_files"]
    discrepancy_section = ""
    if refinement["discrepancies"]:
        items = "\n".join(f"- {d}" for d in refinement["discrepancies"])
        discrepancy_section = f"\n## Plan Discrepancies Detected\n{items}\n"

    walkthrough_steps = build_walkthrough_steps(milestone)
    walkthrough_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(walkthrough_steps))

    regression_components = build_regression_components(milestone)
    regression_text = "\n".join(f"- {c}" for c in regression_components)

    target_files_text = "\n".join(f"- `{f}`" for f in target_files) or "- (auto-detect during implementation)"

    content = f"""# Issue: {milestone['title']}

**Feature:** {milestone['feature']}
**Tier:** {milestone['tier']}
**Status:** active
**Created:** {datetime.utcnow().isoformat()}

## Description
{milestone['description']}
{discrepancy_section}
## Target Files
{target_files_text}

## Implementation Notes
- Verify all target files exist before editing.
- Run `npm run typecheck` after changes to catch type regressions early.
- If this is a Tier 1 (Data Model) change, run `npm run db:generate` and `npm run db:migrate`.
- Keep changes minimal and focused — do not refactor adjacent code outside the milestone scope.

## Localized Unit Tests
- Create or update test files in `tests/` corresponding to modified modules.
- Tests must be runnable with: `npm test`
- Aim for coverage of: happy path, empty/null input, and one error case.

## Interactive Walkthrough Steps
{walkthrough_text}

## High-Risk Regression Components
{regression_text or "- (none identified)"}

## Acceptance Criteria
- All unit tests pass (`npm test`)
- No TypeScript errors (`npm run typecheck`)
- No lint errors (`npm run check`)
- Interactive walkthrough completes without console errors
- Visual audit of regression components shows no regressions
"""

    issue_path.write_text(content)
    print(f"[create_issue] Issue file written: {issue_path}")
    return issue_path


def set_active_issue(state: dict, milestone: dict, issue_path: Path, refinement: dict) -> None:
    state["active_issue"] = {
        "id": milestone["id"],
        "title": milestone["title"],
        "description": milestone["description"],
        "status": "active",
        "target_files": refinement["verified_target_files"],
        "modified_dependencies": refinement["changed_files"],
        "circuit_breaker_counter": 0,
        "diagnostics": {
            "issue_file": str(issue_path),
            "git_status": refinement["git_status"],
            "discrepancies": refinement["discrepancies"],
        },
    }

    for m in state["milestone_queue"]:
        if m["id"] == milestone["id"]:
            m["status"] = "active"
            break


def main() -> None:
    print("[create_issue] Loading ledger...")
    state = load_ledger()

    milestone = pop_next_milestone(state)
    if not milestone:
        print("[create_issue] No queued milestones in milestone_queue. Nothing to do.")
        sys.exit(0)

    print(f"[create_issue] Processing milestone: {milestone['title']}")

    refinement = run_plan_refinement(milestone)

    if refinement["discrepancies"]:
        print("\n[create_issue] DISCREPANCIES DETECTED:")
        for d in refinement["discrepancies"]:
            print(f"  ! {d}")
        print("[create_issue] Proceeding with dynamically adjusted target files.")

    issue_path = generate_issue_file(milestone, refinement)

    set_active_issue(state, milestone, issue_path, refinement)
    save_ledger(state)

    print(f"\n[create_issue] Active issue set: {milestone['id']}")
    print("[create_issue] Ready to run solve_issue.py")


if __name__ == "__main__":
    main()
