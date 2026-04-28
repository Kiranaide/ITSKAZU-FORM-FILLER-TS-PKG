const HIGHLIGHT_ATTR = "data-form-pilot-highlight";

export function highlightElement(el: Element): void {
  clearHighlight();
  el.setAttribute(HIGHLIGHT_ATTR, "");
}

export function clearHighlight(): void {
  const prev = document.querySelector(`[${HIGHLIGHT_ATTR}]`);
  if (prev) {
    prev.removeAttribute(HIGHLIGHT_ATTR);
  }
}
