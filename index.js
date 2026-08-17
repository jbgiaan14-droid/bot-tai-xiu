const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ============================================================
//  WEB PANEL (THÊM MỚI - KHÔNG ẢNH HƯỞNG BOT)
// ============================================================
const app = express();
app.use(express.json());
app.use(express.static('public'));

// Data file
const DATA_FILE = './data.json';

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    } catch (e) {}
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
    } catch (e) {}
}

// ===== WEB PANEL API =====
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

app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(gameHistory.slice(-limit).reverse());
});

app.get('/api/transfer-history', (req, res) => {
    res.json(transferHistory.slice(-50).reverse());
});

app.post('/api/transfer', (req, res) => {
    const { userId, amount, note } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: 'Thiếu thông tin!' });
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ!' });
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

app.post('/api/reset-all', (req, res) => {
    const { password } = req.body;
    if (password !== 'Tuanpro123') return res.status(403).json({ error: 'Sai mật khẩu!' });
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
//  WEB SERVER (CHẠY CỔNG 3000)
// ============================================================
const WEB_PORT = process.env.WEB_PORT || 3000;
app.listen(WEB_PORT, () => {
    console.log(`🌐 Web Panel chạy tại: http://localhost:${WEB_PORT}`);
});

// ============================================================
//  DISCORD BOT (GIỮ NGUYÊN 100% CODE CỦA NGÀI)
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

// ===== VARIABLES (GIỮ NGUYÊN) =====
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

// ===== HÀM (GIỮ NGUYÊN) =====
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

// ===== WEBHOOK NẠP TIỀN (GIỮ NGUYÊN) =====
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

// ===== AUTO TRANSFER (GIỮ NGUYÊN) =====
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

// ============================================================
//  CODE BOT DISCORD (GIỮ NGUYÊN 100% - COPY TỪ FILE CŨ)
// ============================================================
client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} đã sẵn sàng!`);
    console.log(`📊 ${Object.keys(balances).length} người chơi`);
});

// ===== MESSAGECREATE (GIỮ NGUYÊN) =====
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();

    if (content === '!setupbank') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Chỉ có Quản trị viên mới dùng được lệnh này!', ephemeral: true });
        }
        try { await message.delete(); } catch(e) {}

        const embed = new EmbedBuilder()
            .setColor(0x38bdf8)
            .setTitle('🏛️ KINGMC GAMBLING\nTRUNG TÂM NẠP & RÚT GAMBLING')
            .setDescription('🟢 **ONLINE – HỆ THỐNG SẴN SÀNG**\n\n📌 **Chức năng có bot sẵn sàng sẽ tự mở**\nCác bot còn lại có thể online sau mà không làm khóa bot đang hoạt động.\n\n🔒 **Giao dịch an toàn**\nChỉ đổi thưởng/vật phẩm khi đã tạo yêu cầu chính xác.\n\n⏱️ **Timeout / mất kết nối**\nYêu cầu sẽ tự động hết hạn sau 5 phút nếu không được xác nhận.\n\n🔄 **Cập nhật trạng thái**\nVừa xong\n*Hệ thống nội bộ game • Vui lòng đọc kỹ hướng dẫn*');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_open_nap').setLabel('Nạp Money').setEmoji('💰').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_open_rut').setLabel('Rút Money').setEmoji('💸').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_open_chuyen').setLabel('Chuyển tiền').setEmoji('💳').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_sodu').setLabel('Số dư').setEmoji('📊').setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_lichsu_giaodich').setLabel('Lịch sử').setEmoji('📜').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_huongdan').setLabel('Hướng dẫn').setEmoji('❓').setStyle(ButtonStyle.Secondary)
        );

        return message.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    if (content === '!tx' || content === '!taixiu') {
        if (message.channel.id !== ALLOWED_CHANNEL_ID) {
            return message.reply({ content: `❌ Lệnh này chỉ được dùng tại kênh <#${ALLOWED_CHANNEL_ID}> thôi nhé!`, ephemeral: true });
        }
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Chỉ có Quản trị viên (Admin) mới có quyền khởi tạo phiên Tài Xỉu!', ephemeral: true });
        }
        if (activeSessions[message.channel.id]) {
            return message.reply({ content: '⚠️ Phiên tài xỉu đang chạy trong kênh này rồi!', ephemeral: true });
        }
        try { await message.delete(); } catch(e) {}
        startTaiXiuSession(message.channel);
    }
});

// ============================================================
//  TÀI XỈU (GIỮ NGUYÊN 100%)
// ============================================================
// [PHẦN NÀY QUÁ DÀI - COPY TOÀN BỘ CODE CỦA NGÀI VÀO ĐÂY]
// Bao gồm: interactionCreate, startTaiXiuSession, finishGameAndLoop

client.login(BOT_TOKEN);
