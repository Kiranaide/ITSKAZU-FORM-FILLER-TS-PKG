import { MASK_PLACEHOLDER } from "../core/pii-detector";
import type { KazuFiraHooks, KazuFiraPlugin } from "../core/types";

export function createMaskPlugin(maskValue = MASK_PLACEHOLDER): KazuFiraPlugin {
  return {
    name: "mask-plugin",
    install(hooks: KazuFiraHooks): void {
      const previousOnStep = hooks.onStep;
      hooks.onStep = (step) => {
        const candidate = previousOnStep ? previousOnStep(step) : step;
        if (!candidate || candidate.type !== "input" || !candidate.masked) {
          return candidate;
        }
        return { ...candidate, value: maskValue };
      };
    },
  };
}
