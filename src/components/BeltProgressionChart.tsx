import type { CSSProperties } from "react";
import { useTranslation } from "../i18n";
import styles from "./BeltProgressionChart.module.css";

/* ── Belt colour tokens ─────────────────────────────────────── */

const C = {
  orange: "#D97318",
  blue:   "#3D84C8",
  green:  "#5A9824",
  brown:  "#864418",
  dark:   "#1C1208",
  black:  "#0E0905",
} as const;

/* ── Gradient helpers ───────────────────────────────────────── */

function grad(a: string, b: string, split = 38): string {
  return `linear-gradient(90deg, ${a} ${split}%, ${b} ${100 - split}%)`;
}

/* ── Rank data ──────────────────────────────────────────────── */

type RankEntry = {
  rankNum:    string;     // "10" … "1" | "SHO"
  rankSub:    string;     // "KYU" | "Dan-Ho"
  techniques: string[];   // one string per display line
  days:       number;
  bg:         string;     // solid colour or CSS gradient
  color:      string;     // text colour
  lightText:  boolean;    // drives icon / divider colours
};

const DARK_TEXT  = "#2C1400";
const LIGHT_TEXT = "#F8EEE2";

const ranks: RankEntry[] = [
  {
    rankNum: "10",
    rankSub: "KYU",
    techniques: [
      "Kamae | Ai-Hanmi | Gyaku-Hanmi | Ikkyo-Undo |",
      "Funakogi-Undo | Zenpo-Ukemi | Koho-Ukemi | Shikko |",
      "Shomen-Uchi | Yokomen-Uchi | Tsuki |",
      "Katatetori Tenkan-Ho | Kosa-Tori : 1 Kyo (Omote) |",
      "Morotetori : Kokyu-Ho (Omote, Ura) |",
      "Suwari Waza : Kokyu-Ho",
    ],
    days: 30,
    bg: C.orange,
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "9",
    rankSub: "KYU",
    techniques: [
      "All 10 Kyu and |",
      "Kosa-Tori : 1 Kyo (Ura) |",
      "Katate-Tori : Shiho-Nage (Omote)",
    ],
    days: 40,
    bg: grad(C.orange, C.blue, 40),
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "8",
    rankSub: "KYU",
    techniques: [
      "Up to 9 Kyu and |",
      "Katate-Tori : Shiho-Nage (Ura) |",
      "Kosa-Tori : 2 Kyo (Omote, Ura)",
    ],
    days: 40,
    bg: grad(C.orange, C.blue, 28),
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "7",
    rankSub: "KYU",
    techniques: [
      "Up to 8 Kyu and |",
      "Kosa-Tori : Irimi-Nage (Omote, Ura) |",
      "Kosa-Tori : 3 Kyo (Omote, Ura) |",
      "Morotetori : Kokyu-Nage",
    ],
    days: 40,
    bg: C.blue,
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "6",
    rankSub: "KYU",
    techniques: [
      "Up to 7 Kyu and |",
      "Kosa-Tori : Kote-Gaeshi (Omote, Ura) |",
      "Kosa-Tori : 1-4 Kyo (Omote, Ura) |",
      "Shomen-Uchi : 1 Kyo (Omote, Ura)",
    ],
    days: 40,
    bg: grad(C.blue, C.green, 40),
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "5",
    rankSub: "KYU",
    techniques: [
      "Up to 6 Kyu and |",
      "Shomen-Uchi : 1-4 Kyo (Omote, Ura) |",
      "Shomen-Uchi : Irimi-Nage (Omote, Ura) |",
      "Yokomen-Uchi : 1-4 Kyo (Omote, Ura) |",
      "Tsuki Kote-Gaeshi : ** Tenchi-Nage",
    ],
    days: 60,
    bg: C.green,
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "4",
    rankSub: "KYU",
    techniques: [
      "All up to 5 Kyu and |",
      "All Tsuki |",
      "All Ryote-Tori",
    ],
    days: 60,
    bg: grad(C.green, C.brown, 40),
    color: DARK_TEXT,
    lightText: false,
  },
  {
    rankNum: "3",
    rankSub: "KYU",
    techniques: [
      "All up to 4 Kyu and |",
      "Suwari-Waza Technique |",
      "Hanmi-Handachi Technique |",
      "Ushiro-Tori Technique",
    ],
    days: 60,
    bg: C.brown,
    color: LIGHT_TEXT,
    lightText: true,
  },
  {
    rankNum: "2",
    rankSub: "KYU",
    techniques: [
      "All up to 3 Kyu and |",
      "Koshi-Nage |",
      "Kokyu-Nage |",
      "Free-Style",
    ],
    days: 60,
    bg: C.dark,
    color: LIGHT_TEXT,
    lightText: true,
  },
  {
    rankNum: "1",
    rankSub: "KYU",
    techniques: [
      "Up to 2 Kyu and |",
      "Tanto-Tori Technique",
    ],
    days: 60,
    bg: C.dark,
    color: LIGHT_TEXT,
    lightText: true,
  },
  {
    rankNum: "SHO",
    rankSub: "Dan-Ho",
    techniques: [
      "Up to 1 Kyu and |",
      "Bokken Technique |",
      "Irimi Nage (3) |",
      "Kote-Gaeshi (3)",
    ],
    days: 140,
    bg: C.black,
    color: LIGHT_TEXT,
    lightText: true,
  },
];

/* ── Component ──────────────────────────────────────────────── */

export function BeltProgressionChart() {
  const { t } = useTranslation();

  return (
    <div
      className={styles.chart}
      role="list"
      aria-label={t("a11y.beltProgressionChart")}
    >
      {ranks.map((rank) => {
        const sep      = rank.lightText ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
        const iconFill = rank.lightText ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)";
        const iconEdge = rank.lightText ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.20)";
        const isSho    = rank.rankNum === "SHO";

        const rowStyle: CSSProperties = {
          background: rank.bg,
          color:      rank.color,
          "--sep":       sep,
          "--icon-fill": iconFill,
          "--icon-edge": iconEdge,
        } as CSSProperties;

        const numStyle: CSSProperties | undefined = isSho
          ? { fontSize: "1.55rem", letterSpacing: "-0.01em" }
          : undefined;

        return (
          <article
            key={`${rank.rankNum}-${rank.rankSub}`}
            role="listitem"
            className={styles.row}
            style={rowStyle}
            aria-label={t("a11y.beltRankLabel", {
              rank: rank.rankNum,
              rankSub: rank.rankSub,
              days: rank.days,
            })}
          >
            {/* Left: rank label */}
            <div className={styles.rankLabel}>
              <span className={styles.rankNum} style={numStyle}>
                {rank.rankNum}
              </span>
              <span className={styles.rankSub}>{rank.rankSub}</span>
            </div>

            {/* Vertical divider */}
            <div
              className={styles.divider}
              aria-hidden="true"
              style={{ background: sep }}
            />

            {/* Center: techniques */}
            <div className={styles.techniques}>
              {rank.techniques.map((line, i) => (
                <p key={i} className={styles.techLine}>
                  {line}
                </p>
              ))}
            </div>

            {/* Right: days */}
            <div className={styles.daysCol}>
              <span className={styles.daysNum}>{rank.days}</span>
              <span className={styles.daysLbl}>{t("common.days")}</span>
            </div>

            {/* Far right: belt icon */}
            <div className={styles.beltIconCol} aria-hidden="true">
              <div className={styles.beltIcon} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
