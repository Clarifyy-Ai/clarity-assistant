import { withBrowserCors } from "../_shared/cors.ts";
import { handlePhaseAction } from "../_shared/pauseResumeTest.ts";

Deno.serve(withBrowserCors("pause-test", (req) => handlePhaseAction(req, "pause_owned_mock_test")));
