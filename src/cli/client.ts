export function mountToolbox(): void {
  const MOUNT_ATTR = "data-toolbox-mounted";
  const ROOT_ID = "__toolbox-root";

  if (document.documentElement.getAttribute(MOUNT_ATTR) === "true") return;
  document.documentElement.setAttribute(MOUNT_ATTR, "true");

  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>:host{all:initial}.toolbox{position:fixed;bottom:16px;right:16px;z-index:2147483647;font:12px system-ui;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:12px;padding:10px;box-shadow:0 8px 32px rgba(0,0,0,.35)}.toolbox button{margin-left:8px}</style><div class="toolbox"><span id="toolbox-count">0 fields</span><button id="toolbox-rescan">Rescan</button><div id="toolbox-list"></div></div>`;

  const countEl = shadow.getElementById("toolbox-count");
  const listEl = shadow.getElementById("toolbox-list");
  if (!(countEl instanceof HTMLElement) || !(listEl instanceof HTMLElement)) return;

  let observer: MutationObserver | null = null;
  let timer = 0;

  const rescan = (): void => {
    const fields = Array.from(
      document.querySelectorAll("form,input,select,textarea,[contenteditable='true'],[contenteditable='']"),
    ).filter((el): el is HTMLElement => el instanceof HTMLElement);
    countEl.textContent = `${fields.length} fields`;
    listEl.textContent = fields.slice(0, 8).map((el) => el.tagName.toLowerCase()).join(", ");
  };

  const schedule = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(rescan, 200);
  };

  const startObserver = (): void => {
    observer?.disconnect();
    if (!document.body) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const onNavigate = (): void => {
    requestAnimationFrame(() => {
      rescan();
      startObserver();
    });
  };

  for (const key of ["pushState", "replaceState"] as const) {
    const original = history[key];
    history[key] = function (this: History, ...args: Parameters<History[typeof key]>) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event("toolbox:navigate"));
      return result;
    } as typeof history.pushState;
  }

  window.addEventListener("popstate", onNavigate);
  window.addEventListener("hashchange", onNavigate);
  window.addEventListener("toolbox:navigate", onNavigate);
  shadow.getElementById("toolbox-rescan")?.addEventListener("click", rescan);

  rescan();
  startObserver();
}

if (typeof window !== "undefined") {
  mountToolbox();
}
