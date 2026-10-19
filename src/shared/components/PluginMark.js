"use client";

// Marks for the custom plugins and the native model capabilities.
//
// SVG rather than the material-symbols font on purpose. The project ships only a
// 143-glyph subset of that font, so a name outside the subset renders blank, and
// a ligature is shared with every other surface that uses it - a plugin mark
// could not be told apart from an unrelated button.
//
// Literal marks, not abstractions. Each one is the familiar object the plugin is
// named after - a framed landscape for Image Vision, a rocket for Speed Mode, a
// shield for JSON Guard, scissors for Context Squeezer - so a mark can be read
// from its shape alone instead of needing its label beside it. The earlier
// pictograms were geometric one-liners (frames, chevrons, braces) and people
// could not tell what they stood for.
//
// One drawing language: 24 grid, uniform stroke with round caps and joins,
// nothing finer than 2.4 units, at most three filled accents per mark. Colour is
// NOT carried by the glyph - the caller picks the ink, so the plugin card wears
// the theme accent and a dense model row stays muted without a second set.

const PLUGIN_MARKS = {
  // Image Vision: a framed landscape - sun over a ridgeline. The universal
  // "photo" glyph, so it reads as images without a caption.
  imageVision: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="8.8" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4.5 16.4l4-4.4 3.1 3.5 2.3-2.4 4.1 3" />
    </>
  ),
  // Native vision: the eye - a lens with a solid pupil.
  vision: (
    <>
      <path d="M2.5 12c2.6-4 5.9-6 9.5-6s6.9 2 9.5 6c-2.6 4-5.9 6-9.5 6s-6.9-2-9.5-6z" />
      <circle cx="12" cy="12" r="2.7" fill="currentColor" stroke="none" />
    </>
  ),
  // Think Deeper: a brain with a bold arrow driving down into it - thinking,
  // then going further. The arrow is what separates it from native reasoning.
  thinkDeeper: (
    <>
      <path d="M11.9 5.1a4.4 4.4 0 0 0-5.5 2.1 3.1 3.1 0 0 0-2 3.2 3.3 3.3 0 0 0 .6 1.9 3.2 3.2 0 0 0 .1 3.7 4 4 0 0 0 3.7 2.5h1.6v-3.4" />
      <path d="M12.1 5.1a4.4 4.4 0 0 1 5.5 2.1 3.1 3.1 0 0 1 2 3.2 3.3 3.3 0 0 1-.6 1.9 3.2 3.2 0 0 1-.1 3.7 4 4 0 0 1-3.7 2.5h-1.6v-3.4" />
      <path d="M12 9.2v6m0 0-2.7-2.7M12 15.2l2.7-2.7" />
    </>
  ),
  // Native reasoning: a brain with a visible crack running through it - the two
  // halves of a chain of thought being worked. Gyri on the perimeter and a
  // zig-zag split keep it from reading as a smooth bean.
  reasoning: (
    <>
      <path d="M11.6 5.4a4 4 0 0 0-5 2 3 3 0 0 0-1.9 3 3.1 3.1 0 0 0 .6 1.8 3 3 0 0 0 .2 3.4 3.8 3.8 0 0 0 3.4 2.3h2v-1.4" />
      <path d="M12.4 5.4a4 4 0 0 1 5 2 3 3 0 0 1 1.9 3 3.1 3.1 0 0 1-.6 1.8 3 3 0 0 1-.2 3.4 3.8 3.8 0 0 1-3.4 2.3h-2v-1.4" />
      <path d="M12 12.6 11 11l2-2-1-1.8M12 12.6l1 1.7-1.9 1.9" />
      <circle cx="8.3" cy="9.2" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="15.7" cy="9.2" r="0.5" fill="currentColor" stroke="none" />
    </>
  ),
  // Speed Mode: a rocket - the answer leaves now, no waiting on thinking.
  speedMode: (
    <>
      <path d="M12 2.6c2.9 2.4 4.4 5.7 4.4 9.1L12 16.2l-4.4-4.5c0-3.4 1.5-6.7 4.4-9.1z" />
      <path d="M8.4 11.4 5 14.4l2.7 1.1M15.6 11.4 19 14.4l-2.7 1.1" />
      <path d="M12 16.2v5.2" />
      <circle cx="12" cy="9.4" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // JSON Guard: a shield with a check - the payload is valid and protected.
  jsonGuard: (
    <>
      <path d="M12 2.6 4.6 5.4v6.1c0 4.4 3 7.9 7.4 9.4 4.4-1.5 7.4-5 7.4-9.4V5.4z" />
      <path d="m8.6 11.8 2.6 2.6 4.4-4.6" />
    </>
  ),
  // Context Squeezer: scissors - the oldest turns get cut to fit the window.
  contextSqueezer: (
    <>
      <circle cx="6" cy="6.4" r="2.7" />
      <circle cx="6" cy="17.6" r="2.7" />
      <path d="M20 4 8.6 15.4M14.2 14.2 20 20M8.6 8.6 12.4 12.4" />
    </>
  ),
  // OpenAI Tool Bridge: a wrench - the tool call the text-only model could not
  // make, recovered and handed back to the client.
  openaiToolBridge: (
    <path d="M15 6.3a1 1 0 0 0 0 1.4l1.5 1.5a1 1 0 0 0 1.4 0l3.3-3.3a6 6 0 0 1-7.9 7.9l-6.3 6.3a2.1 2.1 0 0 1-3-3l6.3-6.3a6 6 0 0 1 7.9-7.9z" />
  ),
  // Anti Slop: a broom - a slanted shaft meeting a wide head with bristles
  // fanned below it, sweeping the generic output away.
  antiSlop: (
    <>
      <path d="M19.4 4l-4.6 5.5" />
      <path d="M13.6 7.2l-5.4 4.6 4 4 4.6-5.4z" />
      <path d="M8.6 11.8 4 7.8M7.4 14.6l-4.2-3M6.2 17.4 2 14.5" />
    </>
  ),


  // Full Stack Software Engineer: layered stack - three tiers of an app
  // (data, service, UI) with a build spark on the top tier.
  agentFse: (
    <>
      <ellipse cx="12" cy="18.2" rx="7.5" ry="2.6" />
      <path d="M4.5 13.4v4.8c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6v-4.8" />
      <path d="M4.5 8.6v4.8c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6V8.6" />
      <ellipse cx="12" cy="8.6" rx="7.5" ry="2.6" />
      <path d="m12 2.2 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="currentColor" stroke="none" />
    </>
  ),
  // QA Engineer: magnifier over a checklist - inspecting what shipped.
  agentQa: (
    <>
      <path d="M4 4.5h9M4 8.5h6" />
      <path d="M4 13.5h4M4 17.5h5" />
      <circle cx="15.2" cy="15.2" r="4.6" />
      <path d="m18.6 18.6 3 3" />
      <path d="m13.4 15.2 1.4 1.4 2.4-2.6" />
    </>
  ),
  // Security Engineer: a padlock - hardening with a keyhole that reads as a lock.
  agentSecurity: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="14.6" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 15.8v2" />
    </>
  ),
  // REA: a lightning bolt in a circular arrow - rapid assist that loops.
  agentRea: (
    <>
      <path d="M19.4 9.2A8 8 0 1 0 20 13.4" />
      <path d="m20.4 4.6-.6 5-5-.6" />
      <path d="M12.9 7.5 9.8 12.6h3.4l-2.1 4.4 4.9-5.8h-3.2z" fill="currentColor" stroke="none" />
    </>
  ),
  // SQL Injection Specialist: a database cylinder with an injected needle.
  agentSqli: (
    <>
      <ellipse cx="9.5" cy="5.4" rx="6" ry="2.4" />
      <path d="M3.5 5.4v13.2c0 1.3 2.7 2.4 6 2.4 1.4 0 2.7-.2 3.7-.5" />
      <path d="M3.5 12c0 1.3 2.7 2.4 6 2.4 1.2 0 2.3-.1 3.2-.4" />
      <path d="m14.5 12.5 4.6-4.6 2 2-4.6 4.6-2.6.6z" />
      <path d="m17.5 9.5 1.2 1.2" />
    </>
  ),
  // RAG Engineer: a document with a retrieval funnel - knowledge pulled in.
  agentRag: (
    <>
      <path d="M6 3.5h8.5L19 8v4.5" />
      <path d="M6 3.5v17h5.5" />
      <path d="M14 3.5V8h5" />
      <path d="M14.5 14.5h6.5l-2.6 3v4l-1.7-1-1.6 1v-4z" />
      <path d="M8.5 9.5h4M8.5 12.5h3" />
    </>
  ),
  // Temperature Guard: a thermometer with a snowflake notch - keeps sampling temp in range.
  tempGuard: (
    <>
      <path d="M10 13.6V5.5a2 2 0 0 1 4 0v8.1a4.2 4.2 0 1 1-4 0z" />
      <circle cx="12" cy="17.4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 15.8v-8" />
      <path d="M19 5.2v4M17.2 6.2l1.8 1 1.8-1M17.2 8.2l1.8-1 1.8 1" />
    </>
  ),
  // Output Cap: a gauge with a cut line - the response ceiling, needle pinned at max.
  outputCap: (
    <>
      <path d="M4 16.5a8 8 0 1 1 16 0" />
      <path d="m4.8 19.2 14.4-9.6" />
      <path d="M12 8.5v-3M5.6 11.5l-2.1-1.6M18.4 11.5l2.1-1.6" />
    </>
  ),
  // Stop Sequence Guard: a hand raised - halt before the forbidden token.
  stopGuard: (
    <>
      <path d="M8 12.5V5.8a1.6 1.6 0 0 1 3.2 0v5.4" />
      <path d="M11.2 11V4.6a1.6 1.6 0 0 1 3.2 0v6.4" />
      <path d="M14.4 11.4V6.4a1.6 1.6 0 0 1 3.2 0V14" />
      <path d="M8 12.5v-1a1.7 1.7 0 0 0-3.2.8V15a7 7 0 0 0 7 7h.8a6.8 6.8 0 0 0 5.2-2.4 7 7 0 0 0 1.8-4.6V14" />
    </>
  ),
  // Prompt Base: a database cylinder with a bookmark - the stored prompt library.
  promptBase: (
    <>
      <ellipse cx="10" cy="5.4" rx="6.5" ry="2.5" />
      <path d="M3.5 5.4v13c0 1.4 2.9 2.5 6.5 2.5 1 0 2-.1 2.8-.3" />
      <path d="M3.5 11.9c0 1.4 2.9 2.5 6.5 2.5.9 0 1.8-.1 2.6-.2" />
      <path d="M17.5 12.5v8l2-1.4 2 1.4v-8z" />
      <path d="M17.5 12.5a6.6 6.6 0 0 0 2.5-2.4" />
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