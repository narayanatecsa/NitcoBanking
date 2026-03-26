const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const GOOGLE_API = process.env.GOOGLE_API;

const processed = new Set();

const LOGO =
"https://poojalist.com/Images/HRplace.jpeg";


// ================= GOOGLE =================

async function getSheet(sheet) {
  try {
    const res =
      await axios.get(
        `${GOOGLE_API}?sheet=${sheet}`
      );
    return res.data || [];
  } catch {
    return [];
  }
}

async function getEmployeeName(mobile) {

  const list =
    await getSheet("Emp_Details");

  const emp = list.find(
    x =>
      String(x.Mobile)
        .endsWith(mobile)
  );

  return emp
    ? emp.Name
    : null;
}



// ================= VERIFY =================

app.get("/webhook", (req, res) => {

  if (
    req.query["hub.mode"] ===
      "subscribe" &&
    req.query["hub.verify_token"]
      === VERIFY
  ) {
    return res.send(
      req.query["hub.challenge"]
    );
  }

  res.sendStatus(403);

});



// ================= WEBHOOK =================

app.post("/webhook",
async (req, res) => {

  try {

    const change =
      req.body.entry?.[0]
      ?.changes?.[0]?.value;

    if (!change)
      return res.sendStatus(200);

    if (change.statuses)
      return res.sendStatus(200);

    const msg =
      change.messages?.[0];

    if (!msg)
      return res.sendStatus(200);


    const msgId = msg.id;

    if (processed.has(msgId))
      return res.sendStatus(200);

    processed.add(msgId);


    const from =
      msg.from;

    const pid =
      change.metadata
        .phone_number_id;



// ================= TEXT =================

if (msg.type === "text") {

  const text =
    msg.text.body
      .toLowerCase()
      .trim();

  if (
    text === "hi" ||
    text === "hello"
  ) {

    const name =
      await getEmployeeName(
        from
      );

    if (!name) {

      await sendText(
        pid,
        from,
        "❌ Your number is not registered in HR Place."
      );

      return res.sendStatus(200);
    }


    // logo
    await sendImage(
      pid,
      from,
      LOGO
    );


    // greeting

    await sendText(
      pid,
      from,
`*Welcome ${name}*

Welcome to *HR PLACE*

Please select from the options below`
    );

    await menuMain(
      pid,
      from
    );

  }

  return res.sendStatus(200);
}



// ================= BUTTON =================

if (
  msg.type === "interactive" &&
  msg.interactive?.button_reply
) {

  const id =
    msg.interactive
      .button_reply.id;



  if (id === "MAIN")
    return menuMain(pid, from);

  if (id === "LEAVE")
    return menuLeave(pid, from);

  if (id === "CLAIM")
    return menuClaim(pid, from);

  if (id === "PAY")
    return menuPayroll(pid, from);

  if (id === "QUICK")
    return menuQuick(pid, from);

  if (id === "BACK")
    return menuMain(pid, from);

  if (id === "SUBMIT_CLAIM")
    return claimLink(pid, from);

}



res.sendStatus(200);

} catch (e) {

console.log(e);
res.sendStatus(200);

}

});



// ================= SEND =================

async function sendText(
  pid,
  to,
  body
) {

  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization:
          `Bearer ${TOKEN}`
      }
    }
  );

}



async function sendImage(
  pid,
  to,
  url
) {

  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: url }
    },
    {
      headers: {
        Authorization:
          `Bearer ${TOKEN}`
      }
    }
  );

}



function btn(id, title) {

  return {
    type: "reply",
    reply: { id, title }
  };

}


async function sendButtons(
  pid,
  to,
  text,
  buttons
) {

  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons }
      }
    },
    {
      headers: {
        Authorization:
          `Bearer ${TOKEN}`
      }
    }
  );

}



// ================= MENUS =================


// MAIN MENU

async function menuMain(
  pid,
  to
) {

  return sendButtons(
    pid,
    to,
`📋 *Main Menu*

Please choose an option`,
    [

      btn("LEAVE",
        "📅 Leave & Attendance"),

      btn("CLAIM",
        "💰 Claims"),

      btn("PAY",
        "🏦 Payroll"),

    ]
  );

}



// LEAVE

async function menuLeave(
  pid,
  to
) {

  return sendButtons(
    pid,
    to,
`📅 *Leave & Attendance*

Select option`,
    [

      btn("APPLY",
        "Apply Leave"),

      btn("VIEW",
        "View Balance"),

      btn("BACK",
        "Back"),

    ]
  );

}



// CLAIM

async function menuClaim(
  pid,
  to
) {

  return sendButtons(
    pid,
    to,
`💰 *Claims & Reimbursements*`,
    [

      btn(
        "SUBMIT_CLAIM",
        "Submit Claim"
      ),

      btn(
        "STATUS",
        "Claim Status"
      ),

      btn(
        "BACK",
        "Back"
      ),

    ]
  );

}



// PAYROLL

async function menuPayroll(
  pid,
  to
) {

  return sendButtons(
    pid,
    to,
`🏦 *Payroll & Bank*`,
    [

      btn(
        "PAYSLIP",
        "Payslip"
      ),

      btn(
        "BANK",
        "Bank Details"
      ),

      btn(
        "BACK",
        "Back"
      ),

    ]
  );

}



// QUICK

async function menuQuick(
  pid,
  to
) {

  return sendButtons(
    pid,
    to,
`⚡ Quick Services`,
    [

      btn(
        "POLICY",
        "Policies"
      ),

      btn(
        "HR",
        "Contact HR"
      ),

      btn(
        "MAIN",
        "Main Menu"
      ),

    ]
  );

}



// CLAIM LINK

async function claimLink(
  pid,
  to
) {

  await sendText(
    pid,
    to,
`To submit a claim,

Go to:

https://application.hrplace.com.my/claims/

Upload receipts and submit.

Press Main Menu to continue`
  );

  await menuMain(
    pid,
    to
  );

}



app.listen(
  3000,
  () =>
    console.log(
      "HR PLACE BOT RUNNING"
    )
);
