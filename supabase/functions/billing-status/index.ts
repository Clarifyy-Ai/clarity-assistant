import { retiredResponse } from "../_shared/retired.ts";

Deno.serve((req) => retiredResponse(req));
