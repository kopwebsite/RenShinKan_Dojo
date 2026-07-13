import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { ScrollToTop } from "./components/ScrollToTop";
import { Seo } from "./components/Seo";
import { useTranslation } from "./i18n";
import { DojoPage } from "./pages/DojoPage";

const AikidoPage = lazy(() => import("./pages/AikidoPage").then((module) => ({ default: module.AikidoPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const ClassesPage = lazy(() => import("./pages/ClassesPage").then((module) => ({ default: module.ClassesPage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((module) => ({ default: module.CommunityPage })));
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
            <Route path="/" element={<DojoPage />} />
            <Route path="/dojo" element={<Navigate to="/" replace />} />
            <Route path="/aikido" element={<AikidoPage />} />
            <Route path="/instructors" element={<InstructorsPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/workshops" element={<WorkshopsPage />} />
            <Route path="/newsletter" element={<NewsletterPage />} />
            <Route path="/newsletter/:slug" element={<NewsletterPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/visit" element={<Navigate to="/contact" replace />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/students" element={<AdminStudentsPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
            <Route path="/student-records" element={<StudentRecordsPage />} />
            <Route path="/records" element={<Navigate to="/student-records" replace />} />
            <Route path="/records/share/:token" element={<SharedStudentRecordPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {isAdminRoute ? null : <Footer />}
    </>
  );
}
