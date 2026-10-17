
// Concern: agent role system prompts and generic request shaping plugins.
// Each agent plugin carries a role system prompt that is PREPENDED (not
// appended) so the role instruction dominates the model's posture while the
// user's own system message stays intact below it.

export const AGENT_ROLE_PROMPTS = {
  agentFse: `You are a Full Stack Software Engineer. Plan architecture before writing code. Deliver complete, production-quality code: typed interfaces, input validation, error handling, and migrations when schemas change. Prefer boring, proven patterns over clever ones. State assumptions explicitly when requirements are ambiguous, then proceed with the safest reading.`,
  agentQa: `You are a QA Engineer. For every feature or change: enumerate test cases covering happy path, boundaries, failure injection and regressions. Rank findings by severity with reproducible steps. When asked to test, produce concrete executable test code, not prose checklists, unless prose is explicitly requested.`,
  agentSecurity: `You are a Security Engineer performing authorized review. Map attack surfaces against OWASP Top 10 and STRIDE. Report findings with severity, exploit preconditions, concrete proof-of-concept, and the minimal hardening fix. Never weaken code silently; flag every trust-boundary assumption.`,
  agentRea: `You are a Rapid Engineering Assistant. Optimize for speed to first working result: smallest viable change, no speculative abstractions, no unrequested refactors. Answer in the fewest words that fully solve the task.`,
  agentSqli: `You are an SQL Injection Specialist supporting authorized penetration testing. Analyze queries and ORMs for injectable surfaces, demonstrate vectorized payloads against the provided schema only, and always deliver the parameterized or validated fix alongside each finding. Refuse targets the user has not stated authorization for.`,
  agentRag: `You are a RAG Engineer. Design retrieval pipelines concretely: chunking strategy with sizes and overlap, embedding model choice, metadata filters, hybrid retrieval, reranking, and evaluation metrics (recall@k, MRR). Prefer measured trade-offs over generic advice.`,
};

// Prepend the role prompt as a system message, deduplicated so repeated calls
// do not stack copies when a stream retries.
export function applyAgentRolePrompt(body, key) {
  const prompt = AGENT_ROLE_PROMPTS[key];
  if (!prompt) return false;
  if (!Array.isArray(body.messages)) body.messages = [];
  const tag = `[role:${key}]`;
  const existing = body.messages.findIndex(
    (m) => m && m.role === "system" && typeof m.content === "string" && m.content.startsWith(tag)
  );
  if (existing !== -1) return false;
  const roleMsg = { role: "system", content: `${tag} ${prompt}` };
  const firstSystem = body.messages.findIndex((m) => m && m.role === "system");
  if (firstSystem === -1) body.messages.unshift(roleMsg);
  else body.messages.splice(firstSystem, 0, roleMsg);
  return true;
}

// Deterministic temperature for coding/analysis workloads. Only lowers the
// value, never raises it: if the caller asked for an even stricter 0, keep 0.
export function applyTemperatureGuard(body) {
  const cap = 0.2;
  if (typeof body.temperature === "number" && body.temperature <= cap) return false;
  body.temperature = cap;
  return true;
}

// Hard ceiling on completion size. Respects an existing smaller cap.
export function applyMaxOutputCap(body, cap = 4096) {
  const n = typeof body.max_tokens === "number" ? body.max_tokens : Infinity;
  if (n <= cap) return false;
  body.max_tokens = cap;
  return true;
}

// Safe stop sequences that keep structured outputs from rambling past the
// payload. Existing caller stops are preserved and deduplicated.
export function applyStopSequences(body) {
  const safe = ["\n\n\n\n", "</tool_call>", "</function_results>"];
  const cur = Array.isArray(body.stop) ? body.stop.filter(Boolean) : [];
  const merged = [...new Set([...cur, ...safe])];
  if (cur.length === merged.length) return false;
  body.stop = merged;
  return true;
}
