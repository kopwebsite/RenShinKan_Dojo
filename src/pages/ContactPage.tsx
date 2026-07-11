import { ArrowUpRight, Facebook, MapPin } from "lucide-react";
import { MotionSection } from "../components/MotionSection";
import { ResponsiveImage } from "../components/ResponsiveImage";
import { googleMapsUrl, siteInfo } from "../data/siteMeta";
import { useTranslation, type TranslationKey } from "../i18n";
import { assetPath } from "../utils/assetPath";

export function ContactPage() {
  const { t } = useTranslation();
  const visitItems: TranslationKey[] = ["contact.before.item1", "contact.before.item2", "contact.before.item3", "contact.before.item4"];
  return <>
    <MotionSection id="visit" className="page-opening container-shell scroll-mt-24"><div><p className="folio-mark">Visitor's note · Hang Dong</p><p className="eyebrow">{t("contact.intro.eyebrow")}</p><h1>{t("contact.intro.title")}</h1><p>{t("contact.intro.copy", { address: siteInfo.address })}</p></div><figure><ResponsiveImage src={assetPath("/pcf-aikido/dojo-exterior.webp")} alt="RenShinKan Dojo entrance and garden" imgClassName="h-full w-full object-cover" loading="eager" /><figcaption>The dojo entrance · Baan Waen</figcaption></figure></MotionSection>
    <MotionSection className="container-shell contact-ledger">
      <section><span>01</span><MapPin size={22} /><h2>Directions</h2><address>{siteInfo.address}</address><a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-link">Open Google Maps <ArrowUpRight size={15} /></a></section>
      <section><span>02</span><Facebook size={22} /><h2>Class visit enquiries</h2><p>{t("contact.message.copy")}</p><a href={siteInfo.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-link">{t("common.messageUsFacebook")} <ArrowUpRight size={15} /></a></section>
      <section><span>03</span><h2>{t("contact.before.title")}</h2><ol>{visitItems.map((item, index) => <li key={item}><b>{index + 1}</b>{t(item)}</li>)}</ol></section>
    </MotionSection>
  </>;
}
