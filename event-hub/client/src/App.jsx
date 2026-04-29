import { useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import EventList from "./pages/EventList.jsx";
import EventDetail from "./pages/EventDetail.jsx";
import EventNew from "./pages/EventNew.jsx";
import EventEdit from "./pages/EventEdit.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import ImportLog from "./pages/ImportLog.jsx";
import ChannelsPage from "./pages/ChannelsPage.jsx";
import ChannelDetail from "./pages/ChannelDetail.jsx";
import CurationPage from "./pages/CurationPage.jsx";
import RruleCurationPage from "./pages/RruleCurationPage.jsx";
import CategorizePage from "./pages/CategorizePage.jsx";
import TimeCurationPage from "./pages/TimeCurationPage.jsx";
import PriceCurationPage from "./pages/PriceCurationPage.jsx";
import DuplicatePage from "./pages/DuplicatePage.jsx";
import ChannelDuplicatePage from "./pages/ChannelDuplicatePage.jsx";
import AttractionsPage from "./pages/AttractionsPage.jsx";
import ArchiveReviewPage from "./pages/ArchiveReviewPage.jsx";
import CityAuditPage from "./pages/CityAuditPage.jsx";
import AddressReviewPage from "./pages/AddressReviewPage.jsx";
import ExportPage from "./pages/ExportPage.jsx";
import ExportLogDetail from "./pages/ExportLogDetail.jsx";
import EnrichmentLogDetail from "./pages/EnrichmentLogDetail.jsx";
import FeaturedCandidatesPage from "./pages/FeaturedCandidatesPage.jsx";
import { useDarkMode } from "./hooks/useDarkMode.js";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import OnboardingTour from "./components/OnboardingTour.jsx";
import { useInstallPrompt } from "./hooks/useInstallPrompt.js";

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

/* ── Icon components for bottom tabs ── */

function IconEvents({ active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconChannels({ active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function IconImport({ active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function IconEnrich({ active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function IconExport({ active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function IconLogs({ active }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function InstallButton({ canInstall, onInstall }) {
  if (!canInstall) return null;
  return (
    <button
      onClick={onInstall}
      className="text-gray-300 hover:text-white cursor-pointer p-1.5 rounded-md hover:bg-gray-700 flex items-center gap-1.5"
      title="Install app"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span className="text-xs font-medium hidden lg:inline">Install</span>
    </button>
  );
}

/* ── Desktop top navigation ── */

function DesktopNav({ dark, onToggle, canInstall, onInstall }) {
  const link = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${isActive ? "bg-gray-900 text-white dark:bg-surface-700" : "text-gray-300 hover:bg-gray-700 hover:text-white"}`;
  return (
    <nav className="bg-gray-800 dark:bg-surface-950 sticky top-0 z-50 hidden md:block">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-2">
        <span className="text-white font-bold text-lg mr-6">Event Hub</span>
        <NavLink to="/" end className={link} data-tour="events">Events</NavLink>
        <NavLink to="/chat" className={link}>Chat</NavLink>
        <NavLink to="/channels" className={link} data-tour="channels">Channels</NavLink>
        <NavLink to="/import" className={link} data-tour="import">Import</NavLink>
        <NavLink to="/curate" className={link} data-tour="enrich">Enrichment</NavLink>
        <NavLink to="/export" className={link} data-tour="export">Export</NavLink>
        <NavLink to="/logs/imports" className={link} data-tour="logs">Logs</NavLink>
        <div className="ml-auto flex items-center gap-1">
          <InstallButton canInstall={canInstall} onInstall={onInstall} />
          <NotificationBell />
          <button
            onClick={onToggle}
            className="text-gray-300 hover:text-white cursor-pointer p-1.5 rounded-md hover:bg-gray-700"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ── Mobile top bar (logo + dark toggle only) ── */

function MobileTopBar({ dark, onToggle, canInstall, onInstall }) {
  return (
    <header className="bg-gray-800 dark:bg-surface-950 md:hidden" style={{ paddingTop: "var(--sai-top, 0px)" }}>
      <div className="flex items-center justify-between px-4 h-12">
        <span className="text-white font-bold text-lg">Event Hub</span>
        <div className="flex items-center gap-1">
          <InstallButton canInstall={canInstall} onInstall={onInstall} />
          <NavLink
            to="/channels"
            className={({ isActive }) =>
              `p-2 rounded-md ${isActive ? "text-white bg-gray-700" : "text-gray-300 hover:text-white hover:bg-gray-700"}`
            }
            title="Channels"
            data-tour="channels"
          >
            <IconChannels active={false} />
          </NavLink>
          <NotificationBell />
          <button
            onClick={onToggle}
            className="text-gray-300 hover:text-white cursor-pointer p-2 rounded-md hover:bg-gray-700"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── Mobile bottom tab bar ── */

const TABS = [
  { to: "/", end: true, icon: IconEvents, label: "Events", tour: "events" },
  { to: "/import", icon: IconImport, label: "Import", tour: "import" },
  { to: "/curate", icon: IconEnrich, label: "Enrich", tour: "enrich" },
  { to: "/export", icon: IconExport, label: "Export", tour: "export" },
  { to: "/logs", icon: IconLogs, label: "Logs", tour: "logs" },
];

function BottomTabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-950/95 dark:backdrop-blur-lg border-t border-gray-200 dark:border-surface-800 md:hidden"
      style={{ paddingBottom: "var(--sai-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14">
        {TABS.map(({ to, end, icon: Icon, label, tour }) => {
          const active = end
            ? location.pathname === to
            : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 ${active ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-surface-500"}`}
            >
              <Icon active={active} />
              <span className={`text-[10px] font-medium leading-tight ${active ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-surface-500"}`}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default function App() {
  const [dark, toggleDark] = useDarkMode();
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <NotificationProvider>
    <div className="min-h-screen bg-gray-50 dark:bg-surface-900">
      <DesktopNav dark={dark} onToggle={toggleDark} canInstall={canInstall} onInstall={promptInstall} />
      <MobileTopBar dark={dark} onToggle={toggleDark} canInstall={canInstall} onInstall={promptInstall} />

      <main className="max-w-7xl mx-auto px-4 py-4 md:py-6 pb-20 md:pb-6">
        <Routes>
          <Route path="/" element={<EventList />} />
          <Route path="/events/new" element={<EventNew />} />
          <Route path="/events/:id/edit" element={<EventEdit />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/channels" element={<ChannelsPage />} />
          <Route path="/channels/:id" element={<ChannelDetail />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/logs/:tab" element={<ImportLog />} />
          <Route path="/logs" element={<ImportLog />} />
          <Route path="/curate" element={<CurationPage />} />
          <Route path="/curate/rrules" element={<RruleCurationPage />} />
          <Route path="/curate/categorize" element={<CategorizePage />} />
          <Route path="/curate/times" element={<TimeCurationPage />} />
          <Route path="/curate/prices" element={<PriceCurationPage />} />
          <Route path="/curate/duplicates" element={<DuplicatePage />} />
          <Route path="/curate/channel-duplicates" element={<ChannelDuplicatePage />} />
          <Route path="/curate/archive" element={<ArchiveReviewPage />} />
          <Route path="/curate/attractions" element={<AttractionsPage />} />
          <Route path="/curate/city-audit" element={<CityAuditPage />} />
          <Route path="/curate/featured" element={<FeaturedCandidatesPage />} />
          <Route path="/curate/addresses" element={<AddressReviewPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/logs/exports/:id" element={<ExportLogDetail />} />
          <Route path="/logs/enrichment/:id" element={<EnrichmentLogDetail />} />
        </Routes>
      </main>

      <BottomTabBar />
      <OnboardingTour />
    </div>
    </NotificationProvider>
  );
}
