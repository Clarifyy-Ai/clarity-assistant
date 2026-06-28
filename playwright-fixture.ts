// Re-export Playwright test primitives. Extend here for shared fixtures (auth mocks, etc.).
export { test, expect } from "@playwright/test";
export {
  E2E_TEST_USER,
  setupSupabaseMocks,
  fillSignupForm,
  fillLoginForm,
  loginAsTestUser,
  dismissCookieBanner,
} from "./e2e/helpers/auth-flow";
