/** Parse admin form JSON for coding question sample + test cases. */

export type CodingCreateCaseFields = {
  sampleInput: string;
  sampleOutput: string;
  visibleInput: string;
  visibleExpected: string;
  hiddenInput: string;
  hiddenExpected: string;
};

export type CodingCreateCasePayload = {
  sample_input: string;
  sample_output: string;
  cases: Array<{
    name: string;
    input_json: unknown;
    expected_json: unknown;
    is_hidden: boolean;
    sort_order: number;
  }>;
};

export const DEFAULT_CODING_CREATE_CASE_FIELDS: CodingCreateCaseFields = {
  sampleInput: "[2, 3]",
  sampleOutput: "5",
  visibleInput: "[2, 3]",
  visibleExpected: "5",
  hiddenInput: "[9, 1]",
  hiddenExpected: "10",
};

function parseJsonValue(raw: string, label: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} is required.` };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, error: `${label} must be valid JSON.` };
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Ensure the human-visible sample I/O matches the visible judge case.
 * Prevents create-path bugs where sample_output says "5" but the problem expects max(2,3)=3.
 */
export function assertSampleMatchesVisibleCase(
  sampleInput: string,
  sampleOutput: string,
  visibleInput: unknown,
  visibleExpected: unknown,
): { ok: true } | { ok: false; error: string } {
  const sampleIn = parseJsonValue(sampleInput, "Sample input");
  if (!sampleIn.ok) return sampleIn;
  const sampleOut = parseJsonValue(sampleOutput, "Sample output");
  if (!sampleOut.ok) return sampleOut;

  if (!jsonEqual(sampleIn.value, visibleInput)) {
    return {
      ok: false,
      error: "Sample input must match the visible case input (JSON equality).",
    };
  }
  if (!jsonEqual(sampleOut.value, visibleExpected)) {
    return {
      ok: false,
      error:
        "Sample output must match the visible case expected value so examples stay consistent with scoring.",
    };
  }
  return { ok: true };
}

/** Build insert payload from editable admin form fields. */
export function buildCodingCreateCasePayload(
  fields: CodingCreateCaseFields,
): { ok: true; payload: CodingCreateCasePayload } | { ok: false; error: string } {
  const sampleIn = fields.sampleInput.trim();
  const sampleOut = fields.sampleOutput.trim();
  if (!sampleIn || !sampleOut) {
    return { ok: false, error: "Sample input and sample output are required." };
  }

  const visibleIn = parseJsonValue(fields.visibleInput, "Visible case input");
  if (!visibleIn.ok) return visibleIn;
  const visibleEx = parseJsonValue(fields.visibleExpected, "Visible case expected");
  if (!visibleEx.ok) return visibleEx;
  const hiddenIn = parseJsonValue(fields.hiddenInput, "Hidden case input");
  if (!hiddenIn.ok) return hiddenIn;
  const hiddenEx = parseJsonValue(fields.hiddenExpected, "Hidden case expected");
  if (!hiddenEx.ok) return hiddenEx;

  const aligned = assertSampleMatchesVisibleCase(
    sampleIn,
    sampleOut,
    visibleIn.value,
    visibleEx.value,
  );
  if (!aligned.ok) return aligned;

  return {
    ok: true,
    payload: {
      sample_input: sampleIn,
      sample_output: sampleOut,
      cases: [
        {
          name: "sample",
          input_json: visibleIn.value,
          expected_json: visibleEx.value,
          is_hidden: false,
          sort_order: 0,
        },
        {
          name: "hidden",
          input_json: hiddenIn.value,
          expected_json: hiddenEx.value,
          is_hidden: true,
          sort_order: 1,
        },
      ],
    },
  };
}
