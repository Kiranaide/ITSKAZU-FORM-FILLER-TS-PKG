import "../setup";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { FormScript } from "../../src/core/schema";
import { exportToPlaywright } from "../../src/exporters/playwright.exporter";

describe("playwright exporter", () => {
  it("renders masked fields using env vars", () => {
    const script: FormScript = {
      version: 2,
      id: "s1",
      name: "Masked Flow",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: "https://example.test",
      steps: [
        {
          type: "input",
          selector: { kind: "id", value: "email" },
          value: "[MASKED]",
          masked: true,
          timestamp: 0,
        },
      ],
    };

    const code = exportToPlaywright(script);
    expect(code.includes("process.env.FIELD_EMAIL")).toBe(true);
    expect(code.includes("TODO: set env var FIELD_EMAIL")).toBe(true);
  });

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
});
