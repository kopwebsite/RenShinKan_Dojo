import { ArrowUpRight, Download, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { BeltCarousel } from "../components/BeltCarousel";
import { BeltProgressionChart } from "../components/BeltProgressionChart";
import { FAQAccordion } from "../components/FAQAccordion";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { examAnnouncement, passedTestStudents } from "../data/editableContent";
import { useTranslation, type TranslationKey } from "../i18n";
import { useEditableContent } from "../lib/content";
import { assetPath } from "../utils/assetPath";

function ObiIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.6"
    >
      <path d="M4 12h8l4 4-4 4H4z" />
      <path d="M28 12h-8l-4 4 4 4h8z" />
      <path d="M13 10h6l3 6-3 6h-6l-3-6z" />
      <path d="M12 16h8" />
    </svg>
  );
}

export function ClassesPage() {
  const { t } = useTranslation();
  const { content } = useEditableContent();
  const activeExamAnnouncement = content.examAnnouncement ?? examAnnouncement;
  const activePassedStudents = content.passedTestStudents.length ? content.passedTestStudents : passedTestStudents;
  const beltExamApplicationUrl = assetPath("/forms/Application_Form_Aikido_Association_Thailand.pdf");
  const firstVisitItems: TranslationKey[] = [
    "classes.firstVisit.item1",
    "classes.firstVisit.item2",
    "classes.firstVisit.item3",
    "classes.firstVisit.item4",
    "classes.firstVisit.item5",
    "classes.firstVisit.item6",
  ];

  return (
    <>
      {/* Information */}
      <MotionSection id="information" className="container-shell scroll-mt-28 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <p className="eyebrow">{t("classes.intro.eyebrow")}</p>
            <h1 className="section-title">
              {t("classes.intro.title")}
            </h1>
            <p className="section-copy">
              {t("classes.intro.copy")}
            </p>
          </div>
          <div className="flex items-center justify-center">
            <ResponsiveImage
              src={assetPath("/dojo-photos/kids-around-green-belt.webp")}
              alt={t("classes.intro.imageAlt")}
              imgClassName="w-full max-w-md rounded-[2rem] object-cover"
              style={{ maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)" }}
              loading="lazy"
              width={1448}
              height={1086}
            />
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <article className="surface rounded-[1.75rem] p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
              {t("classes.halves.firstEyebrow")}
            </p>
            <h2 className="mt-3 text-2xl text-ink sm:text-3xl">{t("classes.halves.firstTitle")}</h2>
            <p className="mt-3 text-sm text-charcoal/75">
              {t("classes.halves.firstCopy")}
            </p>
          </article>
          <article className="surface rounded-[1.75rem] p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-vermilion">
              {t("classes.halves.secondEyebrow")}
            </p>
            <h2 className="mt-3 text-2xl text-ink sm:text-3xl">{t("classes.halves.secondTitle")}</h2>
            <p className="mt-3 text-sm text-charcoal/75">
              {t("classes.halves.secondCopy")}
            </p>
          </article>
        </div>
      </MotionSection>

      {/* Schedule */}
      <MotionSection id="schedule" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="eyebrow">{t("classes.schedule.eyebrow")}</p>
            <h2 className="section-title">{t("classes.schedule.title")}</h2>
            <p className="section-copy">
              {t("classes.schedule.copy")}
            </p>
            <Link to="/contact" className="btn-secondary mt-7">
              <Eye size={17} aria-hidden="true" />
              {t("common.observeClass")}
            </Link>
          </div>
          <ResponsiveImage
            src={assetPath("/dojo-photos/schedule.webp")}
            alt={t("classes.schedule.imageAlt")}
            imgClassName="w-full rounded-[1.75rem] object-contain shadow-line"
            width={1476}
            height={1066}
          />
        </div>
      </MotionSection>

      {/* First Visit Guide */}
      <MotionSection id="first-visit" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="eyebrow">{t("classes.firstVisit.eyebrow")}</p>
            <h2 className="section-title">{t("classes.firstVisit.title")}</h2>
            <p className="section-copy">
              {t("classes.firstVisit.copy")}
            </p>
            <Link to="/contact" className="btn-primary mt-7">
              {t("common.askAboutVisiting")}
            </Link>
          </div>
          <article className="surface rounded-[2rem] p-6 sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <Eye size={24} aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-3xl text-ink">{t("classes.firstVisit.beforeTitle")}</h3>
            <ul className="mt-6 grid gap-3">
              {firstVisitItems.map((itemKey) => (
                <li key={itemKey} className="flex items-start gap-3 text-charcoal/80">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-vermilion" aria-hidden="true" />
                  {t(itemKey)}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </MotionSection>

      {/* Belt Exams */}
      <MotionSection id="belt-exams" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion text-paper">
            <ObiIcon />
          </div>
          <p className="eyebrow mt-7">{t("classes.beltExams.eyebrow")}</p>
          <h2 className="section-title">
            {activeExamAnnouncement.text}
          </h2>
          <p className="section-copy max-w-3xl">
            {t("classes.beltExams.copy")}
          </p>
          <Link to="/support#donations" className="btn-secondary mt-6 inline-flex">
            {t("classes.beltExams.donationCta")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <article className="surface mb-10 flex flex-col gap-5 rounded-[1.75rem] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">
              {t("classes.beltExams.applicationEyebrow")}
            </p>
            <h3 className="mt-3 text-2xl text-ink sm:text-3xl">{t("classes.beltExams.applicationTitle")}</h3>
            <p className="mt-3 text-sm text-charcoal/75">
              {t("classes.beltExams.applicationCopy")}
            </p>
          </div>
          <a
            href={beltExamApplicationUrl}
            download="Application_Form_Aikido_Association_Thailand.pdf"
            className="btn-secondary w-full justify-center sm:w-auto"
          >
            <Download size={17} aria-hidden="true" />
            {t("classes.beltExams.applicationCta")}
          </a>
        </article>

        <BeltProgressionChart />

        {/* Belt exam graduation gallery */}
        <div id="gallery" className="mt-14 scroll-mt-28">
          <p className="eyebrow mb-2">{t("classes.beltExams.graduationEyebrow")}</p>
          <h3 className="section-title mb-8">{t("classes.beltExams.graduationTitle")}</h3>
          <BeltCarousel students={activePassedStudents} />
        </div>
      </MotionSection>

      {/* FAQ */}
      <MotionSection id="faq" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">{t("classes.faq.eyebrow")}</p>
          <h2 className="section-title">{t("classes.faq.title")}</h2>
        </div>
        <FAQAccordion />
      </MotionSection>
    </>
  );
}
