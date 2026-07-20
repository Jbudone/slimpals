#!/usr/bin/env python3
"""
reset_issue.py — Circuit Breaker Reset & Issue Management CLI

Use this after resolving the root cause of a locked issue to
unblock the workflow without manually editing JSON.

Usage:
  python3 reset_issue.py           # Reset counter, set status back to active
  python3 reset_issue.py --abandon # Clear the active issue and re-queue the milestone
  python3 reset_issue.py --status  # Print current ledger state
"""

import json
import sys
from pathlib import Path

AGENT_DIR = Path(__file__).parent.parent
LEDGER_PATH = AGENT_DIR / "ledger" / "project_state.json"


def load_ledger() -> dict:
    with open(LEDGER_PATH) as f:
        return json.load(f)


def save_ledger(state: dict) -> None:
    with open(LEDGER_PATH, "w") as f:
        json.dump(state, f, indent=2)


def print_status(state: dict) -> None:
    active = state.get("active_issue", {})
    queue = state.get("milestone_queue", [])
    queued = [m for m in queue if m.get("status") == "queued"]
    completed = [m for m in queue if m.get("status") == "completed"]

    print("\n=== Ledger Status ===")
    print(f"Active issue : {active.get('id') or '(none)'}")
    print(f"Status       : {active.get('status', 'idle')}")
    print(f"Circuit break: {active.get('circuit_breaker_counter', 0)}")
    print(f"Queue        : {len(queued)} queued, {len(completed)} completed")
    if active.get("diagnostics", {}).get("failing_tier"):
        print(f"Failing tier : Tier {active['diagnostics']['failing_tier']}")
    if active.get("diagnostics", {}).get("error_details"):
        print(f"\nLast error:\n{active['diagnostics']['error_details'][:500]}")
    print()


def reset_counter(state: dict) -> None:
    active = state.get("active_issue", {})
    issue_id = active.get("id", "")
    if not issue_id:
        print("No active issue to reset.")
        sys.exit(0)

    old_counter = active.get("circuit_breaker_counter", 0)
    old_status = active.get("status", "idle")

    state["active_issue"]["circuit_breaker_counter"] = 0
    state["active_issue"]["status"] = "active"
    state["active_issue"]["diagnostics"] = {}

    save_ledger(state)
    print(f"Reset '{issue_id}': counter {old_counter}→0, status {old_status}→active.")
    print("You can now re-run: python3 .agent/skills/solve_issue.py")


def abandon_issue(state: dict) -> None:
    active = state.get("active_issue", {})
    issue_id = active.get("id", "")
    if not issue_id:
        print("No active issue to abandon.")
        sys.exit(0)

    confirm = input(f"Abandon issue '{issue_id}' and re-queue it? (yes/no): ").strip().lower()
    if confirm not in ("yes", "y"):
        print("Aborted.")
        sys.exit(0)

    for m in state["milestone_queue"]:
        if m["id"] == issue_id:
            m["status"] = "queued"
            break

    state["active_issue"] = {
        "id": "",
        "title": "",
        "description": "",
        "status": "idle",
        "target_files": [],
        "modified_dependencies": [],
        "circuit_breaker_counter": 0,
        "diagnostics": {},
    }

    save_ledger(state)
    print(f"Issue '{issue_id}' re-queued. Run create_issue.py to re-scope it.")


def main() -> None:
    args = sys.argv[1:]
    state = load_ledger()

    if "--status" in args:
        print_status(state)
    elif "--abandon" in args:
        print_status(state)
        abandon_issue(state)
    else:
        print_status(state)
        active_status = state.get("active_issue", {}).get("status", "idle")
        if active_status not in ("paused_for_human_intervention", "active"):
            print(f"Issue status is '{active_status}' — nothing to reset.")
            sys.exit(0)
        reset_counter(state)


if __name__ == "__main__":
    main()
