import type { CompetitorEvent } from "@/lib/events";
import { buildFrame, tasksFor, type Frame, type Task, type Tasks, type Templates } from "@/lib/prompt";
import { whatChanged, type ChangeRow } from "@/lib/what-changed";
import { shortDate } from "./format";

/** Everything the Assess panel shows for one change. Built on the server, where the templates and tasks are read. */
export type AssessData = {
  id: string;
  kind: CompetitorEvent["kind"];
  label?: string;
  page?: CompetitorEvent["page"];
  title: string;
  competitor: string;
  detected: string;
  url: string;
  summary: string;
  rows: ChangeRow[];
  /** The prompt around its tasks. The panel puts the ticked tasks in between. */
  frame: Frame;
  /** What the user can ask their agent to do, Assess first, with the competitor's name filled in. */
  tasks: Task[];
  colorIndex: number;
};

export function assessData(event: CompetitorEvent, colorIndex: number, templates: Templates, tasks: Tasks): AssessData {
  const { summary, rows } = whatChanged(event);
  return {
    id: event.id,
    kind: event.kind,
    ...(event.label ? { label: event.label } : {}),
    ...(event.page ? { page: event.page } : {}),
    title: event.title,
    competitor: event.competitor.name,
    detected: shortDate(event.detectedAt),
    url: event.url,
    summary,
    rows,
    frame: buildFrame(event, templates),
    tasks: tasksFor(event, tasks),
    colorIndex,
  };
}
