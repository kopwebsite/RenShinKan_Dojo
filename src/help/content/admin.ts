import type { AdminLanguage } from "../../i18n";
import type { HelpCatalog, HelpCategory, HelpUiCopy } from "../types";
import { buildArticles, categories, type LocalizedArticle } from "./shared";

type Topic = {
  id: string;
  category: HelpCategory;
  href: string;
  title: string;
  summary: string;
  steps: string[];
  action: string;
};

function article(topic: Topic): LocalizedArticle {
  return {
    id: topic.id,
    category: topic.category,
    routes: [topic.href.split(/[?#]/)[0]],
    title: topic.title,
    summary: topic.summary,
    steps: topic.steps.map((instruction) => ({
      title: "",
      instruction,
      result: "",
    })),
    troubleshooting: [],
    related: [],
    screenshots: [],
    keywords: `${topic.title} ${topic.summary}`
      .toLocaleLowerCase()
      .replace(/\*\*/g, "")
      .split(/\s+/),
    action: { label: topic.action, href: topic.href },
  };
}

const commonUi = {
  expectedResult: "Result",
  troubleshooting: "Help",
  related: "Related",
  imageUnavailable: "Image unavailable",
  copied: "Link copied",
  copyLink: "Copy direct link",
  smallerText: "Use smaller help text",
  largerText: "Use larger help text",
  loading: "Loading admin help",
  contentUnavailable: "Admin help could not be loaded.",
  retry: "Try again",
};

const ui: Record<AdminLanguage, HelpUiCopy> = {
  en: {
    ...commonUi,
    trigger: "Admin help",
    triggerAriaLabel: "Open admin help",
    heading: "How to use administration",
    guideDescription: "Choose a task and follow the short steps.",
    close: "Close admin help",
    searchLabel: "Search admin help",
    searchPlaceholder: "Search tasks",
    searchStatus: (count) => `${count} ${count === 1 ? "topic" : "topics"}`,
    suggested: "Suggested for this page",
    allTopics: "All admin topics",
    categories: categories.en,
    back: "Back to all topics",
    breadcrumb: "Admin help",
    steps: "Steps",
    noResults: "No topics match your search.",
    resetSearch: "Clear search",
  },
  th: {
    ...commonUi,
    trigger: "คู่มือผู้ดูแล",
    triggerAriaLabel: "เปิดคู่มือผู้ดูแล",
    heading: "วิธีใช้ระบบผู้ดูแล",
    guideDescription: "เลือกงานแล้วทำตามขั้นตอนสั้น ๆ",
    close: "ปิดคู่มือผู้ดูแล",
    searchLabel: "ค้นหาคู่มือผู้ดูแล",
    searchPlaceholder: "ค้นหางาน",
    searchStatus: (count) => `พบ ${count} หัวข้อ`,
    suggested: "แนะนำสำหรับหน้านี้",
    allTopics: "หัวข้อผู้ดูแลทั้งหมด",
    categories: categories.th,
    back: "กลับไปหัวข้อทั้งหมด",
    breadcrumb: "คู่มือผู้ดูแล",
    steps: "ขั้นตอน",
    noResults: "ไม่พบหัวข้อที่ตรงกับคำค้น",
    resetSearch: "ล้างคำค้น",
    expectedResult: "ผลลัพธ์",
    troubleshooting: "ความช่วยเหลือ",
    related: "เกี่ยวข้อง",
    imageUnavailable: "ไม่มีภาพ",
    copied: "คัดลอกลิงก์แล้ว",
    copyLink: "คัดลอกลิงก์ตรง",
    smallerText: "ลดขนาดตัวอักษร",
    largerText: "เพิ่มขนาดตัวอักษร",
    loading: "กำลังโหลดคู่มือผู้ดูแล",
    contentUnavailable: "โหลดคู่มือผู้ดูแลไม่ได้",
    retry: "ลองอีกครั้ง",
  },
};

/**
 * Steps name the exact place or control to select and wrap it in `**…**`, so
 * the help panel prints it in bold. Every name must match the administration
 * interface word for word.
 */
const en: Topic[] = [
  {
    id: "admin-profile-approval",
    category: "student-records",
    href: "/admin/profile-requests",
    title: "How do I approve a new student profile?",
    summary: "Review a submitted profile and record a decision.",
    steps: [
      "Open **Profile requests** and select the student.",
      "Check the profile details and photo, then choose **Approve** or **Deny**.",
      "Confirm the decision and add a clear student-visible reason when denying.",
    ],
    action: "Open profile requests",
  },
  {
    id: "admin-payments",
    category: "payments",
    href: "/admin/payment-proofs",
    title: "How do I review a payment proof?",
    summary: "Inspect a payslip before approving or rejecting it.",
    steps: [
      "Open **Payment proofs** and choose **View proof**.",
      "Inspect the image or PDF; use **Open full-size proof** when needed.",
      "Choose **Confirm payment** or **Reject proof** and confirm the decision.",
    ],
    action: "Open payment proofs",
  },
  {
    id: "admin-bulk-proofs",
    category: "payments",
    href: "/admin/payment-proofs",
    title: "How do I decide several payment proofs at once?",
    summary:
      "Approve or reject several pending proofs in one confirmed action.",
    steps: [
      "Open **Payment proofs** and tick the pending proofs in the table.",
      "Choose **Confirm payment** or **Reject proof** in the selection bar.",
      "Review the count, add a reason when rejecting, then confirm.",
    ],
    action: "Open payment proofs",
  },
  {
    id: "admin-exam-pdf",
    category: "examinations",
    href: "/admin/exam-applications",
    title: "How do I download the examination report as a PDF?",
    summary:
      "Download the examination report for every student marked Paid.",
    steps: [
      "Open **Exam applications** and choose the cycle under **Exam cycle**.",
      "Set **Report scope** to a single dojo, or leave it on **All Dojos**.",
      "Choose **PDF**, or **Print-friendly PDF** for a black-and-white copy. Only students with the **Paid** status are included.",
    ],
    action: "Open exam applications",
  },
  {
    id: "admin-exam-excel",
    category: "examinations",
    href: "/admin/exam-applications",
    title: "How do I download the examination report to Excel?",
    summary: "Export the same report as an Excel workbook.",
    steps: [
      "Open **Exam applications** and choose the cycle under **Exam cycle**.",
      "Set **Report scope** to a single dojo, or leave it on **All Dojos**.",
      "Choose **Excel**. Only students with the **Paid** status are included.",
    ],
    action: "Open exam applications",
  },
  {
    id: "admin-exam-payment",
    category: "examinations",
    href: "/admin/exam-applications",
    title: "How do I mark a student as paid for an examination?",
    summary:
      "Record an examination payment so the student appears in the report.",
    steps: [
      "Open **Exam applications** and find the student in the roster.",
      "Use the status menu in the **Actions** column, or tick several students and use the selection bar.",
      "Choose **Paid** and confirm. Only students marked **Paid** appear in the PDF and Excel reports.",
    ],
    action: "Open exam applications",
  },
  {
    id: "admin-hours",
    category: "training",
    href: "/admin/students",
    title: "How do I change a student’s training hours?",
    summary: "Add verified hours or correct the current total.",
    steps: [
      "Open the **Student database** and choose **Open record** for the student.",
      "Open **Training**, then add hours or correct the recorded total.",
      "Review the value and choose **Save**.",
    ],
    action: "Open the student database",
  },
  {
    id: "admin-rank",
    category: "student-records",
    href: "/admin/students",
    title: "How do I promote or demote a student?",
    summary: "Change a rank while keeping the record history.",
    steps: [
      "Open the **Student database** and choose **Open record** for the student.",
      "Open **Profile** to set the rank directly, or **Examinations** to record a result.",
      "Review the change and choose **Save**.",
    ],
    action: "Open the student database",
  },
  {
    id: "admin-archive",
    category: "student-records",
    href: "/admin/students",
    title: "How do I archive a student?",
    summary: "Move an inactive student out of the active list.",
    steps: [
      "Open the **Student database** and tick the student in the table.",
      "Choose **Archive records** from **Set record status**.",
      "Review the selected student and confirm.",
    ],
    action: "Open the student database",
  },
  {
    id: "admin-restore",
    category: "student-records",
    href: "/admin/students",
    title: "How do I restore an archived student?",
    summary: "Return an archived student to the active database.",
    steps: [
      "Open the **Student database** and select the **Archived** tab.",
      "Tick the student, then choose **Unarchive records** from **Set record status**.",
      "Review and confirm the restoration.",
    ],
    action: "Open archived students",
  },
  {
    id: "admin-newsletters",
    category: "news-resources",
    href: "/admin/website",
    title: "How do I write and publish a newsletter?",
    summary: "Create a draft, review it, and publish it to the website.",
    steps: [
      "Open **Edit the website** and go to **Newsletters**.",
      "Create or edit the draft: **Title**, **Short summary**, **Category**, content, and email settings.",
      "Work through to **Review and publish**, then choose **Publish**.",
    ],
    action: "Manage newsletters",
  },
  {
    id: "admin-aat-number",
    category: "payments",
    href: "/admin/students",
    title: "How do I add or change a student’s AAT number?",
    summary: "Record or correct the AAT membership number on a student record.",
    steps: [
      "Open the **Student database** and choose **Open record** for the student.",
      "Open **Profile**, then **Edit profile details**.",
      "Enter the number in **AAT membership number** and choose **Save**. The change is written to the audit log.",
    ],
    action: "Open the student database",
  },
  {
    id: "admin-student-id",
    category: "student-records",
    href: "/admin/students",
    title: "How do I change a student’s Student ID?",
    summary: "Correct the dojo-issued Student ID on an existing record.",
    steps: [
      "Open the **Student database** and choose **Open record** for the student.",
      "Open **Profile**, then **Edit profile details**.",
      "Enter the corrected ID in **Student ID** and choose **Save**. The old ID still opens the same profile.",
    ],
    action: "Open the student database",
  },
  {
    id: "admin-training",
    category: "training",
    href: "/admin/training-requests",
    title: "How do I review training-hour requests?",
    summary: "Approve or reject hours submitted by students.",
    steps: [
      "Open **Training hour requests** and select the student.",
      "Check the training date, source, and requested hours.",
      "Choose **Approve**, or reject the request with a clear reason.",
    ],
    action: "Open training requests",
  },
  {
    id: "admin-exams",
    category: "examinations",
    href: "/admin/exam-applications",
    title: "How do I review exam applications?",
    summary: "Check an application, payment, and decision status.",
    steps: [
      "Open **Exam applications** and choose the cycle under **Exam cycle**.",
      "Open the student’s record and review the submitted answers.",
      "Record the payment status or the application decision.",
    ],
    action: "Open exam applications",
  },
  {
    id: "admin-exam-records",
    category: "examinations",
    href: "/admin/examination-records",
    title: "How do I enter or update examination records?",
    summary: "Record a completed examination in the permanent history.",
    steps: [
      "Open **Application records** and find the student.",
      "Choose **Open record** and enter the result, rank, date, and location.",
      "Review the entry and choose **Save**.",
    ],
    action: "Open application records",
  },
  {
    id: "admin-students",
    category: "student-records",
    href: "/admin/students",
    title: "How do I find and filter students?",
    summary: "Search all dojos with a small set of useful filters.",
    steps: [
      "Open the **Student database** and type a name, Student ID, or AAT number in **Search by name, Student ID, or AAT number**.",
      "Narrow the list with **Dojo**, **Current rank**, or **Sort order**; **Clear filters** resets them.",
      "Choose **Open record** on the matching student.",
    ],
    action: "Find students",
  },
  {
    id: "admin-monthly",
    category: "payments",
    href: "/admin/monthly-contributions",
    title: "How do I review monthly contribution status?",
    summary: "See who is paid, pending, or missing for a month.",
    steps: [
      "Open **Monthly contributions**.",
      "Filter with **Status**, **Current rank**, **Last paid**, or **Sort order**.",
      "Open or update the contribution record as needed.",
    ],
    action: "Open monthly contributions",
  },
  {
    id: "admin-aat",
    category: "payments",
    href: "/admin/aat-contributions",
    title: "How do I review AAT annual contribution status?",
    summary: "Check AAT numbers, last-paid dates, and annual status.",
    steps: [
      "Open **AAT annual contributions**.",
      "Filter with **Dojo**, **Current rank**, **Last paid**, or **Sort order**.",
      "Choose **Record payment**, or open the student record when action is needed.",
    ],
    action: "Open AAT contributions",
  },
  {
    id: "admin-complete-record",
    category: "student-records",
    href: "/admin/students",
    title: "How do I view a student’s complete record?",
    summary:
      "See profile, training, examinations, payments, and history together.",
    steps: [
      "Open the **Student database** and find the student.",
      "Choose **Open record**.",
      "Use the **Overview**, **Profile**, **Training**, **Examinations**, **Payments**, and **History** tabs.",
    ],
    action: "Open the student database",
  },
  {
    id: "admin-gallery",
    category: "news-resources",
    href: "/admin/website",
    title: "How do I publish gallery photos?",
    summary: "Add, arrange, and publish dojo gallery images.",
    steps: [
      "Open **Edit the website** and choose the gallery.",
      "Upload images, add useful descriptions, and arrange them.",
      "Preview the gallery, then choose **Publish**.",
    ],
    action: "Manage galleries",
  },
  {
    id: "admin-downloads",
    category: "news-resources",
    href: "/admin/downloads",
    title: "How do I manage public downloads?",
    summary: "Add or update files shown on the Downloads page.",
    steps: [
      "Open **Downloads**.",
      "Add a file and complete its public title and details.",
      "Choose **Save** and check the file on the public Downloads page.",
    ],
    action: "Manage downloads",
  },
  {
    id: "admin-audit",
    category: "administration",
    href: "/admin/audit",
    title: "How do I check an earlier admin change?",
    summary: "Search the permanent audit history.",
    steps: [
      "Open the **Audit log**.",
      "Search by student, administrator, dojo, or date.",
      "Open the matching entry to review the change.",
    ],
    action: "Open audit log",
  },
  {
    id: "admin-scope",
    category: "administration",
    href: "/admin/dojos",
    title: "How do I update dojo details?",
    summary:
      "Maintain the dojo names and contact details used by student records.",
    steps: [
      "Open **Dojo settings**.",
      "Update the required dojo details.",
      "Choose **Save** and check the confirmation message.",
    ],
    action: "Open dojo settings",
  },
];

const thText: Array<[string, string, string[], string]> = [
  [
    "อนุมัติโปรไฟล์นักเรียนใหม่อย่างไร?",
    "ตรวจสอบโปรไฟล์ที่ส่งมาและบันทึกผล",
    [
      "เปิด **คำขอประวัตินักเรียน** แล้วเลือกนักเรียน",
      "ตรวจสอบข้อมูลและรูปภาพ แล้วเลือก **อนุมัติ** หรือ **ไม่อนุมัติ**",
      "ยืนยันผลและใส่เหตุผลที่ชัดเจนเมื่อไม่อนุมัติ",
    ],
    "เปิดคำขอโปรไฟล์",
  ],
  [
    "ตรวจสอบหลักฐานชำระเงินอย่างไร?",
    "ดูสลิปก่อนอนุมัติหรือปฏิเสธ",
    [
      "เปิด **หลักฐานการชำระเงิน** แล้วเลือก **ดูหลักฐาน**",
      "ตรวจสอบภาพหรือ PDF และใช้ **เปิดหลักฐานขนาดเต็ม** เมื่อจำเป็น",
      "เลือก **ยืนยันการชำระเงิน** หรือ **ไม่อนุมัติหลักฐาน** แล้วกดยืนยัน",
    ],
    "เปิดหลักฐานชำระเงิน",
  ],
  [
    "ตัดสินหลักฐานหลายรายการพร้อมกันอย่างไร?",
    "อนุมัติหรือปฏิเสธหลายรายการในการยืนยันครั้งเดียว",
    [
      "เปิด **หลักฐานการชำระเงิน** แล้วเลือกรายการที่รอตรวจสอบในตาราง",
      "เลือก **ยืนยันการชำระเงิน** หรือ **ไม่อนุมัติหลักฐาน** ในแถบการทำงาน",
      "ตรวจสอบจำนวน ใส่เหตุผลเมื่อปฏิเสธ แล้วกดยืนยัน",
    ],
    "เปิดหลักฐานชำระเงิน",
  ],
  [
    "ดาวน์โหลดรายงานการสอบเป็น PDF อย่างไร?",
    "ดาวน์โหลดรายงานเฉพาะนักเรียนที่มีสถานะชำระแล้ว",
    [
      "เปิด **ใบสมัครสอบ** แล้วเลือกรอบที่ **รอบการสอบ**",
      "ตั้ง **ขอบเขตรายงาน** เป็นโดโจเดียว หรือปล่อยไว้ที่ **ทุกโดโจ**",
      "เลือก **PDF** หรือ **PDF สำหรับพิมพ์** สำหรับฉบับขาวดำ รายงานจะมีเฉพาะนักเรียนสถานะ **ชำระแล้ว**",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "ดาวน์โหลดรายงานการสอบเป็น Excel อย่างไร?",
    "ส่งออกรายงานเดียวกันเป็นไฟล์ Excel",
    [
      "เปิด **ใบสมัครสอบ** แล้วเลือกรอบที่ **รอบการสอบ**",
      "ตั้ง **ขอบเขตรายงาน** เป็นโดโจเดียว หรือปล่อยไว้ที่ **ทุกโดโจ**",
      "เลือก **Excel** รายงานจะมีเฉพาะนักเรียนสถานะ **ชำระแล้ว**",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "ทำเครื่องหมายว่านักเรียนชำระค่าสอบแล้วอย่างไร?",
    "บันทึกการชำระค่าสอบเพื่อให้นักเรียนปรากฏในรายงาน",
    [
      "เปิด **ใบสมัครสอบ** แล้วค้นหานักเรียนในรายชื่อ",
      "ใช้เมนูสถานะในคอลัมน์ **การดำเนินการ** หรือเลือกหลายคนแล้วใช้แถบการทำงาน",
      "เลือก **ชำระแล้ว** แล้วกดยืนยัน เฉพาะนักเรียนสถานะ **ชำระแล้ว** เท่านั้นที่อยู่ในรายงาน PDF และ Excel",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "แก้ไขชั่วโมงฝึกของนักเรียนอย่างไร?",
    "เพิ่มชั่วโมงที่ยืนยันหรือแก้ไขยอดรวม",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วเลือก **เปิดระเบียน** ของนักเรียน",
      "เปิด **การฝึก** แล้วเพิ่มชั่วโมงหรือแก้ยอดรวมที่บันทึกไว้",
      "ตรวจสอบค่าแล้วเลือก **บันทึก**",
    ],
    "เปิดฐานข้อมูลนักเรียน",
  ],
  [
    "เลื่อนหรือลดระดับนักเรียนอย่างไร?",
    "เปลี่ยนระดับโดยเก็บประวัติเดิม",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วเลือก **เปิดระเบียน** ของนักเรียน",
      "เปิด **โปรไฟล์** เพื่อตั้งระดับโดยตรง หรือ **การสอบ** เพื่อบันทึกผล",
      "ตรวจสอบการเปลี่ยนแปลงแล้วเลือก **บันทึก**",
    ],
    "เปิดฐานข้อมูลนักเรียน",
  ],
  [
    "เก็บนักเรียนเข้าคลังอย่างไร?",
    "ย้ายนักเรียนที่ไม่ใช้งานออกจากรายการปัจจุบัน",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วเลือกนักเรียนในตาราง",
      "เลือก **เก็บระเบียนถาวร** จาก **กำหนดสถานะระเบียน**",
      "ตรวจสอบและยืนยัน",
    ],
    "เปิดฐานข้อมูลนักเรียน",
  ],
  [
    "คืนนักเรียนจากคลังอย่างไร?",
    "นำนักเรียนที่เก็บไว้กลับสู่ฐานข้อมูลปัจจุบัน",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วเลือกแท็บ **เก็บถาวร**",
      "เลือกนักเรียน แล้วเลือก **นำระเบียนออกจากคลัง** จาก **กำหนดสถานะระเบียน**",
      "ตรวจสอบและยืนยัน",
    ],
    "เปิดนักเรียนที่เก็บไว้",
  ],
  [
    "เขียนและเผยแพร่จดหมายข่าวอย่างไร?",
    "สร้างฉบับร่าง ตรวจสอบ และเผยแพร่",
    [
      "เปิด **แก้ไขเว็บไซต์** แล้วไปที่ **จดหมายข่าว**",
      "กรอก **ชื่อเรื่อง** **สรุปสั้น** **หมวดหมู่** เนื้อหา และการตั้งค่าอีเมล",
      "ไปจนถึง **ตรวจสอบและเผยแพร่** แล้วเลือกเผยแพร่",
    ],
    "จัดการจดหมายข่าว",
  ],
  [
    "เพิ่มหรือแก้ไขหมายเลขสมาชิก AAT อย่างไร?",
    "บันทึกหรือแก้หมายเลขสมาชิก AAT ในระเบียนนักเรียน",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วเลือก **เปิดระเบียน** ของนักเรียน",
      "เปิด **โปรไฟล์** แล้วเลือกแก้ไขรายละเอียดโปรไฟล์",
      "กรอก **หมายเลขสมาชิก AAT** แล้วเลือก **บันทึก** ระบบจะบันทึกการเปลี่ยนแปลงไว้ในบันทึกการตรวจสอบ",
    ],
    "เปิดฐานข้อมูลนักเรียน",
  ],
  [
    "เปลี่ยนรหัสนักเรียนอย่างไร?",
    "แก้รหัสนักเรียนที่โดโจออกให้ในระเบียนเดิม",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วเลือก **เปิดระเบียน** ของนักเรียน",
      "เปิด **โปรไฟล์** แล้วเลือกแก้ไขรายละเอียดโปรไฟล์",
      "กรอก **รหัสนักเรียน** ที่ถูกต้องแล้วเลือก **บันทึก** รหัสเดิมยังเปิดโปรไฟล์เดียวกันได้",
    ],
    "เปิดฐานข้อมูลนักเรียน",
  ],
  [
    "ตรวจสอบคำขอชั่วโมงฝึกอย่างไร?",
    "อนุมัติหรือปฏิเสธชั่วโมงที่นักเรียนส่ง",
    [
      "เปิด **คำขอชั่วโมงฝึก** แล้วเลือกนักเรียน",
      "ตรวจสอบวันที่ฝึก แหล่งที่มา และจำนวนชั่วโมง",
      "เลือก **อนุมัติ** หรือปฏิเสธพร้อมเหตุผลที่ชัดเจน",
    ],
    "เปิดคำขอชั่วโมงฝึก",
  ],
  [
    "ตรวจสอบใบสมัครสอบอย่างไร?",
    "ตรวจสอบใบสมัคร การชำระ และสถานะ",
    [
      "เปิด **ใบสมัครสอบ** แล้วเลือกรอบที่ **รอบการสอบ**",
      "เปิดระเบียนของนักเรียนแล้วตรวจสอบคำตอบที่ส่งมา",
      "บันทึกสถานะการชำระเงินหรือผลการตัดสินใบสมัคร",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "บันทึกหรือแก้ไขผลสอบอย่างไร?",
    "บันทึกการสอบที่เสร็จแล้วในประวัติถาวร",
    [
      "เปิด **บันทึกผลสอบ** แล้วค้นหานักเรียน",
      "เลือก **เปิดระเบียน** แล้วกรอกผล ระดับ วันที่ และสถานที่",
      "ตรวจสอบแล้วเลือก **บันทึก**",
    ],
    "เปิดบันทึกผลสอบ",
  ],
  [
    "ค้นหาและกรองนักเรียนอย่างไร?",
    "ค้นหานักเรียนทุกโดโจด้วยตัวกรองสั้น ๆ",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วพิมพ์ชื่อ รหัสนักเรียน หรือหมายเลข AAT ในช่อง **ค้นหาด้วยชื่อ รหัสนักเรียน หรือหมายเลข AAT**",
      "จำกัดรายการด้วย **โดโจ** **ระดับปัจจุบัน** หรือ **ลำดับการเรียง** และใช้ **ล้างตัวกรอง** เพื่อรีเซ็ต",
      "เลือก **เปิดระเบียน** ของนักเรียนที่ตรงกัน",
    ],
    "ค้นหานักเรียน",
  ],
  [
    "ตรวจสอบเงินสมทบรายเดือนอย่างไร?",
    "ดูผู้ที่ชำระ รอตรวจสอบ หรือขาดชำระ",
    [
      "เปิด **เงินสมทบรายเดือน**",
      "กรองด้วย **สถานะ** **ระดับปัจจุบัน** **ชำระล่าสุด** หรือ **ลำดับการเรียง**",
      "เปิดหรืออัปเดตระเบียนที่ต้องการ",
    ],
    "เปิดเงินสมทบรายเดือน",
  ],
  [
    "ตรวจสอบเงินสมทบ AAT รายปีอย่างไร?",
    "ตรวจเลข AAT วันที่ชำระล่าสุด และสถานะรายปี",
    [
      "เปิด **เงินสมทบ AAT รายปี**",
      "กรองด้วย **โดโจ** **ระดับปัจจุบัน** **ชำระล่าสุด** หรือ **ลำดับการเรียง**",
      "เลือก **บันทึกการชำระเงิน** หรือเปิดระเบียนนักเรียนเมื่อจำเป็น",
    ],
    "เปิดเงินสมทบ AAT",
  ],
  [
    "ดูประวัตินักเรียนทั้งหมดอย่างไร?",
    "ดูโปรไฟล์ การฝึก การสอบ การชำระ และประวัติ",
    [
      "เปิด **ฐานข้อมูลนักเรียน** แล้วค้นหานักเรียน",
      "เลือก **เปิดระเบียน**",
      "ใช้แท็บ **ภาพรวม** **โปรไฟล์** **การฝึก** **การสอบ** **การชำระเงิน** และ **ประวัติ**",
    ],
    "เปิดฐานข้อมูลนักเรียน",
  ],
  [
    "เผยแพร่รูปแกลเลอรีอย่างไร?",
    "เพิ่ม จัดเรียง และเผยแพร่รูปโดโจ",
    [
      "เปิด **แก้ไขเว็บไซต์** แล้วเลือกแกลเลอรี",
      "อัปโหลดรูป ใส่คำอธิบายที่เป็นประโยชน์ และจัดเรียง",
      "ดูตัวอย่างแล้วเลือก **เผยแพร่แกลเลอรี**",
    ],
    "จัดการแกลเลอรี",
  ],
  [
    "จัดการไฟล์ดาวน์โหลดอย่างไร?",
    "เพิ่มหรืออัปเดตไฟล์ในหน้าดาวน์โหลด",
    [
      "เปิด **ดาวน์โหลด**",
      "เพิ่มไฟล์และกรอกชื่อกับรายละเอียดสำหรับสาธารณะ",
      "เลือก **บันทึก** แล้วตรวจสอบไฟล์บนหน้าดาวน์โหลดสาธารณะ",
    ],
    "จัดการดาวน์โหลด",
  ],
  [
    "ตรวจสอบการเปลี่ยนแปลงก่อนหน้าอย่างไร?",
    "ค้นหาประวัติการทำงานถาวร",
    [
      "เปิด **บันทึกการตรวจสอบ**",
      "ค้นหาตามนักเรียน ผู้ดูแล โดโจ หรือวันที่",
      "เปิดรายการที่ตรงกันเพื่อตรวจสอบ",
    ],
    "เปิดบันทึกการตรวจสอบ",
  ],
  [
    "แก้ไขรายละเอียดโดโจอย่างไร?",
    "ดูแลชื่อและข้อมูลติดต่อของโดโจ",
    [
      "เปิด **การตั้งค่าโดโจ**",
      "แก้ไขรายละเอียดโดโจที่ต้องการ",
      "เลือก **บันทึก** แล้วตรวจสอบข้อความยืนยัน",
    ],
    "เปิดการตั้งค่าโดโจ",
  ],
];

const th = en.map((topic, index) => ({
  ...topic,
  title: thText[index][0],
  summary: thText[index][1],
  steps: thText[index][2],
  action: thText[index][3],
}));

export function getAdminHelpCatalog(locale: AdminLanguage): HelpCatalog {
  return {
    audience: "admin",
    locale,
    ui: ui[locale],
    articles: buildArticles(
      "admin",
      locale,
      (locale === "th" ? th : en).map(article),
    ),
  };
}
