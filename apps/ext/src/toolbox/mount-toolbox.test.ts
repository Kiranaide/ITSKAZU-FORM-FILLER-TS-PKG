import { beforeEach, describe, expect, it } from "vitest";

describe("mount-toolbox", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-toolbox-mounted");
    // biome-ignore lint/suspicious/noExplicitAny: test global flag
    (globalThis as any).__kazuFiraToolboxMounted = undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test global flag
    (window as any).__kazuFiraToolboxMounted = undefined;
  });

  it("mountToolbox creates shadow DOM host in document body", async () => {
    const mod = await import("./mount-toolbox");

    mod.mountToolbox();

    const host = document.getElementById("__toolbox-root");
    expect(host).toBeTruthy();
    expect(host?.shadowRoot).toBeTruthy();
    expect(document.documentElement.getAttribute("data-toolbox-mounted")).toBe("true");
  });

  it("mountToolbox sets data attribute on html element", async () => {
    const mod = await import("./mount-toolbox");

    mod.mountToolbox();

    expect(document.documentElement.getAttribute("data-toolbox-mounted")).toBe("true");
  });

  it("mountToolbox does not mount twice", async () => {
    const mod = await import("./mount-toolbox");

    mod.mountToolbox();
    mod.mountToolbox();

    const hosts = document.querySelectorAll("#__toolbox-root");
    expect(hosts.length).toBe(1);
  });

  it("unmountToolbox removes host element and clears attribute", async () => {
    const mod = await import("./mount-toolbox");

    mod.mountToolbox();
    expect(document.getElementById("__toolbox-root")).toBeTruthy();

    mod.unmountToolbox();

    expect(document.getElementById("__toolbox-root")).toBeNull();
    expect(document.documentElement.getAttribute("data-toolbox-mounted")).toBeNull();
  });

  it("unmountToolbox sets mounted flag to false", async () => {
    const mod = await import("./mount-toolbox");

    window.__kazuFiraToolboxMounted = true;
    mod.mountToolbox();
    mod.unmountToolbox();

    expect(window.__kazuFiraToolboxMounted).toBe(false);
  });

  it("unmount then remount works correctly", async () => {
    const mod = await import("./mount-toolbox");

    mod.mountToolbox();
    mod.unmountToolbox();

    mod.mountToolbox();
    const host = document.getElementById("__toolbox-root");
    expect(host).toBeTruthy();
    expect(host?.shadowRoot).toBeTruthy();
  });

  it("unmountToolbox is safe to call when not mounted", async () => {
    const mod = await import("./mount-toolbox");

    expect(() => mod.unmountToolbox()).not.toThrow();
  });
});
