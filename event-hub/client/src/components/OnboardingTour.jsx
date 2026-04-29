import { useState, useEffect, useCallback } from "react";

const STEPS = [
  {
    key: "events",
    title: "Events",
    desc: "View all imported events. Search, filter, and drill into details.",
  },
  {
    key: "channels",
    title: "Channels",
    desc: "Channels are auto-generated from venue and host data. Browse and manage them here.",
  },
  {
    key: "import",
    title: "Import",
    desc: "Run the scrapers here to pull in event data from local sources.",
  },
  {
    key: "enrich",
    title: "Enrichment",
    desc: "After importing, use these tools to clean up and fix your event data.",
  },
  {
    key: "export",
    title: "Export",
    desc: "Export your curated events to Realms once everything looks good.",
  },
  {
    key: "logs",
    title: "Logs",
    desc: "View the full history of imports, exports, and enrichment runs.",
  },
];

const COOKIE_NAME = "onboarding_complete";

function hasCookie(name) {
  return document.cookie.split("; ").some((c) => c.startsWith(name + "="));
}

function setForeverCookie(name, val) {
  document.cookie = `${name}=${val}; max-age=2147483647; path=/; SameSite=Lax`;
}

/** Return the first *visible* element matching [data-tour="key"] */
function getTarget(key) {
  for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [steps, setSteps] = useState([]);

  /* ── bootstrap ── */
  useEffect(() => {
    if (hasCookie(COOKIE_NAME)) return;
    const t = setTimeout(() => {
      const visible = STEPS.filter((s) => getTarget(s.key));
      if (visible.length) {
        setSteps(visible);
        setActive(true);
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);

  /* ── measure target rect ── */
  const measure = useCallback(() => {
    if (!active || !steps[idx]) return;
    const el = getTarget(steps[idx].key);
    if (el) setRect(el.getBoundingClientRect());
  }, [active, idx, steps]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /* ── actions ── */
  const dismiss = useCallback(() => {
    setForeverCookie(COOKIE_NAME, "1");
    setActive(false);
  }, []);

  const next = () =>
    idx < steps.length - 1 ? setIdx((i) => i + 1) : dismiss();
  const prev = () => idx > 0 && setIdx((i) => i - 1);

  /* ── render guard ── */
  if (!active || !rect || !steps[idx]) return null;

  const pad = 6;
  const step = steps[idx];
  const above = rect.top > window.innerHeight / 2;

  /* spotlight */
  const spotStyle = {
    position: "fixed",
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 8,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
    zIndex: 10000,
    pointerEvents: "none",
    transition:
      "top .3s ease, left .3s ease, width .3s ease, height .3s ease",
  };

  /* tooltip positioning */
  const tipW = 300;
  const gap = 14;
  const tipStyle = { position: "fixed", zIndex: 10001, width: tipW };

  if (above) {
    tipStyle.bottom = window.innerHeight - rect.top + pad + gap;
  } else {
    tipStyle.top = rect.bottom + pad + gap;
  }

  const cx = rect.left + rect.width / 2;
  tipStyle.left = Math.max(
    12,
    Math.min(cx - tipW / 2, window.innerWidth - tipW - 12),
  );

  const arrowLeft = Math.max(20, Math.min(cx - tipStyle.left, tipW - 20));

  return (
    <>
      {/* click-catcher overlay */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999 }}
        onClick={dismiss}
      />

      {/* spotlight cutout */}
      <div style={spotStyle} />

      {/* tooltip */}
      <div style={tipStyle}>
        {/* top arrow (tooltip below target) */}
        {!above && (
          <div
            className="absolute -top-[6px] w-3 h-3 rotate-45 bg-white dark:bg-surface-800 border-t border-l border-gray-200 dark:border-surface-700"
            style={{ left: arrowLeft - 6 }}
          />
        )}

        <div className="relative bg-white dark:bg-surface-800 rounded-xl shadow-2xl p-4 border border-gray-200 dark:border-surface-700">
          {/* progress dots */}
          <div className="flex items-center gap-1.5 mb-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === idx
                    ? "bg-blue-500"
                    : "bg-gray-200 dark:bg-surface-600"
                }`}
              />
            ))}
          </div>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base mb-1">
            {step.title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-surface-300 leading-relaxed mb-4">
            {step.desc}
          </p>

          <div className="flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-surface-200 cursor-pointer"
            >
              Skip
            </button>
            <div className="flex gap-2">
              {idx > 0 && (
                <button
                  onClick={prev}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-surface-200 hover:bg-gray-200 dark:hover:bg-surface-600 cursor-pointer"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              >
                {idx === steps.length - 1 ? "Got it!" : "Next"}
              </button>
            </div>
          </div>
        </div>

        {/* bottom arrow (tooltip above target) */}
        {above && (
          <div
            className="absolute -bottom-[6px] w-3 h-3 rotate-45 bg-white dark:bg-surface-800 border-b border-r border-gray-200 dark:border-surface-700"
            style={{ left: arrowLeft - 6 }}
          />
        )}
      </div>
    </>
  );
}
