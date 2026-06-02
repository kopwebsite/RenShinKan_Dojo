import type { TranslationKey } from "../i18n";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

function key(path: string): TranslationKey {
  return path as TranslationKey;
}

function text(t: Translator, baseKey: string, field: string) {
  return t(key(`${baseKey}.${field}`));
}

export const facilityKeys = [
  "data.facilities.changingRooms",
  "data.facilities.bathrooms",
  "data.facilities.water",
  "data.facilities.weapons",
  "data.facilities.viewingDeck",
];

export const dojoPhotoKeys = [
  "data.dojoPhotos.koiPond",
  "data.dojoPhotos.garden",
  "data.dojoPhotos.courtyard",
  "data.dojoPhotos.trainingHall",
];

export const instructorKeys = [
  "data.instructors.sombat",
  "data.instructors.teerarat",
  "data.instructors.kop",
  "data.instructors.kittisak",
  "data.instructors.fuengwich",
  "data.instructors.siriphorn",
];

export const workshopKeys = [
  "data.workshops.beginningAikido",
  "data.workshops.fallingConfidence",
  "data.workshops.weaponsDistance",
];

export const aikidoBenefitKeys = [
  "data.aikido.benefits.discipline",
  "data.aikido.benefits.patience",
  "data.aikido.benefits.focus",
  "data.aikido.benefits.confidence",
  "data.aikido.benefits.posture",
  "data.aikido.benefits.coordination",
  "data.aikido.benefits.balance",
  "data.aikido.benefits.respect",
  "data.aikido.benefits.awareness",
];

export const aikidoChildKeys = [
  "data.aikido.children.speakUp",
  "data.aikido.children.selfControl",
  "data.aikido.children.falling",
];

export const aikidoAdultKeys = [
  "data.aikido.adults.move",
  "data.aikido.adults.mind",
  "data.aikido.adults.community",
];

export const aikidoTimelineKeys = [
  "data.aikido.timeline.earlyLife",
  "data.aikido.timeline.hokkaido",
  "data.aikido.timeline.omoto",
  "data.aikido.timeline.tokyo",
  "data.aikido.timeline.iwama",
  "data.aikido.timeline.hombu",
  "data.aikido.timeline.international",
  "data.aikido.timeline.thailand",
  "data.aikido.timeline.renbukan",
  "data.aikido.timeline.thaiNetwork",
  "data.aikido.timeline.chiangMai",
];

export const communityValueKeys = [
  "data.community.values.respect",
  "data.community.values.safety",
  "data.community.values.peace",
  "data.community.values.growth",
];

export const pcfPhotoKeys = [
  "data.community.pcfPhotos.liblab",
  "data.community.pcfPhotos.learning",
  "data.community.pcfPhotos.safety",
  "data.community.pcfPhotos.sombat",
];

export const cmuPhotoKeys = [
  "data.community.cmuPhotos.practice",
  "data.community.cmuPhotos.history",
  "data.community.cmuPhotos.roots",
  "data.community.cmuPhotos.falling",
  "data.community.cmuPhotos.blend",
];

export const relatedDojoKeys = [
  "data.community.relatedDojos.thaiAikikai",
  "data.community.relatedDojos.aikidoCmu",
  "data.community.relatedDojos.aiDojo",
  "data.community.relatedDojos.allDojo",
  "data.community.relatedDojos.aikidoKids",
];

export function translateTitleDescription<T extends { title: string; description: string }>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    title: text(t, baseKey, "title"),
    description: text(t, baseKey, "description"),
  };
}

export function translateTitleCaption<T extends { title: string; caption: string; alt?: string }>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    title: text(t, baseKey, "title"),
    caption: text(t, baseKey, "caption"),
    alt: item.alt == null ? item.alt : text(t, baseKey, "alt"),
  };
}

export function translateDojoPhoto<T extends { title: string; description: string; alt: string }>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    title: text(t, baseKey, "title"),
    description: text(t, baseKey, "description"),
    alt: text(t, baseKey, "alt"),
  };
}

export function translateInstructor<T extends {
  role: string;
  rank: string;
  trainingBackground: string;
  imageAlt?: string;
}>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    role: text(t, baseKey, "role"),
    rank: text(t, baseKey, "rank"),
    trainingBackground: text(t, baseKey, "trainingBackground"),
    imageAlt: item.imageAlt == null ? item.imageAlt : text(t, baseKey, "imageAlt"),
  };
}

export function translateWorkshop<T extends {
  title: string;
  date: string;
  time: string;
  audience: string;
  description: string;
}>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    title: text(t, baseKey, "title"),
    date: text(t, baseKey, "date"),
    time: text(t, baseKey, "time"),
    audience: text(t, baseKey, "audience"),
    description: text(t, baseKey, "description"),
  };
}

export function translateTimelineItem<T extends { title: string; description: string }>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    title: text(t, baseKey, "title"),
    description: text(t, baseKey, "description"),
  };
}

export function translateRelatedDojo<T extends { name: string; description: string; location: string }>(
  t: Translator,
  item: T,
  baseKey: string,
) {
  return {
    ...item,
    name: text(t, baseKey, "name"),
    description: text(t, baseKey, "description"),
    location: text(t, baseKey, "location"),
  };
}
