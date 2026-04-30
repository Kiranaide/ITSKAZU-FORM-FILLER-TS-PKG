import "../setup";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { FormScript } from "../../src/core/schema";
import { exportToPlaywright } from "../../src/exporters/playwright.exporter";

describe("playwright exporter", () => {
  it("generates syntactically valid TypeScript", () => {
    const script: FormScript = {
      version: 2,
      id: "s2",
      name: "Simple Flow",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: "https://example.test",
      steps: [
        {
          type: "click",
          selector: { kind: "id", value: "submit" },
          timestamp: 0,
        },
      ],
    };

    const output = exportToPlaywright(script, { language: "typescript" });
    const transpiled = ts.transpileModule(output, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
    });
    expect(transpiled.diagnostics?.length ?? 0).toBe(0);
  });

  it("exports react-select steps using role option selection", () => {
    const script: FormScript = {
      version: 2,
      id: "s3",
      name: "Select Flow",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: "https://example.test",
      steps: [
        {
          type: "select",
          selector: { kind: "id", value: "react-select-10-input" },
          value: "agency",
          timestamp: 0,
          metadata: {
            controlType: "react-select",
            optionLabel: "Agency Banking",
            optionId: "agency",
          },
        },
      ],
    };

    const output = exportToPlaywright(script);
    expect(output).toContain("getByRole('option', { name: 'Agency Banking' })");
    expect(output).not.toContain("nth-of-type");
  });

  it("exports semantic datepicker input with calendar selection and assertion", () => {
    const script: FormScript = {
      version: 2,
      id: "s4",
      name: "Date Flow",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: "https://example.test",
      steps: [
        {
          type: "input",
          selector: { kind: "name", value: "birthDate" },
          value: "03/09/1966",
          timestamp: 0,
          metadata: {
            controlType: "datepicker",
            commitReason: "calendar-day",
            optionLabel: "Choose Wednesday, March 9th, 1966",
            normalizedValue: "1966-03-09",
          },
        },
      ],
    };

    const output = exportToPlaywright(script, { includeAssertions: true });
    expect(output).toContain("locator('[aria-label=\"Choose Wednesday, March 9th, 1966\"]').click()");
    expect(output).toContain("toHaveValue('03/09/1966')");
  });
});
