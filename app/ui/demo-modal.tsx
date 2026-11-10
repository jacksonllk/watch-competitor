"use client";

/**
 * What the public demo shows instead of a change it cannot make (Start watching, Add monitors): how to run your own copy.
 * The last step says where to do the same thing in that copy.
 */
import { contextDevLink, DEPLOY_URL, SELF_HOST_URL } from "@/lib/links";
import { ContextDevName } from "./context-dev";
import { Modal } from "./modal";

export function DemoModal({ intro, last, onClose }: { intro: string; last: { title: string; text: string }; onClose: () => void }) {
  const button = "text-body inline-flex h-8 items-center rounded-[6px] px-3";
  const steps = [
    {
      title: (
        <>
          Get a <ContextDevName size={16} /> API key
        </>
      ),
      text: "It runs the page checks and the news search for your copy.",
      action: (
        <a
          href={contextDevLink("demo_card")}
          target="_blank"
          rel="noreferrer"
          className={`${button} border border-rule bg-white text-ink hover:border-edge`}
        >
          <span className="btn-label">Get a free key</span>
        </a>
      ),
    },
    {
      title: "Deploy your own copy",
      text: DEPLOY_URL
        ? "Vercel copies the app and asks for your key in one step. It also runs on any host with Node.js, or on your own server."
        : "It runs on any host with Node.js, or on your own server. The README has the steps.",
      action: SELF_HOST_URL ? (
        <span className="flex flex-wrap gap-2">
          {DEPLOY_URL && (
            <a href={DEPLOY_URL} target="_blank" rel="noreferrer" className={`${button} bg-ink font-semibold text-white hover:bg-[#2f3a48]`}>
              <span className="btn-label">Deploy to Vercel</span>
            </a>
          )}
          <a href={SELF_HOST_URL} target="_blank" rel="noreferrer" className={`${button} border border-rule bg-white text-ink hover:border-edge`}>
            <span className="btn-label">Other hosts</span>
          </a>
        </span>
      ) : null,
    },
    { ...last, action: null },
  ];
  return (
    <Modal title="Watch your own competitors" onClose={onClose}>
      <p className="text-body text-copy">{intro}</p>
      <ol className="mt-4 space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="figures text-small flex size-6 shrink-0 items-center justify-center rounded-full bg-panel-2 font-semibold text-ink">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold">{step.title}</p>
              <p className="text-small mt-0.5 text-muted">{step.text}</p>
              {step.action && <div className="mt-2">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
