import type { LucideIcon } from "lucide-react";
import {
  Bath,
  BookOpen,
  CircleDot,
  Droplets,
  Eye,
  Footprints,
  GlassWater,
  HeartHandshake,
  Home,
  Leaf,
  MapPin,
  ShieldCheck,
  Sparkles,
  Swords,
  UsersRound,
} from "lucide-react";
import { assetPath } from "../utils/assetPath";

export type NavItem = {
  label: string;
  path: string;
};

export type IconContent = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export type Instructor = {
  role: string;
  name: string;
  rank: string;
  trainingBackground: string;
  teachingFocus?: string;
  languages?: string;
  imageSrc?: string;
  imageAlt?: string;
};

export type WorkshopCategory = "Beginner" | "Children" | "Weapons";

export type Workshop = {
  title: string;
  category: WorkshopCategory;
  date: string;
  time: string;
  audience: string;
  description: string;
};

export type AikidoTimelineItem = {
  year: string;
  title: string;
  description: string;
  sectionId: string;
};

export type HistoricalPhoto = {
  id: string;
  src: string;
  alt: string;
  title: string;
  date: string;
  caption: string;
  sourceName: string;
  sourceUrl: string;
  credit: string;
  rightsNote: string;
  objectPosition?: string;
};

export type DojoBuildPhoto = HistoricalPhoto & {
  sourceFile: string;
  dateDark?: boolean;
};

export type AikidoHistorySection = {
  id: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  imageId?: string;
  imagePosition?: "left" | "right";
};

export const siteInfo = {
  name: "RenshinKan Dojo",
  location: "Hang Dong, Chiang Mai",
  address:
    "155 Soi 6, Suan Luang Village, T. Baan Waen, A. Hang Dong, Chiang Mai 50230",
  facebookUrl: "https://www.facebook.com/RenShinKanChiangMai/",
  email: "contact@renshinkandojo.org",
  foundationUrl: "https://www.peaceculturefoundation.org/renshinkan-dojo",
  builtYear: "2013",
};

export const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${siteInfo.name}, ${siteInfo.address}`,
)}`;

export const navigation: NavItem[] = [
  { label: "Home", path: "/" },
  { label: "Our Dojo", path: "/#dojo" },
  { label: "Classes", path: "/classes" },
  { label: "Aikido", path: "/aikido" },
  { label: "Community", path: "/community" },
  { label: "Support", path: "/support" },
  { label: "Contact Us", path: "/contact" },
];

export const quickInfo: IconContent[] = [
  {
    title: "Beginners Welcome",
    description: "A steady first step into cooperative practice.",
    icon: Footprints,
  },
  {
    title: "Parent Viewing Deck",
    description: "A seated place to observe class with calm attention.",
    icon: Eye,
  },
  {
    title: "Built in 2013",
    description: "A dedicated training space rooted in the Hang Dong community.",
    icon: Home,
  },
  {
    title: "Hang Dong Location",
    description: "Located in Baan Waen, Hang Dong. Visitors are welcome to message ahead.",
    icon: MapPin,
  },
];

export const aikidoValues: IconContent[] = [
  {
    title: "Harmony",
    description:
      "Aikido meets force with calm instead of resistance. Rather than clashing, students learn to blend with an attack and guide it toward a peaceful end.",
    icon: HeartHandshake,
  },
  {
    title: "Movement",
    description:
      "The art lives in circular, flowing motion. Entering and turning replace straight line strength, so a technique works through position and timing rather than muscle.",
    icon: CircleDot,
  },
  {
    title: "Safety",
    description:
      "Care always comes before intensity. Spacing, controlled technique, and soft falling let partners train fully while keeping each other safe.",
    icon: ShieldCheck,
  },
  {
    title: "Discipline",
    description:
      "Aikido is learned through honest, repeated practice. Each class follows a settled rhythm that steadies the body and quiets the mind.",
    icon: BookOpen,
  },
  {
    title: "Respect",
    description:
      "Respect shapes everything on the mat. Practice begins and ends with a bow, and a partner is someone you protect, never someone you defeat.",
    icon: Leaf,
  },
];

export const principles = [
  {
    title: "Blend, Don’t Clash",
    description:
      "Practice begins by joining movement instead of forcing an answer.",
  },
  {
    title: "Redirect Energy",
    description:
      "Students learn to guide momentum into safer lines through balance and timing.",
  },
  {
    title: "Protect Yourself and Your Partner",
    description:
      "Ukemi, spacing, and controlled pins keep training cooperative and safe for both partners.",
  },
  {
    title: "Train Body and Mind",
    description:
      "Aikido develops coordination, calm attention, and steady emotional control.",
  },
  {
    title: "Respect Before Technique",
    description:
      "The quality of practice is measured by care, patience, and mutual trust.",
  },
];

export const aikidoBenefits = [
  {
    title: "Discipline",
    description:
      "Bowing in, repeating each movement with care, and returning week after week build a quiet, steady discipline that soon feels natural.",
  },
  {
    title: "Patience",
    description:
      "Techniques are learned slowly and refined over years, so practice gently teaches you to trust the process and value steady progress.",
  },
  {
    title: "Focus",
    description:
      "Reading a partner's movement and meeting it at the right moment trains a clear, present attention you can carry into everyday life.",
  },
  {
    title: "Confidence",
    description:
      "As techniques begin to work without force or strain, students grow a calm, grounded confidence that does not depend on size or strength.",
  },
  {
    title: "Posture",
    description:
      "Aikido is practiced from an upright, relaxed stance, so good posture and a strong, settled base become second nature on and off the mat.",
  },
  {
    title: "Coordination",
    description:
      "Blending footwork, breathing, and hand movement into one smooth action sharpens whole body coordination with every repetition.",
  },
  {
    title: "Balance",
    description:
      "Entering, turning, and staying grounded while a partner moves teaches you to keep your balance and recover it quickly when it is tested.",
  },
  {
    title: "Respect",
    description:
      "Every technique opens and closes with a bow, and partners look after one another, so respect runs through the way the whole dojo trains.",
  },
  {
    title: "Awareness of others",
    description:
      "Working closely with a partner builds a real feel for distance, timing, and safety, keeping you aware of the people around you.",
  },
];

export const aikidoForChildren = [
  {
    title: "Confidence to speak up",
    description:
      "Small, step by step successes on the mat help a quieter child stand a little taller, at the dojo and at school.",
  },
  {
    title: "Listening and self control",
    description:
      "Waiting for a turn, following the count, and working gently with a partner teach children to listen and settle their energy.",
  },
  {
    title: "Safe, playful falling",
    description:
      "Rolling and tumbling are taught as a game first, so children learn to fall without fear and look after themselves anywhere.",
  },
];

export const aikidoForAdults = [
  {
    title: "Move after a day at a desk",
    description:
      "Gentle, flowing practice loosens stiff shoulders and hips and brings easy, natural movement back into the body.",
  },
  {
    title: "A calmer, clearer mind",
    description:
      "Giving full attention to a partner and a technique leaves the day's stress at the door for ninety quiet minutes.",
  },
  {
    title: "A friendly community",
    description:
      "You join a welcoming circle of people of all ages and backgrounds who train with patience and look out for each other.",
  },
];

export const aikidoTimeline: AikidoTimelineItem[] = [
  {
    year: "1883-1911",
    title: "Early Life and Training",
    description:
      "Morihei Ueshiba grows up in Wakayama as Japan modernizes, studying several traditional martial systems before aikido exists.",
    sectionId: "early-life",
  },
  {
    year: "1912-1919",
    title: "Hokkaido and Daito-ryu",
    description:
      "Frontier life and intensive study with Sokaku Takeda give Ueshiba the technical base later transformed into aikido.",
    sectionId: "daito-ryu",
  },
  {
    year: "1919-1926",
    title: "Omoto-kyo and Ayabe",
    description:
      "Onisaburo Deguchi and Omoto spiritual practice pull Ueshiba toward a martial path shaped by purification, service, and ethical purpose.",
    sectionId: "omoto-kyo",
  },
  {
    year: "1927-1942",
    title: "Tokyo and Aiki-budo",
    description:
      "In prewar Tokyo, Ueshiba teaches a demanding art to serious students as Kobukan Dojo becomes known for severe practice.",
    sectionId: "aiki-budo",
  },
  {
    year: "1942-1949",
    title: "Iwama and Postwar Renewal",
    description:
      "The name aikido is adopted, the Aiki Shrine is established, and postwar practice resumes through the Aikikai Foundation.",
    sectionId: "postwar-aikido",
  },
  {
    year: "1950s-1969",
    title: "Hombu Dojo and Public Aikido",
    description:
      "Kisshomaru Ueshiba helps organize daily training, public demonstrations, publishing, and the modern Aikikai identity.",
    sectionId: "hombu-growth",
  },
  {
    year: "1950s-present",
    title: "International Spread",
    description:
      "Aikido teachers and organizations carry the art beyond Japan, building a worldwide practice culture.",
    sectionId: "international-spread",
  },
  {
    year: "1961",
    title: "Aikido Reaches Thailand",
    description:
      "Aikido is introduced to Thailand by Nobuyoshi Tamura Shihan, with technical support from Aikido World Headquarters in Tokyo.",
    sectionId: "thailand",
  },
  {
    year: "1970",
    title: "Renbukan Dojo, Bangkok",
    description:
      "Renbukan Dojo is founded in Bangkok and becomes the headquarters of the Aikido Association of Thailand under Motohiro Fukakusa Shihan.",
    sectionId: "thailand",
  },
  {
    year: "1980s",
    title: "The Thai Aikido Network",
    description:
      "Bangkok teachers such as Motohiro Fukakusa Shihan and Prapant Chittaputta Shihan train a generation that carries aikido to universities and provinces beyond the capital.",
    sectionId: "thailand",
  },
  {
    year: "1986-present",
    title: "Chiang Mai and RenshinKan",
    description:
      "Northern Thailand practice grows through the Chiang Mai University Aikido Club and dojo communities, leading to RenshinKan's local training culture.",
    sectionId: "renshinkan-practice",
  },
];

export const oSenseiHistory = {
  sourceTitle: "A Day in the Life of O’Sensei",
  sourceUrl: "https://aikidocmu.wordpress.com/a-day/",
  originalSourceUrl: "http://www.nippon-kan.org/senseis_articles/day-in-the-life.html",
  sourceNote:
    "Paraphrased from Aikido Chiang Mai Unite’s Thai translation of Gaku Homma Sensei’s article, with historical photos credited on that page.",
  intro:
    "Morihei Ueshiba, known to aikido students as O Sensei, did not leave aikido only as a set of techniques. Accounts from students around him describe a daily life shaped by prayer, calligraphy, teaching, care for place, and disciplined attention.",
  details: [
    {
      title: "Practice Was Part Of Daily Life",
      description:
        "In his later years at Iwama, O Sensei’s training was woven into ordinary routine: meals, rest, walking, teaching, and quiet preparation all belonged to the same practice.",
    },
    {
      title: "Ritual And Movement Were Connected",
      description:
        "Morning prayer, shrine visits, and weapons movement were described as part of how he expressed aikido’s spiritual and physical discipline.",
    },
    {
      title: "Strength Without Display",
      description:
        "The source recalls his steady walking and strong posture at age eighty-five, while also showing a person living simply and relying on the care of those around him.",
    },
    {
      title: "Respect Shaped The Photos",
      description:
        "Several images were taken from behind because photographing the founder directly from the front was considered disrespectful in that setting.",
    },
  ],
};

export const oSenseiPhotos = [
  {
    src: assetPath("/history/o-sensei-calligraphy.png"),
    alt: "Morihei Ueshiba practicing calligraphy at Hombu Dojo in January 1969.",
    title: "Calligraphy At Hombu Dojo",
    caption:
      "January 3, 1969: O Sensei practicing calligraphy on the second floor of Hombu Dojo.",
    credit: "Historical image credited by AikidoCMU / Nippon Kan source page.",
  },
  {
    src: assetPath("/history/o-sensei-hombu-prayer.png"),
    alt: "Morihei Ueshiba praying on the rooftop of Hombu Dojo in February 1969.",
    title: "Morning Prayer",
    caption:
      "February 12, 1969: a morning prayer moment on the Hombu Dojo rooftop.",
    credit: "Photo credited to Gaku Homma on the source page.",
  },
  {
    src: assetPath("/history/o-sensei-walking.png"),
    alt: "Morihei Ueshiba walking with steady posture, photographed from behind.",
    title: "Steady Walking",
    caption:
      "A respectful rear-view photograph emphasizing O Sensei’s strong, steady walking.",
    credit: "Photo credited to Gaku Homma on the source page.",
  },
  {
    src: assetPath("/history/o-sensei-aiki-shrine.png"),
    alt: "Morihei Ueshiba walking toward the Aiki Shrine for morning ceremony.",
    title: "Toward Aiki Shrine",
    caption:
      "May 1968: O Sensei walking to the Aiki Shrine for morning ceremony.",
    credit: "Photo credited to Gaku Homma on the source page.",
  },
  {
    src: assetPath("/history/o-sensei-train.png"),
    alt: "Morihei Ueshiba traveling by train between Iwama and Tokyo.",
    title: "Between Iwama And Tokyo",
    caption:
      "Early March 1968: O Sensei traveling by train from Iwama to Hombu Dojo in Tokyo.",
    credit: "Photo credited to Gaku Homma on the source page.",
  },
];

export const aikidoHistorySources = [
  {
    label: "Aikikai Foundation history and biographies",
    url: "https://aikikai.or.jp/eng/aikido/history/",
  },
  {
    label: "Aikikai Foundation: What is Aikido?",
    url: "https://aikikai.or.jp/eng/aikido/",
  },
  {
    label: "Daito-ryu Aikijujutsu Hombu history",
    url: "https://www.daitohryu.com/eng-history05",
  },
  {
    label: "Peace Culture Foundation: What is aikido?",
    url: "https://www.peaceculturefoundation.org/what-aikido",
  },
  {
    label: "Aikido Chiang Mai Unite / Nippon Kan source article",
    url: "https://aikidocmu.wordpress.com/a-day/",
  },
];

// Public-domain Wikimedia Commons images below use local copies to avoid hotlinking.
export const aikidoHistoricalPhotos: HistoricalPhoto[] = [
  {
    id: "ueshiba-1918",
    src: assetPath("/history/morihei-ueshiba-1918.jpg"),
    alt: "Young Morihei Ueshiba in a formal portrait around 1918.",
    title: "Morihei Ueshiba Around 1918",
    date: "1918",
    caption:
      "A young Morihei Ueshiba during the Hokkaido period, before the public name aikido existed.",
    sourceName: "Wikimedia Commons; source listed as Aikido Journal",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Morihei-ueshiba-c1918.jpg",
    credit: "Unknown photographer.",
    rightsNote:
      "Marked public domain on Wikimedia Commons under PD-Japan-oldphoto and public domain in the United States.",
    objectPosition: "top",
  },
  {
    id: "takeda-1888",
    src: assetPath("/history/sokaku-takeda-1888.jpg"),
    alt: "Sokaku Takeda in a historical full-length portrait from around 1888.",
    title: "Sokaku Takeda",
    date: "c. 1888",
    caption:
      "Takeda Sokaku, the Daito-ryu aiki-jujutsu teacher whose art strongly shaped Ueshiba's technical foundation.",
    sourceName: "Wikimedia Commons; source listed as Aiki News and Aikido FAQ",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Takeda_Sokaku.jpg",
    credit: "Unknown author.",
    rightsNote:
      "Marked public domain on Wikimedia Commons under PD-Japan-oldphoto and public domain in the United States.",
    objectPosition: "top",
  },
  {
    id: "ueshiba-1939",
    src: assetPath("/history/morihei-ueshiba-1939.jpg"),
    alt: "Morihei Ueshiba in a formal portrait from 1939.",
    title: "Morihei Ueshiba in 1939",
    date: "1939",
    caption:
      "A portrait from the Kobukan / aiki-budo years, when Ueshiba was teaching in Tokyo before the postwar Aikikai era.",
    sourceName: "Wikimedia Commons; source listed as Aikido Journal",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Morihei_Ueshiba_1939.jpg",
    credit: "Unknown photographer.",
    rightsNote:
      "Marked public domain on Wikimedia Commons under PD-Japan-oldphoto and public domain in the United States.",
    objectPosition: "top",
  },
  {
    id: "calligraphy-1969",
    src: assetPath("/history/o-sensei-calligraphy.png"),
    alt: "Morihei Ueshiba practicing calligraphy at Hombu Dojo in January 1969.",
    title: "Calligraphy At Hombu Dojo",
    date: "January 3, 1969",
    caption:
      "O Sensei practicing calligraphy on the second floor of Hombu Dojo, months before his death.",
    sourceName: "Aikido Chiang Mai Unite translation of a Nippon Kan / Gaku Homma article",
    sourceUrl: "https://aikidocmu.wordpress.com/a-day/",
    credit: "Source page credits the article and images to Gaku Homma Sensei / Nippon Kan.",
    rightsNote: "Shared here for educational and historical context. Source page cited above.",
  },
  {
    id: "morning-prayer-1969",
    src: assetPath("/history/o-sensei-hombu-prayer.png"),
    alt: "Morihei Ueshiba praying on the rooftop of Hombu Dojo in February 1969.",
    title: "Morning Prayer",
    date: "February 12, 1969",
    caption:
      "A rooftop prayer moment at Hombu Dojo, showing how spiritual discipline remained woven into late-life practice.",
    sourceName: "Aikido Chiang Mai Unite translation of a Nippon Kan / Gaku Homma article",
    sourceUrl: "https://aikidocmu.wordpress.com/a-day/",
    credit: "Photo credited to Gaku Homma on the source page.",
    rightsNote: "Shared here for educational and historical context. Source page cited above.",
    objectPosition: "top",
  },
  {
    id: "steady-walking-1968",
    src: assetPath("/history/o-sensei-walking.png"),
    alt: "Morihei Ueshiba walking with steady posture, photographed from behind.",
    title: "Steady Walking",
    date: "1968",
    caption:
      "A rear-view photograph emphasizing Ueshiba's strong walking posture; the source notes that many images were taken from behind out of respect.",
    sourceName: "Aikido Chiang Mai Unite translation of a Nippon Kan / Gaku Homma article",
    sourceUrl: "https://aikidocmu.wordpress.com/a-day/",
    credit: "Photo credited to Gaku Homma on the source page.",
    rightsNote: "Shared here for educational and historical context. Source page cited above.",
    objectPosition: "50% 20%",
  },
  {
    id: "aiki-shrine-1968",
    src: assetPath("/history/o-sensei-aiki-shrine.png"),
    alt: "Morihei Ueshiba walking toward the Aiki Shrine for morning ceremony.",
    title: "Toward Aiki Shrine",
    date: "May 1968",
    caption:
      "O Sensei walking to the Aiki Shrine in Iwama for morning ceremony, connecting the martial art to daily ritual practice.",
    sourceName: "Aikido Chiang Mai Unite translation of a Nippon Kan / Gaku Homma article",
    sourceUrl: "https://aikidocmu.wordpress.com/a-day/",
    credit: "Photo credited to Gaku Homma on the source page.",
    rightsNote: "Shared here for educational and historical context. Source page cited above.",
    objectPosition: "top",
  },
  {
    id: "train-1968",
    src: assetPath("/history/o-sensei-train.png"),
    alt: "Morihei Ueshiba traveling by train between Iwama and Tokyo.",
    title: "Between Iwama And Tokyo",
    date: "Early March 1968",
    caption:
      "Ueshiba traveling from Iwama to Hombu Dojo, a quiet image of the founder moving between shrine, countryside dojo, and Tokyo headquarters.",
    sourceName: "Aikido Chiang Mai Unite translation of a Nippon Kan / Gaku Homma article",
    sourceUrl: "https://aikidocmu.wordpress.com/a-day/",
    credit: "Photo credited to Gaku Homma on the source page.",
    rightsNote: "Shared here for educational and historical context. Source page cited above.",
  },
];

export const aikidoHistorySections: AikidoHistorySection[] = [
  {
    id: "early-life",
    eyebrow: "Early Life",
    title: "A founder formed during a rapidly changing Japan.",
    imageId: "ueshiba-1918",
    imagePosition: "right",
    paragraphs: [
      "Morihei Ueshiba was born on December 14, 1883, in what is now Tanabe, Wakayama Prefecture. He came of age as Japan was moving through the late Meiji period: railways, industry, new schools, military service, and Western pressure were changing daily life, while older martial traditions were being reinterpreted for a modern nation.",
      "The Aikikai chronology records that Ueshiba began studying several traditional martial arts in the 1890s and later received a license in Goto Ha-Yagyu Ryu jujutsu. For parents and beginners, the important point is that aikido did not appear from nowhere. It grew out of older training in posture, timing, balance, weapons awareness, and close partner control.",
    ],
  },
  {
    id: "daito-ryu",
    eyebrow: "Technical Roots",
    title: "Daito-ryu gave Ueshiba a demanding grammar of control.",
    imageId: "takeda-1888",
    imagePosition: "left",
    paragraphs: [
      "In 1912 Ueshiba led settlers from Wakayama to Shirataki in Hokkaido. Life there was hard, physical, and exposed to frontier discipline. During that period he met Sokaku Takeda, the formidable teacher of Daito-ryu aiki-jujutsu. Daito-ryu Hombu describes Ueshiba as one of Takeda's best students and says the origins of aikido clearly lie in Daito-ryu.",
      "Those roots matter because aikido still studies entering, turning, taking balance, pins, throws, and the careful use of the whole body rather than isolated muscle. What changed over time was the purpose and tone. Ueshiba kept refining severe older methods into a practice that could protect both people rather than simply defeat one of them.",
    ],
  },
  {
    id: "omoto-kyo",
    eyebrow: "Spiritual Influence",
    title: "Ayabe changed the question from winning to what training is for.",
    imageId: "morning-prayer-1969",
    imagePosition: "right",
    paragraphs: [
      "In 1919, while returning home because his father was critically ill, Ueshiba encountered Onisaburo Deguchi of the Omoto religious movement in Ayabe, Kyoto. He moved into that community, opened the Ueshiba-juku dojo in 1920, and combined physical training with ascetic and spiritual practice. The Aikikai timeline notes that by 1922 he was addressing Aiki as the essence of martial arts through both mind development and spiritual practice.",
      "This is where aikido begins to sound different from a contest art. The aim was not merely to produce a stronger fighter. Ueshiba increasingly spoke about harmony, purification, and service. A modern dojo does not need to reproduce every religious idea around early aikido to preserve the practical ethical direction: train seriously, protect the partner, and learn to meet force without feeding conflict.",
    ],
  },
  {
    id: "aiki-budo",
    eyebrow: "Prewar Development",
    title: "Before the name aikido, the art passed through aiki-budo.",
    imageId: "ueshiba-1939",
    imagePosition: "left",
    paragraphs: [
      "Ueshiba moved to Tokyo in 1927 and established the Kobukan Dojo in 1931. This was the prewar Showa period, when budo was often tied to national discipline, police training, military institutions, and elite networks. The techniques of this era could be severe, and the dojo's reputation reflected that intensity.",
      "Names shifted as the art developed: Ueshiba-ryu, aiki-jujutsu, aiki-budo, and eventually aikido. For students today, this history explains why aikido can look gentle from the outside but still asks for precision. The circular movement, footwork, and pins are not decorative. They are ways of organizing the body so power can be received, redirected, and resolved.",
    ],
  },
  {
    id: "postwar-aikido",
    eyebrow: "Postwar Renewal",
    title: "The postwar years gave aikido its modern public shape.",
    imageId: "aiki-shrine-1968",
    imagePosition: "right",
    paragraphs: [
      "In 1942 the name aikido was adopted, Kisshomaru Ueshiba was named director of the headquarters, and Morihei Ueshiba's center of gravity moved strongly toward Iwama. The Aiki Shrine was erected in 1943, and the Ibaraki Dojo was constructed in 1945. These dates sit inside the difficult years of war and defeat, when Japan's public martial culture was being reconsidered.",
      "After the war, aikido had to be presented as something more than a fighting system. The Aikikai Foundation was officially recognized in 1948, and a daily schedule of practice resumed at Hombu Dojo in 1949. The art's noncompetitive format, partner care, and language of harmony helped it survive as education, discipline, and cultural practice.",
    ],
  },
  {
    id: "hombu-growth",
    eyebrow: "Hombu Dojo",
    title: "Kisshomaru Ueshiba organized the bridge from founder to public art.",
    imageId: "calligraphy-1969",
    imagePosition: "left",
    paragraphs: [
      "Modern aikido owes much to the founder's son, Kisshomaru Ueshiba. He helped restart daily training, wrote for a wider public, supported demonstrations, and gave the art a clearer organizational path after the founder's passing. The first public aikido demonstration was held in 1955, the Aikido newspaper began in 1959, and the newly built Hombu Dojo was completed in 1968.",
      "Morihei Ueshiba remained the spiritual and technical center until his death on April 26, 1969. Late photographs show an elderly teacher praying, traveling, writing, and moving between Iwama and Tokyo. Those quiet images help visitors see that aikido history is not only a list of techniques; it is also a daily practice of attention.",
    ],
  },
  {
    id: "international-spread",
    eyebrow: "International Spread",
    title: "Aikido became global through teachers, dojos, and patient repetition.",
    imageId: "train-1968",
    imagePosition: "right",
    paragraphs: [
      "Aikido began spreading overseas in the 1950s. Hombu instructors and students carried the art to Europe, the Americas, Southeast Asia, and beyond. The International Aikido Federation was established in 1976, and Aikikai now describes aikido as established in more than 140 countries and regions.",
      "As aikido traveled, it also diversified. Some lineages emphasized weapons, some emphasized crisp prewar technique, some emphasized flowing movement, and some built programs for children, families, and community safety. The best dojos stay honest about that variety while keeping the shared center: train with respect, receive safely, and refine conflict into connection.",
    ],
  },
  {
    id: "thailand",
    eyebrow: "Thailand",
    title: "Thai aikido grew through Hombu links and long-term teachers.",
    paragraphs: [
      "The Peace Culture Foundation's aikido history notes that aikido was introduced to Thailand in 1961 by Nobuyoshi Tamura Shihan, with technical support from Aikido World Headquarters in Tokyo. It also notes that Renbukan Dojo in Bangkok was founded in 1970 and became the headquarters of the Aikido Association of Thailand under Motohiro Fukakusa Shihan.",
      "That national story matters for Chiang Mai because local practice is part of a wider Thai aikido network, not an isolated activity. Rank, seminars, visiting teachers, and friendships across dojos give students continuity beyond a single room.",
    ],
  },
  {
    id: "renshinkan-practice",
    eyebrow: "Local Practice",
    title: "At a local dojo, history becomes visible in ordinary habits.",
    imageId: "steady-walking-1968",
    imagePosition: "left",
    paragraphs: [
      "In Chiang Mai, aikido practice grew through university and community roots. Ajarn Sombat Tapanya began aikido training in 1980, helped found the Chiang Mai University Aikido Club in 1986, and later built the RenshinKan training space in Hang Dong. The dojo continues that line through beginner classes, family observation, weapons practice, and visiting aikidoka.",
      "For a first-time visitor, the history becomes practical very quickly. Bowing teaches attention. Ukemi teaches how to receive pressure. Partner practice teaches how to protect another person while staying centered yourself. That is the living thread from O Sensei's story to the mat today.",
    ],
  },
];

export const facilities: IconContent[] = [
  {
    title: "Changing Rooms",
    description: "Separate male and female changing rooms support comfortable visits.",
    icon: UsersRound,
  },
  {
    title: "Bathrooms & Handwashing",
    description: "Bathrooms include handwashing facilities for students and guests.",
    icon: Bath,
  },
  {
    title: "Drinking Water",
    description: "A water cooler is available so students can hydrate during practice.",
    icon: GlassWater,
  },
  {
    title: "Training Weapons",
    description: "Aikido weapons are available for bokken, jo, and tanto practice.",
    icon: Swords,
  },
  {
    title: "Parent Viewing Deck",
    description: "A seated viewing deck lets parents and visitors observe class.",
    icon: Eye,
  },
];

export const pcfAikidoImages = {
  sourceLabel: "Peace Culture Foundation Aikido page",
  sourceUrl: "https://www.peaceculturefoundation.org/aikido",
  classPractice: {
    src: assetPath("/pcf-aikido/aikido-class.jpg"),
    alt: "Aikido students seated in seiza before the kamiza wall at RenshinKan Dojo.",
  },
  schedule: {
    src: assetPath("/pcf-aikido/class-schedule.png"),
    alt: "Aikido class schedule graphic from the Peace Culture Foundation Aikido page.",
  },
  dojoSign: {
    src: assetPath("/pcf-aikido/dojo-sign.jpg"),
    alt: "RenshinKan Dojo sign outside the dojo.",
  },
  kamiza: {
    src: assetPath("/pcf-aikido/kamiza.jpg"),
    alt: "Kamiza area inside RenshinKan Dojo.",
  },
  joBokken: {
    src: assetPath("/pcf-aikido/jo-bokken.jpg"),
    alt: "Wooden aikido training weapons arranged at the dojo.",
  },
  bokkenRack: {
    src: assetPath("/pcf-aikido/bokken-rack.jpg"),
    alt: "A rack of wooden bokken training weapons at RenshinKan Dojo.",
  },
  dojoExterior: {
    src: assetPath("/pcf-aikido/dojo-exterior.jpg"),
    alt: "Exterior view of RenshinKan Dojo in Hang Dong, Chiang Mai.",
  },
};

export const aikidoActionImages = {
  technique: {
    src: assetPath("/dojo-photos/aikido-wristlock.webp"),
    alt: "A RenshinKan student calmly applying a controlled wrist technique on a partner inside the dojo, with a wooden weapons rack on the wall behind.",
  },
  joTraining: {
    src: assetPath("/dojo-photos/aikido-jo-training.webp"),
    alt: "Two students practising paired jo staff movements at a public aikido demonstration.",
  },
  tantoTechnique: {
    src: assetPath("/dojo-photos/aikido-tanto-technique.webp"),
    alt: "A student performing a tanto knife disarm, guiding the partner into a forward roll.",
  },
  breakfall: {
    src: assetPath("/dojo-photos/aikido-breakfall.webp"),
    alt: "A student taking a high, relaxed breakfall during an aikido demonstration.",
  },
  pin: {
    src: assetPath("/dojo-photos/aikido-pin.webp"),
    alt: "A young aikido student holding a calm, controlled pin on a partner on the tatami mat.",
  },
  seminar: {
    src: assetPath("/dojo-photos/aikido-seminar-demo.webp"),
    alt: "An instructor demonstrating an aikido technique in front of a large seated group of students of all ages during a seminar.",
  },
  trainingPin: {
    src: assetPath("/dojo-photos/aikido-training-pin-2x.webp"),
    alt: "A RenshinKan student applying a calm, controlled pin on a partner during aikido training on the tatami mat.",
  },
};

export const dojoPhotos = [
  {
    title: "Koi Pond",
    description: "A small koi pond tucked into the garden grounds.",
    alt: "Koi pond in the RenshinKan Dojo garden.",
    src: assetPath("/dojo-photos/renshinkan-koi-pond-upscaled.webp"),
  },
  {
    title: "The Garden",
    description: "Greenery surrounds the dojo and gives the space a calm, settled feel.",
    alt: "Garden surrounding RenshinKan Dojo in Hang Dong.",
    src: assetPath("/dojo-photos/workshop-location-garden.webp"),
  },
  {
    title: "Courtyard",
    description: "The open courtyard connects the main dojo building to the rest of the grounds.",
    alt: "Open courtyard at RenshinKan Dojo.",
    src: assetPath("/dojo-photos/workshop-location-courtyard.webp"),
  },
  {
    title: "Training Hall",
    description: "The main training space with tatami mats, high ceilings, and plenty of room to move.",
    alt: "RenshinKan Dojo interior training hall.",
    src: assetPath("/dojo-photos/workshop-location-dojo.webp"),
  },
];

export const dojoJourney = [
  {
    title: "Wide Class Group",
    description:
      "A full class portrait inside the RenshinKan training hall.",
    alt: "Large class group seated on the RenshinKan Dojo mat.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_01.jpg"),
    variant: "tatami",
  },
  {
    title: "Yellow Mat Group",
    description:
      "Students gathered after class on the yellow center mat.",
    alt: "Aikido students in white uniforms seated together on the dojo mat.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_yellow_mat_01.jpg"),
    variant: "tatami",
  },
  {
    title: "Close Class Portrait",
    description:
      "A closer class photo with students and instructors together.",
    alt: "Close class group portrait inside RenshinKan Dojo.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_closeup_01.jpg"),
    variant: "tatami",
  },
  {
    title: "Front Wall Class",
    description:
      "A class group photo facing the kamiza wall.",
    alt: "Class group seated in front of the RenshinKan Dojo front wall.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_front_wall_01.jpg"),
    variant: "tatami",
  },
  {
    title: "Second Wide Group",
    description:
      "Another wide class portrait from the dojo floor.",
    alt: "Wide aikido class group portrait inside RenshinKan Dojo.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_02.jpg"),
    variant: "tatami",
  },
  {
    title: "On The Mat",
    description:
      "Students and instructors gathered on the mat after practice.",
    alt: "RenshinKan students on the mat.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/on_the_mat_01.jpg"),
    variant: "tatami",
  },
  {
    title: "Mat Practice",
    description:
      "A moment captured during training at RenshinKan.",
    alt: "Aikido training on the mat at RenshinKan Dojo.",
    imageSrc: assetPath("/renshinkan-gallery/class-photos/on_the_mat_02.jpg"),
    variant: "tatami",
  },
];

export const classCarouselPhotos = [
  {
    title: "Wide Class Group",
    caption: "A full class portrait inside the RenshinKan training hall.",
    alt: "Large class group seated on the RenshinKan Dojo mat.",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_01.jpg"),
  },
  {
    title: "Yellow Mat Group",
    caption: "Students gathered after class on the yellow center mat.",
    alt: "Aikido students in white uniforms seated together on the dojo mat.",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_yellow_mat_01.jpg"),
  },
  {
    title: "Close Class Portrait",
    caption: "A closer class photo with students and instructors together.",
    alt: "Close class group portrait inside RenshinKan Dojo.",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_closeup_01.jpg"),
  },
  {
    title: "Front Wall Class",
    caption: "A class group photo facing the kamiza wall.",
    alt: "Class group seated in front of the RenshinKan Dojo front wall.",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_front_wall_01.jpg"),
  },
  {
    title: "Second Wide Group",
    caption: "Another wide class portrait from the dojo floor.",
    alt: "Wide aikido class group portrait inside RenshinKan Dojo.",
    src: assetPath("/renshinkan-gallery/class-photos/class_group_dojo_wide_02.jpg"),
  },
];

export const beltExamCarouselPhotos = [
  {
    title: "Mixed Certificate Group",
    caption: "Students receiving certificates after a belt examination.",
    alt: "Students seated with certificates after a belt graduation.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_01.jpg"),
  },
  {
    title: "Three Students",
    caption: "A certificate presentation moment for three students.",
    alt: "Three aikido students with instructors during certificate presentation.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_three_students_01.jpg"),
  },
  {
    title: "Two Students",
    caption: "A belt graduation certificate photo with two students.",
    alt: "Two aikido students seated with instructors for a certificate photo.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_01.jpg"),
  },
  {
    title: "Two Students",
    caption: "A second certificate photo with two students after examination.",
    alt: "Two aikido students with certificates during a belt graduation.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_02.jpg"),
  },
  {
    title: "Mixed Certificate Group",
    caption: "A quiet certificate presentation after examination.",
    alt: "Mixed group of aikido students and instructors during belt graduation.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_02.jpg"),
  },
  {
    title: "Certificate Pair",
    caption: "A paired student certificate photo from the graduation set.",
    alt: "Two students with certificates during a RenshinKan belt graduation.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_03.jpg"),
  },
  {
    title: "Mixed Certificate Group",
    caption: "Another certificate presentation photo from the examination set.",
    alt: "Aikido students and instructors seated with certificates after examination.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_mixed_group_03.jpg"),
  },
  {
    title: "Certificate Pair",
    caption: "A final paired certificate photo from the belt graduation set.",
    alt: "Two aikido students seated with certificates after belt examination.",
    src: assetPath("/renshinkan-gallery/belt-graduation/belt_graduation_certificate_two_students_04.jpg"),
  },
];

// These local crops from the source gallery collages avoid hotlinking remote files.
export const renshinkanBuildPhotos: DojoBuildPhoto[] = [
  {
    id: "site-layout-december-2011",
    src: assetPath("/renshinkan-build/crops/site-layout-december-2011.jpg"),
    alt: "Marked ground and posts on the RenshinKan Dojo site before construction.",
    title: "Laying Out The Site",
    date: "December 25, 2011",
    caption:
      "The early build gallery shows the dojo site being marked out before the main foundation work began.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_02.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "foundation-formwork-january-2012",
    src: assetPath("/renshinkan-build/crops/foundation-formwork-january-2012.jpg"),
    alt: "Wood formwork and early concrete foundation work for RenshinKan Dojo.",
    title: "Foundation Work",
    date: "January 20, 2012",
    caption:
      "The foundation and formwork begin to show the footprint of the future practice hall.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_02.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "early-columns-february-2012",
    src: assetPath("/renshinkan-build/crops/early-columns-february-2012.jpg"),
    alt: "Early concrete columns rising from the RenshinKan Dojo construction site.",
    title: "First Columns",
    date: "February 24, 2012",
    caption:
      "Vertical supports appear on the site, beginning the shift from ground work to building frame.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_02.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "roof-frame-may-2012",
    src: assetPath("/renshinkan-build/crops/roof-frame-may-2012.jpg"),
    alt: "Steel roof frame and construction materials at RenshinKan Dojo.",
    title: "Roof Frame",
    date: "May 3, 2012",
    caption:
      "The steel roof structure and stored materials show the dojo taking on its final outline.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_03.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "garden-view-may-2012",
    src: assetPath("/renshinkan-build/crops/garden-view-may-2012.jpg"),
    alt: "Garden and pond view near RenshinKan Dojo during construction.",
    title: "Garden Setting",
    date: "May 3, 2012",
    caption:
      "The source gallery pairs the construction progress with the quiet garden setting around the dojo.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_03.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "finished-wood-floor-november-2012",
    src: assetPath("/renshinkan-build/crops/finished-wood-floor-november-2012.jpg"),
    alt: "Completed wooden floor inside RenshinKan Dojo before mats were installed.",
    title: "Finished Wood Floor",
    date: "November 2012",
    caption:
      "Before the tatami arrived, the empty hall already showed the calm proportions of the practice space.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_04.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "night-exterior-november-2012",
    src: assetPath("/renshinkan-build/crops/night-exterior-november-2012.jpg"),
    alt: "RenshinKan Dojo exterior lit at night during late construction.",
    title: "Night Exterior",
    date: "November 2012",
    caption:
      "A night view from the build gallery shows the completed shell lit from within.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_04.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "sunlit-empty-dojo-january-2013",
    dateDark: true,
    src: assetPath("/renshinkan-build/crops/sunlit-empty-dojo-january-2013.jpg"),
    alt: "Sunlit empty RenshinKan Dojo interior with wood floor and kamiza wall.",
    title: "Ready For The Mat",
    date: "January 2013",
    caption:
      "The empty room shows the warm wood, high windows, and open floor before regular training began.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_05.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "kamiza-visit-january-2013",
    dateDark: true,
    src: assetPath("/renshinkan-build/crops/kamiza-visit-january-2013.jpg"),
    alt: "Two visitors standing in front of the kamiza wall at RenshinKan Dojo.",
    title: "Kamiza Visit",
    date: "January 2013",
    caption:
      "The source gallery includes a visit in front of the kamiza wall as the interior neared completion.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_05.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "tatami-stacked-april-2013",
    src: assetPath("/renshinkan-build/crops/tatami-stacked-april-2013.jpg"),
    alt: "Stacks of green and yellow tatami mats outside RenshinKan Dojo.",
    title: "Tatami Arrives",
    date: "April 6, 2013",
    caption:
      "The mats arrive at the dojo, turning the completed hall into a working aikido space.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_06.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "tatami-installation-april-2013",
    src: assetPath("/renshinkan-build/crops/tatami-installation-april-2013.jpg"),
    alt: "People installing yellow tatami mats inside RenshinKan Dojo.",
    title: "Installing The Mat",
    date: "April 6, 2013",
    caption:
      "Students and supporters help place the mats, one of the last visible steps before practice.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_06.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "first-ukemi-april-2013",
    src: assetPath("/renshinkan-build/crops/first-ukemi-april-2013.jpg"),
    alt: "A practitioner taking ukemi on the new RenshinKan Dojo mats.",
    title: "First Ukemi",
    date: "April 6, 2013",
    caption:
      "The first movement on the new mat captures the moment the building becomes a dojo.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_06.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "opening-practice-april-2013",
    src: assetPath("/renshinkan-build/crops/opening-practice-april-2013.jpg"),
    alt: "Aikido students practicing together at RenshinKan Dojo after opening.",
    title: "Opening Practice",
    date: "April 8, 2013",
    caption:
      "The build sequence ends naturally with a room full of movement, partners, and shared practice.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_07.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
  {
    id: "interclub-community-august-2013",
    src: assetPath("/renshinkan-build/crops/interclub-community-august-2013.jpg"),
    alt: "RenshinKan Dojo community members eating together after practice.",
    title: "Community After Practice",
    date: "August 18, 2013",
    caption:
      "The same interclub panel includes a shared meal, a useful reminder that dojo life extends beyond the mat.",
    sourceName: "Peace Culture Foundation RenshinKan Dojo build gallery",
    sourceUrl: siteInfo.foundationUrl,
    sourceFile: "Build_09.png",
    credit: "Peace Culture Foundation; photographer not listed.",
    rightsNote: "Shared here for educational and historical context. Source gallery cited above.",
  },
];

export const instructorSource = {
  label: "Peace Culture Foundation instructors page",
  url: "https://www.peaceculturefoundation.org/instructors",
  note:
    "Instructor profiles are paraphrased from the Peace Culture Foundation source page. The requested omitted profile, teaching assistants, and visiting instructors are intentionally excluded.",
};

export const instructors: Instructor[] = [
  {
    role: "Founder / Senior Instructor",
    name: "Sombat Tapanya",
    rank: "5th dan",
    trainingBackground:
      "Began aikido training in New Haven, Connecticut, in 1980, then trained at the Thai Aikido Association in Bangkok from 1982 under Motohiro Fukakusa Shihan and Prapant Chittaputta Shihan. Founded the Chiang Mai University Aikido Club in 1986 and Renshinkan Dojo in 2012.",
    imageSrc: assetPath("/instructors/sombat-tapanya.jpg"),
    imageAlt: "Sombat Tapanya in aikido uniform at RenshinKan Dojo.",
  },
  {
    role: "Senior Instructor",
    name: "Teerarat Boripantakul",
    rank: "3rd dan",
    trainingBackground:
      "Started aikido at the Chiang Mai University Aikido Club in 1986 and trained under Motohiro Fukakusa Shihan and Prapant Chittaputta Shihan.",
    imageSrc: assetPath("/instructors/teerarat-boripantakul.jpg"),
    imageAlt: "Teerarat Boripantakul in aikido uniform at RenshinKan Dojo.",
  },
  {
    role: "Founder / Senior Instructor",
    name: "Kop Narumol",
    rank: "3rd dan",
    trainingBackground:
      "Narumol (Kop) Thammapruksa began aikido at the Chiang Mai University Aikido Club. In 2008, she enrolled at the Aikido Academy at Hombu Dojo, Tokyo, and received 2nd kyu under Koichi Toriumi Shihan and Yoshiaki Yokota Shihan. In 2012, while an exchange student at Osaka University, she practiced at Shosenji Dojo under Katsuyuki Shimamoto Shihan and received shodan from Hombu Dojo under Tsuruzo Miyamoto Shihan.",
    imageSrc: assetPath("/instructors/kop-narumol.jpg"),
    imageAlt: "Kop Narumol in aikido uniform at RenshinKan Dojo.",
  },
  {
    role: "Instructor",
    name: "Major Kittisak Siriparp (Tor)",
    rank: "2nd dan",
    trainingBackground:
      "Started aikido at the Chiang Mai University Aikido Club in 2003 and trained under Sombat Tapanya and Teerarat Boripantakul.",
    imageSrc: assetPath("/instructors/major-kittisak-siriparp-current.png"),
    imageAlt: "Major Kittisak Siriparp in aikido uniform at RenshinKan Dojo.",
  },
  {
    role: "Instructor",
    name: "Fuengwich Maneekarn (Tong)",
    rank: "2nd dan",
    trainingBackground:
      "Started aikido at the Chiang Mai University Aikido Club in 2002 and trained under Sombat Tapanya and Teerarat Boripantakul.",
    imageSrc: assetPath("/instructors/major-kittisak-siriparp.png"),
    imageAlt: "Fuengwich Maneekarn in aikido uniform at RenshinKan Dojo.",
  },
  {
    role: "Instructor",
    name: "Siriphorn Manokeaw (Bee)",
    rank: "2nd dan",
    trainingBackground:
      "Started aikido at the Chiang Mai University Aikido Club in 2012 and trained under Sombat Tapanya and Teerarat Boripantakul.",
    imageSrc: assetPath("/instructors/siriphorn-manokeaw-current.png"),
    imageAlt: "Siriphorn Manokeaw in aikido uniform at RenshinKan Dojo.",
  },
];

export const classTracks: IconContent[] = [
  {
    title: "Beginner Adults",
    description:
      "A measured introduction to footwork, posture, safe falling, and partner practice.",
    icon: Footprints,
  },
  {
    title: "Children & Teens",
    description:
      "Confidence, coordination, focus, and respect taught through practice designed for children and teens.",
    icon: Sparkles,
  },
  {
    title: "Family Observation",
    description:
      "Parents may observe from the viewing deck and ask about first steps.",
    icon: Eye,
  },
  {
    title: "Visiting Aikidoka",
    description:
      "Experienced aikidoka are welcome to get in touch before visiting class.",
    icon: UsersRound,
  },
];

export const schedule = [
  { day: "Tuesday",  time: "17:30 – 19:00" },
  { day: "Thursday", time: "17:30 – 19:00" },
  { day: "Saturday", time: "9:00 – 10:30" },
  { day: "Sunday",   time: "9:00 – 10:30" },
];

export const beltLevels = [
  {
    level: "10 Kyu",
    techniques: "Kosa-Tori: 1 Kyo (Omote) · Morotetori: Kokyu-Ho (Omote, Ura) · Suwari Waza: Kokyu-Ho",
    days: 30,
    color: "white",
  },
  {
    level: "9 Kyu",
    techniques: "All 10 Kyu and Kosa-Tori: 1 Kyo (Ura) · Katate-Tori: Shiho-Nage (Omote)",
    days: 40,
    color: "white",
  },
  {
    level: "8 Kyu",
    techniques: "Up to 9 Kyu and Katate-Tori: Shiho-Nage (Ura) · Kosa-Tori: 2 Kyo (Omote, Ura)",
    days: 40,
    color: "white-stripe",
  },
  {
    level: "7 Kyu",
    techniques: "Up to 8 Kyu and Kosa-Tori: Irimi-Nage (Omote, Ura) · Kosa-Tori: 3 Kyo (Omote, Ura) · Morotetori: Kokyu-Nage",
    days: 40,
    color: "blue",
  },
  {
    level: "6 Kyu",
    techniques: "Up to 7 Kyu and Kosa-Tori: Kote-Gaeshi (Omote, Ura) · Kosa-Tori: 1–4 Kyo (Omote, Ura) · Shomen-Uchi: 1 Kyo (Omote, Ura)",
    days: 40,
    color: "blue-stripe",
  },
  {
    level: "5 Kyu",
    techniques: "Up to 6 Kyu and Shomen-Uchi: 1–4 Kyo (Omote, Ura) · Shomen-Uchi: Irimi-Nage (Omote, Ura) · Yokomen-Uchi: 1–4 Kyo (Omote, Ura) · Tsuki Kote-Gaeshi · Tenchi-Nage",
    days: 60,
    color: "green",
  },
  {
    level: "4 Kyu",
    techniques: "All up to 5 Kyu and All Tsuki · All Ryote-Tori",
    days: 60,
    color: "green-stripe",
  },
  {
    level: "3 Kyu",
    techniques: "All up to 4 Kyu and Suwari-Waza Technique · Hanmi-Handachi Technique · Ushiro-Tori Technique",
    days: 60,
    color: "brown",
  },
  {
    level: "2 Kyu",
    techniques: "All up to 3 Kyu and Koshi-Nage · Kokyu-Nage · Free-Style",
    days: 60,
    color: "brown-stripe",
  },
  {
    level: "1 Kyu",
    techniques: "Up to 2 Kyu and Tanto-Tori Technique",
    days: 60,
    color: "brown-double",
  },
  {
    level: "SHO Dan-Ho",
    techniques: "Up to 1 Kyu and Bokken Technique · Irimi-Nage (3) · Kote-Gaeshi (3)",
    days: 140,
    color: "black",
  },
];

export const workshops: Workshop[] = [
  {
    title: "Beginning Aikido Evening",
    category: "Beginner",
    date: "Scheduled seasonally",
    time: "90 minutes",
    audience: "Adults and older teens starting from zero",
    description:
      "A calm first session covering bowing, posture, footwork, falling basics, and how partner practice works.",
  },
  {
    title: "Confidence Through Falling",
    category: "Children",
    date: "Shared through dojo updates",
    time: "60 minutes",
    audience: "Children and teens with parent observation welcome",
    description:
      "A gentle workshop on safe rolling, listening, balance, and confidence through movement.",
  },
  {
    title: "Bokken & Jo Distance Practice",
    category: "Weapons",
    date: "Shared through dojo updates",
    time: "2 hours",
    audience: "Current students and visiting aikidoka",
    description:
      "A focused session on wooden sword and staff practice for posture, distance, and harmonious timing.",
  },
];

export const newsletters = [
  {
    title: "Beginning Aikido: What to Expect",
    summary:
      "A parent-friendly guide to first class routines, what to wear, and how beginners are introduced to partner practice.",
    date: "Recent note",
  },
  {
    title: "Why Falling Practice Builds Confidence",
    summary:
      "How careful ukemi teaches students to move with the floor, recover calmly, and trust gradual learning.",
    date: "Recent note",
  },
  {
    title: "Workshop Notes: Blending and Balance",
    summary:
      "A short reflection on entering, turning, redirecting, and protecting both people in practice.",
    date: "Recent note",
  },
];

export const facebookTimeline = {
  pageName: "Aikido Chiang Mai - Renshinkan Dojo",
  pageUrl: siteInfo.facebookUrl,
  title: "Aikido Chiang Mai - Renshinkan Dojo Facebook posts",
  description:
    "Live public posts from the dojo's Facebook page. Scroll inside the frame to browse the available timeline.",
};

export const firstVisitChecklist = [
  "Message ahead",
  "Wear comfortable clothing",
  "Arrive 10 minutes early",
  "Bring water",
  "Parents may observe",
];

export const communityValues: IconContent[] = [
  {
    title: "Respectful Practice",
    description:
      "Students learn that tone, attention, and care matter as much as technique.",
    icon: HeartHandshake,
  },
  {
    title: "Community Safety",
    description:
      "The dojo’s culture supports listening, calm boundaries, and steady personal growth.",
    icon: ShieldCheck,
  },
  {
    title: "Peace Culture",
    description:
      "Aikido offers a practical language for meeting conflict without aggression.",
    icon: Leaf,
  },
  {
    title: "Shared Growth",
    description:
      "Beginners, parents, children, and visitors all contribute to a welcoming training space.",
    icon: Droplets,
  },
];

export const peaceCultureFoundation = {
  name: "Peace Culture Foundation",
  homepageUrl: "https://www.peaceculturefoundation.org/",
  advocacyUrl: "https://www.peaceculturefoundation.org/advocacy",
  groomingPreventionUrl:
    "https://www.peaceculturefoundation.org/grooming-prevention-",
  logo: {
    src: assetPath("/peace-culture/peace-culture-foundation-logo.png"),
    alt: "Peace Culture Foundation logo.",
    sourceUrl: "https://www.peaceculturefoundation.org/",
  },
  summary:
    "Peace Culture Foundation connects education, awareness, and community practice around respect, safety, consent, and peaceful conflict resolution.",
  aikidoConnection:
    "Aikido supports that culture through lived habits: listening before reacting, protecting the person in front of you, redirecting pressure without aggression, and practicing responsibility with a partner.",
  groomingPrevention:
    "The foundation’s grooming-prevention work helps communities name unsafe patterns, strengthen boundaries, and give adults and young people clearer tools for recognizing and responding to manipulation.",
  pillars: [
    "Respectful relationships",
    "Consent and healthy boundaries",
    "Awareness of grooming patterns",
    "Community safety through education",
  ],
};

export const cmuAikidoClub = {
  name: "Aikido Chiang Mai University (CMU) Club",
  shortName: "AikidoCMU",
  sourceUrl: "https://aikidocmu.wordpress.com/about/",
  practiceSourceUrl: "https://aikidocmu.wordpress.com/2010/10/13/nonviolent/",
  logoSourceUrl: "https://www.cmu.ac.th/en/cmu/symbol",
  email: "AikidoCMU@gmail.com",
  logo: {
    src: assetPath("/cmu/cmu-sub-logo.png"),
    alt: "Chiang Mai University official sub-logo signature.",
  },
  intro:
    "RenshinKan belongs to a wider northern Thailand aikido community. AikidoCMU is the long-running Chiang Mai University club, a practice group connected to the same culture of cooperative training, calm movement, and peaceful conflict resolution.",
  background: [
    "The public AikidoCMU history describes Ajarn Sombat Tapanya continuing aikido after moving to Chiang Mai University in the mid-1980s, first sharing practice space with the judo club.",
    "The club is described as forming around 1986, with Ajarn Teerarat Boripantakul helping sustain the group and senior Thai aikido teachers supporting its development.",
    "AikidoCMU has welcomed CMU students, international students, and community members who practice with regular discipline and mutual respect.",
  ],
  practice: {
    days: "Monday, Wednesday, Friday",
    time: "Publicly listed as 6:00-8:00 p.m.",
    location:
      "The AikidoCMU article describes practice on the ground floor of the Student Union Building. The history page also lists the Chiang Mai University Aikido Club at the Gymnasium Building on Suthep Road.",
    note:
      "These public schedule notes are older. Visitors should confirm the current room and start time with AikidoCMU before going.",
  },
  address:
    "Chiang Mai University Aikido Club, Gymnasium Building, Chiang Mai University, Suthep Road, Chiang Mai, Thailand",
  links: [
    { label: "AikidoCMU History", href: "https://aikidocmu.wordpress.com/about/" },
    {
      label: "Practice Article",
      href: "https://aikidocmu.wordpress.com/2010/10/13/nonviolent/",
    },
    { label: "CMU Logo Source", href: "https://www.cmu.ac.th/en/cmu/symbol" },
  ],
  photos: [
    {
      src: assetPath("/cmu/aikido-cmu-practice-wide.png"),
      alt: "AikidoCMU practitioners training on a white mat in Chiang Mai.",
      title: "Practice At CMU",
      caption:
        "A public AikidoCMU newsletter image showing partner practice and circular movement.",
    },
    {
      src: assetPath("/cmu/aikido-cmu-history.png"),
      alt: "AikidoCMU history image from the Aikido Chiang Mai Unite page.",
      title: "Northern Thailand Aikido",
      caption:
        "A source image from Aikido Chiang Mai Unite's history of aikido in northern Thailand.",
    },
    {
      src: assetPath("/cmu/aikido-cmu-club.png"),
      alt: "AikidoCMU club members practicing together.",
      title: "Student Club Roots",
      caption:
        "A public AikidoCMU image connected to the university club's early community story.",
    },
    {
      src: assetPath("/cmu/aikido-cmu-practice-1.png"),
      alt: "AikidoCMU student falling safely during partner practice.",
      title: "Safe Falling",
      caption:
        "Partner practice imagery from an AikidoCMU article on aikido and peace-making.",
    },
    {
      src: assetPath("/cmu/aikido-cmu-practice-2.png"),
      alt: "AikidoCMU practitioners demonstrating a throw and pin sequence.",
      title: "Blend And Redirect",
      caption:
        "Practice imagery showing the cooperative roles of uke and nage.",
    },
  ],
};

export const socialLinks = [
  { label: "Facebook", href: siteInfo.facebookUrl },
  { label: "Peace Culture Foundation", href: siteInfo.foundationUrl },
];

export const pcfDojoPhotos = [
  {
    src: "https://images.squarespace-cdn.com/content/v1/5ef17fec6947fc50b4ef6d98/1593060476288-40T0WMOMLWFVPWMDLUTL/LibLab_books.jpg",
    alt: "Stacks of books from the Peace Culture Foundation's LibLab community literacy programme.",
    title: "LibLab: Books for Communities",
    caption: "The foundation's LibLab programme puts books into communities that need them.",
  },
  {
    src: "https://images.squarespace-cdn.com/content/v1/5ef17fec6947fc50b4ef6d98/2f4dd984-ed92-41a9-8604-fff8aa60a18e/book-table-open-book-nature-landscapes-3ab79f-1024.jpg",
    alt: "An open book resting on a table surrounded by nature.",
    title: "Learning in Every Setting",
    caption: "Peace culture is built through education, in classrooms, dojos, and communities alike.",
  },
  {
    src: "https://images.squarespace-cdn.com/content/v1/5ef17fec6947fc50b4ef6d98/1741073068980-EH76HR39CGJYDBF9YF8U/image+%2834%29.png",
    alt: "Peace Culture Foundation grooming prevention awareness graphic.",
    title: "Child Safety Education",
    caption: "Teaching communities to recognise unsafe patterns and protect the young people around them.",
  },
  {
    src: "https://images.squarespace-cdn.com/content/v1/5ef17fec6947fc50b4ef6d98/1599217309955-OT5DYFE5SY5LMYRCHE9L/115881800_718580105643534_3910442649120489109_n.jpg",
    alt: "Dr. Sombat Tapanya, founder of the Peace Culture Foundation.",
    title: "Dr. Sombat Tapanya",
    caption: "Founder of the Peace Culture Foundation and the person behind both its mission and RenshinKan Dojo.",
    featured: true,
  },
];

export const relatedDojos = [
  {
    name: "Thai Aikikai",
    description:
      "The national governing body for Aikido in Thailand, founded 1975 under Motohiro Fukakusa Shihan (8th Dan Aikikai). Affiliated with the Aikikai Foundation in Tokyo. All belt examinations at RenshinKan are certified through this organisation.",
    url: "https://thaiaikikairenbuka.wixsite.com/renbukandojo" as string | null,
    facebook: "https://www.facebook.com/AAT.renbukan/" as string | null,
    logo: "https://static.wixstatic.com/media/15845a_3353925468b240e29081a6c2e5a18a76~mv2.png" as string | null,
    location: "Bangkok, Thailand (national body)",
  },
  {
    name: "Aikido Chiang Mai University Club",
    description:
      "A long-running university club open to students, international visitors, and community members. Trains Monday, Wednesday, and Friday evenings at CMU's gymnasium. Free for CMU students; open to the general public.",
    url: "https://aikidocmu.wordpress.com/about/" as string | null,
    facebook: "https://www.facebook.com/CMUAIKIDO/" as string | null,
    logo: "https://aikidocmu.wordpress.com/wp-content/uploads/2008/09/renbukan-logo.png" as string | null,
    location: "Chiang Mai University, Suthep Road",
  },
  {
    name: "Ai Dojo",
    description:
      "An Aikido dojo in the Suthep district of Chiang Mai, part of the wider local aikido community sharing the same Aikikai affiliation.",
    url: null as string | null,
    facebook: "https://www.facebook.com/Ai-Dojo-421619891270261/" as string | null,
    logo: null as string | null,
    location: "Suthep, Chiang Mai",
  },
  {
    name: "All Dojo Chiang Mai",
    description:
      "A dojo in the Saraphi district south of Chiang Mai city. Part of the local aikido network with the same Aikikai affiliation. No active online presence. Contact them directly to visit or enquire.",
    url: null as string | null,
    facebook: null as string | null,
    logo: null as string | null,
    location: "Saraphi, Chiang Mai",
  },
  {
    name: "Aikido Kids Chiangmai",
    description:
      "A child and family focused Aikido programme based at AllGym Chiangmai. Classes for children from age 3, youth, and women. A welcoming entry point for families interested in aikido.",
    url: null as string | null,
    facebook: "https://www.facebook.com/aikidokidsatchiangmai/" as string | null,
    logo: null as string | null,
    location: "Suthep, Chiang Mai",
  },
];
