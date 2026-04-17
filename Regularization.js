const moment = require("moment-timezone");

const attendanceRequests = new Map();

// ================= CHECK-IN CLICK =================
async function handleCheckInRequest(from, pid, sendText, type = "checkin") {
  attendanceRequests.set(from, { type });

  await sendText(pid, from, "📍 Please share your location");
}

// ================= LOCATION =================
async function handleLocationSubmit(
  msg,
  pid,
  from,
  db,
  getUser,
  getManagerById,
  sendText,
  sendButtons
) {
  const reqData = attendanceRequests.get(from);
  if (!reqData) return;

  const user = await getUser(from);
  const manager = await getManagerById(user.manager_id);

  const lat = msg.location.latitude;
  const long = msg.location.longitude;

  const now = moment().tz("Asia/Kolkata");
  const date = now.format("YYYY-MM-DD");
  const datetime = now.format("YYYY-MM-DD HH:mm:ss");

  const requestId = "A" + Date.now();

  attendanceRequests.set(requestId, {
    emp_id: user.emp_id,
    name: user.name,
    type: reqData.type,
    date,
    datetime,
    location: `${lat},${long}`
  });

  attendanceRequests.delete(from);

  let managerPhone = manager.mobile.replace(/\D/g, "");
  if (!managerPhone.startsWith("91")) managerPhone = "91" + managerPhone;

  await sendText(pid, from, "✅ Sent to manager");

  await sendButtons(pid, managerPhone,
`📢 Attendance Approval

${user.name}
${reqData.type}
${datetime}
📍 ${lat},${long}

ID: ${requestId}`,
[
    { type: "reply", reply: { id: `APPROVE_${requestId}`, title: "Approve" }},
    { type: "reply", reply: { id: `REJECT_${requestId}`, title: "Reject" }}
]);
}

// ================= APPROVAL =================
async function handleApproval(id, pid, from, db, sendText, getUser) {
  const approve = id.startsWith("APPROVE_");
  const requestId = id.split("_")[1];

  const data = attendanceRequests.get(requestId);
  if (!data) return;

  const manager = await getUser(from);

  if (approve) {
    const [rows] = await db.execute(
      `SELECT * FROM attendance WHERE emp_id=? AND date=?`,
      [data.emp_id, data.date]
    );

    if (data.type === "checkin") {
      if (!rows.length) {
        await db.execute(
          `INSERT INTO attendance 
          (emp_id, date, check_in, status, location, network_ip, approval_status, approved_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.emp_id,
            data.date,
            data.datetime,
            "Present",
            data.location,
            "GPS",
            "Approved",
            manager.emp_id
          ]
        );
      }
    }

    if (data.type === "checkout") {
      if (rows.length) {
        await db.execute(
          `UPDATE attendance 
           SET check_out=?, approved_by=?, approval_status='Approved'
           WHERE emp_id=? AND date=?`,
          [
            data.datetime,
            manager.emp_id,
            data.emp_id,
            data.date
          ]
        );
      }
    }
  }

  attendanceRequests.delete(requestId);

  await sendText(pid, from, approve ? "✅ Approved" : "❌ Rejected");
}

module.exports = {
  handleCheckInRequest,
  handleLocationSubmit,
  handleApproval
};
