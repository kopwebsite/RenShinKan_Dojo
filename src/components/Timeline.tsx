import { aikidoTimeline } from "../data/siteContent";
import { useTranslation } from "../i18n";
import { aikidoTimelineKeys, translateTimelineItem } from "../utils/siteContentTranslations";

export function Timeline() {
  const { t } = useTranslation();
  const localizedTimeline = aikidoTimeline.map((item, index) =>
    translateTimelineItem(t, item, aikidoTimelineKeys[index]),
  );

  return (
    <ol className="era-scroll">
      {localizedTimeline.map((item) => (
        <li key={`${item.year}-${item.title}`}>
          <span className="era-scroll__mark" aria-hidden="true" />
          <p className="era-scroll__year">{item.year}</p>
          <div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
