import { assetPath } from "../utils/assetPath";

export type EditableMedia = {
  id: string;
  type: "image" | "video";
  src: string;
  alt?: string;
  title?: string;
  caption?: string;
  dateAdded?: string;
  objectPosition?: string;
};

export type DojoUpdate = {
  id: string;
  date: string;
  subject: string;
  summary: string;
  body: string;
  media: EditableMedia[];
  mainImage: string;
  slug: string;
};

export type ExamAnnouncement = {
  text: string;
  updatedAt: string;
};

export type PassedTestStudent = {
  id: string;
  image: string;
  name?: string;
  caption?: string;
  date?: string;
  dateAdded: string;
  objectPosition?: string;
};

export const dojoUpdates: DojoUpdate[] = [
  {
    id: "belt-promotion-day-2026",
    date: "May 2026",
    subject: "Belt Promotion Day",
    summary:
      "Students demonstrated their techniques and received certificates at the most recent examination day.",
    body:
      "Students demonstrated steady practice, safe ukemi, and careful partner work during the most recent examination day. Thank you to the instructors, families, and senior students who helped make the testing day calm and supportive.",
    slug: "belt-promotion-day-2026",
    mainImage: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_01.jpg"),
    media: [
      {
        id: "belt-promotion-main",
        type: "image",
        src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_01.jpg"),
        alt: "Students seated with certificates after a belt graduation.",
        title: "Certificate Presentation",
        caption: "Students receiving certificates after examination.",
        objectPosition: "center",
      },
      {
        id: "belt-promotion-group",
        type: "image",
        src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_large_class_group_01.jpg"),
        alt: "Large class group gathered after belt examination.",
        title: "Class Group",
        caption: "A group moment from the graduation day.",
        objectPosition: "center",
      },
    ],
  },
  {
    id: "community-practice-2026",
    date: "May 2026",
    subject: "Community Practice",
    summary:
      "An open practice session brought together students at all levels for shared training.",
    body:
      "Students from different levels trained together with attention to timing, spacing, and mutual care. These shared sessions help beginners see the wider dojo community and give experienced students a chance to support steady practice.",
    slug: "community-practice-2026",
    mainImage: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_01.jpg"),
    media: [
      {
        id: "community-practice-wide",
        type: "image",
        src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_01.jpg"),
        alt: "Large class group seated on the RenshinKan Dojo mat.",
        title: "Together On The Mat",
        caption: "A full class portrait inside the training hall.",
        objectPosition: "center",
      },
    ],
  },
  {
    id: "workshop-visit-2026",
    date: "May 2026",
    subject: "Workshop Visit",
    summary:
      "A visiting instructor joined the dojo for focused practice and shared reflections.",
    body:
      "The dojo welcomed a visiting instructor for a focused practice session. Students worked on posture, distance, and calm receiving, then gathered after class for questions and reflections.",
    slug: "workshop-visit-2026",
    mainImage: assetPath("/past-events/aikido_event_large_group_stage_01.jpg"),
    media: [
      {
        id: "workshop-visit-group",
        type: "image",
        src: assetPath("/past-events/aikido_event_large_group_stage_01.jpg"),
        alt: "Large aikido group photo taken on a public stage.",
        title: "Shared Practice",
        caption: "A group photo from a past demonstration and community event.",
        objectPosition: "center",
      },
    ],
  },
];

function createNumberedMedia(
  count: number,
  idPrefix: string,
  assetDir: string,
  filePrefix: string,
  altPrefix: string,
): EditableMedia[] {
  return Array.from({ length: count }, (_, index) => {
    const photoNumber = index + 1;

    return {
      id: `${idPrefix}-${String(photoNumber).padStart(3, "0")}`,
      type: "image",
      src: assetPath(`${assetDir}/${filePrefix}-${String(photoNumber).padStart(3, "0")}.jpg`),
      alt: `${altPrefix} ${photoNumber}.`,
      dateAdded: "2026-05-27",
      objectPosition: "center",
    };
  });
}

export const historyMedia: EditableMedia[] = createNumberedMedia(
  40,
  "history-photo",
  "/past-events/misc-gallery",
  "history-photo",
  "RenshinKan dojo history photo",
);

export const onTheMatMedia: EditableMedia[] = createNumberedMedia(
  14,
  "group-photo",
  "/renshinkan-gallery/group-photos",
  "group-photo",
  "RenshinKan group photo on the mat",
);

export const examAnnouncement: ExamAnnouncement = {
  text: "Next examination schedule will be posted after the next grading date is confirmed.",
  updatedAt: "2026-05-01",
};

export const passedTestStudents: PassedTestStudent[] = Array.from(
  { length: 109 },
  (_, index) => {
    const photoNumber = index + 1;
    const paddedPhotoNumber = String(photoNumber).padStart(3, "0");

    return {
      id: `belt-ceremony-${paddedPhotoNumber}`,
      image: assetPath(`/renshinkan-gallery/belt-ceremony/belt-ceremony-${paddedPhotoNumber}.jpg`),
      dateAdded: "2026-05-27",
      objectPosition: "center",
    };
  },
);

export function getRecentDojoUpdates(limit = 3) {
  return [...dojoUpdates]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, limit);
}

export function sendNewsletterUpdatePlaceholder(update: DojoUpdate) {
  const payload = {
    subject: update.subject,
    summary: update.summary,
    updateUrl: `/newsletter#${update.slug}`,
    mainImage: update.mainImage,
    date: update.date,
  };

  // Connect MailerLite, Brevo, Mailchimp, Resend, SendGrid, or another
  // provider here from a backend/serverless function. Do not call an email
  // provider directly from the browser because API keys would be public.
  return payload;
}
