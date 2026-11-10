import Image from "next/image";
import { contextDevLink, REPO_URL } from "@/lib/links";

/** context.dev's name with its small logo in front, the way page-token-meter credits it. */
export function ContextDevName({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <Image src="/context-dev.png" alt="" width={size} height={size} className="rounded-[3px]" style={{ width: size, height: size }} />
      context.dev
    </span>
  );
}

/**
 * The app's footer on every page, stuck to the bottom of the window: built with context.dev on the left (the sign-up
 * link the spec never cuts), "Star on GitHub" on the right (Jackson, 10 Nov: the label for every OSS app).
 */
export function Footer() {
  return (
    <footer className="text-small sticky bottom-0 z-30 mt-auto flex items-center gap-4 border-t border-rule bg-white/90 px-(--gutter) py-2.5 text-muted backdrop-blur">
      <span className="flex items-center gap-1.5">
        Built with
        <a href={contextDevLink("footer")} target="_blank" rel="noreferrer" className="font-semibold text-copy hover:text-ink">
          <ContextDevName />
        </a>
      </span>
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1.5 font-semibold text-copy hover:text-ink">
        <GitHubMark />
        Star on GitHub
      </a>
    </footer>
  );
}

/** GitHub's mark (Octicons mark-github, MIT). */
function GitHubMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
