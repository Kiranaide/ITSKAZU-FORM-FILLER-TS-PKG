import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the ext workspace shell", () => {
    render(<App />);
    expect(screen.getByText("Kazu Fira Ext")).toBeTruthy();
    expect(screen.getByText(/workspace package/i)).toBeTruthy();
  });
});
