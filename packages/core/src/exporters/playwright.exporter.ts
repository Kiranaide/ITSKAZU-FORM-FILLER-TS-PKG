import type { FormScript, FormScriptStep, SelectorStrategy } from "../core/schema";

export interface ExportOptions {
  framework: "playwright" | "puppeteer";
  language: "typescript" | "javascript";
  outputFormat: "test" | "script";
  includeAssertions: boolean;
  includeComments: boolean;
  stableMode: boolean;
  testName?: string;
}

const DEFAULT_OPTIONS: ExportOptions = {
  framework: "playwright",
  language: "typescript",
  outputFormat: "test",
  includeAssertions: true,
  includeComments: true,
  stableMode: true,
};

function selectorToString(selector: SelectorStrategy): string {
  if (selector.kind === "id") return `#${CSS.escape(selector.value)}`;
  if (selector.kind === "name") return `[name="${CSS.escape(selector.value)}"]`;
  if (selector.kind === "data")
    return `[data-${CSS.escape(selector.attr)}="${CSS.escape(selector.value)}"]`;
  if (selector.kind === "aria") return `[aria-label="${CSS.escape(selector.value)}"]`;
  return selector.value;
}

function generateStepCode(step: FormScriptStep, indent: number, options: ExportOptions): string[] {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  if (
    step.type === "input" ||
    step.type === "click" ||
    step.type === "keyboard" ||
    step.type === "select"
  ) {
    const selectorStr = selectorToString(step.selector);
    const targetExpr = toTargetExpression(step.selector);
    switch (step.type) {
      case "input": {
        if (step.metadata?.controlType === "datepicker" && step.metadata.optionLabel) {
          lines.push(`${pad}await ${targetExpr}.click();`);
          lines.push(
            `${pad}await page.locator('[aria-label="${escapeForCode(step.metadata.optionLabel)}"]').click();`,
          );
          if (options.includeAssertions) {
            lines.push(`${pad}await expect(${targetExpr}).toHaveValue('${escapeForCode(step.value)}');`);
          }
          break;
        }
        const value = `'${escapeForCode(step.value)}'`;
        lines.push(`${pad}await ${targetExpr}.fill(${value});`);
        if (options.includeAssertions && step.metadata?.controlType === "currency") {
          lines.push(`${pad}await expect(${targetExpr}).toHaveValue(${value});`);
        }
        break;
      }
      case "click":
        lines.push(`${pad}await ${targetExpr}.click();`);
        break;
      case "select":
        if (step.metadata?.controlType === "react-select") {
          lines.push(`${pad}await ${targetExpr}.click();`);
          if (step.metadata.optionLabel) {
            lines.push(
              `${pad}await page.getByRole('option', { name: '${escapeForCode(step.metadata.optionLabel)}' }).click();`,
            );
          } else if (step.metadata.optionId) {
            lines.push(
              `${pad}await page.locator('[data-value="${escapeForCode(step.metadata.optionId)}"], [data-id="${escapeForCode(step.metadata.optionId)}"]').first().click();`,
            );
          } else {
            lines.push(
              `${pad}await page.locator('${selectorStr} [role="option"]').first().click();`,
            );
          }
          break;
        }
        lines.push(`${pad}await ${targetExpr}.selectOption('${escapeForCode(step.value)}');`);
        if (options.includeAssertions) {
          lines.push(
            `${pad}await expect(${targetExpr}).toHaveValue('${escapeForCode(step.value)}');`,
          );
        }
        break;
      case "keyboard":
        lines.push(`${pad}await page.keyboard.press('${escapeForCode(step.key)}');`);
        break;
    }
  } else if (step.type === "navigate") {
    lines.push(`${pad}await page.goto('${escapeForCode(step.url)}');`);
    if (step.triggeredBy) {
      lines.push(`${pad}// Navigation triggered by: ${step.triggeredBy}`);
    }
  } else if (step.type === "wait") {
    lines.push(`${pad}// Wait ${step.ms}ms`);
    lines.push(`${pad}await page.waitForTimeout(${step.ms});`);
  } else if (step.type === "assert") {
    if (!step.selector) return lines;
    const selectorStr = selectorToString(step.selector);
    switch (step.assertion) {
      case "visible":
        lines.push(`${pad}await expect(page.locator('${selectorStr}')).toBeVisible();`);
        break;
      case "hidden":
        lines.push(`${pad}await expect(page.locator('${selectorStr}')).toBeHidden();`);
        break;
      case "text":
        lines.push(
          `${pad}await expect(page.locator('${selectorStr}')).toHaveText('${escapeForCode(String(step.expected ?? ""))}');`,
        );
        break;
      case "value":
        lines.push(
          `${pad}await expect(page.locator('${selectorStr}')).toHaveValue('${escapeForCode(String(step.expected ?? ""))}');`,
        );
        break;
      case "count":
        lines.push(
          `${pad}await expect(page.locator('${selectorStr}')).toHaveCount(${step.expected ?? 0});`,
        );
        break;
      case "enabled":
        lines.push(`${pad}await expect(page.locator('${selectorStr}')).toBeEnabled();`);
        break;
      case "disabled":
        lines.push(`${pad}await expect(page.locator('${selectorStr}')).toBeDisabled();`);
        break;
      case "contains":
        lines.push(
          `${pad}await expect(page.locator('${selectorStr}')).toContainText('${escapeForCode(String(step.expected ?? ""))}');`,
        );
        break;
    }
  }

  return lines;
}

function escapeForCode(str: string): string {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

export function exportToPlaywright(
  script: FormScript,
  options: Partial<ExportOptions> = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  if (opts.includeComments) {
    lines.push(
      `// Generated by kazu-fira ${opts.framework}`,
      `// Script: ${script.name}`,
      `// Version: ${script.version}`,
      `// Created: ${new Date(script.createdAt).toISOString()}`,
      ``,
    );
  }

  if (opts.framework === "playwright") {
    if (opts.outputFormat === "test") {
      lines.push(`import { test, expect } from '@playwright/test';`);
    } else {
      lines.push(`import { chromium } from 'playwright';`);
    }
  } else {
    lines.push(`const { chromium } = require('playwright');`);
  }

  lines.push("");

  const testName = opts.testName ?? sanitizeTestName(script.name);

  if (opts.outputFormat === "test") {
    lines.push(`test('${testName}', async ({ page }) => {`);
    for (const step of script.steps) {
      lines.push(...generateStepCode(step, 2, opts));
    }
    lines.push(`});`);
  } else {
    lines.push(`async function runScript(page) {`);
    lines.push(`  // Navigate to origin`);
    lines.push(`  await page.goto('${escapeForCode(script.origin)}');`);
    lines.push("");
    for (const step of script.steps) {
      if (step.type === "navigate") continue;
      lines.push(...generateStepCode(step, 2, opts));
    }
    lines.push(`}`);
    lines.push("");
    lines.push(`async function main() {`);
    lines.push(`  const browser = await ${opts.framework}.launch();`);
    lines.push(`  const page = await browser.newPage();`);
    lines.push(`  await runScript(page);`);
    lines.push(`  await browser.close();`);
    lines.push(`}`);
    lines.push("");
    lines.push(`main().catch(console.error);`);
  }

  return lines.join("\n");
}

function toTargetExpression(selector: SelectorStrategy): string {
  if (selector.kind === "id") {
    return `page.locator('#${CSS.escape(selector.value)}')`;
  }
  if (selector.kind === "name") {
    return `page.locator('[name="${CSS.escape(selector.value)}"]')`;
  }
  if (selector.kind === "aria") {
    return `page.getByLabel('${escapeForCode(selector.value)}')`;
  }
  if (selector.kind === "data") {
    if (selector.attr === "placeholder") {
      return `page.getByPlaceholder('${escapeForCode(selector.value)}')`;
    }
    if (selector.attr === "data-testid") {
      return `page.getByTestId('${escapeForCode(selector.value)}')`;
    }
    return `page.locator('[${selector.attr}="${CSS.escape(selector.value)}"]')`;
  }
  return `page.locator('${escapeForCode(selector.value)}')`;
}

export function exportToPuppeteer(
  script: FormScript,
  options: Partial<ExportOptions> = {},
): string {
  return exportToPlaywright(script, { ...options, framework: "puppeteer" });
}

function sanitizeTestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^-|-$/g, "");
}

export { exportToPlaywright as default };
