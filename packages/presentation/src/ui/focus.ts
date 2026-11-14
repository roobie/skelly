/** Elements the browser can focus by default or that opt in through `tabindex`. */
const FOCUSABLE =
  'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

const canFocus = (element: Element): element is HTMLElement =>
  element instanceof HTMLElement && !element.matches(':disabled') && element.closest('[inert]') === null;

/** The control a press on `element` lands on: its nearest focusable ancestor-or-self, if it can take focus. */
export const focusableAround = (element: Element): HTMLElement | undefined => {
  const control = element.closest(FOCUSABLE);
  return control && canFocus(control) ? control : undefined;
};

/** The first control inside `root` that can take focus and is shown. */
export const firstFocusable = (root: ParentNode): HTMLElement | undefined =>
  [...root.querySelectorAll(FOCUSABLE)].find(
    (element): element is HTMLElement => canFocus(element) && element.checkVisibility(),
  );
