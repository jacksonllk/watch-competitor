"use client";

/**
 * A failure message, with "Contact support" linked to SUPPORT_URL when the developer set one.
 * Every failure caused by the developer's account ends with "Contact support." (never the vendor or credits).
 */
import { useSupportUrl } from "./shell";

const WORDS = "Contact support";

export function SupportText({ text }: { text: string }) {
  const url = useSupportUrl();
  const at = text.indexOf(WORDS);
  if (!url || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
        {WORDS}
      </a>
      {text.slice(at + WORDS.length)}
    </>
  );
}
