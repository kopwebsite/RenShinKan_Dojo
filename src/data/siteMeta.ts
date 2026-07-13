export const siteInfo = {
  name: "RenShinKan Dojo",
  location: "Hang Dong, Chiang Mai",
  address:
    "155 Soi 6, Suan Luang Village, T. Baan Waen, A. Hang Dong, Chiang Mai 50230",
  facebookUrl: "https://www.facebook.com/RenShinKanChiangMai/",
  foundationUrl: "https://www.peaceculturefoundation.org/renshinkan-dojo",
  builtYear: "2013",
};

export const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${siteInfo.name}, ${siteInfo.address}`,
)}`;

export const classSchedule = [
  { day: "Tuesday", labelKey: "classes.schedule.days.tuesday", time: "17:30-19:00", opens: "17:30", closes: "19:00" },
  { day: "Thursday", labelKey: "classes.schedule.days.thursday", time: "17:30-19:00", opens: "17:30", closes: "19:00" },
  { day: "Saturday", labelKey: "classes.schedule.days.saturday", time: "09:00-10:30", opens: "09:00", closes: "10:30" },
  { day: "Sunday", labelKey: "classes.schedule.days.sunday", time: "09:00-10:30", opens: "09:00", closes: "10:30" },
] as const;

export const socialLinks = [
  { label: "Facebook", href: siteInfo.facebookUrl },
  { label: "Peace Culture Foundation", href: siteInfo.foundationUrl },
];
