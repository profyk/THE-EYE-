"""AI investigate feature: natural-language search + report generation against
the Anthropic Messages API, called via stdlib urllib (no anthropic SDK
dependency -- this is a plain REST API). Optional: returns
LLMNotConfiguredError if no API key is set, which the endpoint maps to a
clear 503 rather than failing unexpectedly. Nothing else in the app depends
on this working.
"""
import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import settings
from app.schemas.event import EventRead

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
REQUEST_TIMEOUT_SECONDS = 30

SEARCH_FILTER_TOOL = {
    "name": "search_filters",
    "description": "Extracts structured search filters for THE EYE's audit ledger from a natural-language question.",
    "input_schema": {
        "type": "object",
        "properties": {
            "actor_id": {"type": "string", "description": "Specific actor/username to filter by, if mentioned"},
            "event_type": {"type": "string", "description": "Specific dotted event_type (e.g. 'auth.login'), if clearly implied"},
            "event_category": {
                "type": "string",
                "enum": [
                    "authentication", "authorization", "data_access", "data_modification", "configuration",
                    "process_execution", "network", "financial_transaction", "administrative", "system",
                ],
            },
            "outcome": {"type": "string", "enum": ["success", "failure", "denied", "unknown"]},
            "q": {"type": "string", "description": "Free-text fallback search term if no specific filter applies"},
            "days_back": {"type": "integer", "description": "How many days back to search, if a timeframe is mentioned"},
        },
    },
}


class LLMNotConfiguredError(Exception):
    pass


def _post_to_anthropic(body: dict) -> dict:
    if not settings.anthropic_api_key:
        raise LLMNotConfiguredError("ANTHROPIC_API_KEY is not configured")

    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": ANTHROPIC_VERSION,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Anthropic API error {e.code}: {e.read().decode('utf-8', errors='replace')}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Anthropic API unreachable: {e}") from e


async def extract_search_filters(question: str) -> dict[str, Any]:
    response = _post_to_anthropic(
        {
            "model": settings.anthropic_model,
            "max_tokens": 512,
            "tools": [SEARCH_FILTER_TOOL],
            "tool_choice": {"type": "tool", "name": "search_filters"},
            "messages": [{"role": "user", "content": question}],
        }
    )

    for block in response.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "search_filters":
            filters = dict(block.get("input", {}))
            days_back = filters.pop("days_back", None)
            if days_back:
                filters["occurred_from"] = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
            return filters

    return {}


async def generate_report(question: str, events: list[EventRead]) -> str:
    event_summaries = [
        {
            "sequence_num": e.sequence_num,
            "occurred_at": e.occurred_at.isoformat(),
            "actor_id": e.actor_id,
            "event_type": e.event_type,
            "event_category": e.event_category,
            "outcome": e.outcome,
            "severity": e.severity,
            "target_type": e.target_type,
            "target_id": e.target_id,
        }
        for e in events[:200]
    ]

    system_prompt = (
        "You are an investigation assistant for THE EYE, an immutable audit-trail platform. "
        "Write a clear, factual written report answering the investigator's question using ONLY the "
        "provided event records. Do not speculate beyond the data. Cite sequence numbers when referencing "
        "specific events. Keep it concise and suitable for inclusion in a compliance/forensic submission."
    )
    user_content = (
        f"Question: {question}\n\nMatching ledger events (JSON, newest first):\n"
        f"{json.dumps(event_summaries, indent=2)}"
    )

    response = _post_to_anthropic(
        {
            "model": settings.anthropic_model,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_content}],
        }
    )

    for block in response.get("content", []):
        if block.get("type") == "text":
            return block["text"]

    return "(The AI did not return a text report.)"
