const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const LOGO = "https://poojalist.com/Images/NewHRplace.png";

const SHEET_API = "https://script.google.com/macros/s/AKfycbwHHurrj6O-2w2543YxICZd_7G71MZ148NGEuNCYjrJXNWRO60JADwPREQ4yGHBGWVfVQ/exec?sheet=Emp_Details";

const userState = new Map();
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ===== CHECK USER =====
async function getUser(phone) {
  try {
    const res = await axios.get(SHEET_API);
    const users = res.data;

    const clean = phone.replace(/\D/g, "");

    const user = users.find(u =>
      String(u.Mobile).replace(/\D/g, "") === clean
    );

    return user && user.Status === "Active" ? user : null;

  } catch (err) {
    console.log("Sheet error:", err.message);
    return null;
  }
}

// ===== VERIFY =====
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    // Prevent duplicate messages
    if (msg.id) {
      if (userState.has(msg.id)) return res.sendStatus(200);
      userState.set(msg.id, true);
    }

    // FLOW RESPONSE
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {
      await sendText(pid, from, "✅ Submitted successfully");
      return res.sendStatus(200);
    }

    // TEXT
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        const user = await getUser(from);

        if (!user) {
          await sendText(pid, from, "❌ You are not registered. Please contact HR.");
          return res.sendStatus(200);
        }

        const firstKey = from + "_FIRST";

        await sendImage(pid, from, LOGO);
        await delay(800);

        if (!userState.has(firstKey)) {
          userState.set(firstKey, true);

          await sendText(pid, from,
`Hello ${user.Name}

Welcome to HRPlace 👋
Please choose a service below.`);
          await delay(800);
        }

        await menuFirst(pid, from);
        await delay(600);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }

    // BUTTON HANDLER
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));

      if (id === "CLAIM") return menuClaim(pid, from).then(()=>res.sendStatus(200));
       if (id === "CLAIM") return menuClaim(pid, from).then(()=>res.sendStatus(200));

  if (id === "CLAIM_NEW") {
    return sendClaimFlow(pid, from).then(()=>res.sendStatus(200));
  }

 if (id === "CLAIM_STATUS") {
  return sendClaimStatusTemplate(pid, from).then(()=>res.sendStatus(200));
}

      if (id === "PAYROLL") return menuPayroll(pid, from).then(()=>res.sendStatus(200));
      if (id === "PAYSLIP") {
  return sendPayslipTemplate(pid, from).then(()=>res.sendStatus(200));
}

      if (id === "POLICY") {
  return sendPolicyTemplate(pid, from).then(()=>res.sendStatus(200));
}
      if (id === "CONTACT") {
  await sendContactFlow(pid, from);
  return res.sendStatus(200);
}
      if (id === "BANK_DETAILS") {
  return sendViewBankTemplate(pid, from).then(()=>res.sendStatus(200));
}

if (id === "BANK_UPDATE") {
  return sendUpdateBankTemplate(pid, from).then(()=>res.sendStatus(200));
}

      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));
      if (id === "BALANCE") {
  await sendLeaveBalanceLink(pid, from);
  return res.sendStatus(200);
}
     
      if (id === "EDIT") {
  await sendEditLeaveLink(pid, from);
  return res.sendStatus(200);
}

      if (id === "ATTENDANCE") {
  await sendAttendanceLink(pid, from);
  return res.sendStatus(200);
}
      if (id === "REGULARIZE") {
  await sendRegularizeLink(pid, from);
  return res.sendStatus(200);
}
      if (id === "BACK_MAIN") {
        await menuFirst(pid, from);
        await delay(600);
        return menuSecond(pid, from).then(()=>res.sendStatus(200));
      }
    }

  } catch (e) {
    console.log("ERROR:", e);
    return res.sendStatus(200);
  }
});

// ===== SEND FUNCTIONS =====


// ===== TEMPLATE: CONTACT HR =====
async function sendContactFlow(pid, to) {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v23.0/${pid}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "flow",
          body: { text: "Contact HR" },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_id: "1511045223936865",
              flow_cta: "Open"
            }
          }
        }
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    console.log("✅ FLOW SENT:", res.data);

  } catch (err) {
    console.log("❌ FLOW ERROR:", err.response?.data || err.message);
  }
}
// ===== TEMPLATE: COMPANY POLICIES =====
async function sendPolicyTemplate(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "companypolices",   // ⚠️ EXACT name from Meta (same as screenshot)
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== TEMPLATE: VIEW BANK DETAILS =====
async function sendViewBankTemplate(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "viewbank",   // ✅ your template name
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== TEMPLATE: UPDATE BANK INFO =====
async function sendUpdateBankTemplate(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "updatebank",   // ✅ your template name
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}


async function sendPayslipTemplate(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "downloadpayslip",
      language: { code: "en" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                link: "http://poojalist.com/Images/DileepReddy.pdf", // ✅ PUBLIC PDF URL
                filename: "Payslip.pdf"
              }
            }
          ]
        }
      ]
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}


async function sendClaimStatusTemplate(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "viewclaimstatus",   // ✅ your template name
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== TEMPLATE: REGULARIZE ATTENDANCE =====
async function sendRegularizeLink(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "regularize_attendance",   // ✅ your template
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== TEMPLATE: VIEW ATTENDANCE LINK =====
async function sendAttendanceLink(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "view_attendance",   // ✅ your template name
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== TEMPLATE: EDIT LEAVE LINK =====
async function sendEditLeaveLink(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "editleave",   // ✅ your template name
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== TEMPLATE: LEAVE BALANCE LINK =====
async function sendLeaveBalanceLink(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "leave_",   // ✅ your template name
      language: { code: "en" }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}



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

// ===== FLOW =====
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

// ===== BUTTON UTILS =====
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

// ===== MENUS =====
async function menuFirst(pid, to) {
  return sendButtons(pid, to,
` *Main Services*`,
  [
    btn("LEAVE_MENU", "Leave & Attendance"),
    btn("CLAIM", "Claims"),
    btn("PAYROLL", "Payroll")
  ]);
}

async function menuSecond(pid, to) {
  return sendButtons(pid, to,
`More options:`,
  [
    btn("POLICY", "Policies"),
    btn("CONTACT", "Contact HR")
  ]);
}

// ===== LEAVE MENU (SPLIT 3 + 2) =====
async function menuLeave(pid, to) {

  await sendButtons(pid, to,
` *Leave & Attendance*

Select an action:`,
  [
    btn("LEAVE", "Apply Leave"),
    btn("BALANCE", "Leave Balance"),
    btn("EDIT", "Edit/Cancel")
  ]);

  await delay(600);

  return sendButtons(pid, to,
`More actions:`,
  [
    btn("ATTENDANCE", "View Attendance"),
    btn("REGULARIZE", "Regularize"),
    btn("BACK_MAIN", "⬅ Back")
  ]);
}
// ===== CLAIM MENU =====
async function menuClaim(pid, to) {

  return sendButtons(pid, to,
`📊 *Claims Management*

Choose an option:`,
  [
    btn("CLAIM_NEW", "Submit New Claim"),
    btn("CLAIM_STATUS", "View Claim Status"),
    btn("BACK_MAIN", "⬅ Back")
  ]);
}

async function sendClaimFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Submit New Claim" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: "847122295070410",   // ✅ YOUR CLAIM FLOW ID
          flow_cta: "Open"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}
async function menuPayroll(pid, to) {

  return sendButtons(pid, to,
` *Payroll Management*

Choose an option:`,
  [
    btn("PAYSLIP", "Download Payslip"),
    btn("BANK_DETAILS", "View Bank Details"),
    btn("BANK_UPDATE", "Update Bank Info"),
    
  ]);
}


app.listen(3000, () => console.log("✅ HR BOT READY"));
