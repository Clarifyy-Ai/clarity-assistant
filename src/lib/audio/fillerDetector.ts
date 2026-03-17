import type { FillerWord, FillerWordOccurrence } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// Filler Word Detector
// Real-time detection from transcript stream.
// Counts occurrences, tracks timestamps, identifies top offenders.
// ─────────────────────────────────────────────────────────────────

// All filler words + patterns to detect
const FILLER_PATTERNS: Array<{ word: FillerWord; patterns: RegExp[] }> = [
  {
    word: "um",
    patterns: [/\bum+\b/gi],
  },
  {
    word: "uh",
    patterns: [/\buh+\b/gi],
  },
  {
    word: "like",
    patterns: [/\blike\b(?!\s+(to|that|how|when|where|what|which|a|an|the))/gi],
  },
  {
    word: "basically",
    patterns: [/\bbasically\b/gi],
  },
  {
    word: "literally",
    patterns: [/\bliterally\b/gi],
  },
  {
    word: "you know",
    patterns: [/\byou know\b/gi],
  },
  {
    word: "right",
    patterns: [/\bright\??\b(?=\s|$)/gi],
  },
  {
    word: "so",
    patterns: [/^so\b/gim, /,\s*so\b/gi],
  },
  {
    word: "actually",
    patterns: [/\bactually\b/gi],
  },
  {
    word: "kind of",
    patterns: [/\bkind of\b/gi],
  },
  {
    word: "sort of",
    patterns: [/\bsort of\b/gi],
  },
  {
    word: "just",
    patterns: [/\bjust\b(?!\s+(in|now|then|before|after|because))/gi],
  },
  {
    word: "I mean",
    patterns: [/\bi mean\b/gi],
  },
  {
    word: "okay",
    patterns: [/\bokay\b/gi],
  },
  {
    word: "well",
    patterns: [/^well\b/gim, /,\s*well\b/gi],
  },
];

// ─────────────────────────────────────────────────────────────────
// Single text analysis
// ─────────────────────────────────────────────────────────────────

export function detectFillersInText(
  text: string,
  timestampOffsetSeconds = 0
): FillerWordOccurrence[] {
  const results: FillerWordOccurrence[] = [];

  for (const { word, patterns } of FILLER_PATTERNS) {
    const allMatches: number[] = [];

    for (const pattern of patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Rough timestamp: character position / average chars per second (5 chars/sec estimate)
        const approxTs = timestampOffsetSeconds + match.index / 15;
        allMatches.push(approxTs);
      }
    }

    if (allMatches.length > 0) {
      results.push({
        word,
        count:      allMatches.length,
        timestamps: allMatches,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────
// Accumulator — tracks fillers across entire session
// ─────────────────────────────────────────────────────────────────

export class FillerAccumulator {
  private occurrences: Map<FillerWord, FillerWordOccurrence> = new Map();
  private totalCount = 0;

  processText(text: string, timestampOffset = 0): number {
    const detected = detectFillersInText(text, timestampOffset);
    let newCount = 0;

    for (const detection of detected) {
      const existing = this.occurrences.get(detection.word);
      if (existing) {
        existing.count += detection.count;
        existing.timestamps.push(...detection.timestamps);
      } else {
        this.occurrences.set(detection.word, { ...detection });
      }
      newCount += detection.count;
    }

    this.totalCount += newCount;
    return newCount; // Returns count of new fillers in this text
  }

  getAll(): FillerWordOccurrence[] {
    return Array.from(this.occurrences.values()).sort(
      (a, b) => b.count - a.count
    );
  }

  getTotal(): number {
    return this.totalCount;
  }

  getTopFiller(): FillerWord | null {
    const all = this.getAll();
    return all[0]?.word ?? null;
  }

  getFillerRate(totalDurationSeconds: number): number {
    if (totalDurationSeconds === 0) return 0;
    return (this.totalCount / totalDurationSeconds) * 60; // per minute
  }

  getWorstOffenders(topN = 3): FillerWordOccurrence[] {
    return this.getAll().slice(0, topN);
  }

  reset(): void {
    this.occurrences.clear();
    this.totalCount = 0;
  }

  getSnapshot(): FillerWordOccurrence[] {
    return this.getAll().map((o) => ({ ...o, timestamps: [...o.timestamps] }));
  }
}

// ─────────────────────────────────────────────────────────────────
// Real-time filler counter (for live display during session)
// ─────────────────────────────────────────────────────────────────

export class RealTimeFillerCounter {
  private count = 0;
  private onUpdate: (count: number) => void;

  constructor(onUpdate: (count: number) => void) {
    this.onUpdate = onUpdate;
  }

  check(interimText: string): void {
    const found = detectFillersInText(interimText);
    const newFillers = found.reduce((sum, f) => sum + f.count, 0);
    if (newFillers > 0) {
      this.count += newFillers;
      this.onUpdate(this.count);
    }
  }

  getCount(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// Filler summary for scorecard
// ─────────────────────────────────────────────────────────────────

export function buildFillerSummary(
  occurrences: FillerWordOccurrence[],
  durationSeconds: number
): {
  total: number;
  rate_per_minute: number;
  top_3: FillerWordOccurrence[];
  grade: "excellent" | "good" | "needs_work" | "poor";
} {
  const total = occurrences.reduce((sum, o) => sum + o.count, 0);
  const rate_per_minute =
    durationSeconds > 0 ? (total / durationSeconds) * 60 : 0;
  const top_3 = [...occurrences]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  let grade: "excellent" | "good" | "needs_work" | "poor";
  if (rate_per_minute === 0)      grade = "excellent";
  else if (rate_per_minute < 2)   grade = "good";
  else if (rate_per_minute < 5)   grade = "needs_work";
  else                             grade = "poor";

  return { total, rate_per_minute, top_3, grade };
}
