import "../setup";
import { describe, expect, it } from "vitest";
import { Recorder } from "../../src/core/recorder";
import { Replayer } from "../../src/core/replayer";
import { applyPlugins } from "../../src/index";

describe("hooks", () => {
  it("discards step when onStep returns null", () => {
    document.body.innerHTML = '<input id="email" />';
    const input = document.querySelector<HTMLInputElement>("#email");
    if (!input) throw new Error("missing input");

    const recorder = new Recorder({
      hooks: {
        onStep: () => null,
      },
    });
    recorder.start();
    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const script = recorder.stop();
    expect(script.steps).toHaveLength(0);
  });

  it("calls onError when replay misses element", async () => {
    let called = 0;
    await new Replayer({
      script: {
        version: 2,
        id: "s1",
        name: "demo",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        origin: location.origin,
        steps: [{ type: "click", selector: { kind: "id", value: "missing" }, timestamp: 0 }],
      },
      hooks: {
        onError: () => {
          called += 1;
        },
      },
    }).play();

    expect(called).toBe(1);
  });

  it("installs plugins into runtime hooks", () => {
    let installed = 0;
    applyPlugins(
      [
        {
          name: "p1",
          install: () => {
            installed += 1;
          },
        },
      ],
      {},
    );

    expect(installed).toBe(1);
  });
});
