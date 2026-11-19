import { now, read, write, id } from "./store.js";
import { sameWorkspace } from "./access.js";

const maxLogs = 2000;

export async function logExecution({ workspaceId, userId, surface, command, status, output = "" }) {
  const entry = {
    id: id(),
    workspaceId,
    userId,
    surface,
    command: String(command).slice(0, 180),
    status,
    output: String(output).slice(0, 2000),
    createdAt: now(),
  };
  await write((state) => {
    state.executionLogs ||= [];
    state.executionLogs.unshift(entry);
    state.executionLogs = state.executionLogs.slice(0, maxLogs);
  });
  return entry;
}

export function listExecutionLogs(workspaceId, surface) {
  return read((state) =>
    (state.executionLogs || [])
      .filter((entry) => sameWorkspace(entry, workspaceId) && (!surface || entry.surface === surface))
      .slice(0, 50),
  );
}
