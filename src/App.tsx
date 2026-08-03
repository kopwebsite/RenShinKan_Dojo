import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { ScrollToTop } from "./components/ScrollToTop";
import { Seo } from "./components/Seo";
import { ManagedRoute } from "./components/ManagedRoute";
import { AdminShell } from "./components/admin/AdminShell";
import { AdminSessionProvider } from "./components/admin/useAdminSession";
import { AdminAuggieLauncher } from "./components/admin/AdminAuggieLauncher";
import { AdminLanguageProvider, useAdminTranslation, useTranslation } from "./i18n";
import { DojoPage } from "./pages/DojoPage";
import { HelpLauncher } from "./help/HelpLauncher";

const AikidoPage = lazy(() => import("./pages/AikidoPage").then((module) => ({ default: module.AikidoPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })));
const ClassesPage = lazy(() => import("./pages/ClassesPage").then((module) => ({ default: module.ClassesPage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((module) => ({ default: module.CommunityPage })));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage").then((module) => ({ default: module.DownloadsPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })));
const InstructorsPage = lazy(() => import("./pages/InstructorsPage").then((module) => ({ default: module.InstructorsPage })));
const NewsletterPage = lazy(() => import("./pages/NewsletterPage").then((module) => ({ default: module.NewsletterPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((module) => ({ default: module.SupportPage })));
const WorkshopsPage = lazy(() => import("./pages/WorkshopsPage").then((module) => ({ default: module.WorkshopsPage })));
const StudentRecordsPage = lazy(() => import("./pages/StudentRecordsPage").then((module) => ({ default: module.StudentRecordsPage })));
const SharedStudentRecordPage = lazy(() => import("./pages/SharedStudentRecordPage").then((module) => ({ default: module.SharedStudentRecordPage })));
const AdminStudentsPage = lazy(() => import("./pages/AdminStudentsPage").then((module) => ({ default: module.AdminStudentsPage })));
const AdminAuditPage = lazy(() => import("./pages/AdminAuditPage").then((module) => ({ default: module.AdminAuditPage })));
const AdminMembershipsPage = lazy(() => import("./pages/AdminMembershipsPage").then((module) => ({ default: module.AdminMembershipsPage })));
const AdminDojosPage = lazy(() => import("./pages/AdminDojosPage").then((module) => ({ default: module.AdminDojosPage })));
const AdminWorkflowPage = lazy(() => import("./pages/AdminWorkflowPage").then((module) => ({ default: module.AdminWorkflowPage })));
const AdminGalleryPage = lazy(() => import("./pages/AdminGalleryPage").then((module) => ({ default: module.AdminGalleryPage })));
const AdminDownloadsPage = lazy(() => import("./pages/AdminDownloadsPage").then((module) => ({ default: module.AdminDownloadsPage })));

function RouteFallback() {
  return (
    <div
      className="container-shell grid min-h-[var(--hero-viewport-height)] place-items-center py-16"
      role="status"
      aria-label="Loading page"
    >
      <div className="h-16 w-16 animate-pulse rounded-full border border-bamboo/25 bg-paper/65 shadow-line" />
    </div>
  );
}

function AdminRouteFrame() {
  const { t } = useAdminTranslation();

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t("a11y.skipToContent")}
      </a>
      <ScrollToTop />
      <Seo />
      <main id="main-content" tabIndex={-1} className="min-h-[var(--hero-viewport-height)]">
        <AdminShell>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/website" element={<AdminPage />} />
              <Route path="/admin/downloads" element={<AdminDownloadsPage />} />
              <Route path="/admin/galleries/:galleryId" element={<AdminGalleryPage />} />
              <Route path="/admin/dojo-updates" element={<Navigate to="/admin/website" replace />} />
              <Route path="/admin/site-editor" element={<Navigate to="/admin/website" replace />} />
              <Route path="/admin/students" element={<AdminStudentsPage />} />
              <Route path="/admin/profile-requests" element={<AdminStudentsPage mode="profileRequests" />} />
              <Route path="/admin/training-requests" element={<AdminStudentsPage mode="trainingRequests" />} />
              <Route path="/admin/exam-applications" element={<AdminWorkflowPage kind="exam-applications" />} />
              <Route path="/admin/examination-records" element={<AdminWorkflowPage kind="examination-records" />}
              />
              <Route
                path="/admin/exam-payslips"
                element={<AdminWorkflowPage kind="exam-payslips" />}
              />
              <Route
                path="/admin/monthly-contributions"
                element={<AdminWorkflowPage kind="monthly-contributions" />} />
              <Route path="/admin/aat-contributions" element={<AdminWorkflowPage kind="aat-contributions" />} />
              <Route path="/admin/payment-proofs" element={<AdminWorkflowPage kind="payment-proofs" />} />
              <Route path="/admin/audit" element={<AdminAuditPage />} />
              <Route path="/admin/memberships" element={<AdminMembershipsPage />} />
              <Route path="/admin/dojos" element={<AdminDojosPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AdminShell>
      </main>
      <AdminAuggieLauncher />
    </>
  );
}

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    document.documentElement.classList.toggle("admin-route", isAdminRoute);
    document.body.classList.toggle("admin-simple", isAdminRoute);
    return () => {
      document.documentElement.classList.remove("admin-route");
      document.body.classList.remove("admin-simple");
    };
  }, [isAdminRoute]);

  if (isAdminRoute) {
    return (
      <AdminLanguageProvider>
        <AdminSessionProvider>
          <AdminRouteFrame />
        </AdminSessionProvider>
      </AdminLanguageProvider>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t("a11y.skipToContent")}
      </a>
      <ScrollToTop />
      <Seo />
      <Navbar currentPath={`${location.pathname}${location.hash}`} />
      <main id="main-content" tabIndex={-1} className="min-h-[var(--hero-viewport-height)]">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<ManagedRoute fallback={<DojoPage />} />} />
            <Route path="/dojo" element={<Navigate to="/" replace />} />
            <Route path="/aikido" element={<ManagedRoute fallback={<AikidoPage />} />} />
            <Route path="/instructors" element={<ManagedRoute fallback={<InstructorsPage />} />} />
            <Route path="/classes" element={<ManagedRoute fallback={<ClassesPage />} />} />
            <Route path="/workshops" element={<ManagedRoute fallback={<WorkshopsPage />} />} />
            <Route path="/newsletter" element={<ManagedRoute fallback={<NewsletterPage />} />} />
            <Route path="/newsletter/:slug" element={<NewsletterPage />} />
            <Route path="/community" element={<ManagedRoute fallback={<CommunityPage />} />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/support" element={<ManagedRoute fallback={<SupportPage />} />} />
            <Route path="/contact" element={<ManagedRoute fallback={<ContactPage />} />} />
            <Route path="/visit" element={<Navigate to="/contact" replace />} />
            <Route path="/student-records" element={<StudentRecordsPage />} />
            <Route path="/records" element={<Navigate to="/student-records" replace />} />
            <Route path="/records/share/:token" element={<SharedStudentRecordPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <HelpLauncher audience="public" />
      <Footer />
    </>
  );
}
