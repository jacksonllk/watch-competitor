"use client";

/**
 * Edit address on a broken page monitor: the page moved or was not found, so the user gives its new address.
 * The server checks the address opens before it changes the monitor.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./modal";
import { useNotify } from "./shell";
import { SupportText } from "./support-text";

export function EditAddressButton({ slug, monitorId, label, url }: { slug: string; monitorId: string; label: string; url: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-small ml-1 inline-flex h-6 items-center rounded-[5px] border border-warn-edge/40 bg-white px-2 font-semibold text-ink hover:border-warn-edge"
      >
        <span className="btn-label">Edit address</span>
      </button>
      {open && <EditAddressModal slug={slug} monitorId={monitorId} label={label} url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditAddressModal({
  slug,
  monitorId,
  label,
  url,
  onClose,
}: {
  slug: string;
  monitorId: string;
  label: string;
  url: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const notify = useNotify();
  const [input, setInput] = useState(url ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    const address = input.trim();
    if (!address || saving) return;
    setSaving(true);
    setProblem(null);
    let status = "failed";
    try {
      const res = await fetch(`/api/competitors/${encodeURIComponent(slug)}/address`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monitorId, url: address }),
      });
      status = ((await res.json()) as { status: string }).status;
    } catch {}
    setSaving(false);
    if (status === "updated") {
      onClose();
      notify(`Saved. The first check of the new ${label.toLowerCase()} address is running.`);
      router.refresh();
    } else if (status === "page_not_found") setProblem(`We couldn't open ${address}. Check the address and try again.`);
    else if (status === "demo") setProblem("The demo can't change monitors. Run your own copy to edit addresses.");
    else if (status === "out_of_credits") setProblem("The check failed. Contact support.");
    else setProblem("Something went wrong. Try again in a minute.");
  }

  return (
    <Modal
      title={`Edit the ${label.toLowerCase()} address`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-body h-(--control-h) rounded-[6px] border border-rule bg-white px-4 text-ink hover:border-edge"
          >
            <span className="btn-label">Cancel</span>
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!input.trim() || saving || input.trim() === url}
            className="text-body h-(--control-h) min-w-24 rounded-[6px] bg-ink px-4 font-semibold text-white hover:bg-[#2f3a48] disabled:opacity-40"
          >
            {saving ? <span className="ui-spinner" /> : <span className="btn-label">Save</span>}
          </button>
        </div>
      }
    >
      <p className="text-body text-copy">Enter the page&apos;s new address. We check that it opens, then watch it from today.</p>
      <input
        value={input}
        autoFocus
        onChange={(e) => {
          setInput(e.target.value);
          setProblem(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && save()}
        aria-label={`New ${label.toLowerCase()} address`}
        className="ui-field text-body mt-3 h-(--control-h) w-full rounded-[6px] border border-rule bg-white px-3"
      />
      {problem ? (
        <p className="text-small mt-1.5 text-warn">
          <SupportText text={problem} />
        </p>
      ) : (
        <p className="text-small mt-1.5 text-muted">Changes found before today stay on the timeline.</p>
      )}
    </Modal>
  );
}
