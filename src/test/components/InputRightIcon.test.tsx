import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui/Input";

describe("Input rightIcon", () => {
  it("lets password visibility buttons receive clicks", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <Input
        label="Password"
        type="password"
        rightIcon={
          <button type="button" aria-label="Show password" onClick={onToggle}>
            Show
          </button>
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
