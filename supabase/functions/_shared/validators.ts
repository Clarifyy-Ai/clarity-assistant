export function validateCompanyResearch(data: any) {
  return {
    overview:
      typeof data?.overview === "string"
        ? data.overview
        : "No overview available.",

    industry:
      typeof data?.industry === "string"
        ? data.industry
        : "",

    tags: Array.isArray(data?.tags)
      ? data.tags.slice(0, 20)
      : [],

    interview_process: Array.isArray(data?.interview_process)
      ? data.interview_process
      : [],

    questions: Array.isArray(data?.questions)
      ? data.questions
      : [],

    values: Array.isArray(data?.values)
      ? data.values
      : [],

    tips: Array.isArray(data?.tips)
      ? data.tips
      : [],

    watch_outs: Array.isArray(data?.watch_outs)
      ? data.watch_outs
      : [],
  };
}
