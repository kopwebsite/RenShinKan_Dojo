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
  "RenShinKan Dojo history photo",
).filter((item) => item.id !== "history-photo-001");

export const onTheMatMedia: EditableMedia[] = createNumberedMedia(
  14,
  "group-photo",
  "/renshinkan-gallery/group-photos",
  "group-photo",
  "RenShinKan group photo on the mat",
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
