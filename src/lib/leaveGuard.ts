/**
 * Shared decision for leaving an editor with possibly-unsaved work (#37/#30):
 * if there are unsaved edits, flush them first and only allow the navigation when
 * the flush SUCCEEDS — so in-app navigation can't silently drop work, and a failed
 * save keeps the user on the page (the flush surfaces the error).
 *
 * @returns true if it's safe to navigate; false to stay put.
 */
export async function guardedLeave(
  hasUnsaved: boolean,
  flush: () => Promise<boolean>,
): Promise<boolean> {
  if (!hasUnsaved) return true;
  return flush();
}
