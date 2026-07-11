import { ArrowRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { BeltCarousel } from "../components/BeltCarousel";
import { BeltProgressionChart } from "../components/BeltProgressionChart";
import { FAQAccordion } from "../components/FAQAccordion";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { examAnnouncement, passedTestStudents } from "../data/editableContent";
import { classSchedule } from "../data/siteMeta";
import { useTranslation, type TranslationKey } from "../i18n";
import { useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";

export function ClassesPage() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const activeExamAnnouncement = content.examAnnouncement ?? examAnnouncement;
  const activePassedStudents = content.passedTestStudents.length ? content.passedTestStudents : passedTestStudents;
  const firstVisitItems: TranslationKey[] = [
    "classes.firstVisit.item1", "classes.firstVisit.item2", "classes.firstVisit.item3",
    "classes.firstVisit.item4", "classes.firstVisit.item5", "classes.firstVisit.item6",
  ];

  return (
    <>
      <MotionSection className="page-opening container-shell">
        <div>
          <p className="folio-mark">Practice notes · 01</p>
          <p className="eyebrow">{t("classes.intro.eyebrow")}</p>
          <h1>{t("classes.intro.title")}</h1>
          <p>{t("classes.intro.copy")}</p>
          <Link to="/contact" className="text-link">Ask about visiting <ArrowRight size={16} /></Link>
        </div>
        <figure>
          <ResponsiveImage src={assetPath("/dojo-photos/kids-around-green-belt.webp")} alt={t("classes.intro.imageAlt")} imgClassName="h-full w-full object-cover" loading="eager" />
          <figcaption>Children and adults learn through careful partner practice.</figcaption>
        </figure>
      </MotionSection>

      <MotionSection id="schedule" className="ink-section scroll-mt-24">
        <div className="container-shell ink-section__layout">
          <header>
            <p className="eyebrow">{t("classes.schedule.eyebrow")}</p>
            <h2>{t("classes.schedule.title")}</h2>
            <p>{t("classes.schedule.copy")}</p>
          </header>
          <div className="class-times" role="list" aria-label="Weekly class times">
            {classSchedule.map((session, index) => (
              <div role="listitem" key={session.day}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{session.day}</strong>
                <time>{session.time.replace("-", " — ")}</time>
              </div>
            ))}
          </div>
        </div>
      </MotionSection>

      <MotionSection id="first-visit" className="container-shell first-visit-path scroll-mt-24">
        <header className="section-masthead">
          <p className="eyebrow">{t("classes.firstVisit.eyebrow")}</p>
          <h2>{t("classes.firstVisit.title")}</h2>
          <p>{t("classes.firstVisit.copy")}</p>
        </header>
        <ol>
          {firstVisitItems.map((itemKey, index) => (
            <li key={itemKey}>
              <span>{index + 1}</span>
              <p>{t(itemKey)}</p>
            </li>
          ))}
        </ol>
        <Link to="/contact" className="btn-primary">{t("common.askAboutVisiting")}</Link>
      </MotionSection>

      <MotionSection id="belt-exams" className="container-shell belt-manuscript scroll-mt-24">
        <header className="section-masthead section-masthead--wide">
          <p className="eyebrow">{t("classes.beltExams.eyebrow")}</p>
          <h2>{activeExamAnnouncement.text}</h2>
          <p>{t("classes.beltExams.copy")}</p>
          <a href={assetPath("/forms/Application_Form_Aikido_Association_Thailand.pdf")} download className="text-link">
            <Download size={16} /> {t("classes.beltExams.applicationCta")}
          </a>
        </header>
        <BeltProgressionChart />
        <div id="gallery" className="graduation-strip scroll-mt-24">
          <p className="eyebrow">{t("classes.beltExams.graduationEyebrow")}</p>
          <h3>{t("classes.beltExams.graduationTitle")}</h3>
          <BeltCarousel students={activePassedStudents} />
        </div>
      </MotionSection>

      <MotionSection id="faq" className="container-shell faq-manuscript scroll-mt-24">
        <header className="section-masthead">
          <p className="eyebrow">{t("classes.faq.eyebrow")}</p>
          <h2>{t("classes.faq.title")}</h2>
        </header>
        <FAQAccordion />
      </MotionSection>
    </>
  );
}
