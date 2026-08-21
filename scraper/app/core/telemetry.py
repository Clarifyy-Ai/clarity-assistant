"""Production metrics, health status, and alerting triggers for FastAPI scraper and worker."""
from __future__ import annotations

import os
import sys
import time
from typing import Any, Literal
from prometheus_client import Counter, Gauge, Histogram

# --- Prometheus Metrics ---

SOURCE_RETRIEVAL_SUCCESS = Counter(
    "source_retrieval_success_total",
    "Total count of successfully retrieved official exam documents.",
    ["recruiting_body", "exam_type"],
)

SOURCE_DOMAIN_FAILURES = Counter(
    "source_domain_failures_total",
    "Total count of rejected or disallowed source domains.",
    ["domain", "reason"],
)

DOCUMENT_DOWNLOAD_FAILURES = Counter(
    "document_download_failures_total",
    "Total count of failed document downloads.",
    ["reason", "http_status"],
)

VIRUS_SCAN_FAILURES = Counter(
    "virus_scan_failures_total",
    "Total count of rejected files failing virus/malware inspection.",
    ["threat_type"],
)

OCR_CONFIDENCE_HISTOGRAM = Histogram(
    "ocr_confidence_ratio",
    "Distribution of OCR character confidence scores (0.0 to 1.0).",
    buckets=[0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0],
)

PARSER_FAILURES = Counter(
    "parser_failures_total",
    "Total count of document parsing failures.",
    ["parser_type", "error_code"],
)

JOB_QUEUE_DEPTH = Gauge(
    "job_queue_depth",
    "Current number of queued jobs waiting for a worker lease.",
    ["queue_name"],
)

LEASE_EXPIRATIONS = Counter(
    "lease_expirations_total",
    "Total count of worker job leases that expired before completion.",
    ["worker_id", "job_type"],
)

JOB_RETRIES = Counter(
    "job_retries_total",
    "Total count of retried processing jobs.",
    ["job_type", "retry_reason"],
)

PROCESSING_DURATION = Histogram(
    "processing_duration_seconds",
    "Time taken to process document or question papers from lease to completion.",
    ["job_type", "stage"],
    buckets=[0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0],
)

AI_MALFORMED_RESPONSES = Counter(
    "ai_malformed_responses_total",
    "Total count of malformed or schema-invalid AI provider responses.",
    ["provider", "action"],
)

QUESTION_VALIDATION_REJECTIONS = Counter(
    "question_validation_rejections_total",
    "Total count of candidate questions rejected during multi-agent or deterministic validation.",
    ["validator", "reason"],
)

DUPLICATE_QUESTIONS = Counter(
    "duplicate_questions_total",
    "Total count of near-duplicate or fingerprint-colliding questions detected.",
    ["exam_type", "detection_method"],
)

PAPER_GENERATION_FAILURES = Counter(
    "paper_generation_failures_total",
    "Total count of blueprint generation or assembly failures.",
    ["mode", "error_code"],
)

CREDIT_RESERVATIONS = Counter(
    "credit_reservations_total",
    "Total count of credit reservations initiated.",
    ["action"],
)

CREDIT_COMPENSATIONS = Counter(
    "credit_compensations_total",
    "Total count of credit refund compensations issued due to terminal job failure.",
    ["action", "reason"],
)

WORKER_CPU_USAGE = Gauge(
    "worker_cpu_usage_ratio",
    "Current process CPU usage ratio (0.0 to 1.0).",
)

WORKER_MEMORY_BYTES = Gauge(
    "worker_memory_bytes",
    "Current process resident memory in bytes.",
)


# --- Secret Redaction ---

_SENSITIVE_KEYS = {"password", "secret", "token", "key", "authorization", "api_key", "service_role"}


def sanitize_telemetry_payload(data: Any) -> Any:
    """Recursively redacts secrets and credentials from monitoring telemetry."""
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if any(s in str(k).lower() for s in _SENSITIVE_KEYS):
                sanitized[k] = "[REDACTED]"
            else:
                sanitized[k] = sanitize_telemetry_payload(v)
        return sanitized
    if isinstance(data, list):
        return [sanitize_telemetry_payload(item) for item in data]
    return data


# --- Alerting Evaluator ---

AlertSeverity = Literal["info", "warning", "critical"]


class AlertManager:
    """Evaluates production metric thresholds and emits alerts."""

    def __init__(self) -> None:
        self.active_alerts: list[dict[str, Any]] = []

    def check_stuck_queue(self, queue_depth: int, oldest_age_seconds: float) -> dict[str, Any] | None:
        if queue_depth > 100 or oldest_age_seconds > 300:
            alert = {
                "alert": "StuckProcessingQueue",
                "severity": "critical" if oldest_age_seconds > 600 else "warning",
                "message": f"Processing queue has {queue_depth} jobs; oldest job queued {int(oldest_age_seconds)}s ago.",
                "timestamp": time.time(),
            }
            self.active_alerts.append(alert)
            return alert
        return None

    def check_repeated_lease_expirations(self, expirations_in_window: int) -> dict[str, Any] | None:
        if expirations_in_window >= 3:
            alert = {
                "alert": "RepeatedWorkerLeaseExpiration",
                "severity": "critical",
                "message": f"Detected {expirations_in_window} worker lease expirations within the observation window.",
                "timestamp": time.time(),
            }
            self.active_alerts.append(alert)
            return alert
        return None

    def check_high_ocr_failure(self, failure_rate: float) -> dict[str, Any] | None:
        if failure_rate > 0.20:
            alert = {
                "alert": "HighOcrFailure",
                "severity": "warning",
                "message": f"OCR failure rate is {failure_rate * 100:.1f}%, exceeding 20% threshold.",
                "timestamp": time.time(),
            }
            self.active_alerts.append(alert)
            return alert
        return None

    def check_published_paper_integrity(self, missing_answers_count: int, count_mismatch: bool) -> dict[str, Any] | None:
        if missing_answers_count > 0 or count_mismatch:
            alert = {
                "alert": "PublishedPaperIntegrityViolation",
                "severity": "critical",
                "message": f"Integrity failure: missing answers={missing_answers_count}, count_mismatch={count_mismatch}.",
                "timestamp": time.time(),
            }
            self.active_alerts.append(alert)
            return alert
        return None

    def check_cross_user_access(self, violation_detected: bool, details: str = "") -> dict[str, Any] | None:
        if violation_detected:
            alert = {
                "alert": "CrossUserAccessViolation",
                "severity": "critical",
                "message": f"Unauthorized cross-tenant access attempt detected. {details}".strip(),
                "timestamp": time.time(),
            }
            self.active_alerts.append(alert)
            return alert
        return None

    def check_duplicate_credit_charge(self, duplicate_detected: bool, idempotency_key: str = "") -> dict[str, Any] | None:
        if duplicate_detected:
            alert = {
                "alert": "DuplicateCreditChargeAttempt",
                "severity": "critical",
                "message": f"Duplicate credit deduction intercepted for key: {idempotency_key}.",
                "timestamp": time.time(),
            }
            self.active_alerts.append(alert)
            return alert
        return None


alert_manager = AlertManager()
