import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FloatingFirstVisit } from "./components/FloatingFirstVisit";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { ScrollToTop } from "./components/ScrollToTop";
import { AikidoPage } from "./pages/AikidoPage";
import { ClassesPage } from "./pages/ClassesPage";
import { CommunityPage } from "./pages/CommunityPage";
import { ContactPage } from "./pages/ContactPage";
import { DojoPage } from "./pages/DojoPage";
import { InstructorsPage } from "./pages/InstructorsPage";
import { NewsletterPage } from "./pages/NewsletterPage";
import { SupportPage } from "./pages/SupportPage";
import { WorkshopsPage } from "./pages/WorkshopsPage";

export default function App() {
  const location = useLocation();

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <ScrollToTop />
      <Navbar currentPath={`${location.pathname}${location.hash}`} />
      <main id="main-content" tabIndex={-1}>
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
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/visit" element={<ContactPage />} />
        </Routes>
      </main>
      <FloatingFirstVisit />
      <Footer />
    </>
  );
}
