import { RANKS, normalizeRank } from "../../shared/ranks";
import { displayDateToCanonical, isCanonicalDate } from "../../shared/date";
import { NEWSLETTER_CATEGORIES } from "../../shared/newsletter";

// Guided flows are answered entirely by this server module. The model is asked
// once, at the very start, only to work out which flow the administrator wants.
// After that every question, every acknowledgement, every validation message and
// every summary below is wording written into this file in English and Thai, and
// no answer, no question and no database result is ever sent to the model. The
// flow only ever ends by preparing an ordinary Admin Auggie proposal, so the
// existing permission checks, dojo limits, server-side rechecks and exact typed
// confirmation still decide whether anything is written.

export type FlowLocale = "en" | "th";

export type FlowText = { en: string; th: string };

export function flowText(locale: FlowLocale, value: FlowText) {
  return locale === "th" ? value.th : value.en;
}

export const FLOW_IDS = [
  "create_student",
  "create_newsletter",
  "add_training_hours",
  "record_exam_result",
] as const;

export type FlowId = (typeof FLOW_IDS)[number];

export function isFlowId(value: unknown): value is FlowId {
  return (
    typeof value === "string" && (FLOW_IDS as readonly string[]).includes(value)
  );
}

type FieldType =
  | "name"
  | "thaiName"
  | "rank"
  | "date"
  | "hours"
  | "yesno"
  | "choice"
  | "studentId"
  | "webAddress"
  | "shortText"
  | "longText";

export type FlowField = {
  key: string;
  type: FieldType;
  optional?: boolean;
  ask: FlowText;
  label: FlowText;
  hint?: FlowText;
  choices?: readonly string[];
  maxLength?: number;
  // Set on the one field the server can answer by itself when only a single
  // choice is possible, so the administrator is never asked a question that has
  // exactly one valid answer.
  autoResolve?: "dojo";
};

export type FlowDefinition = {
  id: FlowId;
  title: FlowText;
  opening: FlowText;
  fields: FlowField[];
};

// The dojos this administrator may actually use. When the list holds one dojo,
// the dojo question is answered by the server instead of being asked.
export type FlowRuntime = { dojos: Array<{ id: string; name: string }> };

export type FlowState = {
  flowId: FlowId;
  answers: Record<string, string>;
  order: string[];
  startedAt: string;
};

// --- Wording ----------------------------------------------------------------

const RANK_LIST = RANKS.join(", ");

export const FLOW_WORDING = {
  opening: (count: number): FlowText => ({
    en: `Happy to help. I need a few details from you — about ${count} short question${count === 1 ? "" : "s"}. You can answer them one at a time, or give me several at once on separate lines.`,
    th: `ยินดีช่วยเหลือ ขอรายละเอียดสักเล็กน้อย ประมาณ ${count} คำถามสั้น ๆ ตอบทีละข้อได้ หรือจะตอบหลายข้อพร้อมกันโดยขึ้นบรรทัดใหม่ก็ได้`,
  }),
  guide: {
    en: 'You can type "back" to change your last answer, or "cancel" to stop.',
    th: 'พิมพ์ "ย้อนกลับ" เพื่อแก้คำตอบล่าสุด หรือพิมพ์ "ยกเลิก" เพื่อหยุด',
  } as FlowText,
  optional: {
    en: 'This one is optional — type "skip" if you would rather leave it out.',
    th: 'ข้อนี้ไม่บังคับ พิมพ์ "ข้าม" ได้หากไม่ต้องการกรอก',
  } as FlowText,
  progress: (step: number, total: number): FlowText => ({
    en: `Question ${step} of ${total}`,
    th: `คำถามที่ ${step} จาก ${total}`,
  }),
  // A short, plain acknowledgement so the panel does not repeat one phrase over
  // and over. The choice is made from the answer count, never by a model.
  acknowledgement: (index: number): FlowText =>
    [
      { en: "Thank you.", th: "ขอบคุณ" },
      { en: "Got it.", th: "รับทราบ" },
      { en: "Thanks.", th: "ขอบคุณ" },
      { en: "Noted.", th: "บันทึกไว้แล้ว" },
    ][index % 4],
  cancelled: {
    en: "Cancelled. Nothing was saved, and nothing was changed. Ask me again whenever you are ready.",
    th: "ยกเลิกแล้ว ไม่มีการบันทึกและไม่มีการเปลี่ยนแปลงใด ๆ หากพร้อมเมื่อใดสอบถามได้เสมอ",
  } as FlowText,
  cancelHeading: { en: "Cancelled", th: "ยกเลิกแล้ว" } as FlowText,
  nothingToCancel: {
    en: "There is nothing in progress, so there is nothing to cancel.",
    th: "ขณะนี้ไม่มีรายการที่ทำค้างไว้ จึงไม่มีสิ่งที่ต้องยกเลิก",
  } as FlowText,
  backAtStart: {
    en: "We are still on the first question, so there is nothing to go back to.",
    th: "ขณะนี้ยังอยู่ที่คำถามแรก จึงยังไม่มีคำตอบให้ย้อนกลับ",
  } as FlowText,
  backDone: {
    en: "Of course. Let us change that one.",
    th: "ได้เลย มาแก้ข้อนั้นกัน",
  } as FlowText,
  skipNotAllowed: {
    en: "I do need this one, sorry. Could you give me an answer?",
    th: "ข้อนี้จำเป็นต้องกรอก ขออนุญาตถามอีกครั้ง",
  } as FlowText,
  resumed: {
    en: "Welcome back. We can carry on from where you left off.",
    th: "ยินดีต้อนรับกลับมา เราทำต่อจากจุดเดิมได้เลย",
  } as FlowText,
  summaryHeading: { en: "Please check this", th: "โปรดตรวจสอบ" } as FlowText,
  summaryLead: (phrase: string): FlowText => ({
    en: `Here is everything I have. Please read it once. If it is right, type ${phrase} in the box below and press the confirm button. Nothing is saved until you do.`,
    th: `นี่คือข้อมูลทั้งหมดที่ได้รับ โปรดตรวจสอบอีกครั้ง หากถูกต้อง พิมพ์ ${phrase} ในช่องด้านล่างแล้วกดปุ่มยืนยัน จะยังไม่มีการบันทึกจนกว่าคุณจะยืนยัน`,
  }),
  notProvided: { en: "not given", th: "ไม่ได้ระบุ" } as FlowText,
  sensitive: {
    en: "I would rather not keep that kind of private detail here. Please add it on the normal administration page instead, where it is handled properly. We can carry on with the rest.",
    th: "ขออนุญาตไม่เก็บข้อมูลส่วนตัวลักษณะนี้ไว้ที่นี่ โปรดกรอกในหน้าผู้ดูแลตามปกติซึ่งจัดการข้อมูลนี้ได้อย่างเหมาะสม ส่วนที่เหลือเราทำต่อได้",
  } as FlowText,
  expired: {
    en: "That earlier conversation has been cleared because it sat unused for a while. Nothing was saved. We can start again whenever you like.",
    th: "บทสนทนาก่อนหน้าถูกล้างแล้วเนื่องจากไม่ได้ใช้งานเป็นเวลานาน ไม่มีการบันทึกใด ๆ เริ่มใหม่ได้ทุกเมื่อ",
  } as FlowText,
  startOverConfirm: {
    en: "You are part way through something. Starting over will clear your answers so far. Nothing that you have already saved is affected.",
    th: "คุณกำลังทำรายการค้างอยู่ การเริ่มใหม่จะล้างคำตอบที่กรอกไว้ ข้อมูลที่บันทึกไปแล้วจะไม่ได้รับผลกระทบ",
  } as FlowText,
  startedOver: {
    en: "All cleared. We are starting fresh.",
    th: "ล้างข้อมูลเรียบร้อย เริ่มใหม่ได้เลย",
  } as FlowText,
};

// --- Flow definitions -------------------------------------------------------

const CREATE_STUDENT: FlowDefinition = {
  id: "create_student",
  title: { en: "New student profile", th: "สร้างประวัตินักเรียนใหม่" },
  opening: {
    en: "Let us make a new student profile.",
    th: "มาสร้างประวัตินักเรียนใหม่กัน",
  },
  fields: [
    {
      key: "englishName",
      type: "name",
      maxLength: 120,
      ask: {
        en: "First, what is the student's name in English?",
        th: "ข้อแรก ชื่อนักเรียนเป็นภาษาอังกฤษว่าอย่างไร",
      },
      label: { en: "Name in English", th: "ชื่อภาษาอังกฤษ" },
    },
    {
      key: "thaiName",
      type: "thaiName",
      optional: true,
      maxLength: 120,
      ask: {
        en: "And the name in Thai?",
        th: "แล้วชื่อภาษาไทยว่าอย่างไร",
      },
      label: { en: "Name in Thai", th: "ชื่อภาษาไทย" },
    },
    {
      key: "dojoId",
      type: "choice",
      autoResolve: "dojo",
      ask: { en: "Which dojo is this student joining?", th: "นักเรียนเข้าโดโจใด" },
      label: { en: "Dojo", th: "โดโจ" },
    },
    {
      key: "currentRank",
      type: "rank",
      ask: {
        en: "What rank is the student starting at?",
        th: "นักเรียนเริ่มต้นที่ระดับใด",
      },
      hint: {
        en: `Most new students start at Unranked. The ranks are: ${RANK_LIST}.`,
        th: `นักเรียนใหม่ส่วนใหญ่เริ่มที่ Unranked ระดับทั้งหมดคือ ${RANK_LIST}`,
      },
      label: { en: "Rank", th: "ระดับ" },
    },
    {
      key: "dojoJoinedDate",
      type: "date",
      optional: true,
      ask: {
        en: "What date did the student join the dojo?",
        th: "นักเรียนเข้าร่วมโดโจวันที่เท่าใด",
      },
      hint: {
        en: "Please write it as DD/MM/YYYY, for example 15/01/2026. If you skip this, today's date is used.",
        th: "โปรดพิมพ์เป็น วว/ดด/ปปปป เช่น 15/01/2026 หากข้ามจะใช้วันที่วันนี้",
      },
      label: { en: "Joined the dojo", th: "วันที่เข้าร่วมโดโจ" },
    },
    {
      key: "currentTrainingHours",
      type: "hours",
      optional: true,
      ask: {
        en: "Last one. How many training hours should the student start with?",
        th: "ข้อสุดท้าย ให้เริ่มต้นด้วยชั่วโมงฝึกเท่าใด",
      },
      hint: {
        en: "Leave this out and the student starts at zero.",
        th: "หากข้ามข้อนี้ นักเรียนจะเริ่มต้นที่ศูนย์ชั่วโมง",
      },
      label: { en: "Starting training hours", th: "ชั่วโมงฝึกเริ่มต้น" },
    },
  ],
};

const ADD_TRAINING_HOURS: FlowDefinition = {
  id: "add_training_hours",
  title: { en: "Add training hours", th: "เพิ่มชั่วโมงฝึก" },
  opening: {
    en: "Let us add training hours to a student.",
    th: "มาเพิ่มชั่วโมงฝึกให้นักเรียนกัน",
  },
  fields: [
    {
      key: "studentId",
      type: "studentId",
      ask: {
        en: "First, which student? Please give me the Student ID.",
        th: "ข้อแรก นักเรียนคนใด โปรดระบุรหัสนักเรียน",
      },
      hint: {
        en: "It looks like RSK-1001. If you do not have it, ask me to find the student by name first.",
        th: "รูปแบบเช่น RSK-1001 หากไม่ทราบ ให้ค้นหานักเรียนจากชื่อก่อนได้",
      },
      label: { en: "Student", th: "นักเรียน" },
    },
    {
      key: "hours",
      type: "hours",
      ask: { en: "How many hours should I add?", th: "ต้องการเพิ่มกี่ชั่วโมง" },
      hint: {
        en: "Anything from a quarter of an hour up to 1,000 hours.",
        th: "ตั้งแต่ 0.25 ชั่วโมง จนถึง 1,000 ชั่วโมง",
      },
      label: { en: "Hours to add", th: "ชั่วโมงที่เพิ่ม" },
    },
    {
      key: "entryDate",
      type: "date",
      ask: {
        en: "What date was the training?",
        th: "ฝึกในวันที่เท่าไร",
      },
      hint: {
        en: "Use YYYY-MM-DD, for example 2026-08-10.",
        th: "ใช้รูปแบบ YYYY-MM-DD เช่น 2026-08-10",
      },
      label: { en: "Training date", th: "วันที่ฝึก" },
    },
    {
      key: "location",
      type: "shortText",
      optional: true,
      maxLength: 200,
      ask: {
        en: "Where was the training? Last question.",
        th: "ฝึกที่ใด เป็นคำถามสุดท้าย",
      },
      label: { en: "Where", th: "สถานที่" },
    },
  ],
};

const RECORD_EXAM_RESULT: FlowDefinition = {
  id: "record_exam_result",
  title: { en: "Record an examination result", th: "บันทึกผลการสอบ" },
  opening: {
    en: "Let us record an examination result.",
    th: "มาบันทึกผลการสอบกัน",
  },
  fields: [
    {
      key: "studentId",
      type: "studentId",
      ask: {
        en: "First, which student? Please give me the Student ID.",
        th: "ข้อแรก นักเรียนคนใด โปรดระบุรหัสนักเรียน",
      },
      hint: {
        en: "It looks like RSK-1001. If you do not have it, ask me to find the student by name first.",
        th: "รูปแบบเช่น RSK-1001 หากไม่ทราบ ให้ค้นหานักเรียนจากชื่อก่อนได้",
      },
      label: { en: "Student", th: "นักเรียน" },
    },
    {
      key: "attemptedRank",
      type: "rank",
      ask: {
        en: "Which rank did the student go for?",
        th: "นักเรียนสอบเพื่อเลื่อนไประดับใด",
      },
      hint: {
        en: `It has to be higher than the student's rank now. The ranks are: ${RANK_LIST}.`,
        th: `ต้องสูงกว่าระดับปัจจุบันของนักเรียน ระดับทั้งหมดคือ ${RANK_LIST}`,
      },
      label: { en: "Rank attempted", th: "ระดับที่สอบ" },
    },
    {
      key: "passed",
      type: "yesno",
      ask: { en: "Did the student pass?", th: "นักเรียนสอบผ่านหรือไม่" },
      hint: { en: 'Please answer yes or no.', th: 'ตอบว่า ใช่ หรือ ไม่' },
      label: { en: "Result", th: "ผลการสอบ" },
    },
    {
      key: "examinationDate",
      type: "date",
      ask: {
        en: "What date was the examination?",
        th: "สอบวันที่เท่าใด",
      },
      hint: {
        en: "Please write it as DD/MM/YYYY, for example 14/12/2025.",
        th: "โปรดพิมพ์เป็น วว/ดด/ปปปป เช่น 14/12/2025",
      },
      label: { en: "Examination date", th: "วันที่สอบ" },
    },
    {
      key: "location",
      type: "shortText",
      maxLength: 200,
      ask: {
        en: "Where was the examination held? Last question.",
        th: "จัดสอบที่ใด เป็นคำถามสุดท้าย",
      },
      label: { en: "Where", th: "สถานที่" },
    },
  ],
};

const CREATE_NEWSLETTER: FlowDefinition = {
  id: "create_newsletter",
  title: { en: "New newsletter", th: "สร้างจดหมายข่าวใหม่" },
  opening: {
    en: "Let us write a new newsletter. I will save it as a draft, so nothing goes on the website or to anybody's email until you publish or send it yourself.",
    th: "มาสร้างจดหมายข่าวใหม่กัน ระบบจะบันทึกเป็นฉบับร่าง จะยังไม่ขึ้นเว็บไซต์และยังไม่ส่งอีเมลถึงใคร จนกว่าคุณจะเผยแพร่หรือส่งด้วยตนเอง",
  },
  fields: [
    {
      key: "title",
      type: "shortText",
      maxLength: 160,
      ask: {
        en: "First, what is the title?",
        th: "ข้อแรก หัวเรื่องคืออะไร",
      },
      label: { en: "Title", th: "หัวเรื่อง" },
    },
    {
      key: "summary",
      type: "shortText",
      maxLength: 500,
      ask: {
        en: "Please give me a short summary, one or two sentences.",
        th: "ขอบทสรุปสั้น ๆ ประมาณหนึ่งถึงสองประโยค",
      },
      label: { en: "Summary", th: "บทสรุป" },
    },
    {
      key: "body",
      type: "longText",
      maxLength: 1400,
      ask: {
        en: "Now the newsletter itself. Please write the text.",
        th: "ต่อไปเป็นเนื้อหาจดหมายข่าว โปรดพิมพ์ข้อความ",
      },
      hint: {
        en: "You can add pictures and tidy the layout afterwards in the website editor.",
        th: "สามารถเพิ่มรูปภาพและจัดรูปแบบเพิ่มเติมได้ในหน้าแก้ไขเว็บไซต์ภายหลัง",
      },
      label: { en: "Newsletter text", th: "เนื้อหา" },
    },
    {
      key: "category",
      type: "choice",
      choices: NEWSLETTER_CATEGORIES,
      ask: { en: "Which category does it belong to?", th: "อยู่ในหมวดหมู่ใด" },
      hint: {
        en: `Please choose one of: ${NEWSLETTER_CATEGORIES.join(", ")}.`,
        th: `โปรดเลือกหนึ่งรายการจาก ${NEWSLETTER_CATEGORIES.join(", ")}`,
      },
      label: { en: "Category", th: "หมวดหมู่" },
    },
    {
      key: "date",
      type: "date",
      ask: { en: "What date should it carry?", th: "ให้ใช้วันที่ใด" },
      hint: {
        en: "Please write it as DD/MM/YYYY, for example 05/08/2026.",
        th: "โปรดพิมพ์เป็น วว/ดด/ปปปป เช่น 05/08/2026",
      },
      label: { en: "Date", th: "วันที่" },
    },
    {
      key: "webAddress",
      type: "webAddress",
      optional: true,
      maxLength: 100,
      ask: {
        en: "Last one. What web address would you like? Small letters and hyphens only.",
        th: "ข้อสุดท้าย ต้องการที่อยู่เว็บแบบใด ใช้ตัวพิมพ์เล็กและเครื่องหมายขีดเท่านั้น",
      },
      hint: {
        en: "For example summer-training-camp. Skip this and I will make one from the title.",
        th: "เช่น summer-training-camp หากข้ามระบบจะสร้างให้จากหัวเรื่อง",
      },
      label: { en: "Web address", th: "ที่อยู่เว็บ" },
    },
  ],
};

const DEFINITIONS: Record<FlowId, FlowDefinition> = {
  create_student: CREATE_STUDENT,
  create_newsletter: CREATE_NEWSLETTER,
  add_training_hours: ADD_TRAINING_HOURS,
  record_exam_result: RECORD_EXAM_RESULT,
};

export function flowDefinition(flowId: FlowId) {
  return DEFINITIONS[flowId];
}

// --- Commands ---------------------------------------------------------------

const CANCEL_WORDS = [
  "cancel",
  "stop",
  "quit",
  "never mind",
  "nevermind",
  "forget it",
  "don't do that",
  "do not do that",
  "ยกเลิก",
  "หยุด",
  "เลิก",
  "ไม่เอาแล้ว",
];
const BACK_WORDS = [
  "back",
  "go back",
  "previous",
  "undo",
  "change that",
  "ย้อนกลับ",
  "กลับ",
  "ก่อนหน้า",
  "แก้ไข",
];
const SKIP_WORDS = [
  "skip",
  "none",
  "no",
  "n/a",
  "na",
  "nothing",
  "leave it",
  "ข้าม",
  "ไม่มี",
  "ไม่ระบุ",
  "ผ่าน",
];

function normalizedCommand(raw: string) {
  return raw
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ");
}

export type FlowCommand = "cancel" | "back" | "skip" | null;

export function flowCommand(raw: string): FlowCommand {
  const value = normalizedCommand(raw);
  if (!value) return null;
  if (CANCEL_WORDS.includes(value)) return "cancel";
  if (BACK_WORDS.includes(value)) return "back";
  if (SKIP_WORDS.includes(value)) return "skip";
  return null;
}

// --- Field handling ---------------------------------------------------------

export function activeFields(flow: FlowDefinition, runtime: FlowRuntime) {
  return flow.fields.filter((field) =>
    field.autoResolve === "dojo" ? runtime.dojos.length > 1 : true,
  );
}

// Every question the administrator will actually be asked, so the count offered
// up front is the count they will really see.
export function flowQuestionCount(flow: FlowDefinition, runtime: FlowRuntime) {
  return activeFields(flow, runtime).length;
}

export function currentField(
  flow: FlowDefinition,
  runtime: FlowRuntime,
  state: FlowState,
) {
  return (
    activeFields(flow, runtime).find(
      (field) => !(field.key in state.answers),
    ) || null
  );
}

export function answeredCount(
  flow: FlowDefinition,
  runtime: FlowRuntime,
  state: FlowState,
) {
  return activeFields(flow, runtime).filter((field) => field.key in state.answers)
    .length;
}

function tidy(value: string, max: number) {
  return value
    .normalize("NFKC")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .replace(/[ \t]+/g, " ")
    .slice(0, max);
}

const THAI_LETTER = /\p{Script=Thai}/u;
const ANY_LETTER = /\p{L}/u;
const YES_WORDS = ["yes", "y", "pass", "passed", "true", "ใช่", "ผ่าน", "สอบผ่าน"];
const NO_WORDS = [
  "no",
  "n",
  "fail",
  "failed",
  "false",
  "ไม่",
  "ไม่ใช่",
  "ไม่ผ่าน",
  "สอบไม่ผ่าน",
];

export type FieldResult = { value: string } | { error: FlowText };

// Every answer is checked here, on the server, against the same rules the
// reviewed administration endpoint uses. A kind message is returned instead of
// a failure so the administrator can simply answer again.
export function parseFieldAnswer(
  field: FlowField,
  raw: string,
  runtime: FlowRuntime,
): FieldResult {
  const max = field.maxLength || 200;
  const value = tidy(raw, max + 1);

  if (!value)
    return {
      error: {
        en: "I did not catch that. Could you type an answer?",
        th: "ยังไม่ได้รับคำตอบ โปรดพิมพ์คำตอบอีกครั้ง",
      },
    };

  if (field.type === "name") {
    if (value.length > max || !ANY_LETTER.test(value))
      return {
        error: {
          en: `Please give me a name in letters, up to ${max} characters.`,
          th: `โปรดระบุชื่อเป็นตัวอักษร ความยาวไม่เกิน ${max} ตัวอักษร`,
        },
      };
    return { value };
  }

  if (field.type === "thaiName") {
    if (value.length > max)
      return {
        error: {
          en: `That is a little long. Please keep it to ${max} characters.`,
          th: `ข้อความยาวเกินไป โปรดใช้ไม่เกิน ${max} ตัวอักษร`,
        },
      };
    if (!THAI_LETTER.test(value))
      return {
        error: {
          en: 'That does not look like Thai writing. Please type the Thai name, or type "skip" to leave it out.',
          th: 'ข้อความนี้ไม่ใช่ตัวอักษรไทย โปรดพิมพ์ชื่อภาษาไทย หรือพิมพ์ "ข้าม" หากไม่ต้องการระบุ',
        },
      };
    return { value };
  }

  if (field.type === "rank") {
    const rank = normalizeRank(value);
    if (!rank)
      return {
        error: {
          en: `I do not know that rank. Please choose one of: ${RANK_LIST}.`,
          th: `ไม่พบระดับดังกล่าว โปรดเลือกหนึ่งรายการจาก ${RANK_LIST}`,
        },
      };
    return { value: rank };
  }

  if (field.type === "date") {
    const canonical = isCanonicalDate(value)
      ? value
      : displayDateToCanonical(value);
    if (!canonical)
      return {
        error: {
          en: "That date does not look right. Please write it as DD/MM/YYYY, for example 15/01/2026.",
          th: "รูปแบบวันที่ไม่ถูกต้อง โปรดพิมพ์เป็น วว/ดด/ปปปป เช่น 15/01/2026",
        },
      };
    return { value: canonical };
  }

  if (field.type === "hours") {
    const hours = Number(value.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1_000)
      return {
        error: {
          en: "Please give me a number of hours between 0.25 and 1,000.",
          th: "โปรดระบุจำนวนชั่วโมงระหว่าง 0.25 ถึง 1,000",
        },
      };
    return { value: String(Math.round(hours * 100) / 100) };
  }

  if (field.type === "yesno") {
    const word = normalizedCommand(value);
    if (YES_WORDS.includes(word)) return { value: "yes" };
    if (NO_WORDS.includes(word)) return { value: "no" };
    return {
      error: {
        en: "Please answer yes or no.",
        th: "โปรดตอบว่า ใช่ หรือ ไม่",
      },
    };
  }

  if (field.type === "studentId") {
    const id = value.toLocaleUpperCase("en-US").replace(/\s+/g, "");
    if (!/^[A-Z0-9]{2,8}-\d{4,}$/.test(id))
      return {
        error: {
          en: "That does not look like a Student ID. It looks like RSK-1001. If you do not have it, cancel and ask me to find the student by name.",
          th: 'รูปแบบรหัสนักเรียนไม่ถูกต้อง ตัวอย่างเช่น RSK-1001 หากไม่ทราบ ให้พิมพ์ "ยกเลิก" แล้วค้นหานักเรียนจากชื่อ',
        },
      };
    return { value: id };
  }

  if (field.type === "webAddress") {
    const slug = value
      .toLocaleLowerCase("en-US")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!slug || slug.length > max || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return {
        error: {
          en: "Please use small letters, numbers and hyphens only, for example summer-training-camp.",
          th: "โปรดใช้ตัวพิมพ์เล็ก ตัวเลข และเครื่องหมายขีดเท่านั้น เช่น summer-training-camp",
        },
      };
    return { value: slug };
  }

  if (field.type === "choice") {
    const choices =
      field.autoResolve === "dojo"
        ? runtime.dojos.map((dojo) => dojo.name)
        : field.choices || [];
    const wanted = normalizedCommand(value);
    const matchIndex = choices.findIndex(
      (choice) => normalizedCommand(choice) === wanted,
    );
    const index =
      matchIndex >= 0
        ? matchIndex
        : choices.findIndex((choice) =>
            normalizedCommand(choice).includes(wanted),
          );
    if (index < 0)
      return {
        error: {
          en: `I do not have that one. Please choose from: ${choices.join(", ")}.`,
          th: `ไม่พบตัวเลือกดังกล่าว โปรดเลือกจาก ${choices.join(", ")}`,
        },
      };
    return {
      value:
        field.autoResolve === "dojo" ? runtime.dojos[index].id : choices[index],
    };
  }

  if (value.length > max)
    return {
      error: {
        en: `That is a little long. Please keep it to ${max} characters.`,
        th: `ข้อความยาวเกินไป โปรดใช้ไม่เกิน ${max} ตัวอักษร`,
      },
    };
  return { value };
}

// --- Answer application -----------------------------------------------------

function withAnswer(state: FlowState, key: string, value: string): FlowState {
  return {
    ...state,
    answers: { ...state.answers, [key]: value },
    order: [...state.order, key],
  };
}

// Drops one answer and everything given after it, so an answer the records
// themselves reject can be asked again without losing the earlier ones.
export function rewindTo(state: FlowState, key: string): FlowState {
  const position = state.order.indexOf(key);
  if (position < 0) return state;
  const removed = state.order.slice(position);
  const answers = { ...state.answers };
  for (const entry of removed) delete answers[entry];
  return { ...state, answers, order: state.order.slice(0, position) };
}

export function stepBack(state: FlowState): FlowState | null {
  const last = state.order[state.order.length - 1];
  if (!last) return null;
  const answers = { ...state.answers };
  delete answers[last];
  return { ...state, answers, order: state.order.slice(0, -1) };
}

// The administrator may answer several questions at once. The message is only
// treated as several answers when every part is valid for the questions that
// follow, so an ordinary answer that happens to contain a comma is never
// chopped up by mistake.
function candidateSplits(raw: string) {
  const splits: string[][] = [];
  const byLine = raw
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byLine.length > 1) splits.push(byLine);
  const byPipe = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (byPipe.length > 1) splits.push(byPipe);
  const byComma = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (byComma.length > 1) splits.push(byComma);
  return splits;
}

export type ApplyResult =
  | { kind: "answered"; state: FlowState; accepted: number }
  | { kind: "error"; error: FlowText }
  | { kind: "sensitive" };

function applyOne(
  flow: FlowDefinition,
  runtime: FlowRuntime,
  state: FlowState,
  raw: string,
): { state: FlowState } | { error: FlowText } {
  const field = currentField(flow, runtime, state);
  if (!field)
    return {
      error: {
        en: "I already have everything I need.",
        th: "ได้รับข้อมูลครบถ้วนแล้ว",
      },
    };
  // "No" is a real answer to a yes-or-no question, never a request to skip it.
  const command = field.type === "yesno" ? null : flowCommand(raw);
  if (command === "skip") {
    if (!field.optional) return { error: FLOW_WORDING.skipNotAllowed };
    return { state: withAnswer(state, field.key, "") };
  }
  const parsed = parseFieldAnswer(field, raw, runtime);
  if ("error" in parsed) return { error: parsed.error };
  return { state: withAnswer(state, field.key, parsed.value) };
}

export function applyFlowMessage(
  flow: FlowDefinition,
  runtime: FlowRuntime,
  state: FlowState,
  raw: string,
  isSensitive: (value: string) => boolean,
): ApplyResult {
  if (isSensitive(raw)) return { kind: "sensitive" };
  for (const parts of candidateSplits(raw)) {
    let candidate = state;
    let ok = true;
    for (const part of parts) {
      const step = applyOne(flow, runtime, candidate, part);
      if ("error" in step) {
        ok = false;
        break;
      }
      candidate = step.state;
    }
    if (ok && candidate.order.length > state.order.length)
      return {
        kind: "answered",
        state: candidate,
        accepted: candidate.order.length - state.order.length,
      };
  }
  const single = applyOne(flow, runtime, state, raw);
  if ("error" in single) return { kind: "error", error: single.error };
  return { kind: "answered", state: single.state, accepted: 1 };
}

// --- Summary ----------------------------------------------------------------

export function flowSummaryRows(
  flow: FlowDefinition,
  runtime: FlowRuntime,
  state: FlowState,
  locale: FlowLocale,
) {
  return activeFields(flow, runtime).map((field) => {
    const stored = state.answers[field.key] ?? "";
    let shown = stored;
    if (!stored) shown = flowText(locale, FLOW_WORDING.notProvided);
    else if (field.type === "yesno")
      shown =
        stored === "yes"
          ? flowText(locale, { en: "Passed", th: "ผ่าน" })
          : flowText(locale, { en: "Did not pass", th: "ไม่ผ่าน" });
    else if (field.autoResolve === "dojo")
      shown =
        runtime.dojos.find((dojo) => dojo.id === stored)?.name || stored;
    return { label: flowText(locale, field.label), value: shown };
  });
}

// The one dojo an administrator may use is filled in by the server, so the
// question is never asked when there is only one possible answer.
export function resolvedAnswers(
  flow: FlowDefinition,
  runtime: FlowRuntime,
  state: FlowState,
) {
  const answers = { ...state.answers };
  for (const field of flow.fields) {
    if (field.autoResolve === "dojo" && !(field.key in answers))
      answers[field.key] = runtime.dojos[0]?.id || "";
  }
  return answers;
}
