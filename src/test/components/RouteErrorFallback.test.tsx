import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InShellErrorPanel } from "@/components/layout/RouteErrorFallback";

describe("InShellErrorPanel", () => {
  it("renders recovery actions without exposing a production stack", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <InShellErrorPanel
          error={new Error("secret stack detail")}
          onRetry={() => undefined}
          homeTo="/app/dashboard"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Something went wrong on this page");
    expect(html).toContain("Retry");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Log out");
    expect(html).toContain('data-testid="route-error-fallback"');
  });
});
