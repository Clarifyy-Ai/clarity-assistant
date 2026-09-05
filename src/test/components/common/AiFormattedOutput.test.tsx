import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiFormattedOutput } from "@/components/common/AiFormattedOutput";

describe("AiFormattedOutput", () => {
  it("renders bold markdown without raw asterisks", () => {
    render(<AiFormattedOutput text="Use **STAR** method here." />);
    expect(screen.getByText("STAR")).toBeTruthy();
    expect(screen.queryByText(/\*\*STAR\*\*/)).toBeNull();
  });

  it("renders headings and bullet lists", () => {
    render(
      <AiFormattedOutput text={"## Approach\n- First point\n- Second point"} />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Approach" })).toBeTruthy();
    expect(screen.getByText("First point")).toBeTruthy();
    expect(screen.getByText("Second point")).toBeTruthy();
  });
});
