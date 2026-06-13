# FastAPI Scraper → Supabase Ingest Guide

This document describes how the external FastAPI scraper feeds past-paper
questions, options, explanations, and images into the mock-test engine.

There are **two supported ingest paths**. Use the edge-function path unless you
have a strong reason to go direct.

---

## Path A — `bulk-import-questions` Edge Function (recommended)

Edge Function URL:

```
https://qzgvjrvtkwlzxpmlddkx.functions.supabase.co/bulk-import-questions
```

### Auth

Send the shared-secret header **`x-ingest-key`** with the value of the
`INGEST_API_KEY` secret (set in Supabase → Edge Functions → Secrets).

The function rejects all requests without a matching key. No user JWT is needed
because the function uses the service-role client internally.

### Request

`POST` with `Content-Type: application/json`:

```json
{
  "exam_type": "SSC Exams (CGL/CHSL)",
  "source_year": 2024,
  "paper": {
    "exam_name": "SSC CGL Tier 1",
    "session": "Sep",
    "shift": "1",
    "total_questions": 100,
    "total_marks": 200,
    "duration_minutes": 60,
    "difficulty_level": "MEDIUM"
  },
  "questions": [
    {
      "question_text": "If x + y = 10 and x - y = 4, then x = ?",
      "options": [
        {"label": "A", "text": "5"},
        {"label": "B", "text": "6"},
        {"label": "C", "text": "7"},
        {"label": "D", "text": "8"}
      ],
      "correct_answer": "C",
      "explanation": "Adding both equations: 2x = 14 ⇒ x = 7.",
      "subject": "Quant",
      "topic": "Linear Equations",
      "difficulty": "EASY",
      "image_url": "https://qzgvjrvtkwlzxpmlddkx.supabase.co/storage/v1/object/public/question-images/ssc-cgl-2024-q1.png",
      "latex_present": false
    }
  ]
}
```

- `questions[]` max **500 per request** — batch larger papers.
- `paper` is optional but recommended; it upserts a row in `exam_papers`
  (unique on `exam_type + exam_name + year + shift`) so the paper shows on the
  Exam Papers page automatically.
- `image_url` should be a **public** URL (use the `question-images` storage
  bucket — see below).

### Response

```json
{
  "success": true,
  "paper_id": "uuid-or-null",
  "inserted_count": 100,
  "skipped_count": 0,
  "exam_type": "SSC Exams (CGL/CHSL)",
  "source_year": 2024
}
```

### Python example

```python
import os, requests

INGEST_URL = "https://qzgvjrvtkwlzxpmlddkx.functions.supabase.co/bulk-import-questions"
INGEST_KEY = os.environ["INGEST_API_KEY"]

payload = {
    "exam_type": "SSC Exams (CGL/CHSL)",
    "source_year": 2024,
    "paper": {
        "exam_name": "SSC CGL Tier 1",
        "shift": "1",
        "total_questions": 100,
        "duration_minutes": 60,
    },
    "questions": [...],  # list of dicts as above
}

r = requests.post(
    INGEST_URL,
    headers={"x-ingest-key": INGEST_KEY, "Content-Type": "application/json"},
    json=payload,
    timeout=60,
)
r.raise_for_status()
print(r.json())
```

---

## Path B — Direct Supabase write (service-role)

Use the Supabase Python client with the **service-role key** (never ship this
key to a browser). This bypasses the edge function and writes directly to the
`questions` and `exam_papers` tables.

```python
from supabase import create_client
sb = create_client(
    "https://qzgvjrvtkwlzxpmlddkx.supabase.co",
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)
sb.table("questions").insert(rows).execute()
```

You are responsible for matching the schema exactly (see below).

---

## Canonical `exam_type` values

The Exam Papers page and `select-test-questions` filter by these **exact**
strings. Anything else will be invisible to the frontend.

| Frontend exam id  | `exam_type` value to insert        |
|-------------------|-------------------------------------|
| `JEE_MAIN`        | `JEE Main`                          |
| `JEE_ADV`         | `JEE Advanced`                      |
| `NEET`            | `NEET UG`                           |
| `UPSC`            | `UPSC CSE`                          |
| `SSC_CGL`         | `SSC Exams (CGL/CHSL)`              |
| `IBPS_PO`         | `Banking (IBPS/SBI/RBI)`            |
| `HPCL_ENGINEER`   | `HPCL Engineer`                     |
| `APPSC_GROUP`     | `APPSC (Group 1/2/3/4)`             |
| `TSPSC_GROUP`     | `TSPSC (Group 1/2/3/4)`             |

---

## `questions` table columns (write set)

| Column          | Type        | Notes                                          |
|-----------------|-------------|-------------------------------------------------|
| `question_text` | text        | Required. ≤4000 chars. LaTeX in `\( ... \)`.    |
| `question_type` | text        | Always `"MCQ"`.                                 |
| `options`       | jsonb       | `[{"label":"A","text":"..."}, …]` — exactly 4.  |
| `correct_answer`| text        | One of `"A" \| "B" \| "C" \| "D"`.              |
| `explanation`   | text        | Optional. ≤4000 chars.                          |
| `subject`       | text        | Short label, e.g. `"Quant"`, `"GS"`, `"English"`. |
| `topic`         | text        | E.g. `"Algebra"`, `"Polity"`.                   |
| `difficulty`    | text        | `"EASY" \| "MEDIUM" \| "HARD"`.                 |
| `exam_type`     | text        | See canonical list above.                       |
| `source`        | text        | Use `"Previous Year Paper"` for PYQs.           |
| `source_year`   | int         | e.g. `2024`.                                    |
| `is_verified`   | bool        | `true` for scraped PYQs.                        |
| `is_public`     | bool        | `true` so all users can see.                    |
| `uploaded_by`   | uuid        | Use `SYSTEM_USER_ID` for system imports.        |
| `marks_positive`| numeric     | Default 4.                                      |
| `marks_negative`| numeric     | Default 1.                                      |
| `image_url`     | text        | Public URL of diagram/image, or `null`.         |
| `latex_present` | bool        | `true` if the text contains LaTeX.              |

## `exam_papers` table columns

| Column            | Type | Notes                                            |
|-------------------|------|---------------------------------------------------|
| `exam_type`       | text | Canonical value (see above).                      |
| `exam_name`       | text | e.g. `"SSC CGL Tier 1"`.                          |
| `year`            | int  | Paper year.                                       |
| `session`         | text | Optional, e.g. `"Sep"`.                           |
| `shift`           | text | Optional, e.g. `"1"`.                             |
| `total_questions` | int  | Paper length.                                     |
| `total_marks`     | int  | Optional.                                         |
| `duration_minutes`| int  | Paper duration.                                   |
| `difficulty_level`| text | `EASY \| MEDIUM \| HARD`.                         |

Uniqueness: `(exam_type, exam_name, year, shift)` — the ingest function
upserts on this key.

---

## Image upload (diagrams, equations)

Use the public bucket **`question-images`**. The simplest flow from FastAPI:

```python
from supabase import create_client
sb = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_ROLE_KEY"])

with open("ssc-cgl-2024-q1.png", "rb") as f:
    sb.storage.from_("question-images").upload(
        "ssc-cgl-2024/q1.png", f, {"content-type": "image/png", "upsert": "true"}
    )

public_url = sb.storage.from_("question-images").get_public_url("ssc-cgl-2024/q1.png")
# → pass public_url as questions[i].image_url
```

The frontend's `QuestionImage` component already normalizes these URLs and
renders them inline. Equations inside `question_text` wrapped in `\( ... \)`
or `\[ ... \]` are rendered by `MathText` via KaTeX automatically.

---

## Verification checklist after ingesting a paper

1. Call `bulk-import-questions` — confirm `inserted_count` matches the paper.
2. Open the app → **Mock Test → Exam Papers → {your exam}**.
3. The new paper should appear with a green **Bank: N** badge and both
   **Practice Mode** and **Exam Mode** buttons enabled.
4. Click **Exam Mode** → the Testbook-style player loads with real PYQs,
   question palette, mark-for-review, and section timer.
5. Submit → analytics + solutions are available in **Test Results**.

If a paper still shows as "Coming soon" after import, double-check that
`exam_type` and `source_year` match the canonical values exactly.
