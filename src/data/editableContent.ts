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

export const historyMedia: EditableMedia[] = [
  {
    id: "history-stage-demo",
    type: "image",
    src: assetPath("/past-events/aikido_demonstration_stage_action_01.jpg"),
    alt: "Aikido practitioners demonstrating a technique on a public stage.",
    title: "Stage Demonstration",
    caption: "Public demonstration showing movement, timing, and partner care.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "history-cleanup-day",
    type: "image",
    src: assetPath("/past-events/cleanupday.jpg"),
    alt: "Members gathered for a dojo cleanup day.",
    title: "Dojo Cleanup Day",
    caption: "Taking care of our training space together.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "history-old-cmu",
    type: "image",
    src: assetPath("/past-events/training at old cmu center.jpg"),
    alt: "Aikido training at the old CMU center.",
    title: "Training At Old CMU Center",
    caption: "Early training days at the original CMU location.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "history-community",
    type: "image",
    src: assetPath("/past-events/463872355_27264339496544926_6495392107844493594_n.jpg"),
    alt: "Community aikido practice at RenshinKan.",
    title: "Community Practice",
    caption: "Aikido shared with the community.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
];

export const onTheMatMedia: EditableMedia[] = [
  {
    id: "mat-wide-class",
    type: "image",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_01.jpg"),
    alt: "Large class group seated on the RenshinKan Dojo mat.",
    title: "Wide Class Group",
    caption: "A full class portrait inside the RenshinKan training hall.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "mat-yellow-group",
    type: "image",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_yellow_mat_01.jpg"),
    alt: "Aikido students in white uniforms seated together on the dojo mat.",
    title: "Yellow Mat Group",
    caption: "Students gathered after class on the yellow center mat.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "mat-practice-01",
    type: "image",
    src: assetPath("/renshinkan-gallery/class-photos/on_the_mat_01.jpg"),
    alt: "RenshinKan students on the mat.",
    title: "On The Mat",
    caption: "Students and instructors gathered on the mat after practice.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "mat-practice-02",
    type: "image",
    src: assetPath("/renshinkan-gallery/class-photos/on_the_mat_02.jpg"),
    alt: "Aikido training on the mat at RenshinKan Dojo.",
    title: "Mat Practice",
    caption: "A moment captured during training at RenshinKan.",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
];

export const examAnnouncement: ExamAnnouncement = {
  text: "Next examination schedule will be posted after the next grading date is confirmed.",
  updatedAt: "2026-05-01",
};

export const passedTestStudents: PassedTestStudent[] = [
  {
    id: "certificate-mixed-group",
    image: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_01.jpg"),
    name: "Recent Grading Group",
    caption: "Students receiving certificates after a belt examination.",
    date: "May 2026",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "certificate-three-students",
    image: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_three_students_01.jpg"),
    name: "Certificate Presentation",
    caption: "A certificate presentation moment for three students.",
    date: "May 2026",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
  {
    id: "certificate-pair",
    image: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_01.jpg"),
    name: "Student Pair",
    caption: "A belt graduation certificate photo with two students.",
    date: "May 2026",
    dateAdded: "2026-05-01",
    objectPosition: "center",
  },
];

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
