/** Resolve the actual interactive control, including labels and nested icons.
 * Native click runs the same handlers/guards as the mouse; no verifier shortcut. */
export function activateGestureControl(element: Element | null): string {
  const target = element?.closest(
    "button, input[type=checkbox], input[type=radio], label, a[href], summary",
  );
  const control = target instanceof HTMLLabelElement ? target.control : target;
  if (!(control instanceof HTMLElement))
    return "Pinch landed on no control — aim at a button or checkbox.";
  if (
    control.matches(":disabled, [aria-disabled=true]") ||
    control.closest("[inert]")
  )
    return "This control is unavailable. Complete the required setup first.";
  if (
    !(
      control instanceof HTMLButtonElement ||
      control instanceof HTMLAnchorElement ||
      (control instanceof HTMLElement && control.tagName === "SUMMARY") ||
      (control instanceof HTMLInputElement &&
        ["checkbox", "radio"].includes(control.type))
    )
  )
    return "Aim at a button or checkbox. This field needs keyboard input.";
  const name =
    control.getAttribute("aria-label") ||
    control.textContent?.trim() ||
    (control instanceof HTMLInputElement
      ? control.labels?.[0]?.textContent?.trim()
      : "") ||
    "control";
  control.click();
  return `Activated: ${name.slice(0, 100)}.`;
}
