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

export const classSchedule = [
  { day: "Tuesday", time: "17:30-19:00", opens: "17:30", closes: "19:00" },
  { day: "Thursday", time: "17:30-19:00", opens: "17:30", closes: "19:00" },
  { day: "Saturday", time: "09:00-10:30", opens: "09:00", closes: "10:30" },
  { day: "Sunday", time: "09:00-10:30", opens: "09:00", closes: "10:30" },
];

export const socialLinks = [
  { label: "Facebook", href: siteInfo.facebookUrl },
  { label: "Peace Culture Foundation", href: siteInfo.foundationUrl },
];
