import { useEffect, useRef, useCallback } from "react";

export default function FilterDrawer({ open, onClose, activeCount, children }) {
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [open]);

  /* ── Swipe-to-dismiss for mobile bottom sheet ── */
  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY;
    currentY.current = 0;
  }, []);

  const onTouchMove = useCallback((e) => {
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0 && sheetRef.current) {
      currentY.current = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
    if (currentY.current > 100) {
      onClose();
    }
    currentY.current = 0;
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-60 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* Desktop: right-side panel (unchanged) */}
      <div className={`hidden md:flex fixed top-0 right-0 h-full w-80 bg-white dark:bg-surface-800 shadow-xl z-60 flex-col transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-surface-700">
          <span className="font-semibold text-gray-800 dark:text-surface-200">Filters</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-surface-200 cursor-pointer text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`md:hidden fixed bottom-0 left-0 right-0 z-60 bg-white dark:bg-surface-800 rounded-t-2xl shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
        style={{ maxHeight: "85vh", paddingBottom: "var(--sai-bottom, 0px)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 cursor-grab">
          <div className="drag-handle bg-gray-300 dark:bg-surface-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b dark:border-surface-700">
          <span className="font-semibold text-gray-800 dark:text-surface-200">Filters</span>
          <button onClick={onClose} className="text-sm font-medium text-blue-600 dark:text-white cursor-pointer px-2 py-1">Done</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}
