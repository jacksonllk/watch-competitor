"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Suspense, useContext, useState, type ReactNode } from "react";
import { AddPanel } from "./add-panel";
import { Toast, useToast } from "./toast";

const OpenAdd = createContext<() => void>(() => {});
const Notify = createContext<(text: string) => void>(() => {});
const Demo = createContext(false);
const Support = createContext<string | null>(null);

/** True on the public demo (DEMO_MODE=true): visitors try every step, nothing is created on the demo's key. */
export const useDemo = () => useContext(Demo);

/** Shows a short notice in the bottom right. */
export const useNotify = () => useContext(Notify);

/** Holds the Add panel and the toast, so every "Add competitor" button opens the same panel. */
/** Where "Contact support" links (SUPPORT_URL), or null for plain words. */
export const useSupportUrl = () => useContext(Support);

export function Shell({ children, demo = false, supportUrl = null }: { children: ReactNode; demo?: boolean; supportUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const { toast, notify } = useToast();

  return (
    <Demo.Provider value={demo}>
      <Support.Provider value={supportUrl}>
        <Notify.Provider value={notify}>
          <OpenAdd.Provider value={() => setOpen(true)}>
            <header className="sticky top-0 z-40 h-12 border-b border-rule bg-white/90 backdrop-blur">
              <div className="mx-auto flex h-full max-w-[1200px] items-center gap-6 px-(--gutter)">
                <Link href="/" className="text-heading flex items-center gap-2.5 font-semibold text-ink">
                  <Logo />
                  Watch Competitor
                </Link>
                <nav className="hidden h-full items-center sm:flex">
                  <Suspense fallback={<OverviewLink active={false} />}>
                    <CurrentOverviewLink />
                  </Suspense>
                </nav>
                <div className="ml-auto">
                  <AddButton />
                </div>
              </div>
            </header>
            {children}
            {open && <AddPanel onClose={() => setOpen(false)} onAdded={(name) => notify(`Now watching ${name}. The first checks are running.`)} />}
            <Toast toast={toast} />
          </OpenAdd.Provider>
        </Notify.Provider>
      </Support.Provider>
    </Demo.Provider>
  );
}

/** Reads the path, so it sits in its own Suspense boundary: the rest of the page stays static. */
function CurrentOverviewLink() {
  return <OverviewLink active={usePathname() === "/"} />;
}

function OverviewLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/"
      aria-current={active ? "page" : undefined}
      className={`text-body relative flex h-full items-center ${
        active ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink" : "text-muted hover:text-ink"
      }`}
    >
      Overview
    </Link>
  );
}

export function AddButton() {
  const open = useContext(OpenAdd);
  return (
    <button type="button" onClick={open} className="text-body h-8 rounded-[6px] bg-ink px-3.5 font-semibold text-white hover:bg-[#2f3a48]">
      <span className="btn-label">Add competitor</span>
    </button>
  );
}

/** A magnifying glass over a target: watching competitors closely. public/logo.svg, drawn from public/watch-competitor-logo.png. */
function Logo() {
  return <Image src="/logo.svg" alt="" width={24} height={24} priority />;
}
