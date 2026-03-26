const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const GOOGLE_API = process.env.GOOGLE_API;

const LOGO =
"https://poojalist.com/Images/HRplace.jpeg";

const processed = new Set();


// ========= DELAY =========

const delay =
(ms) =>
new Promise(
r => setTimeout(r, ms)
);


// ========= GREETING =========

function getGreeting() {

const h = new Date().getHours();

if (h < 12) return "Good Morning";
if (h < 17) return "Good Afternoon";
return "Good Evening";

}


// ========= GOOGLE =========

async function getSheet(sheet) {

try {

const r =
await axios.get(
`${GOOGLE_API}?sheet=${sheet}`
);

return r.data || [];

} catch {

return [];

}

}


async function getEmployeeName(mobile) {

const list =
await getSheet("Emp_Details");

const emp =
list.find(x =>
String(x.Mobile)
.endsWith(mobile)
);

return emp
? emp.Name
: null;

}


// ========= VERIFY =========

app.get("/webhook", (req,res)=>{

if(
req.query["hub.mode"]==="subscribe"
&&
req.query["hub.verify_token"]===VERIFY
){

return res.send(
req.query["hub.challenge"]
);

}

res.sendStatus(403);

});


// ========= WEBHOOK =========

app.post("/webhook",
async (req,res)=>{

try{

const change =
req.body.entry?.[0]
?.changes?.[0]?.value;

if(!change)
return res.sendStatus(200);

if(change.statuses)
return res.sendStatus(200);

const msg =
change.messages?.[0];

if(!msg)
return res.sendStatus(200);


const id = msg.id;

if(processed.has(id))
return res.sendStatus(200);

processed.add(id);


const from =
msg.from;

const pid =
change.metadata.phone_number_id;



// ========= TEXT =========

if(msg.type==="text"){

const text =
msg.text.body
.toLowerCase()
.trim();


if(
text==="hi"
||
text==="hello"
){

const name =
await getEmployeeName(from);

if(!name){

await sendText(
pid,
from,
"❌ Your number not registered"
);

return res.sendStatus(200);

}


// LOGO

await sendImage(
pid,
from,
LOGO
);


// delay

await delay(3000);


// greeting

const g =
getGreeting();


await sendText(
pid,
from,
`*${g} ${name}*

Welcome to *HR PLACE*

Please select from below`
);


// MAIN MENU

await menuMain(
pid,
from
);


// QUICK MENU

await menuQuick(
pid,
from
);

}

return res.sendStatus(200);

}



// ========= BUTTON =========

if(
msg.type==="interactive"
&&
msg.interactive?.button_reply
){

const id =
msg.interactive
.button_reply.id;



if(id==="MAIN")
return menuMain(pid,from);

if(id==="LEAVE")
return menuLeave(pid,from);

if(id==="CLAIM")
return menuClaim(pid,from);

if(id==="PAY")
return menuPay(pid,from);

if(id==="QUICK")
return menuQuick(pid,from);

if(id==="APPLY")
return leaveType(pid,from);

if(id==="SUBMIT_CLAIM")
return claimLink(pid,from);

if(id==="BACK")
return menuMain(pid,from);

}



res.sendStatus(200);

}catch(e){

console.log(e);
res.sendStatus(200);

}

});


// ========= SEND =========

async function sendText(pid,to,body){

await axios.post(
`https://graph.facebook.com/v23.0/${pid}/messages`,
{
messaging_product:"whatsapp",
to,
text:{body}
},
{
headers:{
Authorization:
`Bearer ${TOKEN}`
}
}
);

}


async function sendImage(pid,to,url){

await axios.post(
`https://graph.facebook.com/v23.0/${pid}/messages`,
{
messaging_product:"whatsapp",
to,
type:"image",
image:{link:url}
},
{
headers:{
Authorization:
`Bearer ${TOKEN}`
}
}
);

}


function btn(id,title){

return {
type:"reply",
reply:{id,title}
};

}


async function sendButtons(
pid,to,text,buttons
){

await axios.post(
`https://graph.facebook.com/v23.0/${pid}/messages`,
{
messaging_product:"whatsapp",
to,
type:"interactive",
interactive:{
type:"button",
body:{text},
action:{buttons}
}
},
{
headers:{
Authorization:
`Bearer ${TOKEN}`
}
}
);

}



// ========= MENUS =========


// MAIN

async function menuMain(pid,to){

return sendButtons(
pid,
to,
"📋 *Main Menu*\nChoose option",
[
btn("LEAVE","📅 Leave"),
btn("CLAIM","💰 Claims"),
btn("PAY","🏦 Payroll")
]
);

}


// QUICK

async function menuQuick(pid,to){

return sendButtons(
pid,
to,
"⚡ Quick Services",
[
btn("POL","Policies"),
btn("HR","Contact HR"),
btn("MAIN","Main Menu")
]
);

}


// LEAVE MENU

async function menuLeave(pid,to){

return sendButtons(
pid,
to,
"📅 Leave & Attendance",
[
btn("APPLY","Apply Leave"),
btn("BAL","Balance"),
btn("BACK","Back")
]
);

}


// LEAVE TYPE

async function leaveType(pid,to){

return sendButtons(
pid,
to,
"Select Leave Type",
[
btn("AL","Annual"),
btn("SL","Sick"),
btn("BACK","Back")
]
);

}


// CLAIM

async function menuClaim(pid,to){

return sendButtons(
pid,
to,
"💰 Claims",
[
btn("SUBMIT_CLAIM","Submit"),
btn("STATUS","Status"),
btn("BACK","Back")
]
);

}


// CLAIM LINK

async function claimLink(pid,to){

await sendText(
pid,
to,
`Submit claim here:

https://application.hrplace.com.my/claims/

Upload receipts and submit`
);

await menuMain(pid,to);

}


// PAY

async function menuPay(pid,to){

return sendButtons(
pid,
to,
"🏦 Payroll",
[
btn("PAYSLIP","Payslip"),
btn("BANK","Bank"),
btn("BACK","Back")
]
);

}


app.listen(
3000,
()=>console.log("HR BOT READY")
);
