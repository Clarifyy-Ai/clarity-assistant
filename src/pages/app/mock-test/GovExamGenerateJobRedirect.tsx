import { Navigate, useParams, useSearchParams } from "react-router-dom";

/** Canonical alias: /app/mock-test/generate/job/:jobId → ?jobId= */
export default function GovExamGenerateJobRedirect() {
  const { jobId } = useParams<{ jobId: string }>();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (jobId?.trim()) next.set("jobId", jobId.trim());
  const search = next.toString();
  return (
    <Navigate
      to={{
        pathname: "/app/mock-test/generate",
        search: search ? `?${search}` : "",
      }}
      replace
    />
  );
}
