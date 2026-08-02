import type { Language } from "../../i18n";
import type { HelpCatalog, HelpUiCopy } from "../types";
import { buildArticles, categories, type LocalizedArticle } from "./shared";

const screenshotRoot = "/help/screenshots";

const ui: Record<Language, HelpUiCopy> = {
  en: {
    trigger: "Help",
    triggerAriaLabel: "Open website help",
    heading: "How to use this website",
    guideDescription:
      "A guide to the RenShinKan website. It is not a person or chat service.",
    close: "Close help",
    searchLabel: "Search help",
    searchPlaceholder: "Search topics",
    searchStatus: (count) =>
      `${count} ${count === 1 ? "topic" : "topics"} found`,
    suggested: "Suggested for this page",
    allTopics: "All help topics",
    categories: categories.en,
    back: "Back to all topics",
    breadcrumb: "Help topics",
    steps: "Steps",
    expectedResult: "What happens",
    troubleshooting: "If it does not work",
    related: "Related topics",
    noResults: "No help topics match your search.",
    resetSearch: "Clear search",
    imageUnavailable:
      "Guide image unavailable. The written steps are still complete.",
    copied: "Link copied",
    copyLink: "Copy direct link",
    smallerText: "Use smaller help text",
    largerText: "Use larger help text",
    loading: "Loading help",
    contentUnavailable:
      "Help content could not be loaded. The rest of the website is still available.",
    retry: "Try again",
  },
  th: {
    trigger: "ช่วยเหลือ",
    triggerAriaLabel: "เปิดคู่มือเว็บไซต์",
    heading: "วิธีใช้เว็บไซต์นี้",
    guideDescription:
      "คู่มือการใช้เว็บไซต์ RenShinKan ไม่ใช่บุคคลหรือบริการแชต",
    close: "ปิดคู่มือ",
    searchLabel: "ค้นหาคู่มือ",
    searchPlaceholder: "ค้นหาหัวข้อ",
    searchStatus: (count) => `พบ ${count} หัวข้อ`,
    suggested: "แนะนำสำหรับหน้านี้",
    allTopics: "หัวข้อช่วยเหลือทั้งหมด",
    categories: categories.th,
    back: "กลับไปหัวข้อทั้งหมด",
    breadcrumb: "หัวข้อช่วยเหลือ",
    steps: "ขั้นตอน",
    expectedResult: "ผลที่ได้",
    troubleshooting: "หากไม่สำเร็จ",
    related: "หัวข้อที่เกี่ยวข้อง",
    noResults: "ไม่พบหัวข้อที่ตรงกับคำค้น",
    resetSearch: "ล้างคำค้น",
    imageUnavailable:
      "ไม่สามารถแสดงภาพคู่มือได้ แต่ยังทำตามขั้นตอนที่เขียนไว้ได้ครบถ้วน",
    copied: "คัดลอกลิงก์แล้ว",
    copyLink: "คัดลอกลิงก์ตรง",
    smallerText: "ลดขนาดตัวอักษรคู่มือ",
    largerText: "เพิ่มขนาดตัวอักษรคู่มือ",
    loading: "กำลังโหลดคู่มือ",
    contentUnavailable:
      "โหลดเนื้อหาคู่มือไม่ได้ แต่ส่วนอื่นของเว็บไซต์ยังใช้งานได้",
    retry: "ลองอีกครั้ง",
  },
  ja: {
    trigger: "ヘルプ",
    triggerAriaLabel: "ウェブサイトのヘルプを開く",
    heading: "このウェブサイトの使い方",
    guideDescription:
      "RenShinKanウェブサイトの操作ガイドです。人やチャットサービスではありません。",
    close: "ヘルプを閉じる",
    searchLabel: "ヘルプを検索",
    searchPlaceholder: "トピックを検索",
    searchStatus: (count) => `${count}件のトピック`,
    suggested: "このページのおすすめ",
    allTopics: "すべてのヘルプトピック",
    categories: categories.ja,
    back: "すべてのトピックに戻る",
    breadcrumb: "ヘルプトピック",
    steps: "手順",
    expectedResult: "結果",
    troubleshooting: "うまくいかない場合",
    related: "関連トピック",
    noResults: "検索に一致するトピックがありません。",
    resetSearch: "検索を消去",
    imageUnavailable:
      "ガイド画像を表示できません。文章の手順は引き続き利用できます。",
    copied: "リンクをコピーしました",
    copyLink: "直接リンクをコピー",
    smallerText: "ヘルプの文字を小さくする",
    largerText: "ヘルプの文字を大きくする",
    loading: "ヘルプを読み込み中",
    contentUnavailable:
      "ヘルプを読み込めませんでした。ウェブサイトのほかの機能は利用できます。",
    retry: "再試行",
  },
  "zh-CN": {
    trigger: "帮助",
    triggerAriaLabel: "打开网站帮助",
    heading: "如何使用本网站",
    guideDescription: "这是RenShinKan网站操作指南，并非真人或聊天服务。",
    close: "关闭帮助",
    searchLabel: "搜索帮助",
    searchPlaceholder: "搜索主题",
    searchStatus: (count) => `找到 ${count} 个主题`,
    suggested: "本页推荐",
    allTopics: "所有帮助主题",
    categories: categories["zh-CN"],
    back: "返回所有主题",
    breadcrumb: "帮助主题",
    steps: "步骤",
    expectedResult: "结果",
    troubleshooting: "如果没有成功",
    related: "相关主题",
    noResults: "没有与搜索匹配的帮助主题。",
    resetSearch: "清除搜索",
    imageUnavailable: "指南图片无法显示，完整的文字步骤仍可使用。",
    copied: "链接已复制",
    copyLink: "复制直接链接",
    smallerText: "缩小帮助文字",
    largerText: "放大帮助文字",
    loading: "正在加载帮助",
    contentUnavailable: "无法加载帮助内容，网站其他部分仍可使用。",
    retry: "重试",
  },
};

const routes = {
  start: ["/", "/aikido", "/classes", "/instructors", "/workshops"],
  profile: ["/student-records"],
  training: ["/student-records"],
  exams: ["/student-records"],
  payments: ["/student-records", "/support"],
  passport: ["/student-records"],
  sharing: ["/student-records", "/records/share/:token"],
  news: ["/newsletter", "/newsletter/:slug"],
  resources: ["/downloads"],
  support: ["/support", "/contact"],
};

const related = {
  start: ["public-profile", "public-news"],
  profile: ["public-training", "public-passport"],
  training: ["public-profile", "public-exams"],
  exams: ["public-training", "public-passport"],
  payments: ["public-passport", "public-support"],
  passport: ["public-sharing", "public-profile"],
  sharing: ["public-passport", "public-support"],
  news: ["public-resources", "public-start"],
  resources: ["public-news", "public-support"],
  support: ["public-profile", "public-payments"],
};

const publicScreenshots: Partial<Record<Language, Record<string, string>>> = {
  en: {
    start: `${screenshotRoot}/public-home-en-desktop-v2026-07.webp`,
    profile: `${screenshotRoot}/student-records-en-mobile-v2026-07.webp`,
    news: `${screenshotRoot}/newsletter-en-desktop-v2026-07.webp`,
    resources: `${screenshotRoot}/downloads-en-desktop-v2026-07.webp`,
  },
};

function enArticles(): LocalizedArticle[] {
  return [
    {
      id: "public-start",
      category: "getting-started",
      routes: routes.start,
      title: "Find your way around the website",
      summary:
        "Use the main menu and language control to reach dojo information, schedules, news, records, and support.",
      steps: [
        {
          title: "Choose a language",
          instruction:
            "Open the language control in the site header and choose English, ไทย, 中文, or 日本語.",
          result:
            "Navigation and help content change to the selected language.",
        },
        {
          title: "Open a section",
          instruction:
            "Use the main menu and choose the page you need, such as “Classes”, “News”, or “Student Record”.",
          result:
            "The selected page opens and its menu item is marked as current.",
        },
        {
          title: "Return home",
          instruction: "Select the “RenShinKan” logo at the top of the page.",
          result: "The dojo home page opens.",
        },
      ],
      troubleshooting: [
        {
          issue: "The mobile menu covers the page.",
          fix: "Choose a link, select “Close menu”, or press Escape.",
        },
      ],
      related: related.start,
      keywords: ["menu", "language", "navigation", "home", "classes"],
      screenshots: publicScreenshots.en?.start
        ? [
            {
              src: publicScreenshots.en.start,
              alt: "RenShinKan home page with the main navigation and language control visible",
              caption:
                "The main menu and language control are in the page header.",
            },
          ]
        : [],
    },
    {
      id: "public-profile",
      category: "student-records",
      routes: routes.profile,
      title: "Look up or update your student profile",
      summary:
        "Open your student workspace with the name used for the profile and your Student ID, then send changes for dojo review.",
      steps: [
        {
          title: "Open your record",
          instruction:
            "On “Student Record”, enter the name used for the profile and the Student ID, then select “Find my record”.",
          result:
            "Your private student workspace opens when the details match.",
        },
        {
          title: "Start a correction",
          instruction:
            "In the profile section, select “Request a profile update”. Change only the fields that need correction.",
          result:
            "A review form shows the proposed values before anything is sent.",
        },
        {
          title: "Send for review",
          instruction:
            "Check the information, then select “Submit update request”.",
          result:
            "The request is sent to your dojo; your official record changes only after approval.",
        },
      ],
      troubleshooting: [
        {
          issue: "Your record is not found.",
          fix: "Check the name and Student ID. Use “Contact us” if the same details still fail.",
        },
        {
          issue: "Your new details do not appear yet.",
          fix: "Profile updates require administrator approval. Check the request status later.",
        },
      ],
      related: related.profile,
      keywords: [
        "student record",
        "profile",
        "Student ID",
        "update",
        "correction",
        "approval",
      ],
      screenshots: publicScreenshots.en?.profile
        ? [
            {
              src: publicScreenshots.en.profile,
              alt: "Student Record lookup form on a mobile-width screen using demonstration fields only",
              caption:
                "Use the Student Record page to open your workspace with your name and Student ID.",
            },
          ]
        : [],
    },
    {
      id: "public-training",
      category: "training",
      routes: routes.training,
      title: "Check hours or report missing training",
      summary:
        "Your training summary shows recorded hours. A missing session can be sent to your dojo for review.",
      steps: [
        {
          title: "Review the total",
          instruction:
            "Open your student workspace and choose the training section. Review total hours and recent entries.",
          result:
            "You can see which sessions are already in your official record.",
        },
        {
          title: "Report a missing session",
          instruction:
            "Select “Report missing training”, enter the date, dojo, duration, and a short note.",
          result: "The page shows the session that will be submitted.",
        },
        {
          title: "Submit the request",
          instruction: "Select “Submit training request”.",
          result:
            "The request is marked pending until a dojo administrator approves or rejects it.",
        },
      ],
      troubleshooting: [
        {
          issue: "A recently submitted session is not in the total.",
          fix: "Pending requests are not counted. Check the request status and wait for dojo review.",
        },
      ],
      related: related.training,
      keywords: [
        "training",
        "hours",
        "missing session",
        "attendance",
        "pending",
      ],
    },
    {
      id: "public-exams",
      category: "examinations",
      routes: routes.exams,
      title: "Check exam eligibility, apply, and read results",
      summary:
        "The examination section explains your eligibility and keeps applications, results, and certificates together.",
      steps: [
        {
          title: "Check eligibility",
          instruction:
            "Open the examination section in your student workspace and read the eligibility message.",
          result:
            "You see whether the current training and time requirements are met.",
        },
        {
          title: "Apply",
          instruction:
            "When available, select “Apply for examination”, confirm the requested grade and details, then select “Submit application”.",
          result: "The application appears with an “Under review” status.",
        },
        {
          title: "Read the outcome",
          instruction:
            "Return to the examination section after the dojo publishes the result. Open the completed examination.",
          result:
            "The result and any available certificate download are shown.",
        },
      ],
      troubleshooting: [
        {
          issue: "The application button is unavailable.",
          fix: "Read the eligibility reason. Missing hours, time in grade, or an open application can prevent another application.",
        },
      ],
      related: related.exams,
      keywords: [
        "exam",
        "examination",
        "eligibility",
        "apply",
        "result",
        "certificate",
        "grade",
      ],
    },
    {
      id: "public-payments",
      category: "payments",
      routes: routes.payments,
      title: "Understand contributions and upload payment proof",
      summary:
        "See what is due, submit the contribution form, upload proof, and track whether payment is pending or confirmed.",
      steps: [
        {
          title: "Check what is due",
          instruction:
            "Open payments in your student workspace. Review monthly and AAT annual contribution status.",
          result: "The page shows the period, amount, and current status.",
        },
        {
          title: "Send payment proof",
          instruction:
            "Choose the correct contribution, select “Upload payment proof”, add a clear image, and select “Submit proof”.",
          result: "The proof is stored with a “Pending review” status.",
        },
        {
          title: "Get a receipt",
          instruction:
            "After the status changes to paid, select “Download receipt”.",
          result: "A receipt file downloads for the confirmed contribution.",
        },
      ],
      troubleshooting: [
        {
          issue: "The image will not upload.",
          fix: "Use a clear JPG, PNG, or WebP file within the size shown on the form, then try again.",
        },
        {
          issue: "The payment still says pending.",
          fix: "Pending means the dojo has not confirmed the proof yet. Do not submit the same proof twice.",
        },
      ],
      related: related.payments,
      keywords: [
        "payment",
        "contribution",
        "monthly",
        "AAT",
        "proof",
        "receipt",
        "pending",
        "paid",
      ],
    },
    {
      id: "public-passport",
      category: "student-records",
      routes: routes.passport,
      title: "Use your digital passport",
      summary:
        "The digital passport brings together identity, rank, training, examinations, payments, and verification details.",
      steps: [
        {
          title: "Open the passport",
          instruction:
            "Open your student workspace and select “Digital passport”.",
          result: "Your current passport opens at the identity page.",
        },
        {
          title: "Move between sections",
          instruction:
            "Use “Previous page”, “Next page”, or the section list to view rank, training, exams, and payments.",
          result:
            "The selected passport section is shown without changing your records.",
        },
        {
          title: "Check verification",
          instruction:
            "Open the verification section and review the displayed status and last-updated details.",
          result:
            "You can tell whether the displayed record is current and verified.",
        },
      ],
      troubleshooting: [
        {
          issue: "A passport item looks out of date.",
          fix: "Refresh the student record. If it remains incorrect, submit the relevant profile or training request.",
        },
      ],
      related: related.passport,
      keywords: [
        "passport",
        "rank",
        "identity",
        "verified",
        "training",
        "exam",
      ],
    },
    {
      id: "public-sharing",
      category: "student-records",
      routes: routes.sharing,
      title: "Share a record safely",
      summary:
        "Create a limited share link only when needed, review what it exposes, and revoke it when the recipient no longer needs access.",
      steps: [
        {
          title: "Review the sharing notice",
          instruction:
            "In your student workspace, open “Share record” and read which information a link will show.",
          result: "You know the scope and expiry before creating a link.",
        },
        {
          title: "Create and copy the link",
          instruction:
            "Select “Create share link”, then select “Copy link”. Send it only to the intended recipient.",
          result:
            "A time-limited link is copied; lookup details are never included.",
        },
        {
          title: "Revoke access",
          instruction:
            "Return to “Share record” and select “Revoke link” when sharing is no longer required.",
          result: "The old link stops opening the shared record.",
        },
      ],
      troubleshooting: [
        {
          issue: "A recipient says the link expired.",
          fix: "Confirm the recipient still needs access, then create a new limited link.",
        },
      ],
      related: related.sharing,
      keywords: ["share", "link", "privacy", "revoke", "expire", "QR"],
    },
    {
      id: "public-news",
      category: "news-resources",
      routes: routes.news,
      title: "Read news and newsletters",
      summary:
        "Browse published dojo updates, open a full newsletter, and move through older pages.",
      steps: [
        {
          title: "Browse published items",
          instruction:
            "Open “News”. Use the visible filters or page controls to narrow the list.",
          result: "Published items matching the selected view are shown.",
        },
        {
          title: "Open an article",
          instruction: "Select a newsletter title or “Read more”.",
          result: "The complete published article opens.",
        },
        {
          title: "Find older news",
          instruction:
            "At the end of the list, select a page number or “Next”.",
          result: "The next group of published items appears.",
        },
      ],
      troubleshooting: [
        {
          issue: "A link from an old message no longer opens.",
          fix: "Open “News” and search or browse the published list. Contact the dojo if the item was withdrawn.",
        },
      ],
      related: related.news,
      keywords: [
        "news",
        "newsletter",
        "article",
        "updates",
        "pagination",
        "published",
      ],
      screenshots: publicScreenshots.en?.news
        ? [
            {
              src: publicScreenshots.en.news,
              alt: "Published News page with newsletter cards and page controls",
              caption: "Choose a title to read the full published item.",
            },
          ]
        : [],
    },
    {
      id: "public-resources",
      category: "news-resources",
      routes: routes.resources,
      title: "Find and download resources",
      summary:
        "Use the Downloads page to find public forms and documents, then open or save the right file.",
      steps: [
        {
          title: "Open downloads",
          instruction: "Choose “Downloads” from the website navigation.",
          result: "Available public resources are grouped on one page.",
        },
        {
          title: "Check the file",
          instruction:
            "Read the title, description, format, and file size before downloading.",
          result: "You can confirm the document is the one you need.",
        },
        {
          title: "Open or save",
          instruction:
            "Select “Download”. Use your browser’s open or save controls.",
          result: "The file opens or downloads to your device.",
        },
      ],
      troubleshooting: [
        {
          issue: "Nothing happens after selecting Download.",
          fix: "Check the browser download list and pop-up permissions, then try once more.",
        },
      ],
      related: related.resources,
      keywords: ["download", "document", "form", "PDF", "resource", "file"],
      screenshots: publicScreenshots.en?.resources
        ? [
            {
              src: publicScreenshots.en.resources,
              alt: "Downloads page showing demonstration document cards",
              caption:
                "Check the title and file details before selecting Download.",
            },
          ]
        : [],
    },
    {
      id: "public-support",
      category: "support",
      routes: routes.support,
      title: "Get support and report a website problem",
      summary:
        "Use the contact details for dojo questions and include safe technical details when reporting a website problem.",
      steps: [
        {
          title: "Choose the right contact",
          instruction:
            "Open “Contact” for dojo, class, membership, or record questions. Use “Support” for a website problem.",
          result: "You reach the team that can handle the request.",
        },
        {
          title: "Describe the problem",
          instruction:
            "Include the page name, what you selected, what happened, device/browser, and the time. Do not send passwords or full Student IDs.",
          result:
            "Support receives enough non-sensitive detail to investigate.",
        },
        {
          title: "Send the request",
          instruction:
            "Complete the required contact fields and select “Send message”.",
          result: "A confirmation message shows whether the request was sent.",
        },
      ],
      troubleshooting: [
        {
          issue: "The contact form does not submit.",
          fix: "Correct any fields marked with an error, complete the anti-bot check if shown, and try again.",
        },
      ],
      related: related.support,
      keywords: [
        "support",
        "contact",
        "problem",
        "bug",
        "help",
        "message",
        "privacy",
      ],
    },
  ];
}

function thArticles(): LocalizedArticle[] {
  return localizeCompact("th", [
    [
      "public-start",
      "getting-started",
      routes.start,
      "ค้นหาเมนูและเปลี่ยนภาษา",
      "ใช้เมนูหลักและตัวเลือกภาษาเพื่อไปยังข้อมูลโดโจ ตาราง ข่าว ประวัตินักเรียน และการติดต่อ",
      [
        "เปิดตัวเลือกภาษาแล้วเลือก English, ไทย, 中文 หรือ 日本語",
        "เลือกหน้า เช่น “ชั้นเรียน” “ข่าว” หรือ “ประวัตินักเรียน”",
        "เลือกโลโก้ “RenShinKan” เพื่อกลับหน้าแรก",
      ],
      "หากเมนูมือถือบังหน้า ให้เลือกลิงก์ ปุ่มปิด หรือกด Escape",
      related.start,
      ["เมนู", "ภาษา", "หน้าแรก"],
    ],
    [
      "public-profile",
      "student-records",
      routes.profile,
      "ค้นหาและขอแก้ไขข้อมูลนักเรียน",
      "เข้าสู่พื้นที่นักเรียนด้วยชื่อที่ใช้สร้างโปรไฟล์และรหัสนักเรียน แล้วส่งการแก้ไขให้โดโจตรวจสอบ",
      [
        "กรอกชื่อที่ใช้สร้างโปรไฟล์และรหัสนักเรียนในหน้า “ประวัตินักเรียน” แล้วเลือก “ค้นหาประวัติของฉัน”",
        "เลือก “ขอแก้ไขข้อมูลส่วนตัว” และแก้เฉพาะช่องที่ต้องการ",
        "ตรวจสอบแล้วเลือก “ส่งคำขอแก้ไข”",
      ],
      "หากค้นหาไม่พบ ให้ตรวจชื่อและรหัสนักเรียนแล้วลองอีกครั้ง",
      related.profile,
      ["ประวัตินักเรียน", "ข้อมูลส่วนตัว", "รหัสนักเรียน", "แก้ไข"],
    ],
    [
      "public-training",
      "training",
      routes.training,
      "ตรวจชั่วโมงและแจ้งการฝึกที่ขาด",
      "ดูชั่วโมงที่บันทึกแล้วและส่งรายการฝึกที่ขาดให้โดโจอนุมัติ",
      [
        "เปิดส่วนการฝึกในพื้นที่นักเรียนและตรวจยอดรวมกับรายการล่าสุด",
        "เลือก “แจ้งการฝึกที่ขาด” แล้วกรอกวันที่ โดโจ ระยะเวลา และหมายเหตุ",
        "เลือก “ส่งคำขอการฝึก”",
      ],
      "รายการรอตรวจจะยังไม่รวมในยอดชั่วโมง ให้ตรวจสถานะภายหลัง",
      related.training,
      ["ฝึก", "ชั่วโมง", "ชั่วโมงฝึก", "เข้าเรียน", "รอตรวจ"],
    ],
    [
      "public-exams",
      "examinations",
      routes.exams,
      "ตรวจสิทธิ์ สมัครสอบ และดูผล",
      "ส่วนการสอบจะแสดงคุณสมบัติ ใบสมัคร ผล และใบประกาศที่มี",
      [
        "เปิดส่วนการสอบและอ่านข้อความคุณสมบัติ",
        "เมื่อสมัครได้ ให้เลือก “สมัครสอบ” ตรวจระดับ แล้วเลือก “ส่งใบสมัคร”",
        "เมื่อโดโจประกาศผล ให้เปิดรายการสอบเพื่อดูผลและดาวน์โหลดใบประกาศ",
      ],
      "หากปุ่มสมัครใช้ไม่ได้ ให้อ่านเหตุผลเรื่องชั่วโมง ระยะเวลาในระดับ หรือใบสมัครที่ยังเปิดอยู่",
      related.exams,
      ["สอบ", "คุณสมบัติ", "สมัคร", "ผล", "ใบประกาศ"],
    ],
    [
      "public-payments",
      "payments",
      routes.payments,
      "ตรวจเงินสมทบและส่งหลักฐานชำระเงิน",
      "ดูยอดรายเดือนและ AAT ส่งหลักฐาน และติดตามสถานะรอตรวจหรือชำระแล้ว",
      [
        "เปิดส่วนการชำระเงินและตรวจงวด จำนวน และสถานะ",
        "เลือกรายการที่ถูกต้อง เลือก “อัปโหลดหลักฐาน” เพิ่มภาพ แล้วเลือก “ส่งหลักฐาน”",
        "เมื่อสถานะเป็นชำระแล้ว ให้เลือก “ดาวน์โหลดใบเสร็จ”",
      ],
      "หากอัปโหลดไม่ได้ ให้ใช้ไฟล์ JPG, PNG หรือ WebP ที่ชัดและไม่เกินขนาดที่กำหนด",
      related.payments,
      ["ชำระเงิน", "เงินสมทบ", "AAT", "หลักฐาน", "ใบเสร็จ"],
    ],
    [
      "public-passport",
      "student-records",
      routes.passport,
      "ใช้พาสปอร์ตดิจิทัล",
      "ดูตัวตน ระดับ ชั่วโมงฝึก การสอบ การชำระเงิน และสถานะยืนยันในที่เดียว",
      [
        "เปิดพื้นที่นักเรียนแล้วเลือก “พาสปอร์ตดิจิทัล”",
        "ใช้ “หน้าก่อน” “หน้าถัดไป” หรือรายชื่อส่วนเพื่อดูข้อมูล",
        "เปิดส่วนการยืนยันเพื่อตรวจสถานะและวันที่ปรับปรุง",
      ],
      "หากข้อมูลเก่า ให้รีเฟรช แล้วส่งคำขอแก้ไขหรือแจ้งการฝึกตามประเภทข้อมูล",
      related.passport,
      ["พาสปอร์ต", "ระดับ", "ยืนยัน", "ข้อมูล"],
    ],
    [
      "public-sharing",
      "student-records",
      routes.sharing,
      "แชร์ประวัติอย่างปลอดภัย",
      "สร้างลิงก์จำกัดเวลา ตรวจข้อมูลที่เปิดเผย และยกเลิกเมื่อไม่จำเป็น",
      [
        "เปิด “แชร์ประวัติ” และอ่านว่าลิงก์จะแสดงข้อมูลใด",
        "เลือก “สร้างลิงก์แชร์” แล้ว “คัดลอกลิงก์” ส่งเฉพาะผู้รับที่ตั้งใจ",
        "เลือก “ยกเลิกลิงก์” เมื่อไม่ต้องการแชร์",
      ],
      "หากลิงก์หมดอายุ ให้ยืนยันความจำเป็นก่อนสร้างใหม่",
      related.sharing,
      ["แชร์", "ลิงก์", "ความเป็นส่วนตัว", "ยกเลิก"],
    ],
    [
      "public-news",
      "news-resources",
      routes.news,
      "อ่านข่าวและจดหมายข่าว",
      "เรียกดูข่าวที่เผยแพร่ เปิดบทความเต็ม และไปยังหน้าข่าวเก่า",
      [
        "เปิด “ข่าว” และใช้ตัวกรองหรือตัวควบคุมหน้า",
        "เลือกชื่อจดหมายข่าวหรือ “อ่านเพิ่มเติม”",
        "เลือกเลขหน้า หรือ “ถัดไป” ที่ท้ายรายการ",
      ],
      "หากลิงก์เก่าเปิดไม่ได้ ให้ค้นหาในหน้าข่าวหรือติดต่อโดโจ",
      related.news,
      ["ข่าว", "จดหมายข่าว", "บทความ", "เผยแพร่"],
    ],
    [
      "public-resources",
      "news-resources",
      routes.resources,
      "ค้นหาและดาวน์โหลดเอกสาร",
      "ใช้หน้าดาวน์โหลดเพื่อดูแบบฟอร์มและเอกสารสาธารณะ แล้วเปิดหรือบันทึกไฟล์",
      [
        "เลือก “ดาวน์โหลด” จากเมนู",
        "ตรวจชื่อ คำอธิบาย ชนิด และขนาดไฟล์",
        "เลือกปุ่ม “ดาวน์โหลด” แล้วใช้คำสั่งเปิดหรือบันทึกของเบราว์เซอร์",
      ],
      "หากไม่เกิดอะไรขึ้น ให้ตรวจรายการดาวน์โหลดและสิทธิ์ป๊อปอัป",
      related.resources,
      ["ดาวน์โหลด", "เอกสาร", "แบบฟอร์ม", "PDF"],
    ],
    [
      "public-support",
      "support",
      routes.support,
      "ติดต่อและรายงานปัญหาเว็บไซต์",
      "ใช้หน้าติดต่อสำหรับคำถามโดโจ และส่งรายละเอียดที่ไม่อ่อนไหวเมื่อเว็บไซต์มีปัญหา",
      [
        "เลือก “ติดต่อ” สำหรับชั้นเรียน สมาชิก หรือประวัติ และเลือก “ช่วยเหลือ” สำหรับปัญหาเว็บไซต์",
        "ระบุชื่อหน้า สิ่งที่กด ผลที่เกิด อุปกรณ์ เบราว์เซอร์ และเวลา โดยไม่ส่งรหัสผ่านหรือรหัสนักเรียนแบบเต็ม",
        "กรอกช่องที่จำเป็นแล้วเลือก “ส่งข้อความ”",
      ],
      "หากส่งไม่ได้ ให้แก้ช่องที่มีข้อความผิดพลาดและทำการตรวจป้องกันบอต",
      related.support,
      ["ช่วยเหลือ", "ติดต่อ", "ปัญหา", "ข้อความ"],
    ],
  ]);
}

function jaArticles(): LocalizedArticle[] {
  return localizeCompact("ja", [
    [
      "public-start",
      "getting-started",
      routes.start,
      "メニューを使い、言語を変更する",
      "メインメニューと言語選択から、道場情報、予定、ニュース、会員記録、問い合わせへ移動できます。",
      [
        "ヘッダーの言語選択を開き、English、ไทย、中文、または日本語を選びます。",
        "「クラス」「ニュース」「会員記録」など必要なページを選びます。",
        "「RenShinKan」ロゴを選ぶとホームへ戻ります。",
      ],
      "モバイルメニューがページを覆う場合は、リンクか閉じるボタンを選ぶか、Escapeキーを押します。",
      related.start,
      ["メニュー", "言語", "ホーム"],
    ],
    [
      "public-profile",
      "student-records",
      routes.profile,
      "会員記録を開き、修正を依頼する",
      "プロフィール作成時の氏名と生徒IDで画面を開き、修正内容を道場へ送ります。",
      [
        "「生徒記録」でプロフィール作成時の氏名と生徒IDを入力し、「自分の記録を探す」を選びます。",
        "「プロフィール更新を依頼」を選び、必要な項目だけ直します。",
        "内容を確認して「更新依頼を送信」を選びます。",
      ],
      "見つからない場合は氏名と生徒IDを確認して、もう一度お試しください。",
      related.profile,
      ["生徒記録", "プロフィール", "生徒ID", "修正"],
    ],
    [
      "public-training",
      "training",
      routes.training,
      "稽古時間を確認し、不足分を報告する",
      "記録済みの時間を確認し、抜けている稽古を道場の審査へ送ります。",
      [
        "会員画面の稽古セクションで合計と最近の記録を確認します。",
        "「不足している稽古を報告」を選び、日付、道場、時間、メモを入力します。",
        "「稽古依頼を送信」を選びます。",
      ],
      "審査中の依頼は合計に入りません。後で状態を確認してください。",
      related.training,
      ["稽古", "時間", "出席", "審査中"],
    ],
    [
      "public-exams",
      "examinations",
      routes.exams,
      "受験資格、申込、結果を確認する",
      "審査セクションで資格、申込、結果、利用可能な証書を確認できます。",
      [
        "審査セクションを開き、受験資格の説明を読みます。",
        "申込可能なら「審査に申し込む」を選び、級・段を確認して送信します。",
        "道場が結果を公開した後、完了した審査を開いて結果と証書を確認します。",
      ],
      "申込ボタンが使えない場合は、稽古時間、在級期間、未完了の申込についての理由を確認します。",
      related.exams,
      ["審査", "資格", "申込", "結果", "証書"],
    ],
    [
      "public-payments",
      "payments",
      routes.payments,
      "会費を確認し、支払証明を送る",
      "月会費とAAT年会費を確認し、証明を提出して状態を追跡します。",
      [
        "支払いセクションで期間、金額、状態を確認します。",
        "正しい会費を選び、「支払証明をアップロード」から画像を追加して送信します。",
        "支払済みになったら「領収書をダウンロード」を選びます。",
      ],
      "アップロードできない場合は、表示された上限以内の鮮明なJPG、PNG、WebPを使います。",
      related.payments,
      ["支払い", "会費", "AAT", "証明", "領収書"],
    ],
    [
      "public-passport",
      "student-records",
      routes.passport,
      "デジタルパスポートを使う",
      "本人情報、級・段、稽古、審査、支払い、確認状態をまとめて見られます。",
      [
        "会員画面で「デジタルパスポート」を選びます。",
        "「前のページ」「次のページ」またはセクション一覧で移動します。",
        "確認セクションで状態と更新日を確認します。",
      ],
      "古い情報が残る場合は再読み込みし、内容に合う修正依頼を送ります。",
      related.passport,
      ["パスポート", "級", "確認", "記録"],
    ],
    [
      "public-sharing",
      "student-records",
      routes.sharing,
      "記録を安全に共有する",
      "必要なときだけ期限付きリンクを作り、共有内容を確認し、不要になったら無効にします。",
      [
        "「記録を共有」を開き、リンクに表示される情報を読みます。",
        "「共有リンクを作成」「リンクをコピー」の順に選び、対象者だけに送ります。",
        "共有が不要になったら「リンクを無効化」を選びます。",
      ],
      "期限切れの場合は必要性を再確認して新しいリンクを作成します。",
      related.sharing,
      ["共有", "リンク", "プライバシー", "無効"],
    ],
    [
      "public-news",
      "news-resources",
      routes.news,
      "ニュースと会報を読む",
      "公開済みのお知らせを閲覧し、全文を開き、過去のページへ移動します。",
      [
        "「ニュース」を開き、フィルターやページ操作を使います。",
        "会報のタイトルまたは「続きを読む」を選びます。",
        "一覧の下でページ番号または「次へ」を選びます。",
      ],
      "古いリンクが開かない場合はニュース一覧で探すか、道場へ連絡します。",
      related.news,
      ["ニュース", "会報", "記事", "公開"],
    ],
    [
      "public-resources",
      "news-resources",
      routes.resources,
      "資料を探してダウンロードする",
      "ダウンロードページで公開書類を確認し、必要なファイルを開くか保存します。",
      [
        "メニューから「ダウンロード」を選びます。",
        "タイトル、説明、形式、サイズを確認します。",
        "「ダウンロード」を選び、ブラウザで開くか保存します。",
      ],
      "反応しない場合はブラウザのダウンロード一覧とポップアップ許可を確認します。",
      related.resources,
      ["ダウンロード", "資料", "書類", "PDF"],
    ],
    [
      "public-support",
      "support",
      routes.support,
      "問い合わせとサイト不具合の報告",
      "道場への質問は問い合わせを使い、サイト不具合には安全な技術情報を添えます。",
      [
        "クラス、会員、記録の質問は「お問い合わせ」、サイト不具合は「サポート」を選びます。",
        "ページ名、操作、結果、端末、ブラウザ、時刻を記載し、パスワードや完全な生徒IDは送りません。",
        "必須欄を入力して「メッセージを送信」を選びます。",
      ],
      "送信できない場合はエラー表示の欄を直し、表示されたボット確認を完了します。",
      related.support,
      ["サポート", "問い合わせ", "不具合", "メッセージ"],
    ],
  ]);
}

function zhArticles(): LocalizedArticle[] {
  return localizeCompact("zh-CN", [
    [
      "public-start",
      "getting-started",
      routes.start,
      "使用菜单并切换语言",
      "通过主菜单和语言选项前往道场信息、课程、新闻、学员记录和联系页面。",
      [
        "打开页眉中的语言选项，选择 English、ไทย、中文或日本語。",
        "选择所需页面，例如“课程”“新闻”或“学员记录”。",
        "选择“RenShinKan”标志返回首页。",
      ],
      "如果移动菜单遮住页面，请选择链接、关闭按钮或按 Escape。",
      related.start,
      ["菜单", "语言", "首页"],
    ],
    [
      "public-profile",
      "student-records",
      routes.profile,
      "查找并申请修改学员资料",
      "使用创建资料时的姓名和学员编号进入工作区，再把修改申请提交给道场审核。",
      [
        "在“学员记录”页填写创建资料时的姓名和学员编号，然后选择“查找我的记录”。",
        "选择“申请更新资料”，只修改需要更正的字段。",
        "检查内容后选择“提交更新申请”。",
      ],
      "如果找不到记录，请检查姓名和学员编号后重试。",
      related.profile,
      ["学员记录", "资料", "学员编号", "修改"],
    ],
    [
      "public-training",
      "training",
      routes.training,
      "查看训练时数并报告遗漏",
      "查看已记录的训练时数，并把遗漏训练提交给道场审核。",
      [
        "打开学员工作区的训练部分，查看总时数和最近记录。",
        "选择“报告遗漏训练”，填写日期、道场、时长和说明。",
        "选择“提交训练申请”。",
      ],
      "待审核训练不会计入总时数，请稍后查看状态。",
      related.training,
      ["训练", "时数", "出席", "待审核"],
    ],
    [
      "public-exams",
      "examinations",
      routes.exams,
      "查看考试资格、报名和结果",
      "考试部分集中显示资格、申请、结果和可下载证书。",
      [
        "打开考试部分并阅读资格提示。",
        "可以报名时，选择“申请考试”，确认级别后提交。",
        "道场发布结果后，打开已完成考试查看结果和证书。",
      ],
      "如果报名按钮不可用，请查看训练时数、在级时间或已有申请的说明。",
      related.exams,
      ["考试", "资格", "报名", "结果", "证书"],
    ],
    [
      "public-payments",
      "payments",
      routes.payments,
      "查看会费并上传付款凭证",
      "查看月费和AAT年费，提交凭证并跟踪待审核或已付款状态。",
      [
        "打开付款部分，查看期间、金额和状态。",
        "选择正确会费，选择“上传付款凭证”，添加清晰图片后提交。",
        "状态变为已付款后，选择“下载收据”。",
      ],
      "如果无法上传，请使用页面规定大小以内的清晰JPG、PNG或WebP。",
      related.payments,
      ["付款", "会费", "AAT", "凭证", "收据"],
    ],
    [
      "public-passport",
      "student-records",
      routes.passport,
      "使用数字护照",
      "在一处查看身份、级别、训练、考试、付款和验证信息。",
      [
        "打开学员工作区并选择“数字护照”。",
        "用“上一页”“下一页”或部分列表浏览。",
        "打开验证部分查看状态和更新时间。",
      ],
      "如果信息过时，请刷新页面，再按信息类型提交资料或训练修改申请。",
      related.passport,
      ["护照", "级别", "验证", "记录"],
    ],
    [
      "public-sharing",
      "student-records",
      routes.sharing,
      "安全分享记录",
      "仅在需要时建立限时链接，检查公开范围，并在不再需要时撤销。",
      [
        "打开“分享记录”，阅读链接会显示哪些信息。",
        "选择“创建分享链接”再选择“复制链接”，只发给预定接收者。",
        "不再分享时选择“撤销链接”。",
      ],
      "链接过期时先确认仍需分享，再建立新链接。",
      related.sharing,
      ["分享", "链接", "隐私", "撤销"],
    ],
    [
      "public-news",
      "news-resources",
      routes.news,
      "阅读新闻和通讯",
      "浏览已发布的道场消息、打开完整文章并翻阅旧内容。",
      [
        "打开“新闻”，使用筛选或页码控件。",
        "选择通讯标题或“阅读更多”。",
        "在列表底部选择页码或“下一页”。",
      ],
      "旧链接无法打开时，请在新闻列表查找或联系道场。",
      related.news,
      ["新闻", "通讯", "文章", "发布"],
    ],
    [
      "public-resources",
      "news-resources",
      routes.resources,
      "查找并下载资料",
      "在下载页面查找公开表格和文件，然后打开或保存正确文件。",
      [
        "从菜单选择“下载”。",
        "先核对标题、说明、格式和文件大小。",
        "选择“下载”，再用浏览器打开或保存。",
      ],
      "没有反应时，请检查浏览器下载列表和弹出窗口权限。",
      related.resources,
      ["下载", "文件", "表格", "PDF"],
    ],
    [
      "public-support",
      "support",
      routes.support,
      "联系道场并报告网站问题",
      "道场问题使用联系页面；网站问题请提供不含敏感信息的技术细节。",
      [
        "课程、会员或记录问题选择“联系”；网站故障选择“支持”。",
        "写明页面、操作、结果、设备、浏览器和时间，不要发送密码或完整学员编号。",
        "填写必填项并选择“发送消息”。",
      ],
      "无法提交时，请修正标记错误的字段并完成页面显示的防机器人检查。",
      related.support,
      ["支持", "联系", "问题", "消息"],
    ],
  ]);
}

type CompactArticle = [
  id: string,
  category: LocalizedArticle["category"],
  articleRoutes: string[],
  title: string,
  summary: string,
  instructions: string[],
  problem: string,
  articleRelated: string[],
  keywords: string[],
];

function localizeCompact(
  locale: Exclude<Language, "en">,
  values: CompactArticle[],
): LocalizedArticle[] {
  const resultLabel =
    locale === "th"
      ? "ระบบแสดงผลของขั้นตอนนี้"
      : locale === "ja"
        ? "この操作の結果が画面に表示されます。"
        : "页面会显示这一步的结果。";
  const stepNames =
    locale === "th"
      ? ["เปิดส่วนที่ต้องการ", "กรอกหรือตรวจข้อมูล", "ยืนยันขั้นตอน"]
      : locale === "ja"
        ? ["必要な画面を開く", "内容を確認・入力する", "操作を確定する"]
        : ["打开所需页面", "检查或填写内容", "确认操作"];
  return values.map(
    ([
      id,
      category,
      articleRoutes,
      title,
      summary,
      instructions,
      problem,
      articleRelated,
      keywords,
    ]) => ({
      id,
      category,
      routes: articleRoutes,
      title,
      summary,
      steps: instructions.map((instruction, index) => ({
        title: stepNames[index] || stepNames[2],
        instruction,
        result: resultLabel,
      })),
      troubleshooting: [
        {
          issue:
            locale === "th"
              ? "ขั้นตอนไม่สำเร็จ"
              : locale === "ja"
                ? "操作が完了しない"
                : "操作没有完成",
          fix: problem,
        },
      ],
      related: articleRelated,
      keywords,
    }),
  );
}

export function getPublicHelpCatalog(locale: Language): HelpCatalog {
  const articleFactories: Record<Language, () => LocalizedArticle[]> = {
    en: enArticles,
    th: thArticles,
    ja: jaArticles,
    "zh-CN": zhArticles,
  };
  return {
    audience: "public",
    locale,
    ui: ui[locale],
    articles: buildArticles("public", locale, articleFactories[locale]()),
  };
}
