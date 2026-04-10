const express = require("express");
const path = require("path");
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
// Tell the server to serve static files from the 'images' folder
app.use('/images', express.static('images'));

// OR, if the logo is in the root:
app.use('/logo.png', express.static('logo.png'));

// Your existing username route MUST stay BELOW the static lines
app.get('/:username', async (req, res) => {
   // ... your "User not found" logic ...
});


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

async function syncLiveEvents(user) {
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: user.youtube_refresh_token });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  try {
    // 1. GET THE ACTIVE LIVE STREAM
    const broadcastRes = await youtube.liveBroadcasts.list({ mine: true, broadcastStatus: 'active', part: 'snippet' });
    const liveChatId = broadcastRes.data.items[0]?.snippet.liveChatId;

    if (!liveChatId) return; // User is not live

    // 2. CATCH CHAT & SUPERCHATS
    const chatRes = await youtube.liveChatMessages.list({
      liveChatId: liveChatId,
      part: 'snippet,authorDetails'
    });

    const messages = chatRes.data.items;
    messages.forEach(msg => {
       // SUPERCHAT DETECTOR
       if (msg.snippet.type === 'superChatEvent') {
          const amount = msg.snippet.superChatDetails.amountMicros / 1000000;
          triggerAlert(user.obs_token, 'superchat', msg.authorDetails.displayName, amount, msg.snippet.displayMessage);
       }
       
       // CHAT MESSAGE (For chat overlays)
       else if (msg.snippet.type === 'textMessageEvent') {
          io.emit(`chat-${user.obs_token}`, {
            user: msg.authorDetails.displayName,
            text: msg.snippet.displayMessage
          });
       }
    });
  } catch (err) {
    console.error("YouTube Live Sync Error:", err.message);
  }
}

setInterval(async () => {
  const { data: users } = await supabase.from('users').select('*').eq('youtube_connected', true);
  
  users.forEach(user => {
    checkYoutubeSubscribers(user); // Check subs every 2 mins
    
    // Only check chat/superchat if user manually toggles "Live Mode" 
    // or if you check their status once every 5 mins.
    if (user.is_live) {
       syncLiveEvents(user); 
    }
  });
}, 120000);

async function pollYouTubeLive(user) {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: user.youtube_refresh_token });
    const youtube = google.google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        let chatId = user.active_chat_id;

        // 1. If we don't have a Chat ID, find the active broadcast
        if (!chatId) {
            const broadcastRes = await youtube.liveBroadcasts.list({
                mine: true,
                broadcastStatus: 'active',
                part: 'snippet'
            });
            chatId = broadcastRes.data.items[0]?.snippet.liveChatId;
            
            if (chatId) {
                await supabase.from('users').update({ active_chat_id: chatId }).eq('id', user.id);
            } else {
                return; // User is not live, stop here to save quota
            }
        }

        // 2. Fetch new messages
        const chatRes = await youtube.liveChatMessages.list({
            liveChatId: chatId,
            part: 'snippet,authorDetails',
            maxResults: 200
        });

        const messages = chatRes.data.items;
        
        for (const msg of messages) {
            const msgTime = new Date(msg.snippet.publishedAt).getTime();
            const lastCheck = new Date(user.last_chat_timestamp || 0).getTime();

            if (msgTime > lastCheck) {
                // --- DETECT SUPERCHATS ---
                if (msg.snippet.type === 'superChatEvent') {
                    const details = msg.snippet.superChatDetails;
                    io.emit(`alert-${user.obs_token}`, {
                        type: 'superchat',
                        sender: msg.authorDetails.displayName,
                        amount: details.amountDisplayString,
                        message: msg.snippet.displayMessage,
                        tier: details.tier // Useful for different colors in OBS
                    });
                }

                // --- DETECT SUPER STICKERS ---
                if (msg.snippet.type === 'superStickerEvent') {
                    io.emit(`alert-${user.obs_token}`, {
                        type: 'sticker',
                        sender: msg.authorDetails.displayName,
                        amount: msg.snippet.superStickerDetails.amountDisplayString
                    });
                }
            }
        }

        // 3. Update timestamp so we don't repeat alerts
        if (messages.length > 0) {
            const latestTime = messages[messages.length - 1].snippet.publishedAt;
            await supabase.from('users').update({ last_chat_timestamp: latestTime }).eq('id', user.id);
        }

    } catch (err) {
        if (err.message.includes('404')) {
            // Stream ended, clear the Chat ID
            await supabase.from('users').update({ active_chat_id: null }).eq('id', user.id);
        }
        console.error("YT_POLL_ERROR:", err.message);
    }
}

async function pollYouTubeSubs(user) {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: user.youtube_refresh_token });
    const youtube = google.google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        const res = await youtube.subscriptions.list({
            mine: true,
            part: 'snippet',
            maxResults: 1
        });

        const latestSub = res.data.items[0]?.snippet.title;

        if (latestSub && latestSub !== user.last_sub_name) {
            io.emit(`alert-${user.obs_token}`, {
                type: 'subscriber',
                name: latestSub
            });

            await supabase.from('users').update({ last_sub_name: latestSub }).eq('id', user.id);
        }
    } catch (e) { console.error("SUB_POLL_ERROR", e.message); }
}

// High Speed Loop (Chat/SuperChat) - 10 Seconds
setInterval(async () => {
    const { data: users } = await supabase.from('users').select('*').eq('youtube_connected', true);
    if (users) users.forEach(user => pollYouTubeLive(user));
}, 10000);

// Slow Loop (Subscribers) - 2 Minutes
setInterval(async () => {
    const { data: users } = await supabase.from('users').select('*').eq('youtube_connected', true);
    if (users) users.forEach(user => pollYouTubeSubs(user));
}, 120000);

// Add this logic inside your init() function after fetching profile data
function updateSystemStatus(profile) {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");
    const container = document.getElementById("ytStatus");

    if (profile.youtube_connected) {
        // Change to Green/Online
        dot.className = "status-dot dot-online pulse-animation";
        text.className = "status-text text-online";
        text.innerText = "SYSTEM STATUS: [ 🟢 MONITORING LIVE ]";
        container.style.borderColor = "rgba(0, 255, 136, 0.3)";
    } else {
        // Keep Red/Offline
        dot.className = "status-dot dot-offline";
        text.className = "status-text text-offline";
        text.innerText = "SYSTEM STATUS: [ 🔴 YT_OFFLINE ]";
        container.style.borderColor = "rgba(255, 0, 85, 0.3)";
    }
}

// Call this inside your existing init() after you fetch the profile
// Example: if (profile) { ... updateStatusDisplay(profile); }

// ===================
// START SERVER
// ===================
app.listen(PORT, () => {
  console.log(`🚀 Terminal Online: http://localhost:${PORT}`);
});
