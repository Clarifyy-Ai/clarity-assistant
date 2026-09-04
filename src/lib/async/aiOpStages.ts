/** Named stages for indeterminate AI operations — never percentages. */

export const AI_OP_STAGES = {
  star: {
    starting: "Preparing STAR story…",
    generating: "Generating STAR bullets…",
  },
  answerBank: {
    starting: "Preparing answer…",
    generating: "Generating answer bank entry…",
  },
  systemDesign: {
    starting: "Preparing system design outline…",
    generating: "Generating architecture guidance…",
  },
  projectBuilder: {
    starting: "Preparing project brief…",
    generating: "Generating project plan…",
  },
  companyResearch: {
    starting: "Preparing company profile…",
    generating: "Collecting company information…",
  },
  scorecard: {
    processing: "Processing your session…",
    evaluating: "Evaluating answers…",
    building: "Building your scorecard…",
  },
  mockQuestion: {
    preparing: "Preparing your next interview question…",
    generating: "Generating question…",
    tts: "Preparing interviewer audio…",
    listening: "Listening…",
    processingAnswer: "Processing your answer…",
  },
  liveHint: {
    thinking: "Thinking…",
    preparing: "Preparing hint…",
  },
} as const;
