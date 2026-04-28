export const toolbarStyles = `
:host {
  all: initial;
}

.toolbar {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483647;
  background: #1a1a1a;
  color: #fff;
  border-radius: 12px;
  padding: 8px 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  user-select: none;
}

button {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}

button:hover {
  background: #3a3a3a;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button.active {
  background: #cc2222;
  border-color: #ff4444;
}

.status {
  font-size: 11px;
  color: #888;
  min-width: 60px;
}
`;

export const globalHighlightStyles = `
[data-form-pilot-highlight] {
  outline: 2px solid #0066ff !important;
  outline-offset: 2px !important;
  transition: outline 0.1s;
}
`;

let highlightStyleNode: HTMLStyleElement | null = null;

export function ensureHighlightStyles(): void {
  if (highlightStyleNode) {
    return;
  }

  const style = document.createElement("style");
  style.setAttribute("data-form-pilot-style", "");
  style.textContent = globalHighlightStyles;
  document.head.appendChild(style);
  highlightStyleNode = style;
}
