import type {
  HelpArticle,
  HelpAudience,
  HelpCategory,
  HelpLocale,
  HelpScreenshot,
  HelpStep,
  HelpTroubleshooting,
} from "../types";

export type LocalizedArticle = {
  id: string;
  category: HelpCategory;
  routes: string[];
  title: string;
  summary: string;
  steps: HelpStep[];
  troubleshooting: HelpTroubleshooting[];
  related: string[];
  keywords: string[];
  screenshots?: HelpScreenshot[];
};

export function buildArticles(
  audience: HelpAudience,
  locale: HelpLocale,
  articles: LocalizedArticle[],
): HelpArticle[] {
  return articles.map((article) => ({
    ...article,
    audience,
    locale,
    screenshots: article.screenshots || [],
    version: "2026.07",
  }));
}

export const categories = {
  en: {
    "getting-started": "Getting started",
    "student-records": "Student records",
    training: "Training",
    examinations: "Examinations",
    payments: "Payments",
    "news-resources": "News and resources",
    support: "Support",
    administration: "Administration",
  },
  th: {
    "getting-started": "เริ่มต้นใช้งาน",
    "student-records": "ข้อมูลนักเรียน",
    training: "การฝึกซ้อม",
    examinations: "การสอบ",
    payments: "การชำระเงิน",
    "news-resources": "ข่าวและเอกสาร",
    support: "ความช่วยเหลือ",
    administration: "การดูแลระบบ",
  },
  ja: {
    "getting-started": "はじめに",
    "student-records": "会員記録",
    training: "稽古",
    examinations: "審査",
    payments: "支払い",
    "news-resources": "ニュースと資料",
    support: "サポート",
    administration: "管理",
  },
  "zh-CN": {
    "getting-started": "开始使用",
    "student-records": "学员记录",
    training: "训练",
    examinations: "考试",
    payments: "付款",
    "news-resources": "新闻与资料",
    support: "支持",
    administration: "管理",
  },
} as const;
