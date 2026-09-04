import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Whiteboard } from "@/components/prep/Whiteboard";

type CtxStub = {
  scale: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  roundRect?: ReturnType<typeof vi.fn>;
  lineCap: string;
  lineJoin: string;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  globalCompositeOperation: string;
  font: string;
  textAlign: string;
  textBaseline: string;
};

function makeCtx(): CtxStub {
  return {
    scale: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    roundRect: vi.fn(),
    lineCap: "round",
    lineJoin: "round",
    strokeStyle: "#000",
    fillStyle: "#000",
    lineWidth: 1,
    globalCompositeOperation: "source-over",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
}

describe("Whiteboard", () => {
  let ctx: CtxStub;
  let observe: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let resizeCallback: ResizeObserverCallback | null;

  beforeEach(() => {
    ctx = makeCtx();
    observe = vi.fn();
    disconnect = vi.fn();
    resizeCallback = null;

    class ResizeObserverStub {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ctx),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,
      value: vi.fn(() => "data:image/png;base64,AAA"),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => true),
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return {
          width: 400,
          height: 380,
          top: 10,
          left: 20,
          bottom: 390,
          right: 420,
          x: 20,
          y: 10,
          toJSON: () => ({}),
        };
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function pointer(
    type: "pointerDown" | "pointerMove" | "pointerUp",
    el: HTMLElement,
    clientX: number,
    clientY: number,
    pointerId = 1,
  ) {
    const eventMap = {
      pointerDown: "pointerdown",
      pointerMove: "pointermove",
      pointerUp: "pointerup",
    } as const;
    const event = new Event(eventMap[type], { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      clientX: { value: clientX },
      clientY: { value: clientY },
      buttons: { value: type === "pointerUp" ? 0 : 1 },
    });
    fireEvent(el, event);
  }

  it("renders without throwing and mounts canvas", () => {
    expect(() => render(<Whiteboard height={380} />)).not.toThrow();
    expect(screen.getByTestId("whiteboard-root")).toBeInTheDocument();
    expect(screen.getByTestId("whiteboard-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pen/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eraser/i })).toBeInTheDocument();
  });

  it("pen draw path does not TypeError", () => {
    render(<Whiteboard height={380} />);
    const canvas = screen.getByTestId("whiteboard-canvas");

    expect(() => {
      // canvas rect left=20,top=10 → local (10,10) and (40,50)
      pointer("pointerDown", canvas, 30, 20);
      pointer("pointerMove", canvas, 60, 60);
      pointer("pointerUp", canvas, 60, 60);
    }).not.toThrow();

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(40, 50);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("eraser uses destination-out", () => {
    render(<Whiteboard height={380} />);
    fireEvent.click(screen.getByRole("button", { name: /Eraser/i }));
    const canvas = screen.getByTestId("whiteboard-canvas");

    expect(() => {
      pointer("pointerDown", canvas, 25, 15, 2);
      pointer("pointerMove", canvas, 35, 25, 2);
      pointer("pointerUp", canvas, 35, 25, 2);
    }).not.toThrow();

    expect(ctx.globalCompositeOperation).toBe("destination-out");
    expect(ctx.lineWidth).toBe(18);
  });

  it("clear does not throw and clears canvas", () => {
    render(<Whiteboard height={380} />);
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    }).not.toThrow();
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it("resize with zero-width parent does not throw", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    expect(() => render(<Whiteboard height={380} />)).not.toThrow();
  });

  it("resize observer callback with content does not throw", () => {
    render(<Whiteboard height={380} />);
    const canvas = screen.getByTestId("whiteboard-canvas");
    pointer("pointerDown", canvas, 21, 11, 3);
    pointer("pointerMove", canvas, 40, 30, 3);
    pointer("pointerUp", canvas, 40, 30, 3);

    expect(resizeCallback).toBeTypeOf("function");

    expect(() => {
      act(() => {
        resizeCallback!(
          [
            {
              contentRect: { width: 500, height: 380 } as DOMRectReadOnly,
              target: screen.getByTestId("whiteboard-canvas-wrap"),
            } as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
      });
    }).not.toThrow();
  });

  it("disconnects ResizeObserver on unmount", () => {
    const { unmount } = render(<Whiteboard height={380} />);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
