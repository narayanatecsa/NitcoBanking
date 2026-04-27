const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ✅ GOOGLE SHEET API
const SHEET_API = "https://script.google.com/macros/s/AKfycbwHHurrj6O-2w2543YxICZd_7G71MZ148NGEuNCYjrJXNWRO60JADwPREQ4yGHBGWVfVQ/exec?sheet=Emp_Details";

// ===== GET USER FROM SHEET =====
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

// ===== VERIFY WEBHOOK =====
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ===== MAIN WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    // ===== TEXT (HI FLOW) =====
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        // ✅ CHECK USER FROM SHEET
        const user = await getUser(from);

        if (!user) {
          await sendText(pid, from, "❌ You are not registered or inactive. Please contact HR.");
          return res.sendStatus(200);
        }

        // ✅ USE NAME FROM SHEET
        await sendText(pid, from,
`Hello ${user.Name}!

Welcome to HRPlace AI Chat Bot

You are just 2 Steps away to experience a whole new way of HRPlace that is convenient, secure and fast..!

To know more, feel free to check out our:

Terms and Conditions:
https://hrplace.com.my/terms-and-conditions.php

Privacy Policy:
https://hrplace.com.my/privacy_policy.php

Lets get started!

Simply Select from the options below or Type your query to get started.`
        );

        await delay(800);

        // MAIN BUTTONS
        await sendButtons(pid, from,
`Choose an option:`,
[
  btn("LEAVE", "Leave"),
  btn("ATT_PAYROLL", "Attendance & Payroll"),
  btn("CLAIM", "Claim")
]);

        await delay(800);

        // QUICK SERVICES
        await sendButtons(pid, from,
`Quick Services is just a click away :`,
[
  btn("SHIFT", "Shift & Roster"),
  btn("MORE", "More")
]);

        return res.sendStatus(200);
      }
    }

    //flow response
if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

  const flow = msg.interactive.nfm_reply;
  console.log("FLOW RESPONSE:", flow);

  const flowId = flow?.flow_id;

  let message = "Your request has been submitted successfully!";

  // ✅ APPLY LEAVE
  if (flowId === "1306256491417200") {
    message = "All set! I’ve sent your leave request over to your manager for review.";
  }

  // ✅ CLAIM
  else if (flowId === "847122295070410") {
    message = "All set! I’ve sent your Claim request over to your manager for review.";
  }

  // ✅ EDIT / CANCEL LEAVE
  else if (flowId === "935945472532451") {
    message = "Your Leave Cancel or Edit Request Submitted successfully!";
  }

  // ✅ CONTACT HR (optional if needed)
  else if (flowId === "1511045223936865") {
    message = "Your request has been sent to HR successfully!";
  }

  await sendText(pid, from, message);

  await delay(600);

  return sendButtons(pid, from,
`We can also assist you with below details:`,
[
  btn("LEAVE_DETAILS", "Leave Details"),
  btn("BACK", "Main Menu")
]).then(()=>res.sendStatus(200));
}    
    
    // ===== BUTTON HANDLER =====
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

// ===== LEAVE MENU =====
if (id === "LEAVE") {
  return menuLeave(pid, from).then(()=>res.sendStatus(200));
}

// ===== APPLY LEAVE =====
if (id === "APPLY_LEAVE") {

  await sendText(pid, from,
`New Leave

Please Click Apply Leave to Submit New Leave Request`
  );

  await delay(500);

  return sendLeaveFlow(pid, from).then(()=>res.sendStatus(200));
}

      // STEP 1
if (id === "EDIT_LEAVE") {

  await sendText(pid, from,
`Here are the details of your applied Leaves

• Leave Details Information`
  );

  await delay(600);

  // ✅ DIRECT FLOW OPEN (NO BUTTONS)
  return sendEditLeaveFlow(pid, from).then(()=>res.sendStatus(200));
} 
      // STEP 2
if (id === "EDIT_LEAVE_FLOW") {

  await sendText(pid, from,
`Cancel Or Edit Leave Request`
  );

  await delay(500);

  return sendEditLeaveFlow(pid, from).then(()=>res.sendStatus(200));
}
     
      // ===== LEAVE DETAILS =====
if (id === "LEAVE_DETAILS") {

  await sendText(pid, from,
`You are Right There!

Here are your Leave Balance Details:
• Leave Details Information
• Casual Leave: 5
• Sick Leave: 3
• Earned Leave: 10`
  );

  await delay(600);

  return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
}

//New 

      // ===== ATTENDANCE & PAYROLL =====
if (id === "ATT_PAYROLL") {

  return sendButtons(pid, from,
`Please select from the options given below.`,
[
  btn("VIEW_TIMESHEET", "View Timesheet"),
  btn("VIEW_PAYROLL", "View Payroll"),
  btn("BACK", "⬅ Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== VIEW TIMESHEET =====
if (id === "VIEW_TIMESHEET") {

  await sendText(pid, from,
`I’ve got your attendance records ready for you.

How would you like to view them today?`
  );

  await delay(500);

  return sendButtons(pid, from,
`Choose option`,
[
  btn("TIMESHEET_PDF", "Timesheet PDF"),
  btn("BACK", "⬅ Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== TIMESHEET PDF =====
// ===== TIMESHEET PDF (TEMPLATE) =====
if (id === "TIMESHEET_PDF") {

  await sendTimesheetTemplate(pid, from);

  await sendText(pid, from, " ");

  await delay(1500);

  return sendButtons(pid, from,
`We can also assist you with below details:`,
[
  btn("SHIFT", "Shift & Roster"),
  btn("BACK", "Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== VIEW PAYROLL =====
if (id === "VIEW_PAYROLL") {

  await sendText(pid, from,
`You are Right There!`
  );

  await delay(500);

  return sendButtons(pid, from,
`Choose option`,
[
  btn("LATEST_PAYSLIP", "Latest Payslip"),
  btn("BACK", "⬅ Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== LATEST PAYSLIP =====
if (id === "LATEST_PAYSLIP") {

  await sendText(pid, from,
`I’ve got your Payslip records ready for you.

How would you like to view them today?`
  );

  await delay(500);

  return sendButtons(pid, from,
`Choose option`,
[
  btn("PAYSLIP_PDF", "Payslip PDF"),
  btn("BACK", "⬅ Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== PAYSLIP PDF =====

      // ===== PAYSLIP PDF (TEMPLATE) =====
if (id === "PAYSLIP_PDF") {

  // 1️⃣ Send template
  await sendPayslipTemplate(pid, from);

  // 2️⃣ Small separator text (IMPORTANT TRICK)
  await sendText(pid, from, " ");

  await delay(1500);

  // 3️⃣ Then buttons
  return sendButtons(pid, from,
`We can also assist you with below details:`,
[
  btn("LEAVE_DETAILS", "Leave Balance"),
  btn("BACK", "Main Menu")
]).then(()=>res.sendStatus(200));
}

      //claim
      // ===== CLAIM MENU =====
if (id === "CLAIM") {

  return sendButtons(pid, from,
`Please select from the options given below`,
[
  btn("APPLY_CLAIM", "Apply New Claim"),
  btn("VIEW_CLAIMS", "View Claims"),
  btn("BACK", "⬅ Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== APPLY CLAIM =====
if (id === "APPLY_CLAIM") {

  await sendText(pid, from,
`New Claim Request

Please click below to submit your claim`
  );

  await delay(500);

  return sendClaimFlow(pid, from).then(()=>res.sendStatus(200));
}

// ===== VIEW CLAIMS =====
if (id === "VIEW_CLAIMS") {

  await sendText(pid, from,
`You are Right There!

Here are your Applied Claim Details:
• Claim Details Information`
  );

  await delay(600);

  // ✅ THIS IS WHAT YOU ASKED (More Options)
  return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
}

      //Shift Roster

      // ===== SHIFT & ROSTER MENU =====
if (id === "SHIFT") {

  return sendButtons(pid, from,
`Please select from the options given below`,
[
  btn("VIEW_SHIFT", "View My Shift"),
  btn("VIEW_ROSTER", "View My Roster"),
  btn("BACK", "⬅ Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== VIEW SHIFT =====
if (id === "VIEW_SHIFT") {

  await sendText(pid, from,
`You are Right There!

Here are your Shift Details:
• Shift Details Information`
  );

  await delay(600);

  return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
}

// ===== VIEW ROSTER =====
if (id === "VIEW_ROSTER") {

  await sendText(pid, from,
`You are Right There!

Here are your Roster Details:
• Roster Details Information`
  );

  await delay(600);

  return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
}

      
         // MORE SERVICES
      if (id === "MORE") {
        return sendButtons(pid, from,
`More Services`,
[
  btn("HOLIDAYS", "Public Holidays"),
  btn("CONTACT", "Contact HR"),
  btn("BACK", "⬅ Back")
]).then(()=>res.sendStatus(200));
      }

      // PUBLIC HOLIDAYS
// PUBLIC HOLIDAYS
if (id === "HOLIDAYS") {

  await sendText(pid, from,
`You are Right There!

📅 *Public Holiday List*

Date       Day   Holiday
--------------------------------
17 Feb   Tue   Chinese New Year
18 Feb   Wed   Chinese New Year (Day 2)
20 Mar   Fri   Hari Raya Aidilfitri Holiday
21 Mar   Sat   Hari Raya Aidilfitri
22 Mar   Sun   Hari Raya Aidilfitri Holiday
1 May    Fri   Labour Day
27 May   Wed   Hari Raya Haji
31 May   Sun   Wesak Day
1 Jun    Mon   King's Birthday (Agong)
17 Jun   Wed   Awal Muharram
25 Aug   Tue   Prophet Muhammad's Birthday
31 Aug   Mon   Merdeka Day (National Day)
16 Sep   Wed   Malaysia Day
8 Nov    Sun   Deepavali (Observed nationwide except Sarawak)
25 Dec   Fri   Christmas Day`
  );

  await delay(600);

  return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
}
      
      // CONTACT HR
// ===== CONTACT HR (FLOW) =====
if (id === "CONTACT") {

  await sendContactHRFlow(pid, from);

  await delay(600);

  return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
}
      
      // BACK TO MAIN
      if (id === "BACK") {
        await sendButtons(pid, from,
`Choose an option:`,
[
  btn("LEAVE", "Leave"),
  btn("ATT_PAYROLL", "Attendance & Payroll"),
  btn("CLAIM", "Claim")
]);

        await delay(800);

        return sendButtons(pid, from,
`Quick Services is just a click away :`,
[
  btn("SHIFT", "Shift & Roster"),
  btn("MORE", "More")
]).then(()=>res.sendStatus(200));
      }
    }

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// ===== SEND FUNCTIONS =====

async function sendText(pid, to, body) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    text: { body }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

function btn(id, title) {
  return {
    type: "reply",
    reply: { id, title }
  };
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
//leave buttons

async function menuLeave(pid, to) {

  await sendButtons(pid, to,
`Please select from the options given below.`,
[
  btn("APPLY_LEAVE", "Apply Leave"),
  btn("LEAVE_DETAILS", "Leave Details"),
  btn("EDIT_LEAVE", "Cancel / Edit Leave")
]);

  await delay(600);

  return sendButtons(pid, to,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]);
}

//Flow 

async function sendLeaveFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: {
        text: "Apply Leave"
      },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: "1306256491417200", // ✅ YOUR FLOW ID
          flow_cta: "Apply Leave"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== CANCEL / EDIT LEAVE FLOW =====
async function sendEditLeaveFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: {
        text: "Cancel or Edit Leave"
      },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: "935945472532451", // ✅ YOUR FLOW ID
          flow_cta: "Open"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

//claim flow 

// ===== CLAIM FLOW =====
async function sendClaimFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: {
        text: "Claim Form"
      },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: "847122295070410", // your claim flow id
          flow_cta: "Open"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}


// ===== SEND PAYSLIP TEMPLATE =====
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
                link: "https://www.poojalist.com/Images/Payslip.pdf", // ✅ replace with real PDF
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

// ===== SEND TIMESHEET TEMPLATE =====
async function sendTimesheetTemplate(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "downloadtimesheet",   // ✅ your template name
      language: { code: "en" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                link: "https://www.poojalist.com/Images/Timesheet.pdf", // 🔁 replace with real timesheet PDF
                filename: "Timesheet.pdf"
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

// Contact flow
// ===== CONTACT HR FLOW =====
async function sendContactHRFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: {
        text: "Contact HR"
      },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: "1511045223936865", // ✅ your flow ID
          flow_cta: "Open"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== START SERVER =====
app.listen(3000, () => console.log("✅ Bot running on port 3000"));
