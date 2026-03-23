import type { Receipt } from "../../domain/schemas";

export function summarizeReceiptEvent(input: {
  eventType: Receipt["eventType"];
  taskId?: string;
  payload: Receipt["payload"];
}) {
  const event = input.eventType.replaceAll("_", " ");
  const taskPart = input.taskId ? ` (task ${input.taskId})` : "";
  return `${event}${taskPart}`;
}
