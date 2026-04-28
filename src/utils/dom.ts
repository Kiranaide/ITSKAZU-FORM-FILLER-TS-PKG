export function getEventTargetElement(event: Event): Element | null {
  const target = event.target;
  return target instanceof Element ? target : null;
}

export function isFormField(el: Element | null): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (!el) {
    return false;
  }

  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

export function matchesAnySelector(el: Element, selectors: string[]): boolean {
  for (const selector of selectors) {
    try {
      if (el.matches(selector)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
