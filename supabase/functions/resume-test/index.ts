import { withBrowserCors } from "../_shared/cors.ts";
import { handlePhaseAction } from "../_shared/pauseResumeTest.ts";

Deno.serve(withBrowserCors("resume-test", (req) => handlePhaseAction(req, "resume_owned_mock_test")));
