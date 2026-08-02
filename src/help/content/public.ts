import type { Language } from "../../i18n";
import type { HelpCatalog, HelpCategory, HelpUiCopy } from "../types";
import { buildArticles, categories, type LocalizedArticle } from "./shared";

type Topic = {
  id: string;
  category: HelpCategory;
  route: string;
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
    routes: [topic.route],
    title: topic.title,
    summary: topic.summary,
    steps: topic.steps.map((instruction) => ({
      title: "",
      instruction,
      result: "",
    })),
    troubleshooting: [],
    related: [],
    keywords: `${topic.title} ${topic.summary}`
      .toLocaleLowerCase()
      .split(/\s+/),
    action: { label: topic.action, href: topic.href },
  };
}

const sharedUi = {
  searchStatus: (count: number) =>
    `${count} ${count === 1 ? "topic" : "topics"}`,
  categories: categories.en,
  expectedResult: "Result",
  troubleshooting: "Help",
  related: "Related",
  imageUnavailable: "Image unavailable",
  copied: "Link copied",
  copyLink: "Copy direct link",
  smallerText: "Use smaller help text",
  largerText: "Use larger help text",
  loading: "Loading help",
  contentUnavailable: "Help could not be loaded.",
  retry: "Try again",
};

function helpUi(locale: Language): HelpUiCopy {
  if (locale === "th")
    return {
      ...sharedUi,
      trigger: "ช่วยเหลือ",
      triggerAriaLabel: "เปิดคู่มือเว็บไซต์",
      heading: "วิธีใช้เว็บไซต์",
      guideDescription: "เลือกหัวข้อแล้วทำตามขั้นตอนสั้น ๆ",
      close: "ปิดคู่มือ",
      searchLabel: "ค้นหาคู่มือ",
      searchPlaceholder: "ค้นหาหัวข้อ",
      searchStatus: (count) => `พบ ${count} หัวข้อ`,
      suggested: "แนะนำสำหรับหน้านี้",
      allTopics: "หัวข้อทั้งหมด",
      categories: categories.th,
      back: "กลับไปหัวข้อทั้งหมด",
      breadcrumb: "หัวข้อช่วยเหลือ",
      steps: "ขั้นตอน",
      noResults: "ไม่พบหัวข้อที่ตรงกับคำค้น",
      resetSearch: "ล้างคำค้น",
    };
  if (locale === "ja")
    return {
      ...sharedUi,
      trigger: "ヘルプ",
      triggerAriaLabel: "ウェブサイトのヘルプを開く",
      heading: "ウェブサイトの使い方",
      guideDescription: "項目を選び、短い手順に従ってください。",
      close: "ヘルプを閉じる",
      searchLabel: "ヘルプを検索",
      searchPlaceholder: "項目を検索",
      searchStatus: (count) => `${count}件`,
      suggested: "このページのおすすめ",
      allTopics: "すべての項目",
      categories: categories.ja,
      back: "すべての項目に戻る",
      breadcrumb: "ヘルプ項目",
      steps: "手順",
      noResults: "一致する項目がありません。",
      resetSearch: "検索を消去",
    };
  if (locale === "zh-CN")
    return {
      ...sharedUi,
      trigger: "帮助",
      triggerAriaLabel: "打开网站帮助",
      heading: "网站使用方法",
      guideDescription: "选择一个主题并按简短步骤操作。",
      close: "关闭帮助",
      searchLabel: "搜索帮助",
      searchPlaceholder: "搜索主题",
      searchStatus: (count) => `${count} 个主题`,
      suggested: "此页面的建议",
      allTopics: "全部主题",
      categories: categories["zh-CN"],
      back: "返回全部主题",
      breadcrumb: "帮助主题",
      steps: "步骤",
      noResults: "没有匹配的主题。",
      resetSearch: "清除搜索",
    };
  return {
    ...sharedUi,
    trigger: "Help",
    triggerAriaLabel: "Open website help",
    heading: "How to use this website",
    guideDescription: "Choose a topic and follow the short steps.",
    close: "Close help",
    searchLabel: "Search help",
    searchPlaceholder: "Search topics",
    suggested: "Suggested for this page",
    allTopics: "All topics",
    back: "Back to all topics",
    breadcrumb: "Help topics",
    steps: "Steps",
    noResults: "No topics match your search.",
    resetSearch: "Clear search",
  };
}

const en: Topic[] = [
  {
    id: "public-new-profile",
    category: "student-records",
    route: "/student-records",
    href: "/student-records?task=profile",
    title: "How do I make a new student profile?",
    summary: "Request a student profile for RenShinKan review.",
    steps: [
      "Open New profile in the student workspace.",
      "Enter the student details and choose the correct dojo.",
      "Review the form, then submit it for approval.",
    ],
    action: "Create a student profile",
  },
  {
    id: "public-exam-application",
    category: "examinations",
    route: "/student-records",
    href: "/student-records?task=exam",
    title: "How do I fill out an exam application?",
    summary: "Submit an application for an available examination.",
    steps: [
      "Open Exam application in the student workspace.",
      "Enter the student ID and complete each required section.",
      "Review the answers and submit the application.",
    ],
    action: "Open exam application",
  },
  {
    id: "public-passport",
    category: "student-records",
    route: "/student-records",
    href: "/student-records",
    title: "How do I see my student passport?",
    summary: "Open the private student passport.",
    steps: [
      "Open My passport in the student workspace.",
      "Enter the student ID and the requested identity details.",
      "Select Find my record, then use the passport tabs.",
    ],
    action: "Find my passport",
  },
  {
    id: "public-monthly",
    category: "payments",
    route: "/support",
    href: "/support#monthly-contribution",
    title: "How do I pay monthly dojo contributions?",
    summary: "Pay and submit proof for a monthly RenShinKan contribution.",
    steps: [
      "Open the monthly contribution section and follow the payment instructions.",
      "Enter every student covered by the payment.",
      "Choose the proof file, check the preview, then upload it.",
    ],
    action: "Pay a monthly contribution",
  },
  {
    id: "public-aat",
    category: "payments",
    route: "/student-records",
    href: "/student-records",
    title: "How do I pay an AAT annual contribution?",
    summary:
      "Register for AAT when needed, then submit the annual contribution.",
    steps: [
      "Open your passport and check the Alerts or Contributions tab.",
      "If you do not have an AAT number, use the AAT registration link shown in the alert first.",
      "Follow the contribution instructions and upload a clear payment proof.",
    ],
    action: "Open student records",
  },
  {
    id: "public-contact",
    category: "support",
    route: "/contact",
    href: "/contact",
    title: "How do I contact the dojo?",
    summary: "Send RenShinKan a question or visit enquiry.",
    steps: [
      "Open Contact.",
      "Choose the contact method that suits you.",
      "Include your name and a short, clear message.",
    ],
    action: "Contact the dojo",
  },
  {
    id: "public-donation",
    category: "support",
    route: "/support",
    href: "/support#donations",
    title: "How do I make a donation?",
    summary: "Support the community dojo with a one-time donation.",
    steps: [
      "Open the Donations section.",
      "Read the payment details or contact the dojo for PromptPay.",
      "Send the donation and keep your payment confirmation.",
    ],
    action: "View donation details",
  },
  {
    id: "public-newsletter",
    category: "news-resources",
    route: "/newsletter",
    href: "/newsletter",
    title: "How do I read dojo newsletters?",
    summary: "Read the latest update and browse the archive.",
    steps: [
      "Open Newsletters from the menu or homepage.",
      "Select Read newsletter on the update you want.",
      "Use the archive controls to see older updates.",
    ],
    action: "Read newsletters",
  },
  {
    id: "public-newsletter-email",
    category: "news-resources",
    route: "/newsletter",
    href: "/newsletter#newsletter-signup",
    title: "How do I receive newsletters by email?",
    summary: "Subscribe to published dojo updates.",
    steps: [
      "Open the newsletter email signup.",
      "Enter your email address.",
      "Submit the form and follow any confirmation message.",
    ],
    action: "Receive updates by email",
  },
];

const th: Topic[] = [
  {
    ...en[0],
    title: "สร้างโปรไฟล์นักเรียนใหม่อย่างไร?",
    summary: "ส่งคำขอโปรไฟล์ให้อาจารย์ RenShinKan ตรวจสอบ",
    steps: [
      "เปิด โปรไฟล์ใหม่ ในพื้นที่นักเรียน",
      "กรอกข้อมูลนักเรียนและเลือกโดโจให้ถูกต้อง",
      "ตรวจสอบข้อมูลแล้วส่งเพื่อรออนุมัติ",
    ],
    action: "สร้างโปรไฟล์นักเรียน",
  },
  {
    ...en[1],
    title: "กรอกใบสมัครสอบอย่างไร?",
    summary: "ส่งใบสมัครสำหรับการสอบที่เปิดรับ",
    steps: [
      "เปิด ใบสมัครสอบ ในพื้นที่นักเรียน",
      "กรอกรหัสนักเรียนและข้อมูลที่จำเป็นทุกส่วน",
      "ตรวจสอบคำตอบแล้วส่งใบสมัคร",
    ],
    action: "เปิดใบสมัครสอบ",
  },
  {
    ...en[2],
    title: "ดูพาสปอร์ตนักเรียนอย่างไร?",
    summary: "เปิดพาสปอร์ตนักเรียนแบบส่วนตัว",
    steps: [
      "เปิด พาสปอร์ตของฉัน ในพื้นที่นักเรียน",
      "กรอกรหัสนักเรียนและข้อมูลยืนยันตัวตน",
      "เลือก ค้นหาประวัติของฉัน แล้วใช้แท็บในพาสปอร์ต",
    ],
    action: "ค้นหาพาสปอร์ต",
  },
  {
    ...en[3],
    title: "ชำระเงินสมทบรายเดือนอย่างไร?",
    summary: "ชำระและส่งหลักฐานเงินสมทบรายเดือน",
    steps: [
      "เปิดส่วนเงินสมทบรายเดือนและทำตามคำแนะนำ",
      "กรอกนักเรียนทุกคนที่รวมอยู่ในการชำระเงิน",
      "เลือกไฟล์ ตรวจสอบภาพตัวอย่าง แล้วอัปโหลด",
    ],
    action: "ชำระเงินสมทบรายเดือน",
  },
  {
    ...en[4],
    title: "ชำระเงินสมทบ AAT รายปีอย่างไร?",
    summary: "ลงทะเบียน AAT ก่อนหากยังไม่มีเลขสมาชิก แล้วส่งเงินสมทบ",
    steps: [
      "เปิดพาสปอร์ตและดูแท็บ การแจ้งเตือน หรือ เงินสมทบ",
      "หากยังไม่มีเลข AAT ให้ใช้ลิงก์ลงทะเบียน AAT ในการแจ้งเตือนก่อน",
      "ทำตามคำแนะนำการชำระและอัปโหลดหลักฐานที่ชัดเจน",
    ],
    action: "เปิดข้อมูลนักเรียน",
  },
  {
    ...en[5],
    title: "ติดต่อโดโจอย่างไร?",
    summary: "ส่งคำถามหรือนัดหมายเยี่ยมชม RenShinKan",
    steps: [
      "เปิดหน้า ติดต่อ",
      "เลือกช่องทางติดต่อที่สะดวก",
      "แจ้งชื่อและข้อความสั้น ๆ ที่ชัดเจน",
    ],
    action: "ติดต่อโดโจ",
  },
  {
    ...en[6],
    title: "บริจาคให้โดโจอย่างไร?",
    summary: "สนับสนุนโดโจชุมชนด้วยการบริจาคครั้งเดียว",
    steps: [
      "เปิดส่วน การบริจาค",
      "อ่านข้อมูลการชำระหรือติดต่อโดโจเพื่อขอ PromptPay",
      "ส่งเงินบริจาคและเก็บหลักฐานไว้",
    ],
    action: "ดูข้อมูลการบริจาค",
  },
  {
    ...en[7],
    title: "อ่านจดหมายข่าวโดโจอย่างไร?",
    summary: "อ่านข่าวล่าสุดและดูคลังข่าว",
    steps: [
      "เปิด จดหมายข่าว จากเมนูหรือหน้าแรก",
      "เลือก อ่านจดหมายข่าว ที่ต้องการ",
      "ใช้ตัวควบคุมคลังข่าวเพื่อดูข่าวเก่า",
    ],
    action: "อ่านจดหมายข่าว",
  },
  {
    ...en[8],
    title: "รับจดหมายข่าวทางอีเมลอย่างไร?",
    summary: "สมัครรับข่าวที่เผยแพร่จากโดโจ",
    steps: [
      "เปิดแบบฟอร์มสมัครอีเมล",
      "กรอกอีเมลของคุณ",
      "ส่งแบบฟอร์มและทำตามข้อความยืนยัน",
    ],
    action: "รับข่าวทางอีเมล",
  },
];

const ja: Topic[] = [
  {
    ...en[0],
    title: "新しい会員プロフィールを作るには？",
    summary: "RenShinKanの確認用にプロフィールを申請します。",
    steps: [
      "会員ページで「新規プロフィール」を開きます。",
      "会員情報を入力し、正しい道場を選びます。",
      "内容を確認して承認申請を送信します。",
    ],
    action: "プロフィールを作成",
  },
  {
    ...en[1],
    title: "審査申請を記入するには？",
    summary: "受付中の審査に申請します。",
    steps: [
      "会員ページで「審査申請」を開きます。",
      "会員IDと必須項目を入力します。",
      "回答を確認して申請を送信します。",
    ],
    action: "審査申請を開く",
  },
  {
    ...en[2],
    title: "会員パスポートを見るには？",
    summary: "非公開の会員パスポートを開きます。",
    steps: [
      "会員ページで「マイパスポート」を開きます。",
      "会員IDと本人確認情報を入力します。",
      "記録を検索し、パスポートのタブを使います。",
    ],
    action: "パスポートを検索",
  },
  {
    ...en[3],
    title: "月会費を支払うには？",
    summary: "月会費を支払い、証明を送信します。",
    steps: [
      "月会費の案内を開きます。",
      "支払いに含まれる会員をすべて入力します。",
      "証明画像を選び、プレビューを確認してアップロードします。",
    ],
    action: "月会費を支払う",
  },
  {
    ...en[4],
    title: "AAT年会費を支払うには？",
    summary: "番号がない場合はAAT登録後に年会費を送信します。",
    steps: [
      "パスポートの通知または会費タブを開きます。",
      "AAT番号がない場合は通知内の登録リンクを先に使います。",
      "案内に従って支払い、鮮明な証明をアップロードします。",
    ],
    action: "会員記録を開く",
  },
  {
    ...en[5],
    title: "道場へ連絡するには？",
    summary: "質問や見学希望を送ります。",
    steps: [
      "お問い合わせページを開きます。",
      "希望する連絡方法を選びます。",
      "名前と簡潔なメッセージを送ります。",
    ],
    action: "道場へ連絡",
  },
  {
    ...en[6],
    title: "道場へ寄付するには？",
    summary: "地域道場を一回の寄付で支援します。",
    steps: [
      "寄付の項目を開きます。",
      "支払い案内を読むかPromptPayについて道場へ連絡します。",
      "寄付後、支払い確認を保管します。",
    ],
    action: "寄付案内を見る",
  },
  {
    ...en[7],
    title: "道場ニュースレターを読むには？",
    summary: "最新号と過去号を読みます。",
    steps: [
      "メニューまたはホームからニュースレターを開きます。",
      "読みたい号の「ニュースレターを読む」を選びます。",
      "アーカイブで過去号を表示します。",
    ],
    action: "ニュースレターを読む",
  },
  {
    ...en[8],
    title: "メールでニュースレターを受け取るには？",
    summary: "道場の更新をメール購読します。",
    steps: [
      "メール登録フォームを開きます。",
      "メールアドレスを入力します。",
      "送信し、確認案内に従います。",
    ],
    action: "メールで受け取る",
  },
];

const zh: Topic[] = [
  {
    ...en[0],
    title: "如何创建新学员资料？",
    summary: "提交资料供 RenShinKan 审核。",
    steps: [
      "在学员工作区打开“新资料”。",
      "填写学员信息并选择正确的道场。",
      "核对后提交审批。",
    ],
    action: "创建学员资料",
  },
  {
    ...en[1],
    title: "如何填写考试申请？",
    summary: "申请当前开放的考试。",
    steps: [
      "在学员工作区打开“考试申请”。",
      "填写学员编号和所有必填部分。",
      "核对答案并提交。",
    ],
    action: "打开考试申请",
  },
  {
    ...en[2],
    title: "如何查看学员护照？",
    summary: "打开私密学员护照。",
    steps: [
      "在学员工作区打开“我的护照”。",
      "填写学员编号和身份验证信息。",
      "查找记录后使用护照标签页。",
    ],
    action: "查找我的护照",
  },
  {
    ...en[3],
    title: "如何支付每月道场会费？",
    summary: "支付并提交每月会费证明。",
    steps: [
      "打开每月会费部分并按说明付款。",
      "填写本次付款涵盖的所有学员。",
      "选择证明文件，检查预览后上传。",
    ],
    action: "支付每月会费",
  },
  {
    ...en[4],
    title: "如何支付 AAT 年费？",
    summary: "没有 AAT 编号时先注册，再提交年费。",
    steps: [
      "打开护照的提醒或会费标签页。",
      "如没有 AAT 编号，先使用提醒中的 AAT 注册链接。",
      "按说明付款并上传清晰证明。",
    ],
    action: "打开学员记录",
  },
  {
    ...en[5],
    title: "如何联系道场？",
    summary: "向 RenShinKan 发送问题或参观咨询。",
    steps: [
      "打开联系页面。",
      "选择合适的联系方法。",
      "填写姓名和简短清楚的消息。",
    ],
    action: "联系道场",
  },
  {
    ...en[6],
    title: "如何向道场捐款？",
    summary: "通过一次性捐款支持社区道场。",
    steps: [
      "打开捐款部分。",
      "阅读付款信息或联系道场获取 PromptPay。",
      "完成捐款并保留付款确认。",
    ],
    action: "查看捐款信息",
  },
  {
    ...en[7],
    title: "如何阅读道场通讯？",
    summary: "阅读最新通讯并浏览存档。",
    steps: [
      "从菜单或主页打开通讯。",
      "选择要看的“阅读通讯”。",
      "使用存档控件查看旧通讯。",
    ],
    action: "阅读通讯",
  },
  {
    ...en[8],
    title: "如何通过电子邮件接收通讯？",
    summary: "订阅道场发布的更新。",
    steps: [
      "打开电子邮件订阅表单。",
      "输入电子邮件地址。",
      "提交并按确认提示操作。",
    ],
    action: "通过邮件接收更新",
  },
];

export function getPublicHelpCatalog(locale: Language): HelpCatalog {
  const topics =
    locale === "th" ? th : locale === "ja" ? ja : locale === "zh-CN" ? zh : en;
  return {
    audience: "public",
    locale,
    ui: helpUi(locale),
    articles: buildArticles("public", locale, topics.map(article)),
  };
}
