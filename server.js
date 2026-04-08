const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// 🔥 SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// VIEW ENGINE
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// ===================
// CLEAN .html URL
// ===================
app.get(/\.html$/, (req, res) => {
  const clean = req.path.replace(".html", "");
  res.redirect(clean);
});


// ===================
// STATIC ROUTES
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
// SAVE TIP API
// ===================

app.post("/api/tip", async (req, res) => {
    // Make sure 'username' is what you destructure from req.body
    const { username, name, message, amount, payment_id } = req.body;

    const { error } = await supabase
        .from("tips")
        .insert([
            {
                username: username,    // Must match the column name in Supabase tips table
                sender_name: name,
                message: message,
                amount: amount,
                payment_id: payment_id
            }
        ]);

    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true });
});

    if (error) {
        console.error("Supabase Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true });
});

app.post("/api/tip", async (req, res) => {
    const { username, name, message, amount, payment_id } = req.body;

    const { error } = await supabase
        .from("tips")
        .insert([
            {
                username: username,    // The recipient's username
                sender_name: name,
                message: message,
                amount: amount,
                payment_id: payment_id
            }
        ]);

    if (error) {
        console.error("Supabase Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true });
});


// ===================
// USERNAME ROUTE (ONLY ONE! 🔥)
// ===================

app.get("/:username", async (req, res) => {
  try {
    const username = req.params.username;

    // 🚫 block system routes
    const blocked = ["login", "dashboard", "admin", "api"];

    if (blocked.includes(username)) {
      return res.redirect("/");
    }

    // 🔥 FIX: use ilike (case-insensitive)
    const { data } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .maybeSingle();

    console.log("Searching username:", username);
    console.log("DB result:", data);

    if (!data) {
      return res.send("User not found");
    }

    res.render("tip", { user: data });

  } catch (err) {
    console.error(err);
    res.send("Server error");
  }
});


// ===================

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
