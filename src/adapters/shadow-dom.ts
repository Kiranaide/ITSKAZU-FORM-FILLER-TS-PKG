type ShadowRootHandler = (root: ShadowRoot) => void;

export function watchOpenShadowRoots(onShadowRoot: ShadowRootHandler): () => void {
  const originalAttachShadow = HTMLElement.prototype.attachShadow;

  HTMLElement.prototype.attachShadow = function patchAttachShadow(init: ShadowRootInit): ShadowRoot {
    const root = originalAttachShadow.call(this, init);
    if (init.mode === "open") {
      onShadowRoot(root);
    }
    return root;
  };

  for (const element of document.querySelectorAll("*")) {
    if (element.shadowRoot) {
      onShadowRoot(element.shadowRoot);
    }
  }

  return () => {
    HTMLElement.prototype.attachShadow = originalAttachShadow;
  };
}
