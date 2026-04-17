const axios = require("axios");
const moment = require("moment-timezone");

module.exports = async function handleAttendance(
  type,
  req,
  pid,
  from,
  db,
  getUser,
  getManagerById,
  sendText,
  sendButtons
) {
  try {
    const user = await getUser(from);
    if (!user) return;

    const manager = await getManagerById(user.manager_id);
    if (!manager) {
      await sendText(pid, from, "❌ Manager not found");
      return;
    }

    const now = moment().tz("Asia/Kolkata");
    const date = now.format("YYYY-MM-DD");
    const datetime = now.format("YYYY-MM-DD HH:mm:ss");

    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "Unknown";

    let location = "Unknown";
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}`);
      location = `${res.data.city}, ${res.data.regionName}`;
    } catch {}

    const checkIn = type === "checkin" ? datetime : null;
    const checkOut = type === "checkout" ? datetime : null;

    const [result] = await db.execute(
      `INSERT INTO attendance 
      (emp_id, date, check_in, check_out, status, location, network_ip, approval_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.emp_id, date, checkIn, checkOut, "Present", location, ip, "Pending"]
    );

    const id = result.insertId;

    await sendText(pid, from,
`✅ ${type.toUpperCase()} SUCCESS

Date: ${date}
Time: ${datetime}
Location: ${location}`);

    let managerPhone = manager.mobile.replace(/\D/g, "");
    if (!managerPhone.startsWith("91")) managerPhone = "91" + managerPhone;

    await sendButtons(pid, managerPhone,
`📢 Attendance Request

${user.name}
${type}
${date}
${datetime}

ID: ${id}`,
[
      { type: "reply", reply: { id: `APPROVE_${id}`, title: "Approve" }},
      { type: "reply", reply: { id: `REJECT_${id}`, title: "Reject" }}
]);

  } catch (e) {
    console.log("ERROR:", e);
  }
};
