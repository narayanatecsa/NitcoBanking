const moment = require("moment-timezone");

// TEMP STORE (shared via import from index if needed)
const attendanceRequests = new Map();

module.exports = {
  handleCheckInRequest,
  handleLocationSubmit,
  handleApproval
};

// ================== STEP 1: CLICK CHECK-IN ==================
async function handleCheckInRequest(from, sendText) {
  attendanceRequests.set(from, { type: "checkin" });

  await sendText(from, from, "📍 Please share your location to continue");
}

// ================== STEP 2: USER SEND LOCATION ==================
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
  try {
    const reqData = attendanceRequests.get(from);

    if (!reqData) {
      await sendText(pid, from, "❌ Please click Check-in first");
      return;
    }

    const user = await getUser(from);
    if (!user) return;

    const manager = await getManagerById(user.manager_id);
    if (!manager) {
      await sendText(pid, from, "❌ Manager not found");
      return;
    }

    const lat = msg.location.latitude;
    const long = msg.location.longitude;

    const now = moment().tz("Asia/Kolkata");
    const date = now.format("YYYY-MM-DD");
    const datetime = now.format("YYYY-MM-DD HH:mm:ss");

    const requestId = "A" + Date.now();

    // SAVE TEMP
    attendanceRequests.set(requestId, {
      emp_id: user.emp_id,
      name: user.name,
      type: reqData.type,
      datetime,
      date,
      location: `${lat},${long}`,
      phone: from
    });

    attendanceRequests.delete(from);

    // manager phone format
    let managerPhone = manager.mobile.replace(/\D/g, "");
    if (!managerPhone.startsWith("91")) managerPhone = "91" + managerPhone;

    await sendText(pid, from, "✅ Request sent to manager");

    await sendButtons(
      pid,
      managerPhone,
`📢 Attendance Approval

Employee: ${user.name}
Type: ${reqData.type}
Date: ${date}
Time: ${datetime}
Location: ${lat},${long}

ID: ${requestId}`,
      [
        { type: "reply", reply: { id: `APPROVE_${requestId}`, title: "Approve" }},
        { type: "reply", reply: { id: `REJECT_${requestId}`, title: "Reject" }}
      ]
    );

  } catch (err) {
    console.log("LOCATION ERROR:", err);
  }
}

// ================== STEP 3: APPROVAL ==================
async function handleApproval(
  id,
  pid,
  from,
  db,
  sendText,
  getUser
) {
  try {
    const isApprove = id.startsWith("APPROVE_");
    const requestId = id.split("_")[1];

    const data = attendanceRequests.get(requestId);

    if (!data) {
      await sendText(pid, from, "❌ Request expired");
      return;
    }

    const manager = await getUser(from);

    if (isApprove) {

      // CHECK EXIST
      const [rows] = await db.execute(
        `SELECT * FROM attendance WHERE emp_id=? AND date=?`,
        [data.emp_id, data.date]
      );

      if (data.type === "checkin") {

        if (rows.length) {
          await sendText(pid, from, "⚠ Already checked in");
          return;
        }

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

      if (data.type === "checkout") {

        if (!rows.length) {
          await sendText(pid, from, "❌ No check-in found");
          return;
        }

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

    attendanceRequests.delete(requestId);

    await sendText(pid, from, isApprove ? "✅ Approved" : "❌ Rejected");

  } catch (err) {
    console.log("APPROVAL ERROR:", err);
  }
}
