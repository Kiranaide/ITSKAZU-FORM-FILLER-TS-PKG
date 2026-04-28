import "../setup";
import { describe, expect, it } from "vitest";
import { Replayer } from "../../src/core/replayer";
import type { FormScript } from "../../src/core/schema";

function createV2Script(steps: FormScript["steps"]): FormScript {
  return {
    version: 2,
    id: "test-script",
    name: "Test Script",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    origin: "https://example.com",
    steps,
  };
}

describe("replayer", () => {
  it("fills text and checkbox inputs", async () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");
    const input = document.createElement("input");
    input.id = "email";
    input.name = "email";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "tos";

    form.append(input, checkbox);
    document.body.append(form);

    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "email" }, value: "user@example.com", masked: false, timestamp: 0 },
      { type: "input", selector: { kind: "id", value: "tos" }, value: "true", masked: false, timestamp: 1 },
    ]);

    await new Replayer({ script }).play();

    expect(input.value).toBe("user@example.com");
    expect(checkbox.checked).toBe(true);
  });

  it("handles select values", async () => {
    document.body.innerHTML = "";

    const select = document.createElement("select");
    select.id = "country";
    select.innerHTML = '<option value="id">ID</option><option value="us">US</option>';
    document.body.append(select);

    const script = createV2Script([
      { type: "select", selector: { kind: "id", value: "country" }, value: "us", timestamp: 0 },
    ]);

    await new Replayer({ script }).play();

    expect(select.value).toBe("us");
  });

  it("handles multi-select values", async () => {
    document.body.innerHTML = "";

    const select = document.createElement("select");
    select.id = "colors";
    select.multiple = true;
    select.innerHTML = '<option value="red">Red</option><option value="blue">Blue</option><option value="green">Green</option>';
    document.body.append(select);

    const script = createV2Script([
      { type: "select", selector: { kind: "id", value: "colors" }, value: "red||green", timestamp: 0 },
    ]);

    await new Replayer({ script }).play();

    const selected = Array.from(select.selectedOptions).map((o) => o.value);
    expect(selected).toEqual(["red", "green"]);
  });

  it("clicks elements", async () => {
    document.body.innerHTML = "";

    const button = document.createElement("button");
    button.id = "submit-btn";
    document.body.append(button);

    let clicked = false;
    button.addEventListener("click", () => { clicked = true; });

    const script = createV2Script([
      { type: "click", selector: { kind: "id", value: "submit-btn" }, timestamp: 0 },
    ]);

    await new Replayer({ script }).play();

    expect(clicked).toBe(true);
  });

  it("handles keyboard events", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "search";
    document.body.append(input);

    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "search" }, value: "test query", masked: false, timestamp: 0 },
      { type: "keyboard", selector: { kind: "id", value: "search" }, key: "Enter", timestamp: 1 },
    ]);

    let submitted = false;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitted = true; });

    await new Replayer({ script }).play();

    expect(submitted).toBe(true);
  });

  it("waits for specified duration", async () => {
    document.body.innerHTML = "";

    const script = createV2Script([
      { type: "wait", ms: 50 },
      { type: "wait", ms: 50 },
    ]);

    const start = Date.now();
    await new Replayer({ script }).play();
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(80);
  });

  it("aborts on missing element when onError returns abort", async () => {
    document.body.innerHTML = "";

    const script = createV2Script([
      { type: "click", selector: { kind: "id", value: "nonexistent" }, timestamp: 0 },
    ]);

    const replayer = new Replayer({
      script,
      onError: () => "abort",
    });

    await replayer.play();
    expect(replayer.state).toBe("stopped");
  });

  it("skips action when onBeforeAction returns false", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "name";
    document.body.append(input);

    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "name" }, value: "skipped", masked: false, timestamp: 0 },
    ]);

    const replayer = new Replayer({
      script,
      onBeforeAction: () => false,
    });

    await replayer.play();

    expect(input.value).toBe("");
  });

  it("calls onAfterAction with resolved element", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "field";
    document.body.append(input);

    let resolvedEl: Element | null = null;
    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "field" }, value: "test", masked: false, timestamp: 0 },
    ]);

    const replayer = new Replayer({
      script,
      onAfterAction: (_step, el) => { resolvedEl = el; },
    });

    await replayer.play();

    expect(resolvedEl).toBe(input);
  });

  it("continues when selector strategy is invalid", async () => {
    document.body.innerHTML = `<div id="success">Done</div>`;

    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "not-found" }, value: "test", masked: false, timestamp: 0 },
      { type: "click", selector: { kind: "id", value: "success" }, timestamp: 1 },
    ]);

    const replayer = new Replayer({
      script,
      onError: () => "skip",
    });

    await replayer.play();

    const success = document.getElementById("success");
    expect(success).not.toBeNull();
  });

  it("allows replay by default without origin check", async () => {
    document.body.innerHTML = `<input id="input" />`;
    const input = document.getElementById("input") as HTMLInputElement;

    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "input" }, value: "test", masked: false, timestamp: 0 },
    ]);

    await new Replayer({ script }).play();

    expect(input.value).toBe("test");
  });

  it("supports speed multiplier", async () => {
    document.body.innerHTML = "";

    const script = createV2Script([
      { type: "wait", ms: 100 },
    ]);

    const start = Date.now();
    const replayer = new Replayer({ script, speedMultiplier: 2 });
    await replayer.play();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(80);
  });

  it("returns performance result with timings", async () => {
    document.body.innerHTML = `<input id="test" />`;

    const script = createV2Script([
      { type: "input", selector: { kind: "id", value: "test" }, value: "hello", masked: false, timestamp: 0 },
    ]);

    const result = await new Replayer({ script }).play();

    expect(result.scriptId).toBe("test-script");
    expect(result.stepTimings).toHaveLength(1);
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(result.stepsPerSecond).toBeGreaterThan(0);
  });
});