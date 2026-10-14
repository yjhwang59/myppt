import { randomUUID } from "node:crypto";

/** @typedef {{ id: string, type: string, deckId: string, status: 'queued'|'running'|'done'|'error', progress: number, total: number, message: string, result?: any, error?: string, createdAt: string, updatedAt: string }} Job */

/** @type {Map<string, Job>} */
const jobs = new Map();

export function createJob(type, deckId, total = 0) {
  const job = {
    id: randomUUID(),
    type,
    deckId,
    status: "queued",
    progress: 0,
    total,
    message: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  return job;
}

export async function runJob(id, runner) {
  const job = jobs.get(id);
  if (!job) throw new Error("job not found");
  updateJob(id, { status: "running", message: "running" });
  try {
    const result = await runner((progress, total, message) => {
      updateJob(id, {
        progress,
        total: total ?? job.total,
        message: message || job.message,
      });
    });
    updateJob(id, { status: "done", progress: job.total || job.progress, message: "done", result });
    return getJob(id);
  } catch (err) {
    updateJob(id, {
      status: "error",
      message: err.message || String(err),
      error: err.message || String(err),
    });
    return getJob(id);
  }
}
