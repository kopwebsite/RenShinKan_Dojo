import { useEffect, type RefObject } from "react";
import { translateEnglishLiteral, type Language } from "./index";

type Phrase = readonly [en: string, th: string, zh: string, ja: string];

const phrases: Phrase[] = [
  ["Student records", "ประวัตินักเรียน", "学员记录", "生徒記録"],
  ["What would you like to do?", "คุณต้องการทำอะไร", "您想进行哪项操作？", "何をしますか？"],
  ["Choose one task. Only the form you need will be shown.", "เลือกหนึ่งรายการ ระบบจะแสดงเฉพาะแบบฟอร์มที่จำเป็น", "请选择一项操作，页面只会显示所需表单。", "項目を一つ選ぶと、必要なフォームだけが表示されます。"],
  ["Student record tasks", "รายการงานเกี่ยวกับประวัตินักเรียน", "学员记录操作", "生徒記録の操作"],
  ["Find my record", "ค้นหาประวัติของฉัน", "查找我的记录", "自分の記録を探す"],
  ["View your approved profile, QR code, and submit hours.", "ดูประวัติที่อนุมัติแล้ว คิวอาร์โค้ด และส่งชั่วโมงฝึก", "查看已批准的记录和二维码，并提交训练时数。", "承認済み記録とQRコードを確認し、稽古時間を申請します。"],
  ["Create a profile", "สร้างประวัตินักเรียน", "创建学员记录", "生徒記録を作成"],
  ["Request a new student record for administrator approval.", "ขอสร้างประวัตินักเรียนใหม่เพื่อให้ผู้ดูแลอนุมัติ", "申请创建新的学员记录并交由管理员审核。", "新しい生徒記録を申請し、管理者の承認を受けます。"],
  ["Apply for an exam", "สมัครสอบเลื่อนระดับ", "申请考级", "審査を申し込む"],
  ["Complete the official belt-examination application.", "กรอกใบสมัครสอบเลื่อนระดับอย่างเป็นทางการ", "填写正式的腰带考级申请。", "正式な昇級・昇段審査申請を入力します。"],
  ["Existing student", "นักเรียนปัจจุบัน", "现有学员", "登録済みの生徒"],
  ["Look up an approved record", "ค้นหาประวัติที่ได้รับอนุมัติ", "查询已批准的记录", "承認済み記録を照会"],
  ["Use the Student ID and student name. Small differences in spacing, punctuation, or spelling are okay; neither value works alone.", "ใช้รหัสนักเรียนและชื่อนักเรียน ระบบยอมรับความแตกต่างเล็กน้อยด้านเว้นวรรค เครื่องหมาย หรือการสะกด แต่ต้องใช้ข้อมูลทั้งสองอย่างร่วมกัน", "请输入学员编号和姓名。空格、标点或拼写的细微差异可以接受，但两项信息必须同时使用。", "生徒IDと氏名を入力してください。空白、句読点、綴りの小さな違いは許容されますが、両方の情報が必要です。"],
  ["Student name", "ชื่อนักเรียน", "学员姓名", "生徒氏名"],
  ["Student ID", "รหัสนักเรียน", "学员编号", "生徒ID"],
  ["Checking…", "กำลังตรวจสอบ…", "正在检查…", "確認中…"],
  ["Verification details are sent securely and never placed in the page URL.", "ข้อมูลยืนยันจะถูกส่งอย่างปลอดภัยและไม่ปรากฏใน URL ของหน้า", "验证信息会安全传输，绝不会写入页面网址。", "確認情報は安全に送信され、ページURLには含まれません。"],
  ["Your verified record will appear here", "ประวัติที่ยืนยันแล้วจะแสดงที่นี่", "已验证的记录会显示在这里", "確認済み記録がここに表示されます"],
  ["Public profile links never allow editing and never reveal application answers or payment details.", "ลิงก์สาธารณะไม่อนุญาตให้แก้ไข และไม่เปิดเผยคำตอบในใบสมัครหรือรายละเอียดการชำระเงิน", "公开链接不能用于编辑，也不会显示申请答案或付款详情。", "公開リンクから編集することはできず、申請回答や支払い情報も表示されません。"],
  ["Student record QR", "คิวอาร์ประวัตินักเรียน", "学员记录二维码", "生徒記録QR"],
  ["This opens your public training record. It is not a payment QR.", "ใช้เปิดประวัติการฝึกสาธารณะของคุณ ไม่ใช่คิวอาร์สำหรับชำระเงิน", "此二维码用于打开公开训练记录，并非付款二维码。", "公開稽古記録を開くQRです。支払い用ではありません。"],
  ["Public student record link", "ลิงก์ประวัตินักเรียนสาธารณะ", "公开学员记录链接", "公開生徒記録リンク"],
  ["Copy link", "คัดลอกลิงก์", "复制链接", "リンクをコピー"],
  ["Share", "แชร์", "分享", "共有"],
  ["Download QR", "ดาวน์โหลดคิวอาร์", "下载二维码", "QRをダウンロード"],
  ["Print", "พิมพ์", "打印", "印刷"],
  ["Submit additional training hours", "ส่งชั่วโมงฝึกเพิ่มเติม", "提交额外训练时数", "追加の稽古時間を申請"],
  ["Your verified lookup session authorizes this request. A sensei will review it before the approved total changes.", "เซสชันการค้นหาที่ได้รับการยืนยันอนุญาตคำขอนี้ อาจารย์จะตรวจสอบก่อนเปลี่ยนยอดชั่วโมงที่อนุมัติ", "本次已验证的查询会话允许提交此申请。老师审核后，已批准总时数才会更改。", "確認済み照会セッションにより申請できます。承認済み合計が変わる前に先生が確認します。"],
  ["Hours to add", "ชั่วโมงที่ต้องการเพิ่ม", "要增加的时数", "追加する時間"],
  ["Submit for review", "ส่งเพื่อตรวจสอบ", "提交审核", "審査に提出"],
  ["New student profile", "ประวัตินักเรียนใหม่", "新学员记录", "新規生徒記録"],
  ["Request an official record", "ขอสร้างประวัติอย่างเป็นทางการ", "申请正式记录", "正式記録を申請"],
  ["Pending until approved", "รอการอนุมัติ", "等待批准", "承認待ち"],
  ["English name", "ชื่อภาษาอังกฤษ", "英文姓名", "英語名"],
  ["Thai name", "ชื่อภาษาไทย", "泰文姓名", "タイ語名"],
  ["Current kyu", "คิวปัจจุบัน", "当前级位", "現在の級"],
  ["Current dojo", "โดโจปัจจุบัน", "当前道场", "現在の道場"],
  ["Choose a dojo", "เลือกโดโจ", "选择道场", "道場を選択"],
  ["AAT annual membership", "สมาชิก AAT รายปี", "AAT 年度会员", "AAT年会員"],
  ["Optional", "ไม่บังคับ", "可选", "任意"],
  ["Membership number", "หมายเลขสมาชิก", "会员编号", "会員番号"],
  ["I already paid my AAT annual membership", "ฉันชำระค่าสมาชิก AAT รายปีแล้ว", "我已支付 AAT 年度会费", "AAT年会費を支払い済みです"],
  ["Most recent payment date", "วันที่ชำระล่าสุด", "最近付款日期", "直近の支払日"],
  ["Approximately when did you start aikido?", "คุณเริ่มฝึกไอคิโดประมาณเมื่อใด", "您大约何时开始练习合气道？", "合気道を始めたおおよその時期"],
  ["Profile preview", "ตัวอย่างรูปประจำตัว", "头像预览", "写真プレビュー"],
  ["Replace profile photo", "เปลี่ยนรูปประจำตัว", "更换头像", "写真を差し替える"],
  ["Add profile photo (optional)", "เพิ่มรูปประจำตัว (ไม่บังคับ)", "添加头像（可选）", "写真を追加（任意）"],
  ["Send profile for approval", "ส่งประวัติเพื่อขออนุมัติ", "提交记录以供批准", "記録を承認申請"],
  ["Request received", "ได้รับคำขอแล้ว", "已收到申请", "申請を受け付けました"],
  ["Your profile is pending administrator approval", "ประวัติของคุณกำลังรอผู้ดูแลอนุมัติ", "您的记录正在等待管理员批准", "記録は管理者の承認待ちです"],
  ["Date of birth", "วันเดือนปีเกิด", "出生日期", "生年月日"],
  ["Permanent (registered) address", "ที่อยู่ตามทะเบียน", "永久（登记）地址", "本籍住所"],
  ["Current address", "ที่อยู่ปัจจุบัน", "现住址", "現住所"],
  ["Telephone number", "หมายเลขโทรศัพท์", "电话号码", "電話番号"],
  ["Relevant certificates or qualifications", "ประกาศนียบัตรหรือคุณวุฒิที่เกี่ยวข้อง", "相关证书或资格", "関連資格・証明書"],
  ["Aikido, martial arts, or sports experience", "ประสบการณ์ไอคิโด ศิลปะการต่อสู้ หรือกีฬา", "合气道、武术或体育经历", "合気道・武道・スポーツ経験"],
  ["Review every answer", "ตรวจทานทุกคำตอบ", "检查所有答案", "すべての回答を確認"],
  ["Review your application", "ตรวจทานใบสมัคร", "检查您的申请", "申請内容を確認"],
  ["Edit answers", "แก้ไขคำตอบ", "编辑答案", "回答を編集"],
  ["Required", "จำเป็น", "必填", "必須"],
  ["Not provided", "ไม่ได้ระบุ", "未提供", "未入力"],
  ["Student Identity", "ข้อมูลประจำตัวนักเรียน", "学员身份", "生徒情報"],
  ["Training Record", "ประวัติการฝึก", "训练记录", "稽古記録"],
  ["Examination History", "ประวัติการสอบ", "考级记录", "審査履歴"],
  ["Contributions", "เงินสมทบ", "会费记录", "会費"],
  ["Requests & Notices", "คำขอและการแจ้งเตือน", "申请与通知", "申請と通知"],
  ["Identity Record", "ข้อมูลประจำตัว", "身份记录", "本人記録"],
  ["Official Details", "รายละเอียดทางการ", "正式详情", "公式情報"],
  ["Approved", "อนุมัติแล้ว", "已批准", "承認済み"],
  ["Not assigned", "ยังไม่ได้กำหนด", "未分配", "未割当"],
  ["Not recorded", "ไม่มีการบันทึก", "未记录", "未記録"],
  ["Verified Training", "การฝึกที่ยืนยันแล้ว", "已验证训练", "確認済み稽古"],
  ["verified hours", "ชั่วโมงที่ยืนยันแล้ว", "已验证时数", "確認済み時間"],
  ["Recent Entries", "รายการล่าสุด", "最近条目", "最近の記録"],
  ["Date", "วันที่", "日期", "日付"],
  ["Hours", "ชั่วโมง", "时数", "時間"],
  ["Details", "รายละเอียด", "详情", "詳細"],
  ["Status", "สถานะ", "状态", "状態"],
  ["Verified", "ยืนยันแล้ว", "已验证", "確認済み"],
  ["No individual entries yet", "ยังไม่มีรายการแยก", "暂无单项记录", "個別記録はまだありません"],
  ["Rank Progression", "ลำดับการเลื่อนระดับ", "级位进展", "昇級・昇段の進捗"],
  ["No examinations recorded", "ยังไม่มีการบันทึกการสอบ", "暂无考级记录", "審査記録はまだありません"],
  ["Rank", "ระดับ", "级位", "級・段"],
  ["Result", "ผล", "结果", "結果"],
  ["Passed", "ผ่าน", "通过", "合格"],
  ["Attempt", "เข้าสอบ", "参加", "受験"],
  ["Recorded", "บันทึกแล้ว", "已记录", "記録済み"],
  ["AAT Annual Contribution", "เงินสมทบ AAT รายปี", "AAT 年度会费", "AAT年会費"],
  ["RenShinKan Monthly Contribution", "เงินสมทบ RenShinKan รายเดือน", "RenShinKan 月度会费", "RenShinKan月会費"],
  ["Under review", "กำลังตรวจสอบ", "审核中", "審査中"],
  ["Action needed", "ต้องดำเนินการ", "需要处理", "対応が必要"],
  ["No annual contribution history", "ไม่มีประวัติเงินสมทบรายปี", "暂无年度会费记录", "年会費履歴はありません"],
  ["No monthly contribution history", "ไม่มีประวัติเงินสมทบรายเดือน", "暂无月度会费记录", "月会費履歴はありません"],
  ["Payment & Record Notices", "การแจ้งเตือนการชำระเงินและประวัติ", "付款与记录通知", "支払い・記録のお知らせ"],
  ["Pending review", "รอตรวจสอบ", "等待审核", "審査待ち"],
  ["Denied", "ไม่อนุมัติ", "已拒绝", "却下"],
  ["Open contribution details", "เปิดรายละเอียดเงินสมทบ", "打开会费详情", "会費の詳細を開く"],
  ["Request & Notice History", "ประวัติคำขอและการแจ้งเตือน", "申请与通知记录", "申請・通知履歴"],
  ["No requests or notices", "ไม่มีคำขอหรือการแจ้งเตือน", "暂无申请或通知", "申請・通知はありません"],
  ["STUDENT PASSPORT", "สมุดประวัตินักเรียน", "学员记录册", "生徒手帳"],
  ["Approved digital training record", "ประวัติการฝึกดิจิทัลที่อนุมัติแล้ว", "已批准的数字训练记录", "承認済みデジタル稽古記録"],
  ["Student passport pages", "หน้าสมุดประวัตินักเรียน", "学员记录册页面", "生徒手帳のページ"],
  ["Verified student record", "ประวัตินักเรียนที่ยืนยันแล้ว", "已验证学员记录", "確認済み生徒記録"],
  ["A sensei will check the proof and confirm the payment.", "อาจารย์จะตรวจสอบหลักฐานและยืนยันการชำระเงิน", "老师将审核凭证并确认付款。", "先生が証明書を確認し、支払いを確定します。"],
  ["Cloudflare verification is still finishing. Wait for the confirmation, then try again.", "การยืนยัน Cloudflare ยังไม่เสร็จ โปรดรอการยืนยันแล้วลองอีกครั้ง", "Cloudflare 验证仍在进行，请等待确认后重试。", "Cloudflare の確認処理中です。完了を待ってからもう一度お試しください。"],
  ["Complete Cloudflare verification.", "โปรดยืนยัน Cloudflare ให้เสร็จ", "请完成 Cloudflare 验证。", "Cloudflare の確認を完了してください。"],
  ["Complete Cloudflare verification before submitting.", "โปรดยืนยัน Cloudflare ให้เสร็จก่อนส่ง", "提交前请完成 Cloudflare 验证。", "提出前に Cloudflare の確認を完了してください。"],
  ["Close", "ปิด", "关闭", "閉じる"],
  ["AAT annual contribution", "เงินสมทบ AAT รายปี", "AAT 年度会费", "AAT 年会費"],
  ["AAT MEMBERSHIP NUMBER", "หมายเลขสมาชิก AAT", "AAT 会员编号", "AAT 会員番号"],
  ["ACCOUNT CREATED", "วันที่สร้างบัญชี", "账户创建日期", "アカウント作成日"],
  ["Add only when relevant", "กรอกเฉพาะเมื่อเกี่ยวข้อง", "仅在适用时填写", "該当する場合のみ入力"],
  ["Add the payment proof using the button below.", "เพิ่มหลักฐานการชำระเงินด้วยปุ่มด้านล่าง", "请使用下方按钮添加付款凭证。", "下のボタンから支払い証明を追加してください。"],
  ["Add these details only if you already have them. You can leave this whole section blank.", "กรอกรายละเอียดเหล่านี้เฉพาะเมื่อคุณมีข้อมูลแล้ว คุณสามารถเว้นส่วนนี้ทั้งหมดได้", "仅在已有这些信息时填写；本节可全部留空。", "すでに情報がある場合のみ入力してください。このセクション全体を空欄にできます。"],
  ["Address and contact", "ที่อยู่และข้อมูลติดต่อ", "地址和联系方式", "住所・連絡先"],
  ["Annual Aikido Association of Thailand records are kept separately from dojo monthly contributions.", "ระเบียนรายปีของสมาคมไอคิโดแห่งประเทศไทยแยกจากเงินสมทบรายเดือนของโดโจ", "泰国合气道协会年度记录与道场月度会费分别保存。", "タイ合気道協会の年次記録は、道場の月会費とは別に管理されます。"],
  ["Applicant details", "รายละเอียดผู้สมัคร", "申请人信息", "申請者情報"],
  ["Application", "ใบสมัคร", "申请", "申請"],
  ["Approved and verified by the dojo", "โดโจอนุมัติและยืนยันแล้ว", "已由道场批准并核实", "道場による承認・確認済み"],
  ["APPROVED RECORD", "ระเบียนที่อนุมัติแล้ว", "已批准记录", "承認済み記録"],
  ["Belt-examination application", "ใบสมัครสอบเลื่อนระดับ", "腰带等级考试申请", "昇級・昇段審査申請"],
  ["Check each answer before submitting it to the dojo.", "ตรวจสอบคำตอบแต่ละข้อก่อนส่งให้โดโจ", "提交给道场前，请检查每项回答。", "道場へ提出する前に、各回答を確認してください。"],
  ["Choose a month and year. An approximate answer is fine.", "เลือกเดือนและปี สามารถตอบโดยประมาณได้", "请选择月份和年份，可填写大致时间。", "月と年を選択してください。おおよその回答でも構いません。"],
  ["Choose one from your photo library or take a new photo. JPEG, PNG, WebP, HEIC, or HEIF; at least 128 × 128 pixels.", "เลือกรูปจากคลังหรือถ่ายรูปใหม่ รองรับ JPEG, PNG, WebP, HEIC หรือ HEIF ขนาดอย่างน้อย 128 × 128 พิกเซล", "请从照片库选择或拍摄新照片。支持 JPEG、PNG、WebP、HEIC 或 HEIF，至少 128 × 128 像素。", "写真ライブラリから選ぶか新しく撮影してください。JPEG、PNG、WebP、HEIC、HEIF、128×128ピクセル以上。"],
  ["Choose the dojo where you currently study or train.", "เลือกโดโจที่คุณกำลังเรียนหรือฝึกอยู่", "请选择您目前学习或训练的道场。", "現在学んでいる、または稽古している道場を選択してください。"],
  ["Choose your dojo", "เลือกโดโจของคุณ", "选择您的道场", "道場を選択"],
  ["Complete the applicant details below. Examination results and official notes are completed by administrators.", "กรอกรายละเอียดผู้สมัครด้านล่าง ผลสอบและหมายเหตุทางการจะกรอกโดยผู้ดูแล", "请填写下方申请人信息。考试结果和官方备注由管理员填写。", "以下の申請者情報を入力してください。審査結果と公式メモは管理者が記入します。"],
  ["CURRENT RANK / 級・段", "ระดับปัจจุบัน", "当前等级", "現在の級・段"],
  ["Declaration and signature", "คำรับรองและลายมือชื่อ", "声明和签名", "宣誓・署名"],
  ["DOJO", "โดโจ", "道场", "道場"],
  ["DOJO / 道場", "โดโจ", "道场", "道場"],
  ["Draft kept in this tab only", "ฉบับร่างเก็บไว้เฉพาะในแท็บนี้", "草稿仅保存在此标签页", "下書きはこのタブにのみ保存されます"],
  ["Examiner / place", "ผู้คุมสอบ / สถานที่", "考官／地点", "審査員／場所"],
  ["Examination history", "ประวัติการสอบ", "考试记录", "審査履歴"],
  ["Example: RSK-2601.", "ตัวอย่าง: RSK-2601", "示例：RSK-2601。", "例：RSK-2601。"],
  ["Finish your application", "ดำเนินการสมัครให้เสร็จ", "完成申请", "申請を完了"],
  ["I accept the declaration above.", "ฉันยอมรับคำรับรองข้างต้น", "我接受上述声明。", "上記の宣誓に同意します。"],
  ["I promise to observe the rules of the Aikido Association Thailand and confirm that the information in this application is accurate.", "ข้าพเจ้าสัญญาว่าจะปฏิบัติตามระเบียบของสมาคมไอคิโดแห่งประเทศไทย และยืนยันว่าข้อมูลในใบสมัครนี้ถูกต้อง", "我承诺遵守泰国合气道协会的规定，并确认本申请中的信息准确无误。", "タイ合気道協会の規則を守り、この申請内容が正確であることを確認します。"],
  ["It is not searchable, active, public, or QR-enabled yet. A sensei will review your details and any optional photo before activating the official student record.", "ระเบียนนี้ยังค้นหา ใช้งาน เปิดเผยต่อสาธารณะ หรือใช้คิวอาร์ไม่ได้ อาจารย์จะตรวจสอบรายละเอียดและรูปที่แนบ (ถ้ามี) ก่อนเปิดใช้ระเบียนนักเรียนทางการ", "该记录目前不可搜索、未启用、不公开，也未启用二维码。老师会审核您的信息和可选照片，然后启用正式学员记录。", "現時点では検索・利用・公開・QR表示はできません。先生が情報と任意の写真を確認した後、正式な生徒記録を有効にします。"],
  ["JOINED DOJO", "วันที่เข้าร่วมโดโจ", "加入道场日期", "入門日"],
  ["LAST UPDATED", "อัปเดตล่าสุด", "最后更新", "最終更新"],
  ["LATEST RECORDED RESULT", "ผลล่าสุดที่บันทึก", "最近记录的结果", "最新の記録結果"],
  ["Leave blank if one has not been assigned; your record will show “NEW”.", "เว้นว่างหากยังไม่ได้รับหมายเลข ระเบียนจะแสดง “NEW”", "如尚未分配，请留空；记录将显示“NEW”。", "まだ割り当てられていない場合は空欄にしてください。記録には「NEW」と表示されます。"],
  ["monthly contribution", "เงินสมทบรายเดือน", "月度会费", "月会費"],
  ["NAME / 氏名", "ชื่อ", "姓名", "氏名"],
  ["Needed to submit", "จำเป็นสำหรับการส่ง", "提交必填", "提出に必要"],
  ["Next expected date:", "วันที่คาดหมายถัดไป:", "预计下次日期：", "次回予定日："],
  ["No examination history", "ไม่มีประวัติการสอบ", "暂无考试记录", "審査履歴はありません"],
  ["No profile photograph", "ไม่มีรูปโปรไฟล์", "无个人照片", "プロフィール写真なし"],
  ["Note from your sensei", "หมายเหตุจากอาจารย์", "老师的备注", "先生からのメモ"],
  ["Notes shown here are written for the student. Private administrator notes are never included in this passport.", "หมายเหตุที่นี่เขียนให้นักเรียนอ่าน หมายเหตุส่วนตัวของผู้ดูแลจะไม่รวมอยู่ในสมุดประวัตินี้", "此处备注供学员查看；管理员私人备注绝不会包含在本记录册中。", "ここに表示されるメモは生徒向けです。管理者の非公開メモはこの手帳には含まれません。"],
  ["Only hours approved by an authorized dojo administrator are included in this total.", "ยอดรวมนี้รวมเฉพาะชั่วโมงที่ผู้ดูแลโดโจที่ได้รับอนุญาตอนุมัติแล้ว", "该总数仅包含经授权道场管理员批准的小时数。", "この合計には、権限を持つ道場管理者が承認した時間のみが含まれます。"],
  ["Page", "หน้า", "页", "ページ"],
  ["Optional · enter your name in Thai script if you use one.", "ไม่บังคับ · กรอกชื่อภาษาไทยหากคุณใช้", "选填 · 如使用泰文姓名，请填写。", "任意・タイ文字の氏名を使用している場合は入力してください。"],
  ["Pay", "ชำระเงิน", "付款", "支払う"],
  ["Payment QR", "คิวอาร์ชำระเงิน", "付款二维码", "支払いQR"],
  ["Please speak with a sensei if you have questions or need help.", "หากมีคำถามหรือต้องการความช่วยเหลือ โปรดสอบถามอาจารย์", "如有问题或需要帮助，请咨询老师。", "質問や助けが必要な場合は、先生にご相談ください。"],
  ["PRACTICE DURATION", "ระยะเวลาฝึก", "训练时长", "稽古期間"],
  ["PRACTICE RECORD", "ประวัติการฝึก", "训练记录", "稽古記録"],
  ["Previous / reference", "ก่อนหน้า / อ้างอิง", "之前／参考", "以前／参照"],
  ["Private payment proof", "หลักฐานการชำระเงินส่วนตัว", "私人付款凭证", "非公開の支払い証明"],
  ["Profile, training, examination, contribution, and payment-proof workflows are listed newest first with the dojo’s current decision.", "ขั้นตอนเกี่ยวกับโปรไฟล์ การฝึก การสอบ เงินสมทบ และหลักฐานการชำระเงินเรียงจากใหม่ไปเก่า พร้อมผลการพิจารณาปัจจุบันของโดโจ", "个人资料、训练、考试、会费和付款凭证流程按最新优先排列，并显示道场当前决定。", "プロフィール、稽古、審査、会費、支払い証明の手続きは新しい順に、道場の現在の判断とともに表示されます。"],
  ["Qualifications and experience", "คุณสมบัติและประสบการณ์", "资历和经验", "資格・経験"],
  ["Question requirements", "ข้อกำหนดของคำถาม", "答题要求", "回答要件"],
  ["RECORD STATUS", "สถานะระเบียน", "记录状态", "記録状態"],
  ["Renewal is normally due one year after this date.", "โดยปกติต้องต่ออายุหนึ่งปีหลังจากวันที่นี้", "通常应在此日期一年后续费。", "通常、この日から1年後に更新期限を迎えます。"],
  ["RenShinKan monthly contribution", "เงินสมทบ RenShinKan รายเดือน", "RenShinKan 月度会费", "RenShinKan 月会費"],
  ["Requested / period", "คำขอ / ช่วงเวลา", "申请／期间", "申請／期間"],
  ["Required · use the name you will use for record lookup.", "จำเป็น · ใช้ชื่อที่คุณจะใช้ค้นหาระเบียน", "必填 · 请使用您查找记录时所用的姓名。", "必須・記録検索に使用する氏名を入力してください。"],
  ["Required to submit this examination application.", "จำเป็นสำหรับการส่งใบสมัครสอบนี้", "提交此考试申请时必填。", "この審査申請の提出に必要です。"],
  ["Review", "ตรวจสอบ", "检查", "確認"],
  ["Scan the PromptPay QR and complete the examination payment.", "สแกนคิวอาร์พร้อมเพย์และชำระค่าธรรมเนียมสอบ", "扫描 PromptPay 二维码并完成考试付款。", "PromptPay QRを読み取り、審査料を支払ってください。"],
  ["Scan with your banking app", "สแกนด้วยแอปธนาคาร", "使用银行应用扫描", "銀行アプリで読み取る"],
  ["School or employment", "สถานศึกษา หรือสถานที่ทำงาน", "学校或工作单位", "学校・勤務先"],
  ["School or employment status", "สถานะการศึกษา หรือการทำงาน", "就学或就业状态", "在学・就業状況"],
  ["Select this to add your most recent payment date.", "เลือกเพื่อเพิ่มวันที่ชำระเงินล่าสุด", "选择此项以添加最近付款日期。", "選択すると最新の支払日を追加できます。"],
  ["Step 1 of 2 · Aikido Association Thailand", "ขั้นตอนที่ 1 จาก 2 · สมาคมไอคิโดแห่งประเทศไทย", "第 1 步，共 2 步 · 泰国合气道协会", "ステップ1/2・タイ合気道協会"],
  ["Step 2 of 2", "ขั้นตอนที่ 2 จาก 2", "第 2 步，共 2 步", "ステップ2/2"],
  ["STUDENT ID", "รหัสนักเรียน", "学员编号", "生徒ID"],
  ["Student record QR code", "คิวอาร์ระเบียนนักเรียน", "学员记录二维码", "生徒記録QRコード"],
  ["Submitted", "ส่งแล้ว", "已提交", "提出済み"],
  ["The ledger follows the student’s recorded progression and does not create missing ranks or dates.", "บัญชีนี้อ้างอิงพัฒนาการที่บันทึกไว้ของนักเรียน และไม่สร้างระดับหรือวันที่ที่ขาดหาย", "该记录表遵循学员已记录的晋级进程，不会补造缺失的等级或日期。", "台帳は記録済みの昇級過程に従い、欠けている級・段や日付を作成しません。"],
  ["The application could not be submitted.", "ไม่สามารถส่งใบสมัครได้", "无法提交申请。", "申請を提出できませんでした。"],
  ["The dojo list could not be loaded. Please try again.", "ไม่สามารถโหลดรายชื่อโดโจได้ โปรดลองอีกครั้ง", "无法加载道场列表，请重试。", "道場一覧を読み込めませんでした。もう一度お試しください。"],
  ["The hours request could not be submitted.", "ไม่สามารถส่งคำขอชั่วโมงฝึกได้", "无法提交训练时数申请。", "稽古時間の申請を提出できませんでした。"],
  ["The photo could not be prepared.", "ไม่สามารถเตรียมรูปภาพได้", "无法处理照片。", "写真を準備できませんでした。"],
  ["The profile request could not be submitted.", "ไม่สามารถส่งคำขอประวัตินักเรียนได้", "无法提交学员记录申请。", "生徒記録の申請を提出できませんでした。"],
  ["This is different from your shareable student-profile QR code.", "คิวอาร์นี้ต่างจากคิวอาร์โปรไฟล์นักเรียนที่แชร์ได้", "这与可分享的学员资料二维码不同。", "共有用の生徒プロフィールQRコードとは異なります。"],
  ["This item is waiting for a sensei to review it.", "รายการนี้กำลังรออาจารย์ตรวจสอบ", "此项目正在等待老师审核。", "この項目は先生の確認待ちです。"],
  ["This workflow is approved or complete.", "ขั้นตอนนี้ได้รับอนุมัติหรือเสร็จสมบูรณ์แล้ว", "此流程已批准或已完成。", "この手続きは承認済み、または完了しています。"],
  ["hours", "ชั่วโมง", "小时", "時間"],
  ["hr", "ชม.", "小时", "時間"],
  ["of", "จาก", "共", "／"],
  ["Three steps remain", "เหลืออีกสามขั้นตอน", "还剩三个步骤", "残り3ステップ"],
  ["Upload", "อัปโหลด", "上传", "アップロード"],
  ["VERIFIED", "ยืนยันแล้ว", "已验证", "確認済み"],
  ["VERIFIED HOURS", "ชั่วโมงที่ยืนยันแล้ว", "已验证小时数", "確認済み時間"],
  ["Verified training entries", "รายการฝึกที่ยืนยันแล้ว", "已验证训练记录", "確認済み稽古記録"],
  ["Verify your approved student record", "ยืนยันระเบียนนักเรียนที่อนุมัติแล้ว", "验证已批准的学员记录", "承認済み生徒記録を確認"],
  ["You must still make the examination payment and upload your payment proof. The dojo cannot confirm your payment until the proof is reviewed.", "คุณยังต้องชำระค่าธรรมเนียมสอบและอัปโหลดหลักฐาน โดโจจะยืนยันการชำระเงินได้หลังจากตรวจสอบหลักฐานแล้ว", "您仍需支付考试费用并上传付款凭证。道场审核凭证后才能确认付款。", "審査料の支払いと支払い証明のアップロードが必要です。証明が確認されるまで道場は支払いを確定できません。"],
  ["Your application is submitted, but you are not finished yet", "ส่งใบสมัครแล้ว แต่ขั้นตอนยังไม่เสร็จ", "申请已提交，但流程尚未完成", "申請は提出済みですが、手続きはまだ完了していません"],
  ["Your contribution record appears complete.", "ระเบียนเงินสมทบของคุณดูเหมือนจะครบถ้วนแล้ว", "您的会费记录看起来已完整。", "会費記録は完了しているようです。"],
  ["Choose the student's dojo.", "เลือกโดโจของนักเรียน", "请选择学员所在道场。", "生徒の道場を選択してください。"],
  ["Enter both the student name and Student ID.", "กรอกทั้งชื่อนักเรียนและรหัสนักเรียน", "请输入学员姓名和学员编号。", "生徒氏名と生徒IDの両方を入力してください。"],
  ["No matching approved record was found.", "ไม่พบระเบียนที่อนุมัติแล้วซึ่งตรงกัน", "未找到匹配的已批准记录。", "一致する承認済み記録が見つかりませんでした。"],
  ["Please check the form and try again.", "โปรดตรวจสอบแบบฟอร์มแล้วลองอีกครั้ง", "请检查表单后重试。", "フォームを確認して、もう一度お試しください。"],
  ["Profile link copied.", "คัดลอกลิงก์โปรไฟล์แล้ว", "个人资料链接已复制。", "プロフィールリンクをコピーしました。"],
  ["Unranked", "ยังไม่มีระดับ", "未定级", "無級"],
];

const indexes: Record<Language, number> = { en: 0, th: 1, "zh-CN": 2, ja: 3 };
const dictionaries = Object.fromEntries((Object.keys(indexes) as Language[]).map((language) => [
  language,
  Object.fromEntries(phrases.map((phrase) => [phrase[0], phrase[indexes[language]]])),
])) as Record<Language, Record<string, string>>;

function localizeDynamicText(value: string, language: Language) {
  const submitted = /^Submitted for administrator review\. Your requested total is ([0-9.]+) hours; your approved total has not changed yet\.$/.exec(value);
  if (!submitted || language === "en") return null;
  const total = submitted[1];
  if (language === "th") return `ส่งให้ผู้ดูแลตรวจสอบแล้ว ยอดที่ขอคือ ${total} ชั่วโมง ส่วนยอดที่อนุมัติยังไม่เปลี่ยนแปลง`;
  if (language === "zh-CN") return `已提交管理员审核。申请总时数为 ${total} 小时；已批准总时数尚未更改。`;
  return `管理者の確認に提出しました。申請合計は${total}時間です。承認済み合計はまだ変更されていません。`;
}

function localizeText(value: string, language: Language) {
  if (language === "en") return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const core = value.trim();
  const translated = localizeDynamicText(core, language) || dictionaries[language][core] || translateEnglishLiteral(language, core);
  return core && translated !== core ? `${leading}${translated}${trailing}` : value;
}

const originals = new WeakMap<Node, string>();
const attributeOriginals = new WeakMap<Element, Map<string, string>>();
const attributes = ["aria-label", "title", "placeholder", "alt"] as const;
const languages = Object.keys(indexes) as Language[];

function isLocalizedVariant(source: string, value: string) {
  return languages.some((language) => localizeText(source, language) === value);
}

function translateTree(root: HTMLElement, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("[data-no-translate], code, pre, script, style")) continue;
    const current = node.nodeValue || "";
    const previous = originals.get(node);
    if (previous === undefined || !isLocalizedVariant(previous, current)) {
      originals.set(node, current);
    }
    const translated = localizeText(originals.get(node) || "", language);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }
  for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    let originalAttributes = attributeOriginals.get(element);
    if (!originalAttributes) {
      originalAttributes = new Map();
      attributeOriginals.set(element, originalAttributes);
    }
    for (const attribute of attributes) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      const previous = originalAttributes.get(attribute);
      if (previous === undefined || !isLocalizedVariant(previous, current)) {
        originalAttributes.set(attribute, current);
      }
      const translated = localizeText(originalAttributes.get(attribute) || "", language);
      if (current !== translated) element.setAttribute(attribute, translated);
    }
  }
}

export function useScopedRecordTranslations(ref: RefObject<HTMLElement | null>, language: Language) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    translateTree(root, language);
    const observer = new MutationObserver(() => translateTree(root, language));
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...attributes] });
    return () => observer.disconnect();
  });
}

export function scopedRecordPhraseKeys() {
  return Object.fromEntries((Object.keys(indexes) as Language[]).map((language) => [language, Object.keys(dictionaries[language])])) as Record<Language, string[]>;
}
