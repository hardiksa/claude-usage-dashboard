#!/usr/bin/env python3
"""
fetch_usage.py — Polls Anthropic Admin API for per-user usage data.
Run by GitHub Actions on a schedule. Outputs JSON for the static dashboard.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

API_BASE = "https://api.anthropic.com/v1/organizations"
API_VERSION = "2023-06-01"

# ── Helpers ──────────────────────────────────────────────────────────────────

def api_get(path: str, params: dict = None) -> dict:
    """Make a GET request to the Anthropic Admin API."""
    url = f"{API_BASE}{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        url = f"{url}?{qs}"

    api_key = os.environ.get("ANTHROPIC_ADMIN_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_ADMIN_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    req = urllib.request.Request(url)
    req.add_header("x-api-key", api_key)
    req.add_header("anthropic-version", API_VERSION)
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"HTTP {e.code} on {url}: {body}", file=sys.stderr)
        if e.code == 401:
            print("Authentication failed. Check your ANTHROPIC_ADMIN_API_KEY.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


def fetch_all_users() -> list:
    """Fetch all organization users with pagination."""
    users = []
    after_id = None
    while True:
        params = {"limit": 100}
        if after_id:
            params["after_id"] = after_id
        resp = api_get("/users", params)
        users.extend(resp.get("data", []))
        if not resp.get("has_more"):
            break
        after_id = resp.get("last_id")
    return users


def fetch_usage_messages(days: int = 30) -> list:
    """Fetch Messages API usage data bucketed by day."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    params = {
        "starting_at": start.strftime("%Y-%m-%d"),
        "ending_at": now.strftime("%Y-%m-%d"),
        "bucket": "1d",
        "limit": 1000,
    }
    resp = api_get("/usage_report/messages", params)
    # The response structure may vary; handle both flat list and paginated
    if isinstance(resp, list):
        return resp
    return resp.get("data", resp.get("results", []))


def fetch_claude_code_usage(days: int = 30) -> list:
    """Fetch Claude Code per-user usage data."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    params = {
        "starting_at": start.strftime("%Y-%m-%d"),
        "limit": 1000,
    }
    try:
        resp = api_get("/usage_report/claude_code", params)
        if isinstance(resp, list):
            return resp
        return resp.get("data", resp.get("results", []))
    except SystemExit:
        # Claude Code endpoint might not be available for all orgs
        print("WARN: Claude Code usage endpoint unavailable, skipping", file=sys.stderr)
        return []


def aggregate_by_user(users: list, messages_usage: list, cc_usage: list) -> list:
    """
    Build a per-user aggregation combining messages API and Claude Code usage.
    Falls back gracefully if some data is missing.
    """
    # Map user_id (or email) → aggregated stats
    by_user = {}

    for u in users:
        email = u.get("email", "")
        name = u.get("name", email.split("@")[0] if email else "Unknown")
        user_id = u.get("id", email)
        by_user[user_id] = {
            "id": user_id,
            "email": email,
            "name": name,
            "role": u.get("role", "user"),
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation_tokens": 0,
            "cache_read_tokens": 0,
            "total_tokens": 0,
            "estimated_cost": 0.0,
            "api_calls": 0,
            "claude_code_sessions": 0,
            "claude_code_commits": 0,
            "claude_code_prs": 0,
            "claude_code_loc_added": 0,
            "claude_code_loc_removed": 0,
        }

    # Process Messages API usage
    for entry in messages_usage:
        # Try to match by user_id or api_key_id
        user_id = entry.get("user_id", "")
        api_key_id = entry.get("api_key_id", "")

        # If we can't match by user_id, try to find a match
        # The messages endpoint might return data per api_key or workspace, not per user
        # We'll aggregate by whatever key is available
        match_key = user_id if user_id in by_user else None

        if match_key:
            u = by_user[match_key]
        else:
            # Create an entry for unmatched usage (aggregate under "Unknown")
            if "unknown" not in by_user:
                by_user["unknown"] = {
                    "id": "unknown",
                    "email": "untracked@organization",
                    "name": "Untracked Usage",
                    "role": "unknown",
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cache_creation_tokens": 0,
                    "cache_read_tokens": 0,
                    "total_tokens": 0,
                    "estimated_cost": 0.0,
                    "api_calls": 0,
                    "claude_code_sessions": 0,
                    "claude_code_commits": 0,
                    "claude_code_prs": 0,
                    "claude_code_loc_added": 0,
                    "claude_code_loc_removed": 0,
                }
            u = by_user["unknown"]

        u["input_tokens"] += entry.get("input_tokens", 0)
        u["output_tokens"] += entry.get("output_tokens", 0)
        u["cache_creation_tokens"] += entry.get("cache_creation_input_tokens", 0)
        u["cache_read_tokens"] += entry.get("cache_read_input_tokens", 0)
        u["total_tokens"] = (
            u["input_tokens"]
            + u["output_tokens"]
            + u["cache_creation_tokens"]
            + u["cache_read_tokens"]
        )
        u["estimated_cost"] += entry.get("cost", 0.0)
        u["api_calls"] += 1

    # Process Claude Code per-user usage
    for entry in cc_usage:
        user_id = entry.get("user_id", "")
        email = entry.get("email", "")

        # Match by user_id or email
        match_key = None
        if user_id in by_user:
            match_key = user_id
        else:
            for uid, u in by_user.items():
                if u.get("email") == email:
                    match_key = uid
                    break

        if match_key:
            u = by_user[match_key]
        else:
            # Add as a new user if we have email
            if email:
                key = email
                by_user[key] = {
                    "id": user_id or key,
                    "email": email,
                    "name": entry.get("name", email.split("@")[0]),
                    "role": "user",
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cache_creation_tokens": 0,
                    "cache_read_tokens": 0,
                    "total_tokens": 0,
                    "estimated_cost": 0.0,
                    "api_calls": 0,
                    "claude_code_sessions": 0,
                    "claude_code_commits": 0,
                    "claude_code_prs": 0,
                    "claude_code_loc_added": 0,
                    "claude_code_loc_removed": 0,
                }
                u = by_user[key]
            else:
                continue

        u["claude_code_sessions"] += entry.get("sessions", 0)
        u["claude_code_commits"] += entry.get("commits", 0)
        u["claude_code_prs"] += entry.get("pull_requests", 0)
        u["claude_code_loc_added"] += entry.get("lines_of_code_added", 0)
        u["claude_code_loc_removed"] += entry.get("lines_of_code_removed", 0)
        # Claude Code usage might also report tokens
        u["input_tokens"] += entry.get("input_tokens", 0)
        u["output_tokens"] += entry.get("output_tokens", 0)
        u["total_tokens"] = (
            u["input_tokens"]
            + u["output_tokens"]
            + u["cache_creation_tokens"]
            + u["cache_read_tokens"]
        )

    return list(by_user.values())


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Fetching organization users...")
    users = fetch_all_users()
    print(f"  Found {len(users)} users")

    print("Fetching Messages API usage (30 days)...")
    messages_usage = fetch_usage_messages(days=30)
    print(f"  Got {len(messages_usage)} usage entries")

    print("Fetching Claude Code usage (30 days)...")
    cc_usage = fetch_claude_code_usage(days=30)
    print(f"  Got {len(cc_usage)} usage entries")

    print("Aggregating per-user data...")
    aggregated = aggregate_by_user(users, messages_usage, cc_usage)

    # Sort by total tokens descending
    aggregated.sort(key=lambda x: x["total_tokens"], reverse=True)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "organization": {
            "admin_email": os.environ.get("ADMIN_EMAIL", "hardik@vmukti.com"),
            "user_count": len(users),
        },
        "summary": {
            "total_tokens": sum(u["total_tokens"] for u in aggregated),
            "total_cost": round(sum(u["estimated_cost"] for u in aggregated), 4),
            "total_api_calls": sum(u["api_calls"] for u in aggregated),
            "total_sessions": sum(u["claude_code_sessions"] for u in aggregated),
        },
        "users": aggregated,
    }

    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "usage.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Data written to {output_path}")
    print(f"   Total tokens: {output['summary']['total_tokens']:,}")
    print(f"   Total cost: ${output['summary']['total_cost']}")
    print(f"   Users tracked: {len(aggregated)}")


if __name__ == "__main__":
    main()
