import "../setup";
import { describe, expect, it } from "vitest";
import { AssertionError, createAssertStep, Replayer } from "../../src/core/replayer";
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
      {
        type: "input",
        selector: { kind: "id", value: "email" },
        value: "user@example.com",
        timestamp: 0,
      },
      {
        type: "input",
        selector: { kind: "id", value: "tos" },
        value: "true",
        timestamp: 1,
      },
    ]);

    await new Replayer({ script }).play();

    expect(input.value).toBe("user@example.com");
    expect(checkbox.checked).toBe(true);
  });

  it("commits blur-based formatting for change-driven inputs", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.name = "loanDetails.effectiveMoratoriumRate";
    input.addEventListener("blur", () => {
      if (input.value === "5") {
        input.value = "5.00";
      }
    });
    document.body.append(input);

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "name", value: "loanDetails.effectiveMoratoriumRate" },
        value: "5",
        timestamp: 0,
        metadata: {
          controlType: "text",
          commitReason: "change",
          selectorSource: "name",
          selectorConfidence: "high",
        },
      },
    ]);

    await new Replayer({ script }).play();

    expect(input.value).toBe("5.00");
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

  it("handles semantic react-select option selection", async () => {
    document.body.innerHTML = "";

    const control = document.createElement("div");
    control.className = "css-react-select-control";
    const input = document.createElement("input");
    input.id = "react-select-1-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    control.append(input);

    const menu = document.createElement("div");
    menu.className = "css-react-select-menu";
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.setAttribute("data-value", "agency");
    option.textContent = "Agency Banking";
    option.addEventListener("click", () => {
      input.value = "agency";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    menu.append(option);
    document.body.append(control, menu);

    const script = createV2Script([
      {
        type: "select",
        selector: { kind: "id", value: "react-select-1-input" },
        value: "agency",
        timestamp: 0,
        metadata: {
          controlType: "react-select",
          optionLabel: "Agency Banking",
          optionId: "agency",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("agency");
  });

  it("selects react-select option when selection is bound to mousedown", async () => {
    document.body.innerHTML = "";

    const control = document.createElement("div");
    control.className = "css-react-select-control";
    const input = document.createElement("input");
    input.id = "react-select-1-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    control.append(input);

    const menu = document.createElement("div");
    menu.className = "css-react-select-menu";
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.setAttribute("data-value", "agency");
    option.textContent = "Agency Banking";
    option.addEventListener("mousedown", () => {
      input.value = "agency";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    menu.append(option);
    document.body.append(control, menu);

    const script = createV2Script([
      {
        type: "select",
        selector: { kind: "id", value: "react-select-1-input" },
        value: "agency",
        timestamp: 0,
        metadata: {
          controlType: "react-select",
          optionLabel: "Agency Banking",
          optionId: "agency",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("agency");
  });

  it("forces input value when option click does not update combobox", async () => {
    document.body.innerHTML = "";

    const control = document.createElement("div");
    control.className = "css-react-select-control";
    const input = document.createElement("input");
    input.id = "react-select-1-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.value = "";
    control.append(input);

    const menu = document.createElement("div");
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.textContent = "2C - Auto Valuation";
    // Intentionally do NOT update input on selection to simulate a handler mismatch.
    menu.append(option);
    document.body.append(control, menu);

    const script = createV2Script([
      {
        type: "select",
        selector: { kind: "id", value: "react-select-1-input" },
        value: "2C - Auto Valuation",
        timestamp: 0,
        metadata: {
          controlType: "react-select",
          optionLabel: "2C - Auto Valuation",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("2C - Auto Valuation");
  });

  it("waits for delayed react-select options before clicking", async () => {
    document.body.innerHTML = "";

    const control = document.createElement("div");
    control.className = "css-react-select-control";
    const input = document.createElement("input");
    input.id = "react-select-1-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-controls", "react-select-1-listbox");
    input.setAttribute("aria-expanded", "false");
    const listbox = document.createElement("div");
    listbox.id = "react-select-1-listbox";
    listbox.setAttribute("role", "listbox");
    control.append(input);
    document.body.append(control, listbox);

    input.addEventListener("click", () => {
      input.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        const option = document.createElement("div");
        option.setAttribute("role", "option");
        option.setAttribute("data-value", "agency");
        option.textContent = "Agency Banking";
        option.addEventListener("click", () => {
          input.value = "agency";
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        listbox.append(option);
      }, 120);
    });

    const script = createV2Script([
      {
        type: "select",
        selector: { kind: "id", value: "react-select-1-input" },
        value: "agency",
        timestamp: 0,
        metadata: {
          controlType: "react-select",
          optionLabel: "Agency Banking",
          optionId: "agency",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("agency");
  });

  it("selects react-select option with normalized label matching", async () => {
    document.body.innerHTML = "";

    const control = document.createElement("div");
    control.className = "css-react-select-control";
    const input = document.createElement("input");
    input.id = "react-select-1-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    control.append(input);

    const menu = document.createElement("div");
    menu.className = "MuiPaper-root";
    const option = document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "  11842 - (14.750000%)   LOAN FIXED 2-YR  ";
    option.addEventListener("click", () => {
      input.value = "selected";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    menu.append(option);
    document.body.append(control, menu);

    const script = createV2Script([
      {
        type: "select",
        selector: { kind: "id", value: "react-select-1-input" },
        value: "11842 - (14.750000%) LOAN FIXED 2-YR",
        timestamp: 0,
        metadata: {
          controlType: "react-select",
          optionLabel: "11842 - (14.750000%) LOAN FIXED 2-YR",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("selected");
  });

  it("handles multi-select values", async () => {
    document.body.innerHTML = "";

    const select = document.createElement("select");
    select.id = "colors";
    select.multiple = true;
    select.innerHTML =
      '<option value="red">Red</option><option value="blue">Blue</option><option value="green">Green</option>';
    document.body.append(select);

    const script = createV2Script([
      {
        type: "select",
        selector: { kind: "id", value: "colors" },
        value: "red||green",
        timestamp: 0,
      },
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
    button.addEventListener("click", () => {
      clicked = true;
    });

    const script = createV2Script([
      { type: "click", selector: { kind: "id", value: "submit-btn" }, timestamp: 0 },
    ]);

    await new Replayer({ script }).play();

    expect(clicked).toBe(true);
  });

  it("handles semantic datepicker day selection", async () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "dob";
    input.readOnly = true;
    input.className = "react-datepicker-ignore-onclickoutside";
    const day = document.createElement("div");
    day.setAttribute("aria-label", "Choose Wednesday, March 9th, 1966");
    day.addEventListener("click", () => {
      input.value = "03/09/1966";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    document.body.append(input, day);

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "dob" },
        value: "03/09/1966",
        timestamp: 0,
        metadata: {
          controlType: "datepicker",
          optionLabel: "Choose Wednesday, March 9th, 1966",
          commitReason: "calendar-day",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("03/09/1966");
  });

  it("waits for delayed datepicker day before clicking", async () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "dob";
    input.readOnly = true;
    document.body.append(input);

    input.addEventListener("click", () => {
      setTimeout(() => {
        const day = document.createElement("div");
        day.setAttribute("aria-label", "Choose Wednesday, March 9th, 1966");
        day.addEventListener("click", () => {
          input.value = "03/09/1966";
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        document.body.append(day);
      }, 120);
    });

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "dob" },
        value: "03/09/1966",
        timestamp: 0,
        metadata: {
          controlType: "datepicker",
          optionLabel: "Choose Wednesday, March 9th, 1966",
          commitReason: "calendar-day",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("03/09/1966");
  });

  it("sets datepicker readonly input when metadata has no optionLabel", async () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "dob";
    input.readOnly = true;
    input.className = "react-datepicker-ignore-onclickoutside";
    document.body.append(input);

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "dob" },
        value: "03/09/1966",
        timestamp: 0,
        metadata: {
          controlType: "datepicker",
          commitReason: "change",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("03/09/1966");
  });

  it("uses normalizedValue when datepicker step value is empty", async () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "dob";
    input.readOnly = true;
    input.className = "react-datepicker-ignore-onclickoutside";
    document.body.append(input);

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "dob" },
        value: "",
        timestamp: 0,
        metadata: {
          controlType: "datepicker",
          commitReason: "change",
          normalizedValue: "1966-03-09",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("03/09/1966");
  });

  it("falls back to normalized date when day aria label is unavailable", async () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "dob";
    input.readOnly = true;
    input.className = "react-datepicker-ignore-onclickoutside";
    document.body.append(input);

    input.addEventListener("click", () => {
      const popper = document.createElement("div");
      popper.className = "react-datepicker-popper";
      const month = document.createElement("select");
      month.className = "react-datepicker__month-select";
      month.innerHTML = '<option value="2">March</option>';
      month.value = "2";
      const year = document.createElement("select");
      year.className = "react-datepicker__year-select";
      year.innerHTML = '<option value="1966">1966</option>';
      year.value = "1966";
      const day = document.createElement("div");
      day.className = "react-datepicker__day react-datepicker__day--009";
      day.textContent = "9";
      day.addEventListener("click", () => {
        input.value = "03/09/1966";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      popper.append(month, year, day);
      document.body.append(popper);
    });

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "dob" },
        value: "",
        timestamp: 0,
        metadata: {
          controlType: "datepicker",
          optionLabel: "Choose Wednesday, March 9th, 1966",
          commitReason: "calendar-day",
          normalizedValue: "1966-03-09",
        },
      },
    ]);

    await new Replayer({ script }).play();
    expect(input.value).toBe("03/09/1966");
  });

  it("handles keyboard events", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "search";
    document.body.append(input);

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "search" },
        value: "test query",
        timestamp: 0,
      },
      { type: "keyboard", selector: { kind: "id", value: "search" }, key: "Enter", timestamp: 1 },
    ]);

    let submitted = false;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitted = true;
    });

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
      {
        type: "input",
        selector: { kind: "id", value: "name" },
        value: "skipped",
        timestamp: 0,
      },
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
      {
        type: "input",
        selector: { kind: "id", value: "field" },
        value: "test",
        timestamp: 0,
      },
    ]);

    const replayer = new Replayer({
      script,
      onAfterAction: (_step, el) => {
        resolvedEl = el;
      },
    });

    await replayer.play();

    expect(resolvedEl).toBe(input);
  });

  it("continues when selector strategy is invalid", async () => {
    document.body.innerHTML = `<div id="success">Done</div>`;

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "not-found" },
        value: "test",
        timestamp: 0,
      },
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
      {
        type: "input",
        selector: { kind: "id", value: "input" },
        value: "test",
        timestamp: 0,
      },
    ]);

    await new Replayer({ script }).play();

    expect(input.value).toBe("test");
  });

  it("supports speed multiplier", async () => {
    document.body.innerHTML = "";

    const script = createV2Script([{ type: "wait", ms: 100 }]);

    const start = Date.now();
    const replayer = new Replayer({ script, speedMultiplier: 2 });
    await replayer.play();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(80);
  });

  it("returns performance result with timings", async () => {
    document.body.innerHTML = `<input id="test" />`;

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "test" },
        value: "hello",
        timestamp: 0,
      },
    ]);

    const result = await new Replayer({ script }).play();

    expect(result.scriptId).toBe("test-script");
    expect(result.timings).toHaveLength(1);
    expect(result.stepTimings).toHaveLength(1);
    expect(result.totalMs).toBeGreaterThan(0);
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(result.slowSteps).toHaveLength(0);
    expect(result.stepsPerSecond).toBeGreaterThan(0);
  });

  it("supports play speed override and lifecycle events", async () => {
    document.body.innerHTML = `<input id="field" />`;
    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "id", value: "field" },
        value: "ok",
        timestamp: 0,
      },
    ]);
    const replayer = new Replayer({ script });
    const events: string[] = [];
    replayer.on("step", () => events.push("step"));
    replayer.on("done", () => events.push("done"));

    await replayer.play({ speed: 1.5 });

    expect(replayer.speedMultiplier).toBe(1.5);
    expect(events).toEqual(["step", "done"]);
  });

  it("creates assert steps and emits AssertionError on failure", async () => {
    document.body.innerHTML = `<input id="field" value="x" />`;
    const assertStep = createAssertStep({ kind: "id", value: "field" }, "value", "y");
    const script = createV2Script([assertStep]);
    let error: Error | null = null;

    await new Replayer({
      script,
      onError: (_step, err) => {
        error = err;
        return "skip";
      },
    }).play();

    expect(error).toBeInstanceOf(AssertionError);
  });

  it("waits longer for low-confidence selectors", async () => {
    document.body.innerHTML = "";

    let clicked = false;

    const script = createV2Script([
      {
        type: "click",
        selector: { kind: "id", value: "swal-confirm" },
        timestamp: 0,
        metadata: {
          controlType: "button",
          commitReason: "click",
          selectorConfidence: "low",
        },
      },
    ]);

    setTimeout(() => {
      const btn = document.createElement("button");
      btn.id = "swal-confirm";
      btn.addEventListener("click", () => {
        clicked = true;
      });
      document.body.append(btn);
    }, 1500);

    await new Replayer({ script }).play();
    expect(clicked).toBe(true);
  });
});
