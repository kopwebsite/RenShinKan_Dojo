import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HeartHandshake,
  MapPin,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MotionSection } from "../components/MotionSection";
import {
  cmuAikidoClub,
  communityValues,
  pcfDojoPhotos,
  peaceCultureFoundation,
  relatedDojos,
} from "../data/siteContent";
import { assetPath } from "../utils/assetPath";

const upcomingEvents = [
  {
    title: "Community Practice Day",
    date: "Date to be announced",
    description:
      "An open training session welcoming students from RenshinKan, AikidoCMU, and other connected dojos.",
  },
  {
    title: "Peace Culture Workshop",
    date: "Date to be announced",
    description:
      "A foundation-connected workshop on peace education, safety, and community-building through aikido.",
  },
  {
    title: "Dojo Gathering",
    date: "Date to be announced",
    description:
      "A student gathering with a shared meal, open mat, or volunteer day. Details to be confirmed.",
  },
];

const pastEventImages = [
  {
    title: "Stage Demonstration",
    image: assetPath("/past-events/aikido_demonstration_stage_action_01.jpg"),
    alt: "Aikido practitioners demonstrating a technique on a public stage.",
    caption: "Public demonstration showing movement, timing, and partner care.",
  },
  {
    title: "Teacher And Children",
    image: assetPath("/past-events/aikido_demonstration_stage_teacher_children_01.jpg"),
    alt: "An aikido teacher guiding children during a stage demonstration.",
    caption: "Young students participate with clear guidance and structure.",
  },
  {
    title: "Large Group Photo",
    image: assetPath("/past-events/aikido_event_large_group_stage_01.jpg"),
    alt: "Large aikido group photo taken on a public stage.",
    caption: "A group photo from a past demonstration and community event.",
  },
  {
    title: "Dojo Cleanup Day",
    image: assetPath("/past-events/cleanupday.jpg"),
    alt: "Members gathered for a dojo cleanup day.",
    caption: "Taking care of our training space together.",
  },
  {
    title: "Training at Old CMU Center",
    image: assetPath("/past-events/training at old cmu center.jpg"),
    alt: "Aikido training at the old CMU center.",
    caption: "Early training days at the original CMU location.",
  },
  {
    title: "Community Gathering",
    image: assetPath("/past-events/31497048_1964429786962579_8682679123652378624_n.jpg"),
    alt: "RenShinKan community gathering.",
    caption: "Members of the dojo gathered together.",
  },
  {
    title: "Dojo Moment",
    image: assetPath("/past-events/31530725_1964429800295911_5466054313245671424_n.jpg"),
    alt: "A moment captured at RenShinKan Dojo.",
    caption: "Shared practice and community at RenShinKan.",
  },
  {
    title: "Dojo History",
    image: assetPath("/past-events/462808445_27186003534378523_1642452659223418147_n.jpg"),
    alt: "A historical moment at RenShinKan Dojo.",
    caption: "Part of our ongoing dojo story.",
  },
  {
    title: "Practice Together",
    image: assetPath("/past-events/463076295_27210059788639564_4349229188603476959_n.jpg"),
    alt: "Aikido practitioners training together.",
    caption: "Training builds connection between students.",
  },
  {
    title: "Dojo Life",
    image: assetPath("/past-events/463461849_27241625125483030_5569220490731885080_n.jpg"),
    alt: "Life at RenShinKan Dojo.",
    caption: "Everyday moments from the dojo.",
  },
  {
    title: "On The Mat",
    image: assetPath("/past-events/463483607_27256028940709315_3238413136091319781_n.jpg"),
    alt: "Students on the mat at RenShinKan.",
    caption: "The mat is where practice becomes understanding.",
  },
  {
    title: "Community Practice",
    image: assetPath("/past-events/463872355_27264339496544926_6495392107844493594_n.jpg"),
    alt: "Community aikido practice at RenShinKan.",
    caption: "Aikido shared with the community.",
  },
  {
    title: "Dojo Gathering",
    image: assetPath("/past-events/464332466_27334442446201297_3579052760884406485_n.jpg"),
    alt: "Members gathered at the dojo.",
    caption: "A gathering of students and friends.",
  },
  {
    title: "Training Session",
    image: assetPath("/past-events/509413133_30106465548998959_7301153235771637545_n.jpg"),
    alt: "A training session at RenShinKan Dojo.",
    caption: "Regular practice keeps the spirit alive.",
  },
  {
    title: "Dojo Moment",
    image: assetPath("/past-events/511949935_30158867373758776_9171541378070610724_n.jpg"),
    alt: "A moment from dojo life.",
    caption: "Every class brings new understanding.",
  },
  {
    title: "Students Training",
    image: assetPath("/past-events/512441655_30158870777091769_1177013419267375358_n.jpg"),
    alt: "Students training at RenShinKan.",
    caption: "Dedication shown through consistent practice.",
  },
  {
    title: "Group Practice",
    image: assetPath("/past-events/513243684_30192571793721667_1245574704555913467_n.jpg"),
    alt: "Group practice at the dojo.",
    caption: "Training together strengthens the community.",
  },
  {
    title: "Dojo Community",
    image: assetPath("/past-events/514375456_30229010516744461_8578624454192314352_n.jpg"),
    alt: "The RenShinKan dojo community.",
    caption: "Our community continues to grow.",
  },
  {
    title: "Shared Practice",
    image: assetPath("/past-events/589121863_1633183308034846_2031634163046550276_n.jpg"),
    alt: "Shared aikido practice at RenShinKan.",
    caption: "Aikido is a practice shared with others.",
  },
  {
    title: "Early Days",
    image: assetPath("/past-events/87285843_3576758575729684_6403029092752424960_n.jpg"),
    alt: "An early gathering at RenShinKan.",
    caption: "Looking back at where we started.",
  },
  {
    title: "Dojo Roots",
    image: assetPath("/past-events/87486499_3576758775729664_6872977112836341760_n.jpg"),
    alt: "Early days at RenShinKan Dojo.",
    caption: "The foundations that shaped our dojo.",
  },
];

export function CommunityPage() {
  const [cmuHeroPhoto, ...cmuGalleryPhotos] = cmuAikidoClub.photos;
  const [pastEventIndex, setPastEventIndex] = useState(0);
  const [thumbnailPage, setThumbnailPage] = useState(0);
  const activePastEvent = pastEventImages[pastEventIndex];
  const THUMBS_PER_PAGE = 6;
  const totalThumbnailPages = Math.ceil(pastEventImages.length / THUMBS_PER_PAGE);
  const visibleThumbnails = pastEventImages.slice(
    thumbnailPage * THUMBS_PER_PAGE,
    (thumbnailPage + 1) * THUMBS_PER_PAGE,
  );

  const showPreviousPastEvent = () => {
    setPastEventIndex((i) => (i === 0 ? pastEventImages.length - 1 : i - 1));
  };

  const showNextPastEvent = () => {
    setPastEventIndex((i) => (i === pastEventImages.length - 1 ? 0 : i + 1));
  };

  return (
    <>
      {/* Intro */}
      <MotionSection className="container-shell py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <p className="eyebrow">Peace Culture & Community</p>
            <h1 className="section-title">
              Aikido as a daily practice of respect, safety, and personal growth.
            </h1>
            <p className="section-copy">
              RenshinKan sits at the centre of a wider network that includes the
              Peace Culture Foundation, the AikidoCMU university club, and a
              community of dojos across Chiang Mai. Aikido here isn't just a
              training system. It's a shared way of learning to move through
              conflict with calm and care.
            </p>
          </div>
          <div className="flex items-center justify-center">
            <img
              src={assetPath("/dojo-photos/pcf.png")}
              alt="Peace Culture Foundation and RenshinKan community."
              className="w-full max-w-md rounded-[2rem] object-cover"
              style={{ maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)" }}
              loading="eager"
            />
          </div>
        </div>
      </MotionSection>

      {/* Values */}
      <MotionSection className="container-shell pb-20">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {communityValues.map((value) => {
            const Icon = value.icon;
            return (
              <article key={value.title} className="surface card-hover rounded-[1.75rem] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-2xl text-ink">{value.title}</h2>
                <p className="mt-3 text-sm text-charcoal/75">{value.description}</p>
              </article>
            );
          })}
        </div>
      </MotionSection>

      {/* Upcoming Events */}
      <MotionSection id="upcoming-events" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Upcoming Events</p>
          <h2 className="section-title">Community calendar.</h2>
          <p className="section-copy">
            Confirmed dates for seminars, open mat days, volunteer activities,
            and dojo gatherings will be posted here as they're set.
          </p>
        </div>
        <div className="surface rounded-[2.5rem] overflow-hidden">
          {upcomingEvents.map((event, i) => (
            <div
              key={event.title}
              className={`flex items-start gap-6 px-10 py-9 sm:gap-10 sm:px-14 sm:py-11${
                i < upcomingEvents.length - 1 ? " border-b border-ink/[0.07]" : ""
              }`}
            >
              <div className="flex-none flex h-14 w-14 items-center justify-center rounded-full bg-vermilion/10 text-vermilion mt-0.5">
                <CalendarDays size={24} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-bamboo">
                  {event.date}
                </p>
                <h3 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">{event.title}</h3>
                <p className="mt-3 text-base text-charcoal/75 max-w-2xl">{event.description}</p>
              </div>
            </div>
          ))}
        </div>
      </MotionSection>

      {/* Past Events */}
      <MotionSection id="past-events" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Past Events</p>
          <h2 className="section-title">A Look at Our History</h2>
          <p className="section-copy">
            Photos from public demonstrations, school visits, and shared
            training events that have brought the dojo into the wider community.
          </p>
        </div>

        {/* Featured photo — full width with overlaid controls */}
        <figure className="relative overflow-hidden rounded-[2rem]">
          <div className="relative min-h-[22rem] bg-ink sm:aspect-video sm:min-h-0">
            <img
              key={activePastEvent.image}
              src={activePastEvent.image}
              alt={activePastEvent.alt}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
              loading="lazy"
            />
            {/* Prev / Next overlaid */}
            <button
              type="button"
              onClick={showPreviousPastEvent}
              aria-label="Previous photo"
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-ink/60 text-paper shadow-lg transition hover:bg-ink"
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNextPastEvent}
              aria-label="Next photo"
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-ink/60 text-paper shadow-lg transition hover:bg-ink"
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
        </figure>

        {/* Thumbnail strip */}
        <div className="mt-4 flex items-stretch gap-2">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setThumbnailPage((p) => Math.max(0, p - 1))}
              aria-label="Previous thumbnails"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/65 transition hover:bg-paper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo ${
                thumbnailPage === 0 ? "invisible" : ""
              }`}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 grid grid-cols-6 gap-2">
            {visibleThumbnails.map((event) => {
              const globalIndex = pastEventImages.indexOf(event);
              const isActive = globalIndex === pastEventIndex;
              return (
                <button
                  key={event.image}
                  type="button"
                  onClick={() => setPastEventIndex(globalIndex)}
                  aria-label={`View: ${event.title}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`relative overflow-hidden rounded-xl transition duration-200 ${
                    isActive
                      ? "ring-2 ring-vermilion ring-offset-2"
                      : "opacity-55 hover:opacity-100"
                  }`}
                >
                  <img
                    src={event.image}
                    alt=""
                    aria-hidden="true"
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setThumbnailPage((p) => Math.min(totalThumbnailPages - 1, p + 1))}
              aria-label="Next thumbnails"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-paper/65 transition hover:bg-paper/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bamboo ${
                thumbnailPage === totalThumbnailPages - 1 ? "invisible" : ""
              }`}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </MotionSection>

      {/* Peace Culture Foundation */}
      <MotionSection id="peace-culture" className="container-shell scroll-mt-28 pb-20">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] bg-ink/90 p-8 text-paper backdrop-blur-sm sm:p-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="inline-flex w-fit rounded-[1.35rem] bg-paper px-4 py-3 shadow-soft">
                <img
                  src={peaceCultureFoundation.logo.src}
                  alt={peaceCultureFoundation.logo.alt}
                  className="h-16 w-auto object-contain"
                  loading="eager"
                />
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion text-paper">
                <HeartHandshake size={26} aria-hidden="true" />
              </div>
            </div>
            <p className="eyebrow mt-7 text-mist/70">Peace Culture Foundation</p>
            <h2 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
              The organisation behind RenshinKan's dojo and community mission.
            </h2>
            <p className="mt-5 max-w-2xl text-paper/75">
              The Peace Culture Foundation built RenshinKan in 2013 and continues
              to connect the dojo's training culture to broader work in child safety,
              grooming prevention, and peaceful conflict resolution across Chiang Mai.
            </p>
            <p className="mt-4 max-w-2xl text-paper/75">
              {peaceCultureFoundation.aikidoConnection}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={peaceCultureFoundation.homepageUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary border-paper/20 bg-paper/10 text-paper hover:text-paper"
              >
                Visit Foundation
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a
                href={peaceCultureFoundation.advocacyUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary border-paper/20 bg-paper/10 text-paper hover:text-paper"
              >
                Advocacy Work
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </article>

          <article className="surface rounded-[2rem] p-8 sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
              <ShieldCheck size={26} aria-hidden="true" />
            </div>
            <p className="eyebrow mt-7">Grooming Prevention</p>
            <h2 className="mt-4 text-4xl leading-tight text-ink sm:text-5xl">
              Prevention starts with language, boundaries, and trusted adults.
            </h2>
            <p className="mt-5 text-charcoal/78">
              {peaceCultureFoundation.groomingPrevention}
            </p>
            <ul className="mt-6 grid gap-3">
              {peaceCultureFoundation.pillars.map((pillar) => (
                <li key={pillar} className="flex items-center gap-3 text-sm font-bold text-charcoal/80">
                  <span className="h-2.5 w-2.5 rounded-full bg-vermilion" aria-hidden="true" />
                  {pillar}
                </li>
              ))}
            </ul>
            <a
              href={peaceCultureFoundation.groomingPreventionUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-7"
            >
              Grooming Prevention Page
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
        </div>

        {/* PCF Photo Gallery */}
        <div className="mt-8">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-charcoal/55">
            From the Peace Culture Foundation
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pcfDojoPhotos.map((photo) => {
              if ((photo as typeof photo & { featured?: boolean }).featured) {
                return (
                  <figure
                    key={photo.src}
                    className="surface overflow-hidden rounded-[1.75rem] sm:col-span-2 lg:col-span-3"
                  >
                    <div className="grid sm:grid-cols-[auto_1fr] sm:items-center">
                      <img
                        src={photo.src}
                        alt={photo.alt}
                        className="w-full object-contain sm:w-auto sm:max-h-56 sm:max-w-sm"
                        loading="lazy"
                      />
                      <figcaption className="border-t border-ink/10 p-6 sm:border-l sm:border-t-0 sm:p-8">
                        <p className="eyebrow">Founder</p>
                        <h3 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">
                          {photo.title}
                        </h3>
                        <p className="mt-4 leading-7 text-charcoal/75">{photo.caption}</p>
                      </figcaption>
                    </div>
                  </figure>
                );
              }
              return (
                <figure
                  key={photo.src}
                  className="surface card-hover overflow-hidden rounded-[1.75rem]"
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <figcaption className="p-5">
                    <p className="font-bold text-ink">{photo.title}</p>
                    <p className="mt-2 text-sm text-charcoal/70">{photo.caption}</p>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </MotionSection>

      {/* Chiang Mai CMU */}
      <MotionSection
        id="cmu-aikido"
        className="container-shell scroll-mt-28 pb-20"
        ariaLabelledby="cmu-aikido-heading"
      >
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <article className="surface overflow-hidden rounded-[2rem]">
            <div className="relative min-h-[25rem] overflow-hidden bg-ink">
              <img
                src={cmuHeroPhoto.src}
                alt={cmuHeroPhoto.alt}
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                loading="lazy"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent"
                aria-hidden="true"
              />
              <div className="absolute left-5 top-5 rounded-2xl bg-paper/95 px-4 py-3 shadow-soft">
                <img
                  src={cmuAikidoClub.logo.src}
                  alt={cmuAikidoClub.logo.alt}
                  className="h-12 w-auto"
                  loading="lazy"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-paper sm:p-8">
                <p className="eyebrow text-paper/70">Chiang Mai University</p>
                <h2 className="mt-3 max-w-2xl text-4xl leading-tight sm:text-5xl">
                  AikidoCMU: aikido at CMU since around 1986.
                </h2>
                <p className="mt-4 max-w-xl text-sm text-paper/75">
                  {cmuHeroPhoto.caption}
                </p>
              </div>
            </div>
            <div className="grid divide-y divide-ink/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-5">
                <CalendarDays className="text-vermilion" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  Public Days
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  {cmuAikidoClub.practice.days}
                </p>
              </div>
              <div className="p-5">
                <UsersRound className="text-bamboo" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  Community
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  Students and guests
                </p>
              </div>
              <div className="p-5">
                <GraduationCap className="text-wood" size={22} aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-charcoal/55">
                  Roots
                </p>
                <p className="mt-2 text-lg font-bold text-ink">
                  Since around 1986
                </p>
              </div>
            </div>
          </article>

          <div>
            <p className="eyebrow">Aikido Chiang Mai University Club</p>
            <h2 id="cmu-aikido-heading" className="section-title">
              Where RenshinKan's lineage began.
            </h2>
            <p className="section-copy">
              The founders of RenshinKan, Ajarn Sombat Tapanya and Ajarn
              Teerarat Boripantakul, both trained at AikidoCMU before
              establishing RenshinKan Dojo in 2013. The university club has been
              part of Chiang Mai's aikido community since the mid-1980s, first
              sharing space with the CMU judo club before growing into its own
              practice group.
            </p>
            <p className="mt-4 text-charcoal/78">
              AikidoCMU has consistently welcomed CMU students, international
              students, and community members who train with regular discipline and
              mutual respect. Their public sessions remain open to anyone serious
              about practice, so message ahead to confirm current times and location.
            </p>

            <div className="mt-7 rounded-[2rem] bg-paper/70 p-6 shadow-line ring-1 ring-ink/10">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-vermilion/10 text-vermilion">
                  <CalendarDays size={22} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-2xl text-ink">Public practice</h3>
                  <p className="mt-2 text-sm font-bold text-charcoal">
                    {cmuAikidoClub.practice.days} · {cmuAikidoClub.practice.time}
                  </p>
                  <p className="mt-3 text-sm text-charcoal/75">
                    {cmuAikidoClub.practice.location}
                  </p>
                  <p className="mt-3 text-sm font-bold text-vermilion">
                    {cmuAikidoClub.practice.note}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7 flex items-start gap-3 text-sm text-charcoal/75">
              <MapPin className="mt-1 shrink-0 text-bamboo" size={20} aria-hidden="true" />
              <p>{cmuAikidoClub.address}</p>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {cmuAikidoClub.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  {link.label}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              ))}
              <a href={`mailto:${cmuAikidoClub.email}`} className="btn-primary">
                Email AikidoCMU
              </a>
            </div>
          </div>
        </div>

        {/* CMU Photo Gallery */}
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cmuGalleryPhotos.map((photo) => (
            <figure
              key={photo.src}
              className="surface card-hover overflow-hidden rounded-[1.5rem]"
            >
              <img
                src={photo.src}
                alt={photo.alt}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <figcaption className="p-5">
                <span className="text-lg font-bold text-ink">{photo.title}</span>
                <p className="mt-2 text-sm text-charcoal/72">{photo.caption}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </MotionSection>

      {/* Other Dojos */}
      <MotionSection id="other-dojos" className="container-shell scroll-mt-28 pb-20">
        <div className="mb-8 max-w-3xl">
          <p className="eyebrow">Other Dojos</p>
          <h2 className="section-title">Part of a wider Chiang Mai aikido network.</h2>
          <p className="section-copy">
            RenshinKan is one part of a broader aikido community in Chiang Mai
            and Thailand. Below are the key organisations and bodies that
            connect the dojo to the wider practice world.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {relatedDojos.map((dojo) => (
            <article
              key={dojo.name}
              className="surface card-hover rounded-[1.75rem] p-6 flex flex-col"
            >
              {dojo.logo ? (
                <div className="h-14 w-14 flex-none">
                  <img
                    src={dojo.logo}
                    alt={`${dojo.name} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-bamboo/10 text-bamboo">
                  <UsersRound size={22} aria-hidden="true" />
                </div>
              )}
              <h3 className="mt-5 text-2xl text-ink">{dojo.name}</h3>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50">
                {dojo.location}
              </p>
              <p className="mt-3 flex-1 text-sm text-charcoal/75">{dojo.description}</p>
              {dojo.url ? (
                <a
                  href={dojo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-vermilion transition hover:text-ink"
                >
                  Visit website
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : dojo.facebook ? (
                <a
                  href={dojo.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-vermilion transition hover:text-ink"
                >
                  Facebook page
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-[1.75rem] bg-bamboo/10 p-6 ring-1 ring-bamboo/20">
          <p className="text-sm text-charcoal/78">
            <span className="font-bold text-ink">Know of another connected dojo or organisation?</span>{" "}
            Get in touch and we'll add it here.{" "}
            <Link to="/contact" className="font-bold text-vermilion hover:text-ink transition">
              Contact us
            </Link>
          </p>
        </div>
      </MotionSection>
    </>
  );
}
