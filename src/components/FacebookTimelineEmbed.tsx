import { ArrowUpRight, Facebook } from "lucide-react";
import { facebookTimeline } from "../data/siteContent";

const updateHighlights = [
  "Class updates",
  "Workshop announcements",
  "Community photos",
  "Dojo news",
];

const facebookPluginSrc = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
  facebookTimeline.pageUrl,
)}&tabs=timeline&width=500&height=820&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=false&lazy=true`;

export function FacebookTimelineEmbed() {
  return (
    <section className="relative -mx-5 overflow-hidden border-y border-ink/10 bg-paper/75 shadow-soft sm:mx-0 sm:rounded-[2rem] sm:border">
      <div className="absolute inset-0 bg-tatami opacity-60" aria-hidden="true" />
      <div className="relative grid gap-6 p-4 sm:gap-8 sm:p-8 lg:grid-cols-[0.82fr_1.18fr] lg:p-10 xl:p-12">
        <div className="flex flex-col justify-between rounded-[1.5rem] bg-ink p-6 text-paper sm:p-8">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-vermilion text-paper">
              <Facebook size={22} aria-hidden="true" />
            </div>
            <p className="eyebrow mt-7 text-mist/70">Community</p>
            <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">
              Community Updates
            </h2>
            <p className="mt-5 text-base leading-7 text-paper/76 sm:text-lg">
              Follow recent dojo news, workshop announcements, class photos, and
              community moments from RenshinKan Dojo.
            </p>

            <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {updateHighlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-center gap-3 rounded-full border border-paper/12 bg-paper/8 px-4 py-3 text-sm font-bold text-paper/88"
                >
                  <span className="h-2 w-2 rounded-full bg-vermilion" aria-hidden="true" />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>

          <a
            href={facebookTimeline.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary mt-8 border-paper/20 bg-paper/10 text-paper hover:border-paper/45 hover:text-paper"
          >
            Open Facebook Page
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>

        <div className="rounded-[1.5rem] border border-ink/10 bg-paper/90 p-3 shadow-line sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">From Facebook</p>
              <h3 className="mt-2 text-3xl leading-tight text-ink">
                Recent posts from the dojo
              </h3>
            </div>
            <p className="text-sm font-semibold text-charcoal/60">
              {facebookTimeline.pageName}
            </p>
          </div>

          <div className="min-h-[680px] overflow-hidden rounded-[1.25rem] border border-ink/10 bg-white shadow-line sm:min-h-[820px]">
            <iframe
              title={facebookTimeline.title}
              src={facebookPluginSrc}
              width="500"
              height="820"
              className="block h-[680px] w-full border-0 sm:h-[820px]"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              loading="lazy"
            />
          </div>

          <p className="mt-4 text-sm leading-6 text-charcoal/65">
            Facebook controls what appears inside this timeline. If the feed is
            blocked by privacy settings or browser extensions,{" "}
            <a
              href={facebookTimeline.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-vermilion transition hover:text-ink"
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
