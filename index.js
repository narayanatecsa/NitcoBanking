const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const LOGO = "https://poojalist.com/Images/NewHRplace.png";

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const userState = new Map();
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// TEMP STORE
global.leaveStore = {};
global.attendanceStore = {};

// ================= USER =================
async function getUser(phone) {
  let clean = phone.replace(/\D/g, "");
  let last10 = clean.slice(-10);

  const [rows] = await db.execute(
    `SELECT * FROM employees WHERE RIGHT(mobile,10)=? AND status='Active'`,
    [last10]
  );

  return rows[0] || null;
}

async function getManagerById(id) {
  const [rows] = await db.execute(
    "SELECT * FROM employees WHERE emp_id=?",
    [id]
  );
  return rows[0] || null;
}

// ================= VERIFY =================
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    if (msg.id && userState.has(msg.id)) return res.sendStatus(200);
    userState.set(msg.id, true);

    // ================= LEAVE FLOW RESPONSE =================
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

      const data = msg.interactive.nfm_reply.response_json;

      const fromDate = data.from || data.from_date;
      const toDate = data.to || data.to_date;
      const reason = data.reason;

      const user = await getUser(from);
      const manager = await getManagerById(user.manager_id);

      const leaveId = "L" + Date.now();

      global.leaveStore[leaveId] = {
        emp_id: user.emp_id,
        fromDate,
        toDate,
        reason
      };

      await sendText(pid, from,
`✅ Leave Request Sent

From: ${fromDate}
To: ${toDate}
Reason: ${reason}`);

      let managerPhone = manager.mobile.replace(/\D/g, "");
      if (!managerPhone.startsWith("91")) managerPhone = "91" + managerPhone;

      await sendButtons(pid, managerPhone,
`📢 Leave Approval

${user.name}

From: ${fromDate}
To: ${toDate}
Reason: ${reason}

ID: ${leaveId}`,
[
        btn(`APPROVE_${leaveId}`, "Approve"),
        btn(`REJECT_${leaveId}`, "Reject")
      ]);

      return res.sendStatus(200);
    }

    // ================= TEXT =================
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase();

      if (text === "hi") {
        const user = await getUser(from);

        await sendImage(pid, from, LOGO);
        await delay(500);

        await sendText(pid, from, `Hello ${user.name}`);
        await menuFirst(pid, from);
        await delay(500);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }

    // ================= BUTTON =================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));
      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));

      // REGULARIZE MENU
      if (id === "REGULARIZE") {
        return sendButtons(pid, from,
`Attendance`,
[
          btn("CHECKIN", "Check-in"),
          btn("CHECKOUT", "Check-out"),
          btn("BACK_MAIN", "Back")
]).then(()=>res.sendStatus(200));
      }

      // CHECKIN / CHECKOUT
      if (id === "CHECKIN" || id === "CHECKOUT") {

        const user = await getUser(from);
        const manager = await getManagerById(user.manager_id);

        const now = new Date();
        const date = now.toISOString().split("T")[0];
        const time = now.toISOString().slice(0, 19).replace("T", " ");

        const reqId = "A" + Date.now();

        global.attendanceStore[reqId] = {
          emp_id: user.emp_id,
          date,
          check_in: id === "CHECKIN" ? time : null,
          check_out: id === "CHECKOUT" ? time : null
        };

        await sendText(pid, from, "✅ Request sent to manager");

        let managerPhone = manager.mobile.replace(/\D/g, "");
        if (!managerPhone.startsWith("91")) managerPhone = "91" + managerPhone;

        await sendButtons(pid, managerPhone,
`📢 Attendance Approval

${user.name}
${id}
${date}
${time}

ID: ${reqId}`,
[
          btn(`APPROVE_${reqId}`, "Approve"),
          btn(`REJECT_${reqId}`, "Reject")
        ]);

        return res.sendStatus(200);
      }

      // APPROVAL
      if (id.startsWith("APPROVE_") || id.startsWith("REJECT_")) {

        const isApprove = id.startsWith("APPROVE_");
        const key = id.replace("APPROVE_", "").replace("REJECT_", "");

        const manager = await getUser(from);

        // LEAVE
        if (key.startsWith("L")) {
          const d = global.leaveStore[key];

          if (isApprove) {
            await db.execute(
              `INSERT INTO leaves 
              (emp_id, from_date, to_date, reason, status, approved_by)
              VALUES (?, ?, ?, ?, 'Approved', ?)`,
              [d.emp_id, d.fromDate, d.toDate, d.reason, manager.emp_id]
            );
          }

          await sendText(pid, from, isApprove ? "Leave Approved" : "Leave Rejected");
          return res.sendStatus(200);
        }

        // ATTENDANCE
        if (key.startsWith("A")) {
          const d = global.attendanceStore[key];

          if (isApprove) {
            await db.execute(
              `INSERT INTO attendance 
              (emp_id, date, check_in, check_out, status, approval_status)
              VALUES (?, ?, ?, ?, 'Present', 'Approved')`,
              [d.emp_id, d.date, d.check_in, d.check_out]
            );
          }

          await sendText(pid, from, isApprove ? "Attendance Approved" : "Rejected");
          return res.sendStatus(200);
        }
      }

      if (id === "BACK_MAIN") {
        await menuFirst(pid, from);
        await delay(500);
        return menuSecond(pid, from).then(()=>res.sendStatus(200));
      }
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log(e);
    return res.sendStatus(200);
  }
});

// ================= SEND =================
async function sendText(pid, to, body) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    text: { body }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

async function sendImage(pid, to, url) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: url }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

async function sendFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Apply Leave" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: FLOW_ID,
          flow_cta: "Open"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

function btn(id, title) {
  return { type: "reply", reply: { id, title } };
}

async function sendButtons(pid, to, text, buttons) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: { buttons }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ================= MENUS =================
async function menuFirst(pid, to) {
  return sendButtons(pid, to, "Main Menu", [
    btn("LEAVE_MENU", "Leave & Attendance"),
    btn("CLAIM", "Claims"),
    btn("PAYROLL", "Payroll")
  ]);
}

async function menuSecond(pid, to) {
  return sendButtons(pid, to, "More", [
    btn("POLICY", "Policies"),
    btn("CONTACT", "Contact HR")
  ]);
}

async function menuLeave(pid, to) {
  await sendButtons(pid, to, "Leave", [
    btn("LEAVE", "Apply Leave"),
    btn("BALANCE", "Leave Balance"),
    btn("EDIT", "Edit/Cancel")
  ]);

  await delay(500);

  return sendButtons(pid, to, "More", [
    btn("ATTENDANCE", "View Attendance"),
    btn("REGULARIZE", "Regularize"),
    btn("BACK_MAIN", "Back")
  ]);
}

app.listen(3000, () => console.log("READY"));
