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

const en: Topic[] = [
  {
    id: "admin-profile-approval",
    category: "student-records",
    href: "/admin/profile-requests",
    title: "How do I approve a new student profile?",
    summary: "Review a submitted profile and record a decision.",
    steps: [
      "Open Profile requests and select a student.",
      "Check the profile details and image, then choose Accept profile or Deny profile.",
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
      "Open Payment proofs and select View proof.",
      "Inspect the image or PDF; use Open full-size proof when needed.",
      "Choose Confirm payment or Reject proof and confirm the decision.",
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
      "Select the pending proofs in the table.",
      "Choose Confirm payment or Reject proof in the bulk bar.",
      "Review the count, add a reason when rejecting, then confirm.",
    ],
    action: "Open payment proofs",
  },
  {
    id: "admin-exam-pdf",
    category: "examinations",
    href: "/admin/exam-applications",
    title: "How do I download exam application PDFs?",
    summary: "Download the selected exam applications as PDF files.",
    steps: [
      "Open Exam applications and filter the list if needed.",
      "Select the applications to include.",
      "Choose the PDF download action.",
    ],
    action: "Open exam applications",
  },
  {
    id: "admin-exam-excel",
    category: "examinations",
    href: "/admin/exam-applications",
    title: "How do I download exam applications to Excel?",
    summary: "Export the selected exam application details.",
    steps: [
      "Open Exam applications and filter the list.",
      "Select the applications to include.",
      "Choose the Excel download action.",
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
      "Open Students and open the student record.",
      "Open Training, then add hours or edit the total shown in the student table.",
      "Review the value and save it.",
    ],
    action: "Open students",
  },
  {
    id: "admin-rank",
    category: "student-records",
    href: "/admin/students",
    title: "How do I promote or demote a student?",
    summary: "Change a rank while keeping the record history.",
    steps: [
      "Open the student record and select Profile or Examinations.",
      "Choose the correct rank or record an examination result.",
      "Review the change and save it.",
    ],
    action: "Open students",
  },
  {
    id: "admin-archive",
    category: "student-records",
    href: "/admin/students",
    title: "How do I archive a student?",
    summary: "Move an inactive student out of the active list.",
    steps: [
      "Select the student in the Students table.",
      "Choose Archive records from Set record status.",
      "Review the selected student and confirm.",
    ],
    action: "Open students",
  },
  {
    id: "admin-restore",
    category: "student-records",
    href: "/admin/students",
    title: "How do I restore an archived student?",
    summary: "Return an archived student to the active database.",
    steps: [
      "Set Record status to Archived.",
      "Select the student and choose Unarchive records.",
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
      "Open Edit the website and go to Newsletters.",
      "Create or edit the draft, including title, text, image, and email settings.",
      "Preview it, then choose Publish when it is ready.",
    ],
    action: "Manage newsletters",
  },
  {
    id: "admin-aat-number",
    category: "payments",
    href: "/admin/students",
    title: "How do I change a student’s AAT number?",
    summary: "Correct the AAT membership number in the student record.",
    steps: [
      "Open the student record and select Profile.",
      "Open the profile details editor and update AAT membership number.",
      "Save the details.",
    ],
    action: "Open students",
  },
  {
    id: "admin-training",
    category: "training",
    href: "/admin/training-requests",
    title: "How do I review training-hour requests?",
    summary: "Approve or reject hours submitted by students.",
    steps: [
      "Open Training hour requests and select a student.",
      "Check the date, source, and requested hours.",
      "Approve the request or reject it with a clear reason.",
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
      "Open Exam applications and select an application.",
      "Review the student details and questionnaire.",
      "Record the appropriate payment or application decision.",
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
      "Open Application records and find the student.",
      "Open the record and enter the result, rank, date, and location.",
      "Review and save the examination.",
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
      "Open Students and enter a name, Student ID, or AAT number.",
      "Choose dojo, rank, record status, or sort order if needed.",
      "Open the matching student record.",
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
      "Open Monthly contributions.",
      "Choose the dojo, rank, status, last-paid option, or sort order.",
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
      "Open AAT annual contributions.",
      "Filter by dojo, rank, AAT status, last paid, or sort order.",
      "Open the student record or payment proof when action is needed.",
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
      "Find the student in Students.",
      "Choose Open record.",
      "Use Overview, Profile, Training, Examinations, Payments, and History.",
    ],
    action: "Open students",
  },
  {
    id: "admin-gallery",
    category: "news-resources",
    href: "/admin/website",
    title: "How do I publish gallery photos?",
    summary: "Add, arrange, and publish dojo gallery images.",
    steps: [
      "Open Edit the website and choose the gallery.",
      "Upload images, add useful descriptions, and arrange them.",
      "Preview and publish the changes.",
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
      "Open Downloads.",
      "Add a file and complete its public title and details.",
      "Save and verify the public download.",
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
      "Open Audit log.",
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
      "Open Dojo settings.",
      "Update the required dojo details.",
      "Save the dojo and check the confirmation.",
    ],
    action: "Open dojo settings",
  },
];

const thText: Array<[string, string, string[], string]> = [
  [
    "อนุมัติโปรไฟล์นักเรียนใหม่อย่างไร?",
    "ตรวจสอบโปรไฟล์ที่ส่งมาและบันทึกผล",
    [
      "เปิด คำขอโปรไฟล์ แล้วเลือกนักเรียน",
      "ตรวจสอบข้อมูลและรูปภาพ แล้วเลือกยอมรับหรือปฏิเสธ",
      "ยืนยันผลและใส่เหตุผลที่ชัดเจนเมื่อปฏิเสธ",
    ],
    "เปิดคำขอโปรไฟล์",
  ],
  [
    "ตรวจสอบหลักฐานชำระเงินอย่างไร?",
    "ดูสลิปก่อนอนุมัติหรือปฏิเสธ",
    [
      "เปิด หลักฐานชำระเงิน แล้วเลือก ดูหลักฐาน",
      "ตรวจสอบภาพหรือ PDF และเปิดขนาดเต็มหากจำเป็น",
      "เลือกยืนยันการชำระหรือปฏิเสธ แล้วกดยืนยัน",
    ],
    "เปิดหลักฐานชำระเงิน",
  ],
  [
    "ตัดสินหลักฐานหลายรายการพร้อมกันอย่างไร?",
    "อนุมัติหรือปฏิเสธหลายรายการในการยืนยันครั้งเดียว",
    [
      "เลือกรายการที่รอตรวจสอบในตาราง",
      "เลือกยืนยันการชำระหรือปฏิเสธในแถบการทำงาน",
      "ตรวจสอบจำนวน ใส่เหตุผลเมื่อปฏิเสธ แล้วกดยืนยัน",
    ],
    "เปิดหลักฐานชำระเงิน",
  ],
  [
    "ดาวน์โหลดใบสมัครสอบ PDF อย่างไร?",
    "ดาวน์โหลดใบสมัครที่เลือกเป็น PDF",
    [
      "เปิด ใบสมัครสอบ และกรองรายการหากต้องการ",
      "เลือกใบสมัครที่ต้องการ",
      "เลือกดาวน์โหลด PDF",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "ดาวน์โหลดใบสมัครสอบ Excel อย่างไร?",
    "ส่งออกรายละเอียดใบสมัครที่เลือก",
    [
      "เปิด ใบสมัครสอบ และกรองรายการ",
      "เลือกใบสมัครที่ต้องการ",
      "เลือกดาวน์โหลด Excel",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "แก้ไขชั่วโมงฝึกของนักเรียนอย่างไร?",
    "เพิ่มชั่วโมงที่ยืนยันหรือแก้ไขยอดรวม",
    [
      "เปิด นักเรียน แล้วเปิดประวัตินักเรียน",
      "เปิด การฝึก แล้วเพิ่มชั่วโมงหรือแก้ยอดในตาราง",
      "ตรวจสอบค่าแล้วบันทึก",
    ],
    "เปิดรายชื่อนักเรียน",
  ],
  [
    "เลื่อนหรือลดระดับนักเรียนอย่างไร?",
    "เปลี่ยนระดับโดยเก็บประวัติเดิม",
    [
      "เปิดประวัตินักเรียน แล้วเลือก โปรไฟล์ หรือ การสอบ",
      "เลือกระดับที่ถูกต้องหรือบันทึกผลสอบ",
      "ตรวจสอบและบันทึก",
    ],
    "เปิดรายชื่อนักเรียน",
  ],
  [
    "เก็บนักเรียนเข้าคลังอย่างไร?",
    "ย้ายนักเรียนที่ไม่ใช้งานออกจากรายการปัจจุบัน",
    [
      "เลือกนักเรียนในตาราง",
      "เลือก เก็บเข้าคลัง จากสถานะระเบียน",
      "ตรวจสอบและยืนยัน",
    ],
    "เปิดรายชื่อนักเรียน",
  ],
  [
    "คืนนักเรียนจากคลังอย่างไร?",
    "นำนักเรียนที่เก็บไว้กลับสู่ฐานข้อมูลปัจจุบัน",
    [
      "ตั้งสถานะระเบียนเป็น เก็บเข้าคลัง",
      "เลือกนักเรียนและเลือก ยกเลิกการเก็บเข้าคลัง",
      "ตรวจสอบและยืนยัน",
    ],
    "เปิดนักเรียนที่เก็บไว้",
  ],
  [
    "เขียนและเผยแพร่จดหมายข่าวอย่างไร?",
    "สร้างฉบับร่าง ตรวจสอบ และเผยแพร่",
    [
      "เปิด แก้ไขเว็บไซต์ แล้วไปที่ จดหมายข่าว",
      "สร้างหรือแก้ไขหัวข้อ เนื้อหา รูปภาพ และอีเมล",
      "ดูตัวอย่างแล้วเลือก เผยแพร่",
    ],
    "จัดการจดหมายข่าว",
  ],
  [
    "เปลี่ยนเลขสมาชิก AAT อย่างไร?",
    "แก้เลขสมาชิกในประวัตินักเรียน",
    [
      "เปิดประวัตินักเรียนและเลือก โปรไฟล์",
      "เปิดตัวแก้ไขรายละเอียดแล้วแก้เลขสมาชิก AAT",
      "บันทึกรายละเอียด",
    ],
    "เปิดรายชื่อนักเรียน",
  ],
  [
    "ตรวจสอบคำขอชั่วโมงฝึกอย่างไร?",
    "อนุมัติหรือปฏิเสธชั่วโมงที่นักเรียนส่ง",
    [
      "เปิด คำขอชั่วโมงฝึก แล้วเลือกนักเรียน",
      "ตรวจสอบวันที่ แหล่งที่มา และจำนวนชั่วโมง",
      "อนุมัติหรือปฏิเสธพร้อมเหตุผล",
    ],
    "เปิดคำขอชั่วโมงฝึก",
  ],
  [
    "ตรวจสอบใบสมัครสอบอย่างไร?",
    "ตรวจสอบใบสมัคร การชำระ และสถานะ",
    [
      "เปิด ใบสมัครสอบ แล้วเลือกใบสมัคร",
      "ตรวจสอบข้อมูลนักเรียนและแบบสอบถาม",
      "บันทึกผลการชำระหรือการตัดสินใจ",
    ],
    "เปิดใบสมัครสอบ",
  ],
  [
    "บันทึกหรือแก้ไขผลสอบอย่างไร?",
    "บันทึกการสอบที่เสร็จแล้วในประวัติถาวร",
    [
      "เปิด บันทึกผลสอบ แล้วค้นหานักเรียน",
      "กรอกผล ระดับ วันที่ และสถานที่",
      "ตรวจสอบและบันทึก",
    ],
    "เปิดบันทึกผลสอบ",
  ],
  [
    "ค้นหาและกรองนักเรียนอย่างไร?",
    "ค้นหานักเรียนทุกโดโจด้วยตัวกรองสั้น ๆ",
    [
      "เปิด นักเรียน แล้วกรอกชื่อ รหัสนักเรียน หรือเลข AAT",
      "เลือกโดโจ ระดับ สถานะ หรือการเรียงหากต้องการ",
      "เปิดประวัติที่ตรงกัน",
    ],
    "ค้นหานักเรียน",
  ],
  [
    "ตรวจสอบเงินสมทบรายเดือนอย่างไร?",
    "ดูผู้ที่ชำระ รอตรวจสอบ หรือขาดชำระ",
    [
      "เปิด เงินสมทบรายเดือน",
      "เลือกโดโจ ระดับ สถานะ ชำระล่าสุด หรือการเรียง",
      "เปิดหรืออัปเดตระเบียนที่ต้องการ",
    ],
    "เปิดเงินสมทบรายเดือน",
  ],
  [
    "ตรวจสอบเงินสมทบ AAT รายปีอย่างไร?",
    "ตรวจเลข AAT วันที่ชำระล่าสุด และสถานะรายปี",
    [
      "เปิด เงินสมทบ AAT รายปี",
      "กรองตามโดโจ ระดับ สถานะ ชำระล่าสุด หรือการเรียง",
      "เปิดประวัตินักเรียนหรือหลักฐานเมื่อจำเป็น",
    ],
    "เปิดเงินสมทบ AAT",
  ],
  [
    "ดูประวัตินักเรียนทั้งหมดอย่างไร?",
    "ดูโปรไฟล์ การฝึก การสอบ การชำระ และประวัติ",
    [
      "ค้นหานักเรียนในหน้า นักเรียน",
      "เลือก เปิดประวัติ",
      "ใช้แท็บ ภาพรวม โปรไฟล์ การฝึก การสอบ การชำระ และประวัติ",
    ],
    "เปิดรายชื่อนักเรียน",
  ],
  [
    "เผยแพร่รูปแกลเลอรีอย่างไร?",
    "เพิ่ม จัดเรียง และเผยแพร่รูปโดโจ",
    [
      "เปิด แก้ไขเว็บไซต์ แล้วเลือกแกลเลอรี",
      "อัปโหลดรูป ใส่คำอธิบาย และจัดเรียง",
      "ดูตัวอย่างและเผยแพร่",
    ],
    "จัดการแกลเลอรี",
  ],
  [
    "จัดการไฟล์ดาวน์โหลดอย่างไร?",
    "เพิ่มหรืออัปเดตไฟล์ในหน้าดาวน์โหลด",
    [
      "เปิด ดาวน์โหลด",
      "เพิ่มไฟล์และกรอกชื่อกับรายละเอียด",
      "บันทึกและตรวจสอบหน้าสาธารณะ",
    ],
    "จัดการดาวน์โหลด",
  ],
  [
    "ตรวจสอบการเปลี่ยนแปลงก่อนหน้าอย่างไร?",
    "ค้นหาประวัติการทำงานถาวร",
    [
      "เปิด บันทึกการตรวจสอบ",
      "ค้นหาตามนักเรียน ผู้ดูแล โดโจ หรือวันที่",
      "เปิดรายการที่ตรงกันเพื่อตรวจสอบ",
    ],
    "เปิดบันทึกการตรวจสอบ",
  ],
  [
    "แก้ไขรายละเอียดโดโจอย่างไร?",
    "ดูแลชื่อและข้อมูลติดต่อของโดโจ",
    [
      "เปิด การตั้งค่าโดโจ",
      "แก้ไขรายละเอียดที่ต้องการ",
      "บันทึกและตรวจสอบข้อความยืนยัน",
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
