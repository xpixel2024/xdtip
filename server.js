const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// 🔥 YOUR SUPABASE KEYS
const supabase = createClient(
  "https://yohrquotbdmsxfeyxtqr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvaHJxdW90YmRtc3hmZXl4dHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzA5MzUsImV4cCI6MjA5MDk0NjkzNX0.C_8yl1JkBYUCoHjsFQWalWipOLmzJMJsJ8QyKjZu8MM"
);

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// VIEW ENGINE
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// ===================
// STATIC PAGES
// ===================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});


// ===================
// TIP PAGE
// ===================

app.get("/:username", async (req, res) => {

  const username = req.params.username;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!data) {
    return res.send("User not found");
  }

  res.render("tip", { user: data });
});


// ===================
// SAVE TIP
// ===================

app.post("/api/tip", async (req, res) => {

  const { creatorId, name, message, amount, payment_id } = req.body;

  await supabase.from("tips").insert({
    creator_id: creatorId,
    sender: name,
    message,
    amount,
    payment_id
  });

  res.json({ success: true });
});


// ===================

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});