function onFormSubmit(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const verificationSheet = ss.getSheetByName("Verification");

  const responses = e.values;

  // These match your Automated System / Form Responses columns:
  // A = Timestamp
  // B = Parent or guardian name
  // C = Student name
  // D = Email address
  // E = Phone number
  // F = Home address
  // G = How would you like to contribute?

  const parentName = responses[1];
  const studentName = responses[2];
  const emailAddress = responses[3];
  const paymentMethod = responses[6];

  // Finds the next open row based on column A
  const nextRow = verificationSheet.getRange("A:A").getValues()
    .filter(String).length + 1;

  verificationSheet.getRange(nextRow, 1, 1, 5).setValues([[
    studentName,
    parentName,
    emailAddress,
    paymentMethod,
    "Pending"
  ]]);
}

function sendMonthlyPaymentReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Verification");

  const data = sheet.getDataRange().getValues();

  // Starts at row 2 because row 1 is the header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const studentName = row[0];
    const parentName = row[1];
    const emailAddress = row[2];
    const paymentMethod = row[3];
    const paymentStatus = row[4];

    if (!emailAddress) continue;

    if (paymentStatus === "Pending" || paymentStatus === "Late") {
      MailApp.sendEmail({
        to: emailAddress,
        subject: "RenShinKan Monthly Contribution Reminder",
        body:
          "Hi " + (parentName || "there") + ",\n\n" +
          "This is a reminder that " + studentName + "'s monthly RenShinKan contribution is due on the 1st of the month.\n\n" +
          "Selected payment method: " + paymentMethod + "\n\n" +
          "If you have already paid, thank you. We will update our records once the payment is verified.\n\n" +
          "Thank you,\nRenShinKan Dojo",
        htmlBody: renderPaymentReminderEmail({
          studentName: studentName,
          parentName: parentName,
          emailAddress: emailAddress,
          paymentMethod: paymentMethod,
          paymentStatus: paymentStatus
        })
      });
    }
  }
}

function escapeEmailHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPaymentReminderEmail(details) {
  const parentName = escapeEmailHtml(details.parentName || "there");
  const studentName = escapeEmailHtml(details.studentName || "your student");
  const emailAddress = escapeEmailHtml(details.emailAddress || "");
  const paymentMethod = escapeEmailHtml(details.paymentMethod || "Not specified");
  const paymentStatus = escapeEmailHtml(details.paymentStatus || "Pending");

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>RenShinKan monthly contribution reminder</title>',
    '<style type="text/css">',
    'html, body { margin:0 !important; padding:0 !important; width:100% !important; }',
    '* { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }',
    'table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }',
    'img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; display:block; }',
    'a { text-decoration:none; }',
    '.serif { font-family: Georgia, Cambria, "Times New Roman", Times, serif; }',
    '.sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }',
    '@media screen and (max-width: 600px) { .container { width:100% !important; } .pad { padding-left:24px !important; padding-right:24px !important; } .h1 { font-size:31px !important; line-height:39px !important; } .body-txt { font-size:16px !important; line-height:27px !important; } }',
    '</style>',
    '</head>',
    '<body style="margin:0; padding:0; width:100%; background-color:#eae0cb;">',
    '<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#eae0cb; opacity:0;">A quiet reminder from RenShinKan Dojo: this month&rsquo;s contribution is due on the 1st.</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eae0cb; background-image:url(https://renshinkandojo.org/parchment-texture.png); background-size:cover; background-position:center;">',
    '<tr><td align="center" style="padding:28px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px; max-width:600px; background-color:#fbf7ef; border:1px solid #e3d8c1; border-radius:14px; overflow:hidden; box-shadow:0 24px 60px rgba(31,27,22,0.10);">',
    '<tr><td align="center" class="pad" style="padding:34px 40px 18px 40px;">',
    '<img src="https://renshinkandojo.org/renshinkan-logo.png" width="58" height="58" alt="RenShinKan Dojo" style="width:58px; height:auto; margin:0 auto 12px auto;">',
    '<div class="serif" style="font-size:26px; line-height:30px; color:#1f1b16; letter-spacing:0.3px;">RenShinKan Dojo</div>',
    '<div class="sans" style="font-size:11px; line-height:16px; letter-spacing:3px; text-transform:uppercase; color:#4f6b4a; margin-top:7px; font-weight:600;">Monthly contribution reminder</div>',
    '</td></tr>',
    '<tr><td align="center" style="padding:0 40px 4px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:56px; height:2px; background-color:#c8312a; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>',
    '<tr><td class="pad" style="padding:28px 48px 0 48px;">',
    '<div class="sans" style="font-size:11px; line-height:16px; letter-spacing:3px; text-transform:uppercase; color:#b22a22; font-weight:600;">Due on the 1st</div>',
    '<h1 class="serif h1" style="margin:10px 0 0 0; font-weight:500; font-size:34px; line-height:42px; color:#1f1b16;">Monthly contribution reminder</h1>',
    '</td></tr>',
    '<tr><td class="pad body-txt sans" style="padding:18px 48px 0 48px; font-size:17px; line-height:29px; color:#3d362c;">',
    '<p style="margin:0 0 16px 0;">Hi ' + parentName + ',</p>',
    '<p style="margin:0 0 16px 0;">This is a gentle reminder that ' + studentName + '&rsquo;s monthly RenShinKan contribution is due on the 1st of the month.</p>',
    '<p style="margin:0;">If you have already paid, thank you. We will update our records once the payment is verified.</p>',
    '</td></tr>',
    '<tr><td class="pad" style="padding:26px 48px 0 48px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3ebda; border-left:3px solid #c8312a; border-radius:0 10px 10px 0;"><tr><td style="padding:22px 26px;">',
    '<div class="sans" style="font-size:11px; line-height:16px; letter-spacing:2px; text-transform:uppercase; color:#7a6f60; font-weight:600; margin-bottom:14px;">Contribution details</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    '<tr><td class="sans" width="42%" style="padding:6px 0; font-size:14px; line-height:21px; color:#7a6f60;">Student</td><td class="sans" style="padding:6px 0; font-size:15px; line-height:21px; color:#1f1b16; font-weight:600;">' + studentName + '</td></tr>',
    '<tr><td class="sans" width="42%" style="padding:6px 0; font-size:14px; line-height:21px; color:#7a6f60;">Payment method</td><td class="sans" style="padding:6px 0; font-size:15px; line-height:21px; color:#1f1b16; font-weight:600;">' + paymentMethod + '</td></tr>',
    '<tr><td class="sans" width="42%" style="padding:6px 0; font-size:14px; line-height:21px; color:#7a6f60;">Current status</td><td class="sans" style="padding:6px 0; font-size:15px; line-height:21px; color:#b22a22; font-weight:700;">' + paymentStatus + '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</td></tr>',
    '<tr><td class="pad sans" style="padding:26px 48px 0 48px; font-size:15px; line-height:24px; color:#7a6f60;"><p style="margin:0;">Thank you for helping keep training accessible for the students and families who share the mat with us.</p></td></tr>',
    '<tr><td class="pad sans" style="padding:26px 48px 38px 48px; font-size:16px; line-height:25px; color:#3d362c;"><p style="margin:0;">With gratitude,</p><p class="serif" style="margin:4px 0 0 0; font-size:19px; color:#1f1b16;">The RenShinKan Dojo</p></td></tr>',
    '<tr><td style="background-color:#2a2018; padding:30px 40px;" class="pad">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" class="sans" style="font-size:13px; line-height:21px; color:#b7a98f;">',
    '<div class="serif" style="font-size:17px; color:#f3ece0; margin-bottom:6px;">RenShinKan Dojo</div>',
    '<a href="https://www.google.com/maps/search/?api=1&amp;query=RenShinKan%20Dojo%2C%20155%20Soi%206%2C%20Suan%20Luang%20Village%2C%20T.%20Baan%20Waen%2C%20A.%20Hang%20Dong%2C%20Chiang%20Mai%2050230" style="color:#b7a98f; text-decoration:none;">155 Soi 6, Suan Luang Village, Baan Waen,<br>Hang Dong, Chiang Mai 50230</a>',
    '<div style="margin-top:14px;"><a href="https://www.facebook.com/RenShinKanChiangMai/" style="color:#e2d8c4; text-decoration:underline;">Facebook</a>&nbsp;&middot;&nbsp;<a href="https://renshinkandojo.org/" style="color:#e2d8c4; text-decoration:underline;">Website</a></div>',
    '<div style="margin-top:16px; padding-top:16px; border-top:1px solid #43382b; font-size:12px; line-height:19px; color:#9a8d76;">This reminder was sent to ' + emailAddress + ' because this address is listed for RenShinKan monthly contribution records.</div>',
    '</td></tr></table>',
    '</td></tr>',
    '</table>',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px; max-width:600px;"><tr><td align="center" class="sans" style="padding:18px 24px 6px 24px; font-size:11px; line-height:17px; color:#8c8164;">&copy; RenShinKan Dojo &middot; Aikido in Hang Dong, Chiang Mai, Thailand</td></tr></table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>'
  ].join("");
}
