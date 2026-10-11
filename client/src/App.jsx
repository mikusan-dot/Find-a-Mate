import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, configured } from './firebase/auth.jsx';
import { AppShell, ErrorBoundary, FullPageSpinner, NotificationsProvider, PublicOnly, RequireAuth, RequireOnboarded, RequireStaff, RequireVerified, ToastProvider } from './components/index.jsx';
import { ConfigMissing, Landing, Login, NotFound, PrivacyPolicy, Register, Terms, Verify } from './pages/public.jsx';

// Code-split everything behind the login wall.
const Onboarding = lazy(() => import('./pages/onboarding.jsx').then((m) => ({ default: m.Onboarding })));
const main = (name) => lazy(() => import('./pages/main.jsx').then((m) => ({ default: m[name] })));
const Dashboard = main('Dashboard'), Discover = main('Discover'), Matches = main('Matches'), Compatibility = main('Compatibility'), Icebreakers = main('Icebreakers');
const Profile = lazy(() => import('./pages/profile.jsx').then((m) => ({ default: m.Profile })));
const ProfileEdit = lazy(() => import('./pages/profile.jsx').then((m) => ({ default: m.ProfileEdit })));
const Chat = lazy(() => import('./pages/chat.jsx').then((m) => ({ default: m.Chat })));
const settings = (name) => lazy(() => import('./pages/settings.jsx').then((m) => ({ default: m[name] })));
const Settings = settings('Settings'), SettingsPrivacy = settings('SettingsPrivacy'), SettingsSecurity = settings('SettingsSecurity');
const admin = (name) => lazy(() => import('./pages/admin.jsx').then((m) => ({ default: m[name] })));
const AdminLayout = admin('AdminLayout'), AdminOverview = admin('AdminOverview'), AdminUsers = admin('AdminUsers'), AdminReports = admin('AdminReports'), AdminUniversities = admin('AdminUniversities'), AdminModeration = admin('AdminModeration'), AdminAnalytics = admin('AdminAnalytics');

export default function App() {
  if (!configured) return <ConfigMissing />;
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<FullPageSpinner />}>
              <Routes>
                {/* public */}
                <Route path="/" element={<Landing />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Terms />} />
                <Route element={<PublicOnly />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                </Route>

                {/* signed in */}
                <Route element={<RequireAuth />}>
                  <Route path="/verify" element={<Verify />} />
                  <Route element={<RequireVerified />}>
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route element={<NotificationsProvider><AppShell /></NotificationsProvider>}>
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/settings/privacy" element={<SettingsPrivacy />} />
                      <Route path="/settings/security" element={<SettingsSecurity />} />
                      <Route element={<RequireOnboarded />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/discover" element={<Discover />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/profile/edit" element={<ProfileEdit />} />
                        <Route path="/matches" element={<Matches />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/chat/:matchId" element={<Chat />} />
                        <Route path="/compatibility" element={<Compatibility />} />
                        <Route path="/compatibility/:matchId" element={<Compatibility />} />
                        <Route path="/icebreakers" element={<Icebreakers />} />
                        <Route path="/icebreakers/:matchId" element={<Icebreakers />} />
                      </Route>
                      <Route element={<RequireStaff />}>
                        <Route path="/admin" element={<AdminLayout />}>
                          <Route index element={<AdminOverview />} />
                          <Route path="users" element={<AdminUsers />} />
                          <Route path="reports" element={<AdminReports />} />
                          <Route path="universities" element={<AdminUniversities />} />
                          <Route path="moderation" element={<AdminModeration />} />
                          <Route path="analytics" element={<AdminAnalytics />} />
                        </Route>
                      </Route>
                    </Route>
                  </Route>
                </Route>

                <Route path="/home" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
