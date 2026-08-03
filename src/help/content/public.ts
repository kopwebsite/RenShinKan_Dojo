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
      .replace(/\*\*/g, "")
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

/**
 * Steps name the exact place or control to select and wrap it in `**…**`, so
 * the help panel prints it in bold. Every name must match the website word for
 * word.
 */
const en: Topic[] = [
  {
    id: "public-new-profile",
    category: "student-records",
    route: "/student-records",
    href: "/student-records?task=profile",
    title: "How do I make a new student profile?",
    summary: "Request a student profile for RenShinKan review.",
    steps: [
      "Open **New profile** in the student workspace.",
      "Enter the student details and choose the correct dojo.",
      "Check the **Review and create** summary, then choose **Create student profile**.",
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
      "Open **Exam application** in the student workspace.",
      "Enter your **Student ID** and complete every required question.",
      "Choose **Review every answer**, check the summary, then choose **Submit application** and pay the fee shown.",
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
      "Open **My passport** in the student workspace.",
      "Enter your **Student name** and **Student ID**.",
      "Choose **Find my record**, then use the passport tabs.",
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
      "Open **Support** from the menu and go to the contribution form.",
      "Choose **Monthly dojo contribution**, then add every student covered by the payment.",
      "Continue to the PromptPay QR, pay the amount shown, then upload your payment proof.",
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
      "Open **My passport** and check the **Contributions** tab.",
      "If you have no AAT number yet, use the AAT registration link shown there first.",
      "On the contribution form choose **AAT annual contribution**, pay the amount shown, then upload a clear payment proof.",
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
      "Open **Contact Us** from the menu.",
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
      "Open **Support** from the menu and go to the **Donations** section.",
      "Read the payment details, or contact the dojo for PromptPay.",
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
      "Open **Newsletter** from the menu or homepage.",
      "Choose **Read newsletter** on the update you want.",
      "Use the archive filters to find older updates.",
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
      "Open **Newsletter** from the menu and scroll to the signup section.",
      "Choose **Open signup form**, then enter your email address.",
      "Submit the form and follow any confirmation message.",
    ],
    action: "Receive updates by email",
  },
  {
    id: "public-training-hours",
    category: "student-records",
    route: "/student-records",
    href: "/student-records",
    title: "How to request training hours",
    summary: "Ask a sensei to verify training completed outside your current total.",
    steps: [
      "Open **My passport** in the student workspace and find your record.",
      "Go to **Submit additional training hours** below your passport.",
      "Enter the training date, hours, and details, then choose **Submit for review**. Approved hours appear in your passport.",
    ],
    action: "Request training hours",
  },
];

const th: Topic[] = [
  {
    ...en[0],
    title: "สร้างโปรไฟล์นักเรียนใหม่อย่างไร?",
    summary: "ส่งคำขอโปรไฟล์ให้อาจารย์ RenShinKan ตรวจสอบ",
    steps: [
      "เปิด **โปรไฟล์ใหม่** ในพื้นที่นักเรียน",
      "กรอกข้อมูลนักเรียนและเลือกโดโจให้ถูกต้อง",
      "ตรวจสอบสรุปใน **ตรวจสอบและสร้าง** แล้วเลือก **สร้างโปรไฟล์นักเรียน**",
    ],
    action: "สร้างโปรไฟล์นักเรียน",
  },
  {
    ...en[1],
    title: "กรอกใบสมัครสอบอย่างไร?",
    summary: "ส่งใบสมัครสำหรับการสอบที่เปิดรับ",
    steps: [
      "เปิด **ใบสมัครสอบ** ในพื้นที่นักเรียน",
      "กรอก **รหัสนักเรียน** และข้อมูลที่จำเป็นทุกข้อ",
      "เลือก **ตรวจสอบทุกคำตอบ** ดูสรุป แล้วส่งใบสมัครและชำระค่าธรรมเนียม",
    ],
    action: "เปิดใบสมัครสอบ",
  },
  {
    ...en[2],
    title: "ดูพาสปอร์ตนักเรียนอย่างไร?",
    summary: "เปิดพาสปอร์ตนักเรียนแบบส่วนตัว",
    steps: [
      "เปิด **พาสปอร์ตของฉัน** ในพื้นที่นักเรียน",
      "กรอก **ชื่อนักเรียน** และ **รหัสนักเรียน**",
      "เลือก **ค้นหาประวัติของฉัน** แล้วใช้แท็บในพาสปอร์ต",
    ],
    action: "ค้นหาพาสปอร์ต",
  },
  {
    ...en[3],
    title: "ชำระเงินสมทบรายเดือนอย่างไร?",
    summary: "ชำระและส่งหลักฐานเงินสมทบรายเดือน",
    steps: [
      "เปิด **สนับสนุน** จากเมนู แล้วไปที่แบบฟอร์มเงินสมทบ",
      "เลือก **เงินสมทบโดโจรายเดือน** แล้วกรอกนักเรียนทุกคนที่รวมอยู่ในการชำระเงิน",
      "ไปต่อที่คิวอาร์ PromptPay ชำระตามยอดที่แสดง แล้วอัปโหลดหลักฐาน",
    ],
    action: "ชำระเงินสมทบรายเดือน",
  },
  {
    ...en[4],
    title: "ชำระเงินสมทบ AAT รายปีอย่างไร?",
    summary: "ลงทะเบียน AAT ก่อนหากยังไม่มีเลขสมาชิก แล้วส่งเงินสมทบ",
    steps: [
      "เปิด **พาสปอร์ตของฉัน** แล้วดูแท็บ **เงินสมทบ**",
      "หากยังไม่มีเลข AAT ให้ใช้ลิงก์ลงทะเบียน AAT ที่แสดงไว้ก่อน",
      "ในแบบฟอร์มเงินสมทบเลือก **เงินสมทบรายปี AAT** ชำระตามยอดที่แสดง แล้วอัปโหลดหลักฐานที่ชัดเจน",
    ],
    action: "เปิดข้อมูลนักเรียน",
  },
  {
    ...en[5],
    title: "ติดต่อโดโจอย่างไร?",
    summary: "ส่งคำถามหรือนัดหมายเยี่ยมชม RenShinKan",
    steps: [
      "เปิด **ติดต่อเรา** จากเมนู",
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
      "เปิด **สนับสนุน** จากเมนู แล้วไปที่ส่วน **การบริจาค**",
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
      "เปิด **จดหมายข่าว** จากเมนูหรือหน้าแรก",
      "เลือก **อ่านจดหมายข่าว** ในฉบับที่ต้องการ",
      "ใช้ตัวกรองคลังข่าวเพื่อดูข่าวเก่า",
    ],
    action: "อ่านจดหมายข่าว",
  },
  {
    ...en[8],
    title: "รับจดหมายข่าวทางอีเมลอย่างไร?",
    summary: "สมัครรับข่าวที่เผยแพร่จากโดโจ",
    steps: [
      "เปิด **จดหมายข่าว** จากเมนู แล้วเลื่อนไปที่ส่วนสมัครรับข่าว",
      "เลือก **เปิดแบบฟอร์มสมัคร** แล้วกรอกอีเมลของคุณ",
      "ส่งแบบฟอร์มและทำตามข้อความยืนยัน",
    ],
    action: "รับข่าวทางอีเมล",
  },
  {
    ...en[9],
    title: "วิธีขอเพิ่มชั่วโมงฝึก",
    summary: "ขอให้อาจารย์ตรวจสอบชั่วโมงการฝึกที่ยังไม่รวมอยู่ในยอดปัจจุบัน",
    steps: [
      "เปิด **พาสปอร์ตของฉัน** ในพื้นที่นักเรียน แล้วค้นหาประวัติของคุณ",
      "ไปที่ **ส่งชั่วโมงฝึกเพิ่มเติม** ใต้พาสปอร์ต",
      "กรอกวันที่ฝึก จำนวนชั่วโมง และรายละเอียด แล้วเลือก **ส่งเพื่อตรวจสอบ** ชั่วโมงที่อนุมัติจะแสดงในพาสปอร์ต",
    ],
    action: "ขอตรวจสอบชั่วโมงฝึก",
  },
];

const ja: Topic[] = [
  {
    ...en[0],
    title: "新しい会員プロフィールを作るには？",
    summary: "RenShinKanの確認用にプロフィールを申請します。",
    steps: [
      "会員ページで **新規プロフィール** を開きます。",
      "会員情報を入力し、正しい道場を選びます。",
      "**確認して作成** の内容を確かめ、**学生プロフィールを作成** を選びます。",
    ],
    action: "プロフィールを作成",
  },
  {
    ...en[1],
    title: "審査申請を記入するには？",
    summary: "受付中の審査に申請します。",
    steps: [
      "会員ページで **審査申請** を開きます。",
      "**会員ID** と必須項目をすべて入力します。",
      "**すべての回答を確認** を選び、内容を確かめてから申請を送信し、表示された費用を支払います。",
    ],
    action: "審査申請を開く",
  },
  {
    ...en[2],
    title: "会員パスポートを見るには？",
    summary: "非公開の会員パスポートを開きます。",
    steps: [
      "会員ページで **マイパスポート** を開きます。",
      "**会員名** と **会員ID** を入力します。",
      "**記録を検索** を選び、パスポートのタブを使います。",
    ],
    action: "パスポートを検索",
  },
  {
    ...en[3],
    title: "月会費を支払うには？",
    summary: "月会費を支払い、証明を送信します。",
    steps: [
      "メニューから **サポート** を開き、会費フォームへ進みます。",
      "**道場月会費** を選び、支払いに含まれる会員をすべて入力します。",
      "PromptPayのQRへ進み、表示された金額を支払い、証明をアップロードします。",
    ],
    action: "月会費を支払う",
  },
  {
    ...en[4],
    title: "AAT年会費を支払うには？",
    summary: "番号がない場合はAAT登録後に年会費を送信します。",
    steps: [
      "**マイパスポート** を開き、**支払い** タブを確認します。",
      "AAT番号がない場合は、そこに表示される登録リンクを先に使います。",
      "会費フォームで **AAT年会費** を選び、表示された金額を支払い、鮮明な証明をアップロードします。",
    ],
    action: "会員記録を開く",
  },
  {
    ...en[5],
    title: "道場へ連絡するには？",
    summary: "質問や見学希望を送ります。",
    steps: [
      "メニューから **お問い合わせ** を開きます。",
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
      "メニューから **サポート** を開き、**寄付** の項目へ進みます。",
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
      "メニューまたはホームから **ニュースレター** を開きます。",
      "読みたい号の **ニュースレターを読む** を選びます。",
      "アーカイブの絞り込みで過去号を表示します。",
    ],
    action: "ニュースレターを読む",
  },
  {
    ...en[8],
    title: "メールでニュースレターを受け取るには？",
    summary: "道場の更新をメール購読します。",
    steps: [
      "メニューから **ニュースレター** を開き、登録欄までスクロールします。",
      "**登録フォームを開く** を選び、メールアドレスを入力します。",
      "送信し、確認案内に従います。",
    ],
    action: "メールで受け取る",
  },
  {
    ...en[9],
    title: "稽古時間を申請する方法",
    summary: "現在の合計に含まれていない稽古時間を先生に確認してもらいます。",
    steps: [
      "会員ページで **マイパスポート** を開き、自分の記録を表示します。",
      "パスポートの下にある **稽古時間の追加申請** へ進みます。",
      "稽古日、時間数、内容を入力し、**確認のために送信** を選びます。承認された時間はパスポートに反映されます。",
    ],
    action: "稽古時間の確認を申請",
  },
];

const zh: Topic[] = [
  {
    ...en[0],
    title: "如何创建新学员资料？",
    summary: "提交资料供 RenShinKan 审核。",
    steps: [
      "在学员工作区打开 **新资料**。",
      "填写学员信息并选择正确的道场。",
      "核对 **检查并创建** 的摘要，然后选择 **创建学员资料**。",
    ],
    action: "创建学员资料",
  },
  {
    ...en[1],
    title: "如何填写考试申请？",
    summary: "申请当前开放的考试。",
    steps: [
      "在学员工作区打开 **考试申请**。",
      "填写 **学员编号** 和所有必填问题。",
      "选择 **检查全部答案**，核对摘要后提交申请并支付显示的费用。",
    ],
    action: "打开考试申请",
  },
  {
    ...en[2],
    title: "如何查看学员护照？",
    summary: "打开私密学员护照。",
    steps: [
      "在学员工作区打开 **我的护照**。",
      "填写 **学员姓名** 和 **学员编号**。",
      "选择 **查找我的记录**，然后使用护照标签页。",
    ],
    action: "查找我的护照",
  },
  {
    ...en[3],
    title: "如何支付每月道场会费？",
    summary: "支付并提交每月会费证明。",
    steps: [
      "从菜单打开 **支持**，进入缴费表单。",
      "选择 **道场月费**，填写本次付款涵盖的所有学员。",
      "继续到 PromptPay 二维码，按显示金额付款后上传付款证明。",
    ],
    action: "支付每月会费",
  },
  {
    ...en[4],
    title: "如何支付 AAT 年费？",
    summary: "没有 AAT 编号时先注册，再提交年费。",
    steps: [
      "打开 **我的护照**，查看 **缴费** 标签页。",
      "如没有 AAT 编号，先使用其中显示的 AAT 注册链接。",
      "在缴费表单选择 **AAT 年度缴费**，按显示金额付款并上传清晰证明。",
    ],
    action: "打开学员记录",
  },
  {
    ...en[5],
    title: "如何联系道场？",
    summary: "向 RenShinKan 发送问题或参观咨询。",
    steps: [
      "从菜单打开 **联系我们**。",
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
      "从菜单打开 **支持**，进入 **捐款** 部分。",
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
      "从菜单或主页打开 **时事通讯**。",
      "选择想看的那一期的 **阅读通讯**。",
      "使用存档筛选查看旧通讯。",
    ],
    action: "阅读通讯",
  },
  {
    ...en[8],
    title: "如何通过电子邮件接收通讯？",
    summary: "订阅道场发布的更新。",
    steps: [
      "从菜单打开 **时事通讯**，滚动到订阅部分。",
      "选择 **打开订阅表单**，输入电子邮件地址。",
      "提交并按确认提示操作。",
    ],
    action: "通过邮件接收更新",
  },
  {
    ...en[9],
    title: "如何申请训练小时数",
    summary: "请老师核实尚未计入当前总数的训练时间。",
    steps: [
      "在学员工作区打开 **我的护照**，找到自己的记录。",
      "前往护照下方的 **提交额外训练小时数**。",
      "填写训练日期、小时数和详情，然后选择 **提交审核**。通过的小时数会显示在护照中。",
    ],
    action: "申请核实训练小时数",
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
