import type { AdminLanguage } from "../../i18n";
import type { HelpCatalog, HelpUiCopy } from "../types";
import { buildArticles, categories, type LocalizedArticle } from "./shared";

const ui: Record<AdminLanguage, HelpUiCopy> = {
  en: {
    trigger: "Open Auggie help",
    triggerAriaLabel: "Open Auggie admin help",
    heading: "Auggie — Admin help",
    guideDescription:
      "Auggie is the name of this administration guide. It is not a person or an AI assistant.",
    close: "Close Auggie help",
    searchLabel: "Search admin help",
    searchPlaceholder: "Search admin tasks",
    searchStatus: (count) =>
      `${count} ${count === 1 ? "topic" : "topics"} found`,
    suggested: "Suggested for this admin page",
    allTopics: "All admin help topics",
    categories: categories.en,
    back: "Back to all admin topics",
    breadcrumb: "Admin help topics",
    steps: "Steps",
    expectedResult: "What happens",
    troubleshooting: "If it does not work",
    related: "Related admin topics",
    noResults: "No admin help topics match your search.",
    resetSearch: "Clear search",
    imageUnavailable:
      "Guide image unavailable. The written steps are still complete.",
    copied: "Link copied",
    copyLink: "Copy direct link",
    smallerText: "Use smaller help text",
    largerText: "Use larger help text",
    loading: "Loading Auggie help",
    contentUnavailable:
      "Auggie help could not be loaded. Administration remains available.",
    retry: "Try again",
  },
  th: {
    trigger: "เปิดคู่มือ Auggie",
    triggerAriaLabel: "เปิดคู่มือผู้ดูแล Auggie",
    heading: "Auggie — คู่มือผู้ดูแล",
    guideDescription:
      "Auggie เป็นชื่อคู่มือการดูแลระบบนี้ ไม่ใช่บุคคลหรือผู้ช่วย AI",
    close: "ปิดคู่มือ Auggie",
    searchLabel: "ค้นหาคู่มือผู้ดูแล",
    searchPlaceholder: "ค้นหางานผู้ดูแล",
    searchStatus: (count) => `พบ ${count} หัวข้อ`,
    suggested: "แนะนำสำหรับหน้าผู้ดูแลนี้",
    allTopics: "หัวข้อผู้ดูแลทั้งหมด",
    categories: categories.th,
    back: "กลับไปหัวข้อผู้ดูแลทั้งหมด",
    breadcrumb: "หัวข้อคู่มือผู้ดูแล",
    steps: "ขั้นตอน",
    expectedResult: "ผลที่ได้",
    troubleshooting: "หากไม่สำเร็จ",
    related: "หัวข้อผู้ดูแลที่เกี่ยวข้อง",
    noResults: "ไม่พบหัวข้อที่ตรงกับคำค้น",
    resetSearch: "ล้างคำค้น",
    imageUnavailable:
      "ไม่สามารถแสดงภาพคู่มือได้ แต่ยังทำตามขั้นตอนที่เขียนไว้ได้ครบถ้วน",
    copied: "คัดลอกลิงก์แล้ว",
    copyLink: "คัดลอกลิงก์ตรง",
    smallerText: "ลดขนาดตัวอักษรคู่มือ",
    largerText: "เพิ่มขนาดตัวอักษรคู่มือ",
    loading: "กำลังโหลดคู่มือ Auggie",
    contentUnavailable: "โหลดคู่มือ Auggie ไม่ได้ แต่ส่วนผู้ดูแลยังใช้งานได้",
    retry: "ลองอีกครั้ง",
  },
};

const r = {
  access: ["/admin"],
  dashboard: ["/admin", "/admin/dashboard"],
  students: ["/admin/students", "/admin/profile-requests"],
  training: ["/admin/training-requests"],
  exams: ["/admin/exam-applications", "/admin/examination-records"],
  payments: [
    "/admin/monthly-contributions",
    "/admin/aat-contributions",
    "/admin/payment-proofs",
  ],
  website: ["/admin/website"],
  gallery: ["/admin/website", "/admin/galleries/:galleryId"],
  downloads: ["/admin/downloads"],
  administration: ["/admin/dojos", "/admin/audit", "/admin/memberships"],
};

const rel = {
  access: ["admin-scope", "admin-dashboard"],
  scope: ["admin-access", "admin-dashboard"],
  dashboard: ["admin-scope", "admin-students"],
  students: ["admin-training", "admin-exams"],
  training: ["admin-students", "admin-exams"],
  exams: ["admin-students", "admin-payments"],
  payments: ["admin-students", "admin-audit"],
  newsletters: ["admin-gallery", "admin-downloads"],
  gallery: ["admin-newsletters", "admin-downloads"],
  downloads: ["admin-newsletters", "admin-gallery"],
  audit: ["admin-scope", "admin-payments"],
};

function enArticles(): LocalizedArticle[] {
  return [
    guide(
      "admin-access",
      "getting-started",
      r.access,
      "Sign in, select a dojo, and sign out",
      "Use only your own administrator account, select the dojo you are managing, and sign out on shared devices.",
      [
        [
          "Sign in",
          "On the administrator sign-in page, enter your administrator email and password, then select “Sign in”.",
          "The dojo selection screen opens.",
        ],
        [
          "Select the administration scope",
          "Choose RenShinKan with a central account, or choose a dojo assigned to your dojo administrator account.",
          "The selected administration workspace opens with server-enforced permissions.",
        ],
        [
          "Sign out",
          "Open the account controls and select “Sign out” when you finish.",
          "The administrator session ends and the sign-in page returns.",
        ],
      ],
      "If sign-in repeatedly fails, stop retrying and ask the authorized system owner to confirm your account. Never share credentials.",
      rel.access,
      ["sign in", "login", "dojo selection", "sign out", "session"],
      [
        {
          src: "/help/screenshots/admin-login-en-desktop-v2026-07.webp",
          alt: "Administrator sign-in page with empty demonstration fields",
          caption:
            "Use your own administrator credentials. The guide never stores them.",
        },
      ],
    ),
    guide(
      "admin-scope",
      "administration",
      ["/admin/dashboard", "/admin/dojos"],
      "Understand permissions and the selected dojo",
      "The data scope in the header tells you whether actions affect one selected dojo or all dojos; central-only actions require the appropriate permission.",
      [
        [
          "Read the scope",
          "Check “Data scope” in the header before reviewing or changing records.",
          "The selected dojo or “All dojos” is clearly shown.",
        ],
        [
          "Change dojo",
          "Select “Change dojo”, choose the intended dojo, and confirm the selection.",
          "Lists and actions refresh for the selected dojo.",
        ],
        [
          "Check a restricted action",
          "If a control is unavailable, confirm your permission level and selected scope before contacting the central administrator.",
          "You avoid applying an action to the wrong dojo.",
        ],
      ],
      "If the header shows the wrong scope after switching, reload once. Do not continue editing until the intended dojo is shown.",
      rel.scope,
      ["permission", "scope", "dojo", "central", "switch", "all dojos"],
    ),
    guide(
      "admin-dashboard",
      "getting-started",
      r.dashboard,
      "Use dashboard tasks and alerts",
      "The dashboard prioritizes items that need attention and links directly to the relevant review queue.",
      [
        [
          "Review alerts",
          "Read the “Needs attention” cards and counts before starting routine work.",
          "You see which queues contain pending or failed items.",
        ],
        [
          "Open a queue",
          "Select the named task or “Review” action on a dashboard card.",
          "The matching filtered administration page opens.",
        ],
        [
          "Return and confirm",
          "After handling items, return to “Dashboard” and refresh if needed.",
          "Counts reflect remaining work after the server confirms changes.",
        ],
      ],
      "If a count and list differ, clear list filters and refresh. Never repeat a completed action solely to change a count.",
      rel.dashboard,
      ["dashboard", "alert", "task", "pending", "review", "status"],
    ),
    guide(
      "admin-students",
      "student-records",
      r.students,
      "Find, create, edit, and archive student records",
      "Search within the selected dojo, make deliberate corrections, and archive records instead of deleting history.",
      [
        [
          "Find or add a student",
          "Use “Search students”. If no correct record exists, select “Add student”, complete required fields, and review for duplicates.",
          "A single student profile opens or a new record is ready to save.",
        ],
        [
          "Save a correction",
          "Open the student, select “Edit”, change only verified information, then select “Save changes”.",
          "The server confirms the updated record and audit history is retained.",
        ],
        [
          "Archive safely",
          "Open the student actions, select “Archive student”, read the impact, and confirm only when the record should leave active lists.",
          "The record becomes archived without removing its history.",
        ],
      ],
      "If saving fails, keep the form open, read the error, and retry only after correcting it. Search again before adding a possible duplicate.",
      rel.students,
      [
        "student",
        "search",
        "add",
        "edit",
        "archive",
        "profile request",
        "duplicate",
      ],
    ),
    guide(
      "admin-training",
      "training",
      r.training,
      "Review training-hour requests",
      "Compare the submitted session with dojo records, then approve, reject with a clear reason, or leave it pending.",
      [
        [
          "Open the request",
          "On “Training hour requests”, select a pending student request.",
          "The submitted date, dojo, duration, note, and student context are shown.",
        ],
        [
          "Verify the session",
          "Compare the request with attendance information and check for an existing matching entry.",
          "You can make a decision without creating duplicate hours.",
        ],
        [
          "Record the decision",
          "Select “Approve” to add verified hours, or “Reject” and enter a plain-language reason.",
          "The student sees the decision; approved hours enter the official total.",
        ],
      ],
      "If evidence is incomplete, leave the request pending and contact the appropriate dojo. Do not approve a duplicate to clear the queue.",
      rel.training,
      [
        "training",
        "hours",
        "request",
        "approve",
        "reject",
        "duplicate",
        "pending",
      ],
    ),
    guide(
      "admin-exams",
      "examinations",
      r.exams,
      "Review applications and record examination results",
      "Check eligibility and application details, then publish results and certificates only after the examination decision is official.",
      [
        [
          "Review an application",
          "Open “Exam applications”, select a pending application, and check rank, time, training hours, and dojo.",
          "The eligibility context is visible before a decision.",
        ],
        [
          "Approve or return it",
          "Select “Approve” when the application is valid, or “Reject” with a useful reason when it is not.",
          "The application status is recorded for the student.",
        ],
        [
          "Record the result",
          "In “Examination records”, open the examination, enter the official result and certificate details, then select “Save result”.",
          "The published result appears in the student passport when confirmed.",
        ],
      ],
      "If a result is uncertain, save no final outcome and check with the examination lead. Correct mistakes through the supported edit flow so the audit remains intact.",
      rel.exams,
      [
        "exam",
        "application",
        "eligibility",
        "result",
        "certificate",
        "approve",
        "reject",
      ],
    ),
    guide(
      "admin-payments",
      "payments",
      r.payments,
      "Review contributions, proofs, and receipts",
      "Match proof to the correct student, contribution type, and period before marking a payment confirmed.",
      [
        [
          "Open the right queue",
          "Choose “Monthly contributions”, “AAT annual contributions”, or “Payment proofs”, then set the intended dojo and filters.",
          "Only the relevant payment records are shown.",
        ],
        [
          "Verify a proof",
          "Open the proof and compare student, amount, date, reference, contribution type, and period with the payment record.",
          "You can detect mismatches or duplicate proof before confirming.",
        ],
        [
          "Confirm or reject",
          "Select “Confirm payment” only for a verified match, or “Reject proof” and provide a reason.",
          "A confirmed contribution becomes paid and can produce a receipt; a rejection remains explainable.",
        ],
      ],
      "If the proof is unreadable or mismatched, reject it with the exact issue. Never mark paid to resolve a queue discrepancy.",
      rel.payments,
      [
        "payment",
        "monthly",
        "AAT",
        "proof",
        "receipt",
        "confirm",
        "reject",
        "period",
      ],
    ),
    guide(
      "admin-newsletters",
      "news-resources",
      r.website,
      "Create, preview, publish, and recover newsletters",
      "Save drafts as you work, preview the public result, and treat publishing as a deliberate state change with clear failure recovery.",
      [
        [
          "Create or edit a draft",
          "Open “Edit the website” and the newsletters area. Select “New newsletter” or open an existing draft, then select “Save draft”.",
          "A server-confirmed draft is available without being public.",
        ],
        [
          "Preview before publishing",
          "Select “Preview” and check title, date, images, links, mobile layout, and language content.",
          "You see how the current saved version will appear.",
        ],
        [
          "Publish deliberately",
          "Select “Publish”, read the confirmation, and confirm once. If an error appears, use “Retry publish” only after checking status.",
          "A successful confirmation makes the newsletter public and records the publish state.",
        ],
      ],
      "If publishing fails after upload, do not recreate the newsletter. Refresh its status and use the retry/reconciliation action so the same item completes safely.",
      rel.newsletters,
      [
        "newsletter",
        "draft",
        "preview",
        "publish",
        "retry",
        "recover",
        "website",
      ],
    ),
    guide(
      "admin-gallery",
      "news-resources",
      r.gallery,
      "Create galleries and manage images",
      "Use non-sensitive image content, write useful alt text, preview crops, and publish only the intended album.",
      [
        [
          "Create an album",
          "Open “Edit the website”, choose a gallery, and select “New album”. Enter a public title and optional event date.",
          "An unpublished album workspace opens.",
        ],
        [
          "Upload and describe",
          "Select “Upload photos”, choose safe files, then add concise alt text and captions where they add context.",
          "Images are prepared for accessible public display.",
        ],
        [
          "Preview and publish",
          "Choose a cover, check crop and order in “Preview”, then select “Publish album” and confirm.",
          "Only the reviewed album becomes visible on the public website.",
        ],
      ],
      "If an upload fails, keep successful photos, remove the failed item, and retry that file once. Do not upload private student documents or identifying paperwork.",
      rel.gallery,
      [
        "gallery",
        "album",
        "photo",
        "image",
        "alt text",
        "caption",
        "cover",
        "publish",
      ],
    ),
    guide(
      "admin-downloads",
      "news-resources",
      r.downloads,
      "Manage public downloads",
      "Upload only approved public documents, provide clear metadata, and test the resulting download before publishing.",
      [
        [
          "Add a document",
          "Open “Downloads” in administration and select “Add download”. Choose the approved file.",
          "A draft download item is created.",
        ],
        [
          "Describe it",
          "Enter a public title, short description, category, and language. Confirm that the displayed format and size are correct.",
          "Visitors can understand the file before opening it.",
        ],
        [
          "Publish and test",
          "Select “Publish”, confirm, then open “View public website” and test “Download”.",
          "The approved file is available and the public link works.",
        ],
      ],
      "If the file is wrong, unpublish the item before replacing it. Never use public downloads for member lists, payment proofs, or private records.",
      rel.downloads,
      ["download", "document", "file", "upload", "publish", "public", "PDF"],
    ),
    guide(
      "admin-audit",
      "administration",
      r.administration,
      "Manage dojos, memberships, and audit history",
      "Central administration changes scope and access. Confirm targets first, use least privilege, and consult audit history when investigating.",
      [
        [
          "Confirm the target",
          "Before changing dojo settings or memberships, check “Data scope” and the record name twice.",
          "The intended dojo and account are selected.",
        ],
        [
          "Make the smallest change",
          "Use the supported edit or membership action, choose only the required permission, and select “Save changes”.",
          "The server confirms the scoped change and records it in audit history.",
        ],
        [
          "Investigate history",
          "Open “Audit log”, filter by date, action, or subject, and expand technical details only when needed.",
          "You can trace who changed what without exposing audit data publicly.",
        ],
      ],
      "If a critical change is wrong, stop further edits, record what happened, and contact the authorized system owner. Do not try to erase audit history.",
      rel.audit,
      [
        "dojo",
        "membership",
        "permission",
        "audit",
        "history",
        "administrator",
        "scope",
      ],
    ),
  ];
}

function guide(
  id: string,
  category: LocalizedArticle["category"],
  routes: string[],
  title: string,
  summary: string,
  steps: [string, string, string][],
  fix: string,
  related: string[],
  keywords: string[],
  screenshots: LocalizedArticle["screenshots"] = [],
): LocalizedArticle {
  return {
    id,
    category,
    routes,
    title,
    summary,
    steps: steps.map(([stepTitle, instruction, result]) => ({
      title: stepTitle,
      instruction,
      result,
    })),
    troubleshooting: [
      { issue: "The task does not complete as expected.", fix },
    ],
    related,
    keywords,
    screenshots,
  };
}

function thArticles(): LocalizedArticle[] {
  const values: Array<
    [
      string,
      LocalizedArticle["category"],
      string[],
      string,
      string,
      string[],
      string,
      string[],
      string[],
    ]
  > = [
    [
      "admin-access",
      "getting-started",
      r.access,
      "ลงชื่อเข้าใช้ เลือกโดโจ และออกจากระบบ",
      "ใช้บัญชีผู้ดูแลของตนเอง เลือกโดโจที่จัดการ และออกจากระบบบนเครื่องที่ใช้ร่วมกัน",
      [
        "กรอกอีเมลและรหัสผ่านผู้ดูแล แล้วเลือก “ลงชื่อเข้าใช้”",
        "เลือก RenShinKan ด้วยบัญชีกลาง หรือเลือกโดโจที่กำหนดให้บัญชีผู้ดูแลโดโจ",
        "เมื่อเสร็จงาน เปิดเมนูบัญชีแล้วเลือก “ออกจากระบบ”",
      ],
      "หากล้มเหลวซ้ำ ให้หยุดลองและขอเจ้าของระบบตรวจบัญชี ห้ามแชร์ข้อมูลเข้าสู่ระบบ",
      rel.access,
      ["ลงชื่อเข้าใช้", "ยืนยัน", "ออกจากระบบ", "เซสชัน"],
    ],
    [
      "admin-scope",
      "administration",
      ["/admin/dashboard", "/admin/dojos"],
      "เข้าใจสิทธิ์และโดโจที่เลือก",
      "ขอบเขตข้อมูลในส่วนหัวบอกว่าการทำงานมีผลต่อโดโจเดียวหรือทุกโดโจ และงานส่วนกลางต้องมีสิทธิ์ที่เหมาะสม",
      [
        "ตรวจ “ขอบเขตข้อมูล” ก่อนอ่านหรือแก้ไขข้อมูล",
        "เลือก “เปลี่ยนโดโจ” เลือกโดโจที่ตั้งใจ แล้ว ยืนยัน",
        "หากปุ่มใช้ไม่ได้ ให้ตรวจระดับสิทธิ์และขอบเขตก่อนติดต่อผู้ดูแลส่วนกลาง",
      ],
      "หากส่วนหัวยังแสดงผิดหลังเปลี่ยน ให้รีโหลดหนึ่งครั้งและอย่าแก้ข้อมูลจนกว่าจะถูกต้อง",
      rel.scope,
      ["สิทธิ์", "ขอบเขต", "โดโจ", "ส่วนกลาง"],
    ],
    [
      "admin-dashboard",
      "getting-started",
      r.dashboard,
      "ใช้รายการงานและการแจ้งเตือนบนแดชบอร์ด",
      "แดชบอร์ดจัดลำดับรายการที่ต้องดำเนินการและเชื่อมไปยังคิวตรวจที่เกี่ยวข้อง",
      [
        "อ่านการ์ด “ต้องดำเนินการ” และจำนวนก่อนเริ่มงาน",
        "เลือกชื่องานหรือ “ตรวจสอบ” เพื่อเปิดคิวที่กรองแล้ว",
        "หลังจัดการ ให้กลับ “แดชบอร์ด” และรีเฟรชหากจำเป็น",
      ],
      "หากจำนวนไม่ตรงกับรายการ ให้ล้างตัวกรองและรีเฟรช ห้ามทำรายการสำเร็จซ้ำเพื่อเปลี่ยนจำนวน",
      rel.dashboard,
      ["แดชบอร์ด", "แจ้งเตือน", "งาน", "รอตรวจ"],
    ],
    [
      "admin-students",
      "student-records",
      r.students,
      "ค้นหา เพิ่ม แก้ไข และเก็บประวัตินักเรียน",
      "ค้นหาในโดโจที่เลือก แก้เฉพาะข้อมูลที่ยืนยันแล้ว และใช้การเก็บแทนการลบประวัติ",
      [
        "ใช้ “ค้นหานักเรียน” ถ้าไม่มีข้อมูลที่ถูกต้องจึงเลือก “เพิ่มนักเรียน” และตรวจข้อมูลซ้ำ",
        "เปิดนักเรียน เลือก “แก้ไข” เปลี่ยนเฉพาะข้อมูลที่ยืนยัน แล้วเลือก “บันทึกการเปลี่ยนแปลง”",
        "เปิดการทำงาน เลือก “เก็บประวัตินักเรียน” อ่านผลกระทบ แล้วจึงยืนยัน",
      ],
      "หากบันทึกไม่ได้ ให้คงฟอร์มไว้ อ่านข้อผิดพลาด และแก้ก่อนลองใหม่ ตรวจค้นก่อนเพิ่มเพื่อเลี่ยงข้อมูลซ้ำ",
      rel.students,
      ["นักเรียน", "ค้นหา", "เพิ่ม", "แก้ไข", "เก็บประวัติ"],
    ],
    [
      "admin-training",
      "training",
      r.training,
      "ตรวจคำขอชั่วโมงฝึก",
      "เปรียบเทียบเซสชันกับข้อมูลโดโจ แล้วอนุมัติ ปฏิเสธพร้อมเหตุผล หรือคงสถานะรอตรวจ",
      [
        "เปิด “คำขอชั่วโมงฝึก” แล้วเลือกรายการรอตรวจ",
        "ตรวจวันที่ โดโจ ระยะเวลา และรายการที่อาจซ้ำกับข้อมูลเข้าเรียน",
        "เลือก “อนุมัติ” สำหรับข้อมูลที่ยืนยัน หรือ “ปฏิเสธ” พร้อมเหตุผลที่ชัดเจน",
      ],
      "หากหลักฐานไม่ครบ ให้คงสถานะรอตรวจและติดต่อโดโจ ห้ามอนุมัติรายการซ้ำเพียงเพื่อล้างคิว",
      rel.training,
      ["ฝึก", "ชั่วโมง", "คำขอ", "อนุมัติ", "ปฏิเสธ"],
    ],
    [
      "admin-exams",
      "examinations",
      r.exams,
      "ตรวจใบสมัครและบันทึกผลสอบ",
      "ตรวจคุณสมบัติและใบสมัคร แล้วเผยแพร่ผลกับใบประกาศเมื่อผลเป็นทางการเท่านั้น",
      [
        "เปิด “ใบสมัครสอบ” เลือกรายการรอตรวจ แล้วตรวจระดับ เวลา ชั่วโมง และโดโจ",
        "เลือก “อนุมัติ” เมื่อถูกต้อง หรือ “ปฏิเสธ” พร้อมเหตุผล",
        "ใน “ประวัติการสอบ” เปิดรายการ กรอกผลทางการ แล้วเลือก “บันทึกผล”",
      ],
      "หากผลยังไม่แน่นอน อย่าบันทึกผลสุดท้าย ให้ตรวจสอบกับผู้รับผิดชอบการสอบ",
      rel.exams,
      ["สอบ", "ใบสมัคร", "คุณสมบัติ", "ผล", "ใบประกาศ"],
    ],
    [
      "admin-payments",
      "payments",
      r.payments,
      "ตรวจเงินสมทบ หลักฐาน และใบเสร็จ",
      "จับคู่หลักฐานกับนักเรียน ประเภทเงินสมทบ และงวดที่ถูกต้องก่อนยืนยันชำระ",
      [
        "เปิดคิวรายเดือน AAT หรือหลักฐานชำระเงิน และตั้งโดโจ/ตัวกรอง",
        "เปิดหลักฐานแล้วเทียบชื่อ จำนวน วันที่ เลขอ้างอิง ประเภท และงวด",
        "เลือก “ยืนยันการชำระเงิน” เมื่อตรงกัน หรือ “ปฏิเสธหลักฐาน” พร้อมเหตุผล",
      ],
      "หากภาพไม่ชัดหรือข้อมูลไม่ตรง ให้ปฏิเสธพร้อมระบุปัญหา ห้ามทำเครื่องหมายว่าชำระเพื่อแก้ยอดคิว",
      rel.payments,
      ["ชำระเงิน", "รายเดือน", "AAT", "หลักฐาน", "ใบเสร็จ"],
    ],
    [
      "admin-newsletters",
      "news-resources",
      r.website,
      "สร้าง ดูตัวอย่าง เผยแพร่ และกู้คืนจดหมายข่าว",
      "บันทึกร่างระหว่างทำ ดูตัวอย่างสาธารณะ และเผยแพร่อย่างตั้งใจพร้อมวิธีกู้คืนเมื่อผิดพลาด",
      [
        "เปิด “แก้ไขเว็บไซต์” ส่วนจดหมายข่าว เลือกสร้างหรือเปิดร่าง แล้วเลือก “บันทึกร่าง”",
        "เลือก “ดูตัวอย่าง” และตรวจชื่อ วันที่ ภาพ ลิงก์ มือถือ และภาษา",
        "เลือก “เผยแพร่” อ่านคำยืนยัน และยืนยันหนึ่งครั้ง หากผิดพลาดให้ตรวจสถานะก่อน “ลองเผยแพร่อีกครั้ง”",
      ],
      "หากเผยแพร่ล้มเหลวหลังอัปโหลด ห้ามสร้างรายการใหม่ ให้รีเฟรชสถานะและใช้การลองใหม่/ประสานสถานะของรายการเดิม",
      rel.newsletters,
      ["จดหมายข่าว", "ร่าง", "ดูตัวอย่าง", "เผยแพร่", "กู้คืน"],
    ],
    [
      "admin-gallery",
      "news-resources",
      r.gallery,
      "สร้างแกลเลอรีและจัดการภาพ",
      "ใช้ภาพที่ไม่อ่อนไหว เขียนข้อความทดแทน ตรวจครอป และเผยแพร่เฉพาะอัลบั้มที่ตั้งใจ",
      [
        "เปิด “แก้ไขเว็บไซต์” เลือกแกลเลอรี แล้วเลือก “อัลบั้มใหม่”",
        "เลือก “อัปโหลดรูป” เพิ่มข้อความทดแทนและคำบรรยายที่มีประโยชน์",
        "เลือกภาพปก ตรวจลำดับใน “ดูตัวอย่าง” แล้วเลือก “เผยแพร่อัลบั้ม”",
      ],
      "หากไฟล์หนึ่งล้มเหลว ให้เก็บไฟล์ที่สำเร็จ ลบรายการล้มเหลว และลองไฟล์นั้นใหม่ ห้ามอัปโหลดเอกสารส่วนตัว",
      rel.gallery,
      ["แกลเลอรี", "อัลบั้ม", "รูป", "ข้อความทดแทน", "เผยแพร่"],
    ],
    [
      "admin-downloads",
      "news-resources",
      r.downloads,
      "จัดการเอกสารดาวน์โหลดสาธารณะ",
      "อัปโหลดเฉพาะเอกสารที่อนุมัติ ใส่ข้อมูลชัดเจน และทดสอบลิงก์หลังเผยแพร่",
      [
        "เปิด “ดาวน์โหลด” ในผู้ดูแลและเลือก “เพิ่มเอกสาร”",
        "กรอกชื่อ คำอธิบาย หมวดหมู่ และภาษา แล้วตรวจชนิด/ขนาดไฟล์",
        "เลือก “เผยแพร่” ยืนยัน แล้วเปิดเว็บไซต์สาธารณะเพื่อทดสอบ “ดาวน์โหลด”",
      ],
      "หากไฟล์ผิด ให้ยกเลิกเผยแพร่ก่อนแทนที่ ห้ามเผยแพร่รายชื่อสมาชิก หลักฐานชำระ หรือข้อมูลส่วนตัว",
      rel.downloads,
      ["ดาวน์โหลด", "เอกสาร", "อัปโหลด", "เผยแพร่"],
    ],
    [
      "admin-audit",
      "administration",
      r.administration,
      "ดูแลโดโจ สมาชิกผู้ดูแล และประวัติการเปลี่ยนแปลง",
      "งานส่วนกลางเปลี่ยนขอบเขตและสิทธิ์ ต้องยืนยันเป้าหมาย ใช้สิทธิ์น้อยที่สุด และตรวจบันทึกเมื่อสืบค้น",
      [
        "ตรวจ “ขอบเขตข้อมูล” ชื่อโดโจ และบัญชีเป้าหมายสองครั้ง",
        "ใช้การแก้ไขหรือสมาชิกที่รองรับ เลือกเฉพาะสิทธิ์ที่จำเป็น แล้ว “บันทึกการเปลี่ยนแปลง”",
        "เปิด “บันทึกการตรวจสอบ” กรองวันที่ การทำงาน หรือรายการ และเปิดรายละเอียดเทคนิคเมื่อจำเป็น",
      ],
      "หากการเปลี่ยนสำคัญผิด ให้หยุดแก้เพิ่ม บันทึกเหตุการณ์ และติดต่อเจ้าของระบบ ห้ามพยายามลบประวัติ",
      rel.audit,
      ["โดโจ", "สมาชิก", "สิทธิ์", "บันทึก", "ประวัติ"],
    ],
  ];
  return values.map(
    ([
      id,
      category,
      routes,
      title,
      summary,
      instructions,
      fix,
      related,
      keywords,
    ]) => ({
      id,
      category,
      routes,
      title,
      summary,
      steps: instructions.map((instruction, index) => ({
        title:
          ["เปิดและตรวจข้อมูล", "ดำเนินการอย่างระมัดระวัง", "ยืนยันและตรวจผล"][
            index
          ] || "ตรวจผล",
        instruction,
        result: "ระบบจะแสดงสถานะที่ยืนยันจากเซิร์ฟเวอร์เมื่อขั้นตอนสำเร็จ",
      })),
      troubleshooting: [{ issue: "งานไม่สำเร็จตามที่คาด", fix }],
      related,
      keywords,
      screenshots:
        id === "admin-access"
          ? [
              {
                src: "/help/screenshots/admin-login-th-desktop-v2026-07.webp",
                alt: "หน้าลงชื่อเข้าใช้ผู้ดูแลภาษาไทยที่ช่องตัวอย่างว่างอยู่",
                caption:
                  "ใช้ข้อมูลเข้าสู่ระบบของตนเอง คู่มือนี้ไม่จัดเก็บข้อมูลดังกล่าว",
              },
            ]
          : [],
    }),
  );
}

export function getAdminHelpCatalog(locale: AdminLanguage): HelpCatalog {
  return {
    audience: "admin",
    locale,
    ui: ui[locale],
    articles: buildArticles(
      "admin",
      locale,
      locale === "th" ? thArticles() : enArticles(),
    ),
  };
}
