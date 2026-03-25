const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const GOOGLE_API = process.env.GOOGLE_API;


// ========= GOOGLE =========

async function getSheet(sheet) {
  try {
    const res = await axios.get(`${GOOGLE_API}?sheet=${sheet}`);
    return res.data || [];
  } catch (e) {
    console.log(e.message);
    return [];
  }
}


// ========= CHECK EMP =========

async function getEmployeeName(mobile) {

  const list = await getSheet("Emp_Details");

  const emp = list.find(
    x => String(x.Mobile).endsWith(mobile)
  );

  if (emp) return emp.Name;

  return null;
}



// ========= VERIFY =========

app.get("/webhook", (req, res) => {

  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }

  res.sendStatus(403);

});


// ========= WEBHOOK =========

app.post("/webhook", async (req, res) => {

  try {

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    const from = msg?.from;
    const pid = entry?.metadata?.phone_number_id;

    if (!msg) return res.sendStatus(200);


    // ===== TEXT =====

    if (msg.type === "text") {

      const text = msg.text.body.toLowerCase();

      if (text === "hi" || text === "hello") {

        const name = await getEmployeeName(from);

        if (name) {

          await sendText(
            pid,
            from,
            `Welcome ${name} to HR Place`
          );

          await sendMenu1(pid, from);

        } else {

          await sendText(
            pid,
            from,
            "You are not registered"
          );

        }

      }

    }


    // ===== LIST CLICK =====

    if (
      msg.type === "interactive" &&
      msg.interactive.list_reply
    ) {

      const id = msg.interactive.list_reply.id;


      if (id === "APPLY") {
        await sendText(pid, from, "Apply menu coming");
      }

      if (id === "VIEW") {
        await sendText(pid, from, "View menu coming");
      }

      if (id === "PROFILE") {
        await sendText(pid, from, "Profile menu coming");
      }

      if (id === "REQUEST") {
        await sendText(pid, from, "Request menu coming");
      }


      // ===== MORE =====
      if (id === "MORE") {
        await sendMenu2(pid, from);
      }

      // ===== BACK =====
      if (id === "BACK") {
        await sendMenu1(pid, from);
      }

    }


    res.sendStatus(200);

  } catch (e) {
    console.log(e);
    res.sendStatus(200);
  }

});



/* ===========================
   MENU 1
=========================== */

async function sendMenu1(pid, to) {

  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "HR Place"
        },
        body: {
          text: "Select option"
        },
        action: {
          button: "Main Menu",
          sections: [
            {
              title: "Options",
              rows: [

                {
                  id: "APPLY",
                  title: "Apply"
                },

                {
                  id: "VIEW",
                  title: "View"
                },

                {
                  id: "MORE",
                  title: "More"
                }

              ]
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    }
  );

}



/* ===========================
   MENU 2 (MORE MENU)
=========================== */

async function sendMenu2(pid, to) {

  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "More Options"
        },
        body: {
          text: "Select option"
        },
        action: {
          button: "More",
          sections: [
            {
              title: "Options",
              rows: [

                {
                  id: "PROFILE",
                  title: "Profile"
                },

                {
                  id: "REQUEST",
                  title: "Request"
                },

                {
                  id: "BACK",
                  title: "Back"
                }

              ]
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    }
  );

}



// ========= SEND TEXT =========

async function sendText(pid, to, body) {

  return axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    }
  );

}


app.listen(process.env.PORT || 3000, () => {
  console.log("HR BOT RUNNING");
});
