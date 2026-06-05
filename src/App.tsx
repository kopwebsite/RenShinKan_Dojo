import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { ScrollToTop } from "./components/ScrollToTop";
import { Seo } from "./components/Seo";
import { useTranslation } from "./i18n";

const AikidoPage = lazy(() => import("./pages/AikidoPage").then((module) => ({ default: module.AikidoPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const ClassesPage = lazy(() => import("./pages/ClassesPage").then((module) => ({ default: module.ClassesPage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((module) => ({ default: module.CommunityPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })));
const DojoPage = lazy(() => import("./pages/DojoPage").then((module) => ({ default: module.DojoPage })));
const InstructorsPage = lazy(() => import("./pages/InstructorsPage").then((module) => ({ default: module.InstructorsPage })));
const NewsletterPage = lazy(() => import("./pages/NewsletterPage").then((module) => ({ default: module.NewsletterPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const PaymentIncompletePage = lazy(() => import("./pages/PaymentReturnPage").then((module) => ({ default: module.PaymentIncompletePage })));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentReturnPage").then((module) => ({ default: module.PaymentSuccessPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((module) => ({ default: module.SupportPage })));
const WorkshopsPage = lazy(() => import("./pages/WorkshopsPage").then((module) => ({ default: module.WorkshopsPage })));

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t("a11y.skipToContent")}
      </a>
      <ScrollToTop />
      <Seo />
      <Navbar currentPath={`${location.pathname}${location.hash}`} />
      <main id="main-content" tabIndex={-1}>
        <Suspense fallback={<div className="container-shell py-20" aria-live="polite" />}>
          <Routes>
            <Route path="/" element={<DojoPage />} />
            <Route path="/dojo" element={<Navigate to="/" replace />} />
            <Route path="/aikido" element={<AikidoPage />} />
            <Route path="/instructors" element={<InstructorsPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/workshops" element={<WorkshopsPage />} />
            <Route path="/newsletter" element={<NewsletterPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/support/payment-success" element={<PaymentSuccessPage />} />
            <Route path="/support/payment-incomplete" element={<PaymentIncompletePage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/visit" element={<Navigate to="/contact" replace />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
