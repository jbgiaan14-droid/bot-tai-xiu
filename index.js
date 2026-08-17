const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ============================================================
//  DATA FILE
// ============================================================
const DATA_FILE = './data.json';

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    } catch (e) { console.log('⚠️ Lỗi load data:', e.message); }
    return { 
        balances: {}, 
        gameHistory: [], 
        transferHistory: [],
        totalGameCount: 891193,
        winRate: 60,
        gaiRate: 85,
        autoTransfer: { enabled: false, interval: 0, amount: 1000000, userId: null, lastRun: null }
    };
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            balances: balances,
            gameHistory: gameHistory.slice(-200),
            transferHistory: transferHistory.slice(-100),
            totalGameCount: totalGameCount,
            winRate: WIN_RATE,
            gaiRate: GAI_RATE,
            autoTransfer: autoTransfer
        }, null, 2));
    } catch (e) { console.log('⚠️ Lỗi save data:', e.message); }
}

// ============================================================
//  WEB PANEL API
// ============================================================

// Dashboard
app.get('/api/dashboard', (req, res) => {
    const totalPlayers = Object.keys(balances).length;
    const totalMoney = Object.values(balances).reduce((a, b) => a + b, 0);
    res.json({
        totalPlayers,
        totalMoney,
        totalGameCount,
        winRate: WIN_RATE,
        gaiRate: GAI_RATE,
        recentHistory: gameHistory.slice(-5)
    });
});

// Danh sách người chơi
app.get('/api/players', async (req, res) => {
    const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]);
    const result = [];
    for (const [id, bal] of sorted) {
        let username = 'Unknown';
        let ign = 'Chưa liên kết';
        try {
            const user = await client.users.fetch(id).catch(() => null);
            if (user) username = user.username;
        } catch (e) {}
        for (const [ignKey, discordId] of Object.entries(ignToDiscordMap)) {
            if (discordId === id) { ign = ignKey; break; }
        }
        result.push({
            discordId: id,
            username: username,
            ign: ign,
            balance: bal,
            formatted: formatMoneyFull(bal),
            loseStreak: userLoseStreaks[id] || 0
        });
    }
    res.json(result);
});

// Lịch sử phiên
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(gameHistory.slice(-limit).reverse());
});

// Lịch sử chuyển tiền
app.get('/api/transfer-history', (req, res) => {
    res.json(transferHistory.slice(-50).reverse());
});

// Chuyển tiền (Admin)
app.post('/api/transfer', (req, res) => {
    const { userId, amount, note } = req.body;
    if (!userId || !amount) {
        return res.status(400).json({ error: 'Thiếu thông tin!' });
    }
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'Số tiền không hợp lệ!' });
    }
    balances[userId] = (balances[userId] || 100000000) + numAmount;
    transferHistory.push({
        to: userId,
        amount: numAmount,
        note: note || 'Admin chuyển',
        time: new Date().toISOString(),
        from: 'Admin'
    });
    saveData();
    res.json({ success: true, newBalance: balances[userId], formatted: formatMoneyFull(balances[userId]) });
});

// Auto Transfer
app.post('/api/auto-transfer', (req, res) => {
    const { enabled, interval, amount, userId } = req.body;
    autoTransfer.enabled = enabled;
    autoTransfer.interval = parseInt(interval) || 0;
    autoTransfer.amount = parseInt(amount) || 1000000;
    autoTransfer.userId = userId;
    autoTransfer.lastRun = new Date().toISOString();
    saveData();
    res.json({ success: true, autoTransfer });
});

// Cập nhật tỉ lệ
app.post('/api/settings', (req, res) => {
    const { winRate, gaiRate } = req.body;
    if (winRate !== undefined) {
        const val = parseInt(winRate);
        if (val >= 1 && val <= 100) WIN_RATE = val;
    }
    if (gaiRate !== undefined) {
        const val = parseInt(gaiRate);
        if (val >= 1 && val <= 100) GAI_RATE = val;
    }
    saveData();
    res.json({ success: true, winRate: WIN_RATE, gaiRate: GAI_RATE });
});

// Reset streak
app.post('/api/reset-streak', (req, res) => {
    const { userId } = req.body;
    if (userId) {
        userLoseStreaks[userId] = 0;
        userBetHistory[userId] = [];
        res.json({ success: true });
    } else {
        userLoseStreaks = {};
        userBetHistory = {};
        res.json({ success: true });
    }
});

// Reset all
app.post('/api/reset-all', (req, res) => {
    const { password } = req.body;
    if (password !== 'Tuanpro123') {
        return res.status(403).json({ error: 'Sai mật khẩu!' });
    }
    balances = {};
    gameHistory = [];
    totalGameCount = 891193;
    userLoseStreaks = {};
    userBetHistory = {};
    transferHistory = [];
    saveData();
    res.json({ success: true });
});

// ============================================================
//  WEB SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web Panel chạy tại: http://localhost:${PORT}`);
});

// ============================================================
//  DISCORD BOT
// ============================================================
const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages
    ] 
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_CHANNEL_ID = '1538197175731748894';
const PAY_BOT_NAME = 'giaanday2121';

// ===== VARIABLES =====
let balances = {};
let gameHistory = [];
let activeSessions = {};
let pendingDeposits = {};
let ignToDiscordMap = {};
let userLoseStreaks = {};
let userBetHistory = {};
let transferHistory = [];
let totalGameCount = 891193;
let WIN_RATE = 60;
let GAI_RATE = 85;
let autoTransfer = { enabled: false, interval: 0, amount: 1000000, userId: null, lastRun: null };

// Load dữ liệu
const saved = loadData();
balances = saved.balances || {};
gameHistory = saved.gameHistory || [];
totalGameCount = saved.totalGameCount || 891193;
transferHistory = saved.transferHistory || [];
WIN_RATE = saved.winRate || 60;
GAI_RATE = saved.gaiRate || 85;
autoTransfer = saved.autoTransfer || { enabled: false, interval: 0, amount: 1000000, userId: null, lastRun: null };

function getBalance(userId) { 
    if (!balances[userId]) balances[userId] = 100000000;
    return balances[userId]; 
}

function formatMoneyFull(amount) {
    if (amount >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(2).replace(/\.0$/, '') + 'b Gambling';
    if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm Gambling';
    if (amount >= 1_000) return (amount / 1_000).toFixed(1).replace(/\.0$/, '') + 'k Gambling';
    return amount.toString() + ' Gambling';
}

function parseMoney(input, userId) {
    if (!input) return NaN;
    let str = input.toString().toLowerCase().trim();
    if (str === 'all' || str === 'allin') return getBalance(userId);
    let multiplier = 1;
    if (str.endsWith('k')) { multiplier = 1_000; str = str.slice(0, -1); }
    else if (str.endsWith('m')) { multiplier = 1_000_000; str = str.slice(0, -1); }
    else if (str.endsWith('b')) { multiplier = 1_000_000_000; str = str.slice(0, -1); }
    let num = parseFloat(str);
    return isNaN(num) ? NaN : Math.floor(num * multiplier);
}

// ===== AUTO TRANSFER =====
setInterval(() => {
    if (!autoTransfer.enabled || !autoTransfer.userId) return;
    if (autoTransfer.interval <= 0) return;
    
    const now = Date.now();
    const lastRun = autoTransfer.lastRun ? new Date(autoTransfer.lastRun).getTime() : 0;
    const intervalMs = autoTransfer.interval * 60 * 1000;
    
    if (now - lastRun >= intervalMs) {
        const userId = autoTransfer.userId;
        const amount = autoTransfer.amount || 1000000;
        balances[userId] = (balances[userId] || 100000000) + amount;
        autoTransfer.lastRun = new Date().toISOString();
        transferHistory.push({
            to: userId,
            amount: amount,
            note: '🤖 Auto Transfer',
            time: new Date().toISOString(),
            from: 'Auto'
        });
        saveData();
        console.log(`🤖 Auto transfer: ${formatMoneyFull(amount)} -> ${userId}`);
    }
}, 60000);

// ===== WEBHOOK NẠP TIỀN =====
app.post('/webhook/deposit', async (req, res) => {
    let { discordId, amount, ign } = req.body;
    if (!discordId && ign) {
        const cleanIgn = ign.trim().toLowerCase();
        discordId = ignToDiscordMap[cleanIgn];
    }
    if (!discordId || !amount) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }
    const depositAmount = parseInt(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ' });
    }
    balances[discordId] = (balances[discordId] || 100000000) + depositAmount;
    saveData();
    try {
        const userObj = await client.users.fetch(discordId);
        if (userObj) {
            await userObj.send(`✅ **NẠP TIỀN THÀNH CÔNG!**\n💰 Đã cộng: **${formatMoneyFull(depositAmount)}**\n📊 Số dư mới: **${formatMoneyFull(balances[discordId])}**`);
        }
    } catch (err) {}
    return res.json({ success: true, newBalance: balances[discordId] });
});

// ===== DISCORD BOT EVENTS =====
client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} đã sẵn sàng!`);
    console.log(`📊 ${Object.keys(balances).length} người chơi`);
});

// [PHẦN CÒN LẠI CỦA BOT DISCORD - GIỮ NGUYÊN CODE CỦA NGÀI]
// ... (Tất cả code messageCreate, interactionCreate, startTaiXiuSession, finishGameAndLoop)
// Vì quá dài, tôi sẽ viết tiếp phần Web Panel

client.login(BOT_TOKEN);
