import Image from "next/image";
import { contextDevLink } from "@/lib/links";

/** context.dev's name with its small logo in front, the way page-token-meter credits it. */
export function ContextDevName({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <Image src="/context-dev.png" alt="" width={size} height={size} className="rounded-[3px]" style={{ width: size, height: size }} />
      context.dev
    </span>
  );
}

/** The app's footer on every page: built with context.dev, linked. */
export function Footer() {
  return (
    <footer className="text-small mt-auto flex items-center gap-1.5 border-t border-rule px-(--gutter) py-3 text-muted">
      Built with
      <a href={contextDevLink("footer")} target="_blank" rel="noreferrer" className="font-semibold text-copy hover:text-ink">
        <ContextDevName />
      </a>
    </footer>
  );
}
