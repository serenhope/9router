"use client";

// Marks for the custom plugins and the native model capabilities.
//
// SVG rather than the material-symbols font on purpose. The project ships only a
// 143-glyph subset of that font, so a name outside the subset renders blank, and
// a ligature is shared with every other surface that uses it - a plugin mark
// could not be told apart from an unrelated button.
//
// One drawing language, all outline:
//   * gridded primitives - a frame, a lens, a staircase, a node graph, a bolt,
//     braces, a press, an arch, a funnel. Nothing hand-drawn, no detail finer
//     than 2.4 units, max 17 units on the 24 grid so every mark carries the same
//     optical weight;
//   * uniform 2.0 stroke with round caps and joins - a 24px card tile and a 12px
//     model row differ only in weight, never in language;
//   * one filled accent, used only for the thing being acted on: a pupil, the
//     payload, the deepest step, the active node, the crossing at the apex.
//     Everything else stays hollow, so the set never reads as half-wireframe;
//   * colour is NOT carried by the glyph - the caller picks the ink, so the
//     plugin card wears the theme accent and a dense model row stays muted
//     without a second set of marks.
//
// Image Vision and native vision are deliberately opposite constructions (a
// frame around a dot, a lens around a dot) so they cannot be confused when both
// appear on one model row.

const PLUGIN_MARKS = {
  // Image Vision: viewfinder corners around a subject - the picture goes into
  // the frame. Corners rather than a full rect so it survives 12px and never
  // reads as native vision's lens.
  imageVision: (
    <>
      <path d="M4 8.4V6.2A2.2 2.2 0 0 1 6.2 4h2.2M15.6 4h2.2A2.2 2.2 0 0 1 20 6.2v2.2M20 15.6v2.2a2.2 2.2 0 0 1-2.2 2.2h-2.2M8.4 20H6.2A2.2 2.2 0 0 1 4 17.8v-2.2" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Native vision: the lens itself - a closed almond with a solid pupil.
  vision: (
    <>
      <path d="M2.6 12c2.6-3.8 5.8-5.6 9.4-5.6s6.8 1.8 9.4 5.6c-2.6 3.8-5.8 5.6-9.4 5.6S5.2 15.8 2.6 12z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Think Deeper: a staircase descending into the page - each step carries the
  // last one further down, and the filled tread is the depth it reached. A
  // staircase, not narrowing bars, so it cannot be read as a sort/filter glyph
  // or mistaken for the funnel.
  thinkDeeper: (
    <>
      <path d="M5.5 8.5h3.6v3.6h3.6v3.6h3.6" />
      <circle cx="16.3" cy="15.7" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
  // Native reasoning: a chain of thought - one node feeding two. The active node
  // is the only filled one; the branches stay hollow.
  reasoning: (
    <>
      <path d="M12 10.4v3.2M8.6 17.4l3.4-3.8 3.4 3.8" />
      <circle cx="12" cy="7.6" r="2.7" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="18.4" r="2.4" />
      <circle cx="17.4" cy="18.4" r="2.4" />
    </>
  ),
  // Speed Mode: the bolt. One stroked polygon, one reading - the answer comes
  // back now, before any thinking. Gridded so its counter holds at 12px.
  speedMode: <path d="M13.4 3.2 5.8 13.6h5l-.8 7.2 7.8-10.4h-5z" />,
  // JSON Guard: open braces - the shape a valid payload lives in. Braces alone
  // already say "code" without ambiguity; the payload dot this used to carry
  // collided with Image Vision's frame-dot at 12px, where both collapse into
  // "two ticks flanking a blob".
  jsonGuard: (
    <>
      <path d="M9.4 5c-1.4 0-1.8.8-1.8 2.1v2.1c0 1.2-.6 1.8-1.7 1.8 1.1 0 1.7.6 1.7 1.8v2.1c0 1.3.4 2.1 1.8 2.1" />
      <path d="M14.6 5c1.4 0 1.8.8 1.8 2.1v2.1c0 1.2.6 1.8 1.7 1.8-1.1 0-1.7.6-1.7 1.8v2.1c0 1.3-.4 2.1-1.8 2.1" />
    </>
  ),
  // Context Squeezer: one piece of content with both walls closing on it - same
  // content, less room. Two chevrons and a single bar, so it stays open at 12px
  // and cannot read as a stack or as expand/collapse.
  contextSqueezer: (
    <>
      <path d="M9.4 12h5.2" />
      <path d="M7.8 7.4 5.2 12l2.6 4.6" />
      <path d="M16.2 7.4 18.8 12l-2.6 4.6" />
    </>
  ),
  // OpenAI Tool Bridge: two docks and one cable arcing over them, the recovered
  // call crossing at the apex. A true arch, not an S-curve.
  openaiToolBridge: (
    <>
      <path d="M6.2 15.6v-5.4M17.8 15.6v-5.4" />
      <path d="M6.2 10.2c2.2-3 3.8-4.6 5.8-4.6s3.6 1.6 5.8 4.6" />
      <circle cx="12" cy="5.6" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  // Anti Slop: a filter - everything passes the mouth, the specks stop at the
  // throat. A compact trapezoid and a centred stem, gridded.
  antiSlop: (
    <>
      <path d="M4.8 5.6h14.4l-5.6 6.6h-3.2z" />
      <path d="M12 12.2v6.2" />
    </>
  ),

  // Agent roles: a robot head, differentiated by the visor accent drawn per role.
  agentFse: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 8V4.5" /><circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 12.2h2.2" /><path d="M12.8 12.2H15" />
      <path d="M9.5 15h5" />
    </>
  ),
  agentQa: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 8V4.5" /><circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 12.5l1.8 1.8 3.4-3.6" />
      <path d="M9.5 15.2h5" />
    </>
  ),
  agentSecurity: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 8V4.5" /><circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 12h7" /><path d="M12 12v3.2" /><path d="M9.8 15.2h4.4" />
    </>
  ),
  agentRea: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 8V4.5" /><circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 11.5L10.5 13.5L8.5 15.5" />
      <path d="M13.5 11.5L15.5 13.5L13.5 15.5" />
    </>
  ),
  agentSqli: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 8V4.5" /><circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 13.5h2" /><path d="M12.8 12.8l2.4 2.4M15.2 12.8l-2.4 2.4" />
    </>
  ),
  agentRag: (
    <>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 8V4.5" /><circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.3" cy="12.6" r="1.4" /><circle cx="14.7" cy="12.6" r="1.4" />
      <path d="M10.7 12.6h2.6" />
    </>
  ),
  
  // Temperature Guard: a thermometer inside a brace - clamped, controlled heat.
  tempGuard: (
    <>
      <path d="M10 4.5h4" /><path d="M12 4.5v9" />
      <circle cx="12" cy="16.5" r="2.5" />
      <path d="M12 14v-0.5" />
    </>
  ),
  // Output Cap: a full gauge with a clamp bar across it.
  outputCap: (
    <>
      <path d="M4.5 14.5h15" />
      <path d="M6.5 14.5a5.5 5.5 0 0 1 11 0" />
      <path d="M12 14.5L15 10" />
      <path d="M4.5 18h15" />
    </>
  ),
  // Stop Sequence Guard: an octagon stop sign outline with a slash breaking the run.
  stopGuard: (
    <>
      <path d="M9 4.5h6l4.5 4.5v6L15 19.5H9L4.5 15V9z" />
      <path d="M9.5 9.5l5 5" />
    </>
  ),
  // Prompt Base: an open book with a grounding pin at the spine.
  promptBase: (
    <>
      <path d="M12 5.5c-1.8-1.2-4-1.5-7-1.2v12.4c3-.3 5.2 0 7 1.2 1.8-1.2 4-1.5 7-1.2V4.3c-3-.3-5.2 0-7 1.2z" />
      <path d="M12 5.5v12.4" />
    </>
  ),
  };

/**
 * One wrapper for every mark so stroke weight, caps and sizing live in one place
 * and cannot drift between the card tile and a model row. An unknown name
 * renders nothing - never a ligature fallback.
 */
function PluginMark({ name, size = 20, strokeWidth = 2, className = "" }) {
  const mark = PLUGIN_MARKS[name];
  if (!mark) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {mark}
    </svg>
  );
}

export default PluginMark;