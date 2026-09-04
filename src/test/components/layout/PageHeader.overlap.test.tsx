import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { useUIStore } from "@/store/uiStore";

const LONG_UNDERSCORE =
  "Anushka_Barai_Resume_DataAnalytics_DataEngineer (1)";
const VERY_LONG =
  "An extremely long professional resume document title containing many words and descriptors.pdf";
const SPECIAL =
  "Resume (Updated) - Data Engineer [Final].pdf";

function renderHeader(title: string) {
  return render(
    <MemoryRouter>
      <PageHeader
        title={title}
        description="Uploaded recently. Stored privately."
        breadcrumbs={[
          { label: "Documents", href: "/app/documents" },
          { label: title },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button type="button">Edit fields</button>
            <button type="button">Re-parse file</button>
            <button type="button">Download</button>
          </div>
        }
      />
    </MemoryRouter>,
  );
}

describe("PageHeader overlap contracts (TC-MOD-006)", () => {
  beforeEach(() => {
    useUIStore.setState({ stealth_mode: false } as never);
  });

  it("exposes title and actions test ids with shrink-safe classes", () => {
    renderHeader(LONG_UNDERSCORE);

    const root = screen.getByTestId("page-header");
    const title = screen.getByTestId("page-header-title");
    const info = screen.getByTestId("page-header-info");
    const actions = screen.getByTestId("page-header-actions");
    const main = screen.getByTestId("page-header-main");

    expect(root).toBeInTheDocument();
    expect(title.tagName).toBe("H1");
    expect(title).toHaveTextContent(LONG_UNDERSCORE);
    expect(title).toHaveAttribute("title", LONG_UNDERSCORE);
    expect(title.className).toMatch(/min-w-0/);
    expect(title.className).toMatch(/max-w-full/);
    expect(title.className).toMatch(/overflow-wrap:anywhere|\[overflow-wrap:anywhere\]/);
    expect(title.className).toMatch(/line-clamp-2/);
    expect(info.className).toMatch(/min-w-0/);
    expect(info.className).toMatch(/flex-1/);
    expect(actions.className).toMatch(/shrink-0/);
    expect(main.className).toMatch(/flex-col/);
    expect(main.className).toMatch(/md:flex-row/);
  });

  it.each([
    ["Resume.pdf"],
    ["Software_Engineer_Resume.pdf"],
    [LONG_UNDERSCORE],
    [VERY_LONG],
    ["Anushka Barai Resume Data Analytics Data Engineer.pdf"],
    ["Anushka_Barai_Resume_DataAnalytics_DataEngineer_Final.pdf"],
    [SPECIAL],
  ])("keeps full title accessible for %s", (title) => {
    renderHeader(title);
    const heading = screen.getByTestId("page-header-title");
    expect(heading).toHaveTextContent(title);
    expect(heading).toHaveAttribute("title", title);
    expect(screen.getByRole("button", { name: "Edit fields" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-parse file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });
});
