/** A key hint, such as Enter inside a field. Show it only when the key works now. */
export function Kbd({ children }: { children: string }) {
  return <kbd className="ui-kbd font-sans">{children}</kbd>;
}
