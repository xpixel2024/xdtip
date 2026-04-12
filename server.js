const express = require("express");
const path = require("path");
const axios = require("axios"); // Make sure you ran 'npm install axios'
const { createClient } = require("@supabase/supabase-js");

const app = express();

// 1. DYNAMIC PORT FOR RENDER (CRITICAL)
const PORT = process.env.PORT || 3000;

// 🔥 SUPABASE SETUP
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MIDDLEWARE
app.use(express.json());
// It's good practice to add urlencoded if you ever use standard HTML forms
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, "public")));

// VIEW ENGINE
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===================
// CLEAN .html URL
// ===================
// Redirects /login.html to /login
app.get(/\.html$/, (req, res) => {
  const clean = req.path.replace(".html", "");
  res.redirect(301, clean);
});

// ===================
// STATIC ROUTES
// ===================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public/dashboard.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));
app.get("/refund", (req, res) => res.sendFile(path.join(__dirname, "public/refund.html")));
app.get("/terms", (req, res) => res.sendFile(path.join(__dirname, "public/terms.html")));


// ===================
// SAVE TIP API
// ===================
app.post("/api/tip", async (req, res) => {
    const { username, name, message, amount, payment_id } = req.body;

    try {
        const { error } = await supabase
            .from("tips")
            .insert([
                {
                    username: username,
                    sender_name: name,
                    message: message,
                    amount: parseFloat(amount), // Ensure amount is a number
                    payment_id: payment_id
                }
            ]);

        if (error) throw error;
        res.json({ success: true });

    } catch (err) {
        console.error("Save Tip Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===================
// USERNAME ROUTE (Dynamic Tip Page)
// ===================
app.get("/:username", async (req, res) => {
  try {
    const username = req.params.username;

    // 🚫 Block system routes
    const blocked = ["login", "dashboard", "admin", "api", "index"];
    if (blocked.includes(username.toLowerCase())) {
      return res.redirect("/");
    }

    // ilike makes it case-insensitive (e.g., /xdfunYT and /xdfunyt both work)
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .maybeSingle();

    if (error || !data) {
      console.log(`User [${username}] not found.`);
      return res.status(404).send("User not found");
    }

    res.render("tip", { user: data });

  } catch (err) {
    console.error("Route Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ===================
// OBS ALERT SYSTEM
// ===================
app.get('/alert/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('overlay_theme, username')
            .eq('obs_token', token)
            .single();

        if (error || !user) {
            return res.status(404).send("INVALID OBS TOKEN");
        }

        // Determine which file to send based on theme
        let fileToSend = 'alert.html'; 
        if (user.overlay_theme === 'neon') fileToSend = 'alert_neon.html';
        if (user.overlay_theme === 'minimal') fileToSend = 'alert_minimal.html';
        if (user.overlay_theme === 'vip') fileToSend = 'alert_vip.html';
        if (user.overlay_theme === 'basic') fileToSend = 'alert_basic.html';
        if (user.overlay_theme === 'frost') fileToSend = 'alert_frost.html';

        res.sendFile(path.join(__dirname, 'public', fileToSend));

    } catch (err) {
        console.error("Overlay Error:", err);
        res.status(500).send("SERVER ERROR");
    }
});

// ==========================
// M. TEST ALERT (Supabase Broadcast)
// ==========================
app.post('/test-alert', async (req, res) => {
    const { username, tipper, amount, message } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    const alertData = {
        tipper: tipper || "Test Commander",
        amount: amount || 69,
        message: message || "System uplink successful! 🚀"
    };

    const roomName = `alert-room-${username.toLowerCase()}`;
    const channel = supabase.channel(roomName);
    
    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.send({
                type: 'broadcast',
                event: 'test-tip',
                payload: alertData
            });
            
            // 🔥 FIX: Wait half a second before hanging up so the message actually sends!
            setTimeout(() => {
                supabase.removeChannel(channel);
            }, 500);
        }
    });

    console.log(`📡 Broadcast sent to OBS for ${username}: ${alertData.tipper}`);
    res.json({ success: true, message: "Test Alert Broadcasted!" });
});

// ==========================
// N. REPLAY LAST ALERT (Supabase Broadcast)
// ==========================
app.post('/replay-alert', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        console.error("Replay Error: No username provided by dashboard");
        return res.status(400).json({ error: "Username is required" });
    }

    try {
        console.log(`[Replay] Searching for last tip for user: ${username}`);

        // 1. Fetch the LAST tip safely without using the buggy .single() method
        const { data: lastTipData, error } = await supabase
            .from('tips')
            .select('sender_name, amount, message')
            .ilike('username', username) 
            .order('created_at', { ascending: false }) 
            .limit(1); 

        // 2. Handle specific database errors
        if (error) {
            console.error("[Replay] Supabase Database Error:", error);
            return res.status(500).json({ success: false, message: "Database connection error." });
        }

        // 3. Handle empty database (if you haven't received a real tip yet!)
        if (!lastTipData || lastTipData.length === 0) {
            console.log(`[Replay] No tips found for ${username}`);
            return res.status(404).json({ success: false, message: "No recent tips found in your history." });
        }

        // 4. Extract the exact tip from the array
        const lastTip = lastTipData[0];

        // 5. Prepare Alert Data
        const alertData = {
            tipper: lastTip.sender_name || "Anonymous",
            amount: lastTip.amount,
            message: lastTip.message
        };

        // 6. Broadcast to OBS
        const roomName = `alert-room-${username.toLowerCase()}`;
        const channel = supabase.channel(roomName);

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.send({
                    type: 'broadcast',
                    event: 'test-tip', 
                    payload: alertData
                });
                
                // Wait half a second before hanging up so the message sends
                setTimeout(() => {
                    supabase.removeChannel(channel);
                }, 500);
            }
        });

        console.log(`[Replay] SUCCESS! Replayed tip: ₹${alertData.amount} from ${alertData.tipper}`);
        res.json({ success: true, message: "Last tip replayed successfully!" });

    } catch (err) {
        console.error("[Replay] Critical Server Error:", err);
        res.status(500).json({ success: false, error: "Server Error during replay" });
    }
});

// ==========================
// H. STATS API (Data Fetcher)
// ==========================
app.get('/stats/:token', async (req, res) => {
    const { token } = req.params;
    try {
        // 1. Find the username attached to this OBS token
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('username')
            .eq('obs_token', token)
            .single();

        if (userErr || !user) return res.status(404).json({ error: "User not found" });

        // 2. Fetch Latest 3 Tips (using username, not receiver_id)
        const { data: latest } = await supabase
            .from('tips')
            .select('sender_name, amount')
            .ilike('username', user.username) // Safe case-insensitive match
            .order('created_at', { ascending: false })
            .limit(3);

        // 3. Fetch Top 3 Tips
        const { data: top } = await supabase
            .from('tips')
            .select('sender_name, amount')
            .ilike('username', user.username)
            .order('amount', { ascending: false })
            .limit(3);

        res.json({ top: top || [], latest: latest || [] });
    } catch (err) {
        console.error("Stats API Error:", err);
        res.status(500).json({ error: "Stats failed" });
    }
});

// ==========================
// S. SERVE STATS OVERLAY
// ==========================
app.get('/stats-overlay/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        const { data: user } = await supabase
            .from('users')
            .select('overlay_theme')
            .eq('obs_token', token)
            .single();

        let fileToSend = 'stats.html'; 
        if (user && user.overlay_theme) {
            if (user.overlay_theme === 'neon') fileToSend = 'stats_neon.html';
            if (user.overlay_theme === 'minimal') fileToSend = 'stats_minimal.html';
            if (user.overlay_theme === 'vip') fileToSend = 'stats_vip.html';
            if (user.overlay_theme === 'basic') fileToSend = 'stats_basic.html';
            if (user.overlay_theme === 'frost') fileToSend = 'stats_frost.html';
        }
        
        // FIX: Must include the 'public' folder in the path!
        res.sendFile(path.join(__dirname, 'public', fileToSend));
    } catch (err) {
        console.error("Serve Stats Error:", err);
        res.status(500).send("Error loading stats overlay.");
    }
});

// ==========================
// ADMIN PANEL ROUTES
// ==========================

// 1. Serve the Admin HTML Page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// 2. Secure Admin Data API (Robust Signed URL Version)
app.post('/api/admin/data', async (req, res) => {
    const { email } = req.body;
    const ADMIN_EMAIL = "bkonai00@gmail.com"; 

    const safeInputEmail = (email || "").toLowerCase().trim();
    const safeAdminEmail = ADMIN_EMAIL.toLowerCase().trim();

    if (!safeInputEmail || safeInputEmail !== safeAdminEmail) {
        return res.status(403).json({ error: "Access Denied." });
    }

    try {
        const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        const { data: tips } = await supabase.from('tips').select('*').order('created_at', { ascending: false });

        // 🔥 IMPROVED: Generate Signed URLs
        const usersWithSignedUrls = await Promise.all((users || []).map(async (u) => {
            if (u.pan_url) {
                // Logic: Extract just the filename (e.g., pan_abc123.jpg) 
                // regardless of whether the DB has a full URL or just a name.
                const pathParts = u.pan_url.split('/');
                const fileName = pathParts[pathParts.length - 1];

                const { data: signedData, error: signedError } = await supabase
                    .storage
                    .from('kyc_docs')
                    .createSignedUrl(fileName, 900); 

                if (signedError) {
                    console.error(`Error signing URL for ${fileName}:`, signedError.message);
                    return { ...u, pan_url: null };
                }

                return { ...u, pan_url: signedData.signedUrl };
            }
            return u;
        }));

        res.json({
            success: true,
            totalUsers: users.length,
            totalTips: tips ? tips.length : 0,
            totalRevenue: (tips || []).reduce((sum, tip) => sum + (Number(tip.amount) || 0), 0),
            fraudCount: (tips || []).filter(tip => parseFloat(tip.amount) >= 5000).length,
            users: usersWithSignedUrls,
            tips: tips || [],
            fraudLogs: (tips || []).filter(tip => parseFloat(tip.amount) >= 5000)
        });
    } catch (err) {
        console.error("Admin API Error:", err);
        res.status(500).json({ error: "Server Error" });
    }
});

// 3. KYC Approval Route (Bulletproof Email Check + lowercase 'true')
app.post('/api/admin/approve-kyc', async (req, res) => {
    const { email, targetUsername } = req.body;
    const ADMIN_EMAIL = "bkonai00@gmail.com"; 

    // 🔥 FIX: Force both to lowercase and remove hidden spaces
    const safeInputEmail = (email || "").toLowerCase().trim();
    const safeAdminEmail = ADMIN_EMAIL.toLowerCase().trim();

    if (!safeInputEmail || safeInputEmail !== safeAdminEmail) {
        return res.status(403).json({ error: "Access Denied." });
    }

    try {
        // Explicitly save the lowercase text 'true'
        const { error } = await supabase
            .from('users')
            .update({ kyc: 'true' }) 
            .eq('username', targetUsername);

        if (error) throw error;

        res.json({ success: true, message: `${targetUsername} KYC is now verified!` });
    } catch (err) {
        console.error("KYC Error:", err);
        res.status(500).json({ error: "Failed to approve KYC" });
    }
});

// ==========================
// CASHFREE: CREATE ORDER
// ==========================
app.post('/api/create-cashfree-order', async (req, res) => {
    const { amount, name, message, username } = req.body;

    try {
        const response = await axios.post('https://api.cashfree.com/pg/orders', {
            order_amount: parseFloat(amount).toFixed(2),
            order_currency: "INR",
            order_id: `order_${Date.now()}`,
            customer_details: {
                customer_id: `user_${Date.now()}`,
                customer_name: name,
                customer_phone: "9999999999", // Required by Cashfree
            },
            order_meta: {
                // IMPORTANT: This tells Cashfree where to send the user and data after payment
                return_url: `https://${req.get('host')}/api/cashfree-verify?order_id={order_id}&u=${username}&n=${encodeURIComponent(name)}&m=${encodeURIComponent(message)}`
            }
        }, {
            headers: {
                'x-client-id': process.env.CASHFREE_CLIENT_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
                'x-api-version': '2023-08-01'
            }
        });

        res.json({ payment_session_id: response.data.payment_session_id });
  } catch (error) {
    if (error.response) {
        // This will print the specific error (e.g., "Amount invalid" or "Unauthorized")
        console.error("CASHFREE LIVE ERROR:", error.response.data);
    } else {
        console.error("SERVER ERROR:", error.message);
    }
    res.status(500).json({ error: "Session failed" });
}
});

// ==========================
// CASHFREE: VERIFY & SAVE TO SUPABASE
// ==========================
app.get('/api/cashfree-verify', async (req, res) => {
    const { order_id, u, n, m } = req.query;

    try {
        // 1. Ask Cashfree if the order was actually paid
        const verifyRes = await axios.get(`https://api.cashfree.com/pg/orders/${order_id}`, {
    headers: {
        'x-client-id': process.env.CASHFREE_CLIENT_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01'
    }
});

        if (verifyRes.data.order_status === "PAID") {
            const finalAmount = verifyRes.data.order_amount;

            // 2. Save to Supabase 'tips' table
            await supabase.from("tips").insert([{
                username: u,
                sender_name: n,
                message: m,
                amount: finalAmount,
                payment_id: order_id
            }]);

            // 3. 🔥 THE ALERT BROADCAST (Matches your listener)
            const roomName = `alert-room-${u.toLowerCase()}`;
            const channel = supabase.channel(roomName);
            
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // We send the data exactly how your listener expects it
                    await channel.send({
                        type: 'broadcast',
                        event: 'test-tip', 
                        payload: {
                            tipper: n || "Anonymous",
                            amount: finalAmount,
                            message: m || "Credits Transmitted!"
                        }
                    });
                    
                    // Give it a second to broadcast before closing the channel
                    setTimeout(() => {
                        supabase.removeChannel(channel);
                    }, 1000);
                }
            });

            // 4. Send user to a clean success page
            res.send(`
                <html>
                <body style="background:#03040b; color:#00f3ff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; text-align:center;">
                    <div>
                        <h1 style="text-shadow: 0 0 10px #00f3ff;">✓ UPLINK SUCCESSFUL</h1>
                        <p style="color:#8fa1d0;">Transmission verified and alert triggered.</p>
                        <script>
                            setTimeout(() => { window.location.href = "/${u}"; }, 3000);
                        </script>
                    </div>
                </body>
                </html>
            `);

        } else {
            // Payment failed or cancelled
            res.redirect(`/${u}?error=payment_incomplete`);
        }

    } catch (err) {
        console.error("Verification Error:", err.message);
        res.status(500).send("Verification Protocol Failed.");
    }
});

app.post('/api/update-goal', async (req, res) => {
    const { username, amount, reason } = req.body;

    const { error } = await supabase
        .from('users')
        .update({ 
            goal_amount: parseFloat(amount), 
            goal_reason: reason 
        })
        .eq('username', username);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ===================
// START SERVER
// ===================
app.listen(PORT, () => {
  console.log(`🚀 Terminal Online: http://localhost:${PORT}`);
});
