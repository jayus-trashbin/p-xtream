import { ReactElement, Suspense, lazy, useEffect, useState } from "react";
import { lazyWithPreload } from "react-lazy-with-preload";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { convertLegacyUrl, isLegacyUrl } from "@/backend/metadata/getmeta";
import { generateQuickSearchMediaUrl } from "@/backend/metadata/tmdb";
import { DetailsModal } from "@/components/overlays/detailsModal";
import { GamepadControlsModal } from "@/components/overlays/GamepadControlsModal";
import { KeyboardCommandsEditModal } from "@/components/overlays/KeyboardCommandsEditModal";
import { KeyboardCommandsModal } from "@/components/overlays/KeyboardCommandsModal";
import { NotificationModal } from "@/components/overlays/notificationsModal";
import { SupportInfoModal } from "@/components/overlays/SupportInfoModal";
import { TraktAuthHandler } from "@/components/TraktAuthHandler";
import { useGlobalKeyboardEvents } from "@/hooks/useGlobalKeyboardEvents";
import { useOnlineListener } from "@/hooks/usePing";
import { AboutPage } from "@/pages/About";
import { AdminPage } from "@/pages/admin/AdminPage";
import { AllBookmarks } from "@/pages/bookmarks/AllBookmarks";
import VideoTesterView from "@/pages/developer/VideoTesterView";
import { DiscoverMore } from "@/pages/discover/AllMovieLists";
import { Discover } from "@/pages/discover/Discover";
import { MoreContent } from "@/pages/discover/MoreContent";
import MaintenancePage from "@/pages/errors/MaintenancePage";
import { NotFoundPage } from "@/pages/errors/NotFoundPage";
import { HomePage } from "@/pages/HomePage";
import { JipPage } from "@/pages/Jip"; // TODO Phase 3: remove after verifying no external links target /jip
import { LegalPage, shouldHaveLegalPage } from "@/pages/Legal";
import { LoginPage } from "@/pages/Login";
import { MigrationPage } from "@/pages/migration/Migration";
import { MigrationDirectPage } from "@/pages/migration/MigrationDirect";
import { MigrationDownloadPage } from "@/pages/migration/MigrationDownload";
import { MigrationUploadPage } from "@/pages/migration/MigrationUpload";
import { OnboardingPage } from "@/pages/onboarding/Onboarding";
import { OnboardingExtensionPage } from "@/pages/onboarding/OnboardingExtension";
import { OnboardingProxyPage } from "@/pages/onboarding/OnboardingProxy";
import { PasPage } from "@/pages/Pas"; // TODO Phase 3: remove after verifying no external links target /pas
import { RegisterPage } from "@/pages/Register";
import { SupportPage } from "@/pages/Support";
import { WatchHistory } from "@/pages/watchHistory/WatchHistory";
import { Layout } from "@/setup/Layout";
import { useHistoryListener } from "@/stores/history";
import { useClearModalsOnNavigation } from "@/stores/interface/overlayStack";
import { LanguageProvider } from "@/stores/language";

import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";

const DeveloperPage = lazy(() => import("@/pages/DeveloperPage"));
const TestView = lazy(() => import("@/pages/developer/TestView"));
const PlayerView = lazyWithPreload(() => import("@/pages/PlayerView"));
const SettingsPage = lazyWithPreload(() => import("@/pages/Settings"));

PlayerView.preload();
SettingsPage.preload();

function LegacyUrlView({ children }: { children: ReactElement }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const url = location.pathname;
    if (!isLegacyUrl(url)) return;
    convertLegacyUrl(location.pathname).then((convertedUrl) => {
      navigate(convertedUrl ?? "/", { replace: true });
    });
  }, [location.pathname, navigate]);

  if (isLegacyUrl(location.pathname)) return null;
  return children;
}

function QuickSearch() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      generateQuickSearchMediaUrl(query).then((url) => {
        navigate(url ?? "/", { replace: true });
      });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

function QueryView() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      navigate(`/browse/${encodeURIComponent(query)}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

function App() {
  useHistoryListener();
  useOnlineListener();
  useGlobalKeyboardEvents();
  useClearModalsOnNavigation();
  const [showDowntime, setShowDowntime] = useState(false);

  const handleButtonClick = () => {
    setShowDowntime(false);
  };

  useEffect(() => {
    const sessionToken = sessionStorage.getItem("downtimeToken");
    if (!sessionToken && false) {
      setShowDowntime(true);
      sessionStorage.setItem("downtimeToken", "true");
    }
  }, [setShowDowntime]);

  return (
    <Layout>
      <TraktAuthHandler />
      <LanguageProvider />
      <NotificationModal id="notifications" />
      <KeyboardCommandsModal id="keyboard-commands" />
      <KeyboardCommandsEditModal id="keyboard-commands-edit" />
      <GamepadControlsModal id="gamepad-controls-edit" />
      <SupportInfoModal id="support-info" />
      <DetailsModal id="details" />
      <DetailsModal id="discover-details" />
      <DetailsModal id="player-details" />
      {!showDowntime && (
        <Routes>
          {/* functional routes */}
          <Route path="/s/:query" element={<QuickSearch />} />
          <Route path="/search/:type" element={<Navigate to="/browse" />} />
          <Route path="/search/:type/:query?" element={<QueryView />} />
          {/* pages */}
          <Route
            path="/media/:media"
            element={
              <LegacyUrlView>
                <FeatureErrorBoundary name="Player">
                  <Suspense fallback={null}>
                    <PlayerView />
                  </Suspense>
                </FeatureErrorBoundary>
              </LegacyUrlView>
            }
          />
          <Route
            path="/media/:media/:season/:episode"
            element={
              <LegacyUrlView>
                <FeatureErrorBoundary name="Player">
                  <Suspense fallback={null}>
                    <PlayerView />
                  </Suspense>
                </FeatureErrorBoundary>
              </LegacyUrlView>
            }
          />
          <Route path="/browse/:query?" element={<HomePage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/onboarding/extension"
            element={<OnboardingExtensionPage />}
          />
          <Route path="/onboarding/proxy" element={<OnboardingProxyPage />} />

          {/* Migration pages - awaiting import and export fixes */}
          <Route path="/migration" element={<MigrationPage />} />
          <Route path="/migration/direct" element={<MigrationDirectPage />} />
          <Route
            path="/migration/download"
            element={<MigrationDownloadPage />}
          />
          <Route path="/migration/upload" element={<MigrationUploadPage />} />

          {shouldHaveLegalPage() ? (
            <Route path="/legal" element={<LegalPage />} />
          ) : null}
          {/* Support page */}
          <Route path="/support" element={<SupportPage />} />
          <Route path="/jip" element={<JipPage />} />
          <Route path="/pas" element={<PasPage />} />
          {/* Discover pages */}
          <Route path="/discover" element={<FeatureErrorBoundary name="Discover"><Discover /></FeatureErrorBoundary>} />
          <Route
            path="/discover/more/:contentType/:mediaType"
            element={<FeatureErrorBoundary name="Discover"><MoreContent /></FeatureErrorBoundary>}
          />
          <Route
            path="/discover/more/:contentType/:id/:mediaType"
            element={<FeatureErrorBoundary name="Discover"><MoreContent /></FeatureErrorBoundary>}
          />
          <Route path="/discover/more/:category" element={<FeatureErrorBoundary name="Discover"><MoreContent /></FeatureErrorBoundary>} />
          <Route path="/discover/all" element={<FeatureErrorBoundary name="Discover"><DiscoverMore /></FeatureErrorBoundary>} />
          {/* Bookmarks page */}
          <Route path="/bookmarks" element={<AllBookmarks />} />
          {/* Watch History page */}
          <Route path="/watch-history" element={<WatchHistory />} />
          {/* Settings page */}
          <Route
            path="/settings"
            element={
              <FeatureErrorBoundary name="Settings">
                <Suspense fallback={null}>
                  <SettingsPage />
                </Suspense>
              </FeatureErrorBoundary>
            }
          />
          {/* admin routes */}
          <Route path="/admin" element={<AdminPage />} />
          {/* other */}
          <Route path="/dev" element={<DeveloperPage />} />
          <Route path="/dev/video" element={<VideoTesterView />} />
          {/* developer routes that can abuse workers are disabled in production */}
          {process.env.NODE_ENV === "development" ? (
            <Route path="/dev/test" element={<TestView />} />
          ) : null}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
      {showDowntime && (
        <MaintenancePage onHomeButtonClick={handleButtonClick} />
      )}
    </Layout>
  );
}

export default App;
