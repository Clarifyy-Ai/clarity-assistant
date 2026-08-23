"""Deterministic system design template builder."""

from __future__ import annotations

from typing import Any

from app.core.logger import get_logger
from app.engines.schemas import EngineError

log = get_logger("engines.system_design")

_TEMPLATES: dict[str, dict[str, Any]] = {
    "url_shortener": {
        "title": "URL Shortener",
        "sections": [
            "Requirements",
            "High-Level Architecture",
            "Core Components",
            "API Design",
            "Data Flow",
            "Scalability",
            "Security",
            "Tradeoffs",
        ],
        "components": [
            {"id": "client", "name": "Web / Mobile Client", "layer": "presentation"},
            {"id": "api_gateway", "name": "API Gateway", "layer": "edge"},
            {"id": "redirect_service", "name": "Redirect Service", "layer": "application"},
            {"id": "url_service", "name": "URL Creation Service", "layer": "application"},
            {"id": "cache", "name": "Hot URL Cache", "layer": "cache"},
            {"id": "url_db", "name": "URL Metadata Store", "layer": "data"},
            {"id": "analytics", "name": "Click Analytics Pipeline", "layer": "analytics"},
        ],
        "apis": [
            {"method": "POST", "path": "/v1/urls", "purpose": "Create short URL from long URL"},
            {"method": "GET", "path": "/{code}", "purpose": "Resolve and redirect"},
            {"method": "GET", "path": "/v1/urls/{code}/stats", "purpose": "Fetch click stats"},
        ],
        "data_flow": [
            "Client submits long URL to URL Creation Service",
            "Service generates code, persists mapping, warms cache",
            "Redirect Service resolves code from cache or database",
            "Analytics pipeline records click events asynchronously",
        ],
        "scalability_notes": [
            "Partition URL store by code prefix",
            "Use read-through cache for hot redirects",
            "Rate-limit creation per account/API key",
        ],
        "security_checklist": [
            "Validate destination URLs against malware/phishing lists",
            "Authenticate URL creation endpoints",
            "Prevent open-redirect abuse",
        ],
        "diagram_spec": {
            "nodes": [
                {"id": "client", "label": "Client"},
                {"id": "api_gateway", "label": "API Gateway"},
                {"id": "url_service", "label": "URL Service"},
                {"id": "redirect_service", "label": "Redirect Service"},
                {"id": "cache", "label": "Cache"},
                {"id": "url_db", "label": "URL DB"},
                {"id": "analytics", "label": "Analytics"},
            ],
            "edges": [
                {"from": "client", "to": "api_gateway", "label": "create URL"},
                {"from": "api_gateway", "to": "url_service", "label": "POST /v1/urls"},
                {"from": "url_service", "to": "url_db", "label": "persist"},
                {"from": "url_service", "to": "cache", "label": "warm"},
                {"from": "client", "to": "redirect_service", "label": "GET /{code}"},
                {"from": "redirect_service", "to": "cache", "label": "lookup"},
                {"from": "redirect_service", "to": "url_db", "label": "fallback read"},
                {"from": "redirect_service", "to": "analytics", "label": "click event"},
            ],
        },
    },
    "chat": {
        "title": "Real-Time Chat",
        "sections": [
            "Requirements",
            "High-Level Architecture",
            "Core Components",
            "API Design",
            "Data Flow",
            "Scalability",
            "Security",
            "Tradeoffs",
        ],
        "components": [
            {"id": "client", "name": "Chat Client", "layer": "presentation"},
            {"id": "gateway", "name": "WebSocket Gateway", "layer": "edge"},
            {"id": "presence", "name": "Presence Service", "layer": "application"},
            {"id": "message_service", "name": "Message Service", "layer": "application"},
            {"id": "message_store", "name": "Message Store", "layer": "data"},
            {"id": "notification", "name": "Push Notification Service", "layer": "notification"},
        ],
        "apis": [
            {"method": "WS", "path": "/v1/ws", "purpose": "Bidirectional messaging"},
            {"method": "GET", "path": "/v1/conversations/{id}/messages", "purpose": "Historical fetch"},
            {"method": "POST", "path": "/v1/conversations", "purpose": "Create conversation"},
        ],
        "data_flow": [
            "Client connects to WebSocket Gateway",
            "Gateway routes messages to Message Service",
            "Message Service persists and fans out to recipients",
            "Offline users receive push notifications",
        ],
        "scalability_notes": [
            "Shard conversations by conversation_id",
            "Use pub/sub for fan-out across gateway nodes",
            "Paginate historical message reads",
        ],
        "security_checklist": [
            "Authenticate websocket sessions",
            "Authorize conversation membership",
            "Encrypt messages in transit",
        ],
        "diagram_spec": {
            "nodes": [
                {"id": "client", "label": "Client"},
                {"id": "gateway", "label": "WS Gateway"},
                {"id": "presence", "label": "Presence"},
                {"id": "message_service", "label": "Message Service"},
                {"id": "message_store", "label": "Message Store"},
                {"id": "notification", "label": "Notifications"},
            ],
            "edges": [
                {"from": "client", "to": "gateway", "label": "connect"},
                {"from": "gateway", "to": "presence", "label": "online status"},
                {"from": "gateway", "to": "message_service", "label": "send message"},
                {"from": "message_service", "to": "message_store", "label": "persist"},
                {"from": "message_service", "to": "gateway", "label": "deliver"},
                {"from": "message_service", "to": "notification", "label": "offline push"},
            ],
        },
    },
    "news_feed": {
        "title": "News Feed",
        "sections": [
            "Requirements",
            "High-Level Architecture",
            "Core Components",
            "API Design",
            "Data Flow",
            "Scalability",
            "Security",
            "Tradeoffs",
        ],
        "components": [
            {"id": "client", "name": "Feed Client", "layer": "presentation"},
            {"id": "feed_api", "name": "Feed API", "layer": "edge"},
            {"id": "ranker", "name": "Ranking Service", "layer": "application"},
            {"id": "post_service", "name": "Post Service", "layer": "application"},
            {"id": "graph_service", "name": "Social Graph Service", "layer": "application"},
            {"id": "feed_cache", "name": "Feed Cache", "layer": "cache"},
            {"id": "post_store", "name": "Post Store", "layer": "data"},
        ],
        "apis": [
            {"method": "GET", "path": "/v1/feed", "purpose": "Fetch ranked home feed"},
            {"method": "POST", "path": "/v1/posts", "purpose": "Create post"},
            {"method": "GET", "path": "/v1/posts/{id}", "purpose": "Fetch post detail"},
        ],
        "data_flow": [
            "Post creation writes to Post Store",
            "Fan-out worker updates follower feed caches",
            "Feed API merges cached entries and ranks via Ranking Service",
        ],
        "scalability_notes": [
            "Hybrid fan-out on write + fan-in on read for celebrities",
            "Cache per-user feed slices with TTL",
            "Precompute ranking features asynchronously",
        ],
        "security_checklist": [
            "Authorize post visibility",
            "Rate-limit post creation",
            "Moderate abusive content",
        ],
        "diagram_spec": {
            "nodes": [
                {"id": "client", "label": "Client"},
                {"id": "feed_api", "label": "Feed API"},
                {"id": "ranker", "label": "Ranker"},
                {"id": "post_service", "label": "Post Service"},
                {"id": "graph_service", "label": "Graph Service"},
                {"id": "feed_cache", "label": "Feed Cache"},
                {"id": "post_store", "label": "Post Store"},
            ],
            "edges": [
                {"from": "client", "to": "feed_api", "label": "GET /feed"},
                {"from": "feed_api", "to": "feed_cache", "label": "read cache"},
                {"from": "feed_api", "to": "ranker", "label": "rank"},
                {"from": "client", "to": "post_service", "label": "POST /posts"},
                {"from": "post_service", "to": "post_store", "label": "write"},
                {"from": "post_service", "to": "graph_service", "label": "fan-out targets"},
                {"from": "graph_service", "to": "feed_cache", "label": "update feeds"},
            ],
        },
    },
    "ride_sharing": {
        "title": "Ride Sharing Platform",
        "sections": [
            "Requirements",
            "High-Level Architecture",
            "Core Components",
            "API Design",
            "Data Flow",
            "Scalability",
            "Security",
            "Tradeoffs",
        ],
        "components": [
            {"id": "rider_app", "name": "Rider App", "layer": "presentation"},
            {"id": "driver_app", "name": "Driver App", "layer": "presentation"},
            {"id": "trip_api", "name": "Trip API", "layer": "edge"},
            {"id": "matching", "name": "Matching Service", "layer": "application"},
            {"id": "location", "name": "Location Tracking Service", "layer": "application"},
            {"id": "pricing", "name": "Pricing Service", "layer": "application"},
            {"id": "trip_store", "name": "Trip Store", "layer": "data"},
        ],
        "apis": [
            {"method": "POST", "path": "/v1/trips", "purpose": "Request ride"},
            {"method": "GET", "path": "/v1/trips/{id}", "purpose": "Trip status"},
            {"method": "POST", "path": "/v1/drivers/location", "purpose": "Publish driver location"},
        ],
        "data_flow": [
            "Rider requests trip via Trip API",
            "Matching Service selects nearby available driver",
            "Location Service streams ETA updates",
            "Trip completion triggers pricing and receipt",
        ],
        "scalability_notes": [
            "Geo-index drivers for low-latency matching",
            "Separate read/write paths for live location updates",
            "Idempotent trip state transitions",
        ],
        "security_checklist": [
            "Verify rider and driver identities",
            "Mask precise location when trip inactive",
            "Audit fare calculation inputs",
        ],
        "diagram_spec": {
            "nodes": [
                {"id": "rider_app", "label": "Rider App"},
                {"id": "driver_app", "label": "Driver App"},
                {"id": "trip_api", "label": "Trip API"},
                {"id": "matching", "label": "Matching"},
                {"id": "location", "label": "Location"},
                {"id": "pricing", "label": "Pricing"},
                {"id": "trip_store", "label": "Trip Store"},
            ],
            "edges": [
                {"from": "rider_app", "to": "trip_api", "label": "request trip"},
                {"from": "trip_api", "to": "matching", "label": "match driver"},
                {"from": "driver_app", "to": "location", "label": "publish location"},
                {"from": "matching", "to": "location", "label": "nearby drivers"},
                {"from": "trip_api", "to": "trip_store", "label": "persist trip"},
                {"from": "trip_api", "to": "pricing", "label": "fare quote"},
            ],
        },
    },
}

_TOPIC_ALIASES: dict[str, str] = {
    "url": "url_shortener",
    "shortener": "url_shortener",
    "link": "url_shortener",
    "chat": "chat",
    "messaging": "chat",
    "feed": "news_feed",
    "timeline": "news_feed",
    "news": "news_feed",
    "ride": "ride_sharing",
    "uber": "ride_sharing",
    "rideshare": "ride_sharing",
}


def _resolve_template_id(payload: dict[str, Any]) -> str:
    explicit = payload.get("template_id")
    if isinstance(explicit, str) and explicit.strip() in _TEMPLATES:
        return explicit.strip()

    topic = str(payload.get("prompt") or payload.get("topic") or "").casefold()
    for alias, template_id in _TOPIC_ALIASES.items():
        if alias in topic:
            return template_id
    raise EngineError("TEMPLATE_NOT_FOUND", retryable=False)


def run_system_design(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    template_id = _resolve_template_id(payload)
    log.info(
        "[SYSTEM_DESIGN] template_load",
        operation_id=operation_id,
        correlation_id=correlation_id,
        template_id=template_id,
    )

    template = _TEMPLATES[template_id]
    requirements = payload.get("requirements")
    req_lines: list[str] = []
    if isinstance(requirements, list):
        req_lines = [str(item).strip() for item in requirements if str(item).strip()]
    elif isinstance(requirements, str) and requirements.strip():
        req_lines = [line.strip() for line in requirements.splitlines() if line.strip()]

    topic = str(payload.get("prompt") or payload.get("topic") or template["title"]).strip()
    log.info(
        "[SYSTEM_DESIGN] deterministic_build",
        operation_id=operation_id,
        correlation_id=correlation_id,
        template_id=template_id,
    )

    outline = {
        "template_id": template_id,
        "topic": topic,
        "sections": template["sections"],
        "components": template["components"],
        "apis": template["apis"],
        "data_flow": template["data_flow"],
        "scalability_notes": template["scalability_notes"],
        "security_checklist": template["security_checklist"],
        "tradeoff_placeholders": [
            "Document consistency vs availability tradeoffs for your scale assumptions",
            "Push vs pull fan-out strategy for hot users",
            "Sync vs async processing for non-critical paths",
        ],
        "requirements_provided": req_lines,
        "diagram_spec": template["diagram_spec"],
        "markdown_outline": "\n".join(f"## {section}\n" for section in template["sections"]),
    }

    log.info("[SYSTEM_DESIGN] completed", operation_id=operation_id, correlation_id=correlation_id)
    return outline
