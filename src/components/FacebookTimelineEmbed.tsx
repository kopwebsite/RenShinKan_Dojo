import { ArrowUpRight, Facebook } from "lucide-react";
import { facebookTimeline } from "../data/siteContent";
import { useTranslation } from "../i18n";

const facebookPluginSrc = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
  facebookTimeline.pageUrl,
)}&tabs=timeline&width=500&height=600&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false&lazy=true`;

export function FacebookTimelineEmbed() {
  const { t } = useTranslation();

  return (
    <section className="relative -mx-5 overflow-hidden border-y border-ink/10 bg-paper/75 shadow-soft sm:mx-0 sm:rounded-[2rem] sm:border">
      <div className="absolute inset-0 bg-tatami opacity-60" aria-hidden="true" />
      <div className="relative grid lg:grid-cols-[260px_1fr] lg:items-start">

        {/* Info panel */}
        <div className="flex flex-col justify-between bg-ink/90 p-8 text-paper backdrop-blur-sm sm:p-10 lg:rounded-l-[2rem]">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-vermilion text-paper">
              <Facebook size={22} aria-hidden="true" />
            </div>
            <p className="eyebrow mt-8 text-mist/60">Community</p>
            <h2 className="mt-3 text-3xl leading-tight sm:text-4xl">
              Community Updates
            </h2>
            <p className="mt-5 text-base leading-7 text-paper/70">
              Follow recent dojo news, workshop announcements, class photos, and
              community moments from {t("common.brand")}.
            </p>
          </div>

          <a
            href={facebookTimeline.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary mt-10 border-paper/20 bg-paper/10 text-paper hover:border-paper/45 hover:text-paper"
          >
            Open Facebook Page
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>

        {/* Feed */}
        <div className="bg-white lg:rounded-r-[2rem] overflow-hidden">
          <iframe
            title={facebookTimeline.title}
            src={facebookPluginSrc}
            width="500"
            height="900"
            className="block h-[500px] w-full border-0 sm:h-[600px]"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            loading="lazy"
          />
          <p className="px-5 pb-4 pt-3 text-xs leading-5 text-charcoal/50">
            If the feed is blocked by your browser,{" "}
            <a
              href={facebookTimeline.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-vermilion transition hover:text-ink"
            >
              open the Facebook page directly
            </a>
            .
          </p>
        </div>

      </div>
    </section>
  );
}
