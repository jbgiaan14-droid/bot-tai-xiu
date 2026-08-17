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

// ============================================================
//  WEB PANEL API
// ============================================================
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
//  WEB SERVER
// ============================================================
const WEB_PORT = process.env.WEB_PORT || 3000;
app.listen(WEB_PORT, () => {
    console.log(`🌐 Web Panel chạy tại: http://localhost:${WEB_PORT}`);
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

// Load
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

// ===== WEBHOOK =====
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

// ============================================================
//  DISCORD BOT - MESSAGECREATE
// ============================================================
client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} đã sẵn sàng!`);
    console.log(`📊 ${Object.keys(balances).length} người chơi`);
});

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
            .setDescription('🟢 **ONLINE – HỆ THỐNG SẴN SÀNG**\n\n📌 **Chức năng có bot sẵn sàng sẽ tự mở**\n\n🔒 **Giao dịch an toàn**\n⏱️ **Timeout / mất kết nối**\n🔄 **Cập nhật trạng thái**\n*Hệ thống nội bộ game • Vui lòng đọc kỹ hướng dẫn*');

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
//  INTERACTION CREATE - TÀI XỈU
// ============================================================
client.on('interactionCreate', async (i) => {
    const session = activeSessions[i.channelId];

    if (i.isButton()) {
        if (i.customId === 'btn_open_nap') {
            const modal = new ModalBuilder().setCustomId('modal_nap').setTitle('NẠP GAMBLING');
            const ignInput = new TextInputBuilder()
                .setCustomId('nap_ign')
                .setLabel('In-Game Name (IGN)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nhập tên nhân vật của bạn')
                .setRequired(true);
            const amountInput = new TextInputBuilder()
                .setCustomId('nap_amount')
                .setLabel('Số tiền (hỗ trợ M, B) - TỐI THIỂU 1M')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ví dụ: 1M, 2M, 5M')
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(ignInput), new ActionRowBuilder().addComponents(amountInput));
            return await i.showModal(modal);
        }

        if (i.customId === 'btn_open_rut') {
            const modal = new ModalBuilder().setCustomId('modal_rut').setTitle('RÚT GAMBLING');
            const ignInput = new TextInputBuilder()
                .setCustomId('rut_ign')
                .setLabel('In-Game Name (IGN) nhận tiền')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nhập tên nhân vật của bạn')
                .setRequired(true);
            const amountInput = new TextInputBuilder()
                .setCustomId('rut_amount')
                .setLabel('Số tiền (hỗ trợ M, B) - TỐI THIỂU 1M')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ví dụ: 1M, 2M, 5M')
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(ignInput), new ActionRowBuilder().addComponents(amountInput));
            return await i.showModal(modal);
        }

        if (i.customId === 'btn_open_chuyen') {
            const modal = new ModalBuilder().setCustomId('modal_chuyen').setTitle('CHUYỂN TIỀN GAMBLING');
            const targetInput = new TextInputBuilder()
                .setCustomId('chuyen_target')
                .setLabel('Discord ID người nhận')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nhập Discord ID (ví dụ: 1234567890)')
                .setRequired(true);
            const amountInput = new TextInputBuilder()
                .setCustomId('chuyen_amount')
                .setLabel('Số tiền (hỗ trợ M, B)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ví dụ: 1M, 500K')
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(targetInput), new ActionRowBuilder().addComponents(amountInput));
            return await i.showModal(modal);
        }

        if (i.customId === 'btn_sodu') {
            const bal = getBalance(i.user.id);
            return i.reply({ content: `📊 Số dư hiện tại của bạn: **${formatMoneyFull(bal)}**`, ephemeral: true });
        }

        if (i.customId === 'btn_lichsu_giaodich') {
            return i.reply({ content: `📜 Bạn chưa có giao dịch nạp/rút nào gần đây.`, ephemeral: true });
        }

        if (i.customId === 'btn_huongdan') {
            const embed = new EmbedBuilder()
                .setColor(0xfacc15)
                .setTitle('📖 HƯỚNG DẪN HỆ THỐNG NỘI BỘ')
                .setDescription('• **Nạp Gambling**: Gửi yêu cầu nạp điểm vào ví.\n• **Rút Gambling**: Rút tiền từ ví về nhân vật trong game.\n• **Chuyển tiền**: Tặng Gambling trực tiếp cho người chơi khác qua Discord ID.\n• **Tài Xỉu**: Giải trí tại kênh `#gambling🎲`.');
            return i.reply({ embeds: [embed], ephemeral: true });
        }

        if (i.customId.startsWith('approve_rut_')) {
            if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return i.reply({ content: '❌ Bạn không có quyền duyệt lệnh này!', ephemeral: true });
            }
            const targetUserId = i.customId.replace('approve_rut_', '');
            await i.update({ content: `✅ **ĐÃ DUYỆT** lệnh rút cho <@${targetUserId}> bởi Admin <@${i.user.id}>.`, components: [] });
            return;
        }

        if (i.customId.startsWith('reject_rut_')) {
            if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return i.reply({ content: '❌ Bạn không có quyền từ chối lệnh này!', ephemeral: true });
            }
            const targetUserId = i.customId.replace('reject_rut_', '');
            await i.update({ content: `❌ **ĐÃ TỪ CHỐI** lệnh rút của <@${targetUserId}> bởi Admin <@${i.user.id}>.`, components: [] });
            return;
        }
    }

    if (i.isModalSubmit()) {
        if (i.customId === 'modal_nap') {
            const ign = i.fields.getTextInputValue('nap_ign').trim();
            const rawAmount = i.fields.getTextInputValue('nap_amount');
            const formattedAmount = rawAmount.toUpperCase().endsWith('M' ) || rawAmount.toUpperCase().endsWith('B' ) || rawAmount.toUpperCase().endsWith('K' ) ? rawAmount.toUpperCase() : rawAmount.toUpperCase() + 'M';
            
            ignToDiscordMap[ign.toLowerCase()] = i.user.id;

            const embedDM = new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle('📥 Yêu cầu nạp Gambling')
                .setDescription(`👤 **IGN xác nhận:** \`${ign}\`\n💰 **Số tiền:** \`${formattedAmount} Gambling\`\n⏰ **Hạn chót:** 5 phút tới\n\n📝 **Hướng dẫn:**\nChuyển đúng số Money bằng lệnh trong game:\n\`/pay ${PAY_BOT_NAME} ${rawAmount.toLowerCase()}\`\n\n📌 **Lưu ý:**\n• Hệ thống tự cộng tiền tự động ngay khi pay!`);
            
            let dmMessage;
            try {
                dmMessage = await i.user.send({ embeds: [embedDM] });
            } catch (err) {
                return await i.reply({ content: '❌ Không thể gửi tin nhắn (DM) cho bạn! Vui lòng mở khóa tin nhắn riêng rồi thử lại.', ephemeral: true });
            }

            const depositKey = `${i.user.id}_${Date.now()}`;
            pendingDeposits[depositKey] = setTimeout(async () => {
                delete pendingDeposits[depositKey];
                try {
                    const expiredEmbed = new EmbedBuilder()
                        .setColor(0xef4444)
                        .setTitle('⏰ Yêu cầu nạp đã hết hạn')
                        .setDescription(`Yêu cầu nạp **${formattedAmount} Gambling** của bạn đã hết hạn.\n\n👤 **IGN:** \`${ign}\`\n💰 **Số tiền:** \`${formattedAmount} Gambling\`\n\nVui lòng tạo yêu cầu mới nếu muốn nạp tiếp.`);
                    
                    await dmMessage.edit({ embeds: [expiredEmbed] });
                } catch (e) {}
            }, 5 * 60 * 1000);

            return await i.reply({ content: `✅ Đã tạo đơn nạp! Hãy kiểm tra tin nhắn (DM) riêng của bot để lấy cú pháp pay nhé.`, ephemeral: true });
        }

        if (i.customId === 'modal_rut') {
            const ign = i.fields.getTextInputValue('rut_ign');
            const rawAmount = i.fields.getTextInputValue('rut_amount');
            let amount = parseMoney(rawAmount, i.user.id);

            if (isNaN(amount) || amount < 1_000_000) {
                return i.reply({ content: '❌ Số tiền rút không hợp lệ hoặc thấp hơn mức tối thiểu 1M!', ephemeral: true });
            }
            if (getBalance(i.user.id) < amount) {
                return i.reply({ content: `❌ Số dư không đủ! Số dư hiện tại: ${formatMoneyFull(getBalance(i.user.id))}`, ephemeral: true });
            }

            balances[i.user.id] -= amount;

            const embedAdmin = new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('💸 YÊU CẦU RÚT GAMBLING MỚI')
                .setDescription(`👤 **Thành viên:** <@${i.user.id}>\n🎮 **IGN Nhận tiền:** \`${ign}\`\n💰 **Số lượng rút:** **${formatMoneyFull(amount)}**`)
                .setTimestamp();

            const rowAdmin = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_rut_${i.user.id}`).setLabel('Duyệt').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_rut_${i.user.id}`).setLabel('Từ chối (Hoàn tiền)').setStyle(ButtonStyle.Danger)
            );

            await i.channel.send({ content: `🔔 Có yêu cầu rút tiền mới cần xử lý!`, embeds: [embedAdmin], components: [rowAdmin] }).catch(() => {});

            return await i.reply({ content: `✅ Đã tạo yêu cầu rút **${formatMoneyFull(amount)}** về nhân vật **${ign}** thành công!`, ephemeral: true });
        }

        if (i.customId === 'modal_chuyen') {
            let targetInput = i.fields.getTextInputValue('chuyen_target').replace(/[<@!>]/g, '').trim();
            const rawAmount = i.fields.getTextInputValue('chuyen_amount');
            let amount = parseMoney(rawAmount, i.user.id);

            if (isNaN(amount) || amount <= 0) {
                return i.reply({ content: '❌ Số tiền chuyển không hợp lệ!', ephemeral: true });
            }
            if (getBalance(i.user.id) < amount) {
                return i.reply({ content: `❌ Số dư của bạn không đủ để chuyển!`, ephemeral: true });
            }
            if (targetInput === i.user.id) {
                return i.reply({ content: `❌ Bạn không thể tự chuyển tiền cho chính mình!`, ephemeral: true });
            }

            balances[i.user.id] -= amount;
            balances[targetInput] = (balances[targetInput] || 100000000) + amount;
            saveData();

            return await i.reply({ content: `✅ Đã chuyển thành công **${formatMoneyFull(amount)}** cho thành viên <@${targetInput}>!`, ephemeral: true });
        }
    }

    if (i.isButton() && (i.customId === 'bet_tai' || i.customId === 'bet_xiu')) {
        if (!session) return i.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });
        if (session.timeLeft <= 5) return i.reply({ content: '❌ Đã khóa cược!', ephemeral: true });
        if (session.userBets[i.user.id]) return i.reply({ content: '❌ Bạn đã đặt cược ở phiên này rồi!', ephemeral: true });

        const side = i.customId === 'bet_tai' ? 'tai' : 'xiu';
        const modal = new ModalBuilder()
            .setCustomId(`modal_bet_${side}`)
            .setTitle(`ĐẶT CƯỢC CỬA ${side.toUpperCase()}`);

        const amountInput = new TextInputBuilder()
            .setCustomId('amount_input')
            .setLabel('Nhập số tiền muốn cược:')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('VD: 1m, 20m, 10b, 500k')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        return await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId.startsWith('modal_bet_')) {
        if (!session) return i.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });

        const side = i.customId.replace('modal_bet_', '');
        const rawAmount = i.fields.getTextInputValue('amount_input').trim();
        let amount = parseMoney(rawAmount, i.user.id);

        if (isNaN(amount) || amount < 5000) {
            return i.reply({ content: '❌ Vui lòng nhập số tiền hợp lệ (tối thiểu 5,000 Gambling)!', ephemeral: true });
        }
        if (getBalance(i.user.id) < amount) {
            return i.reply({ content: `❌ Bạn không đủ tiền! Số dư hiện tại: ${formatMoneyFull(getBalance(i.user.id))}`, ephemeral: true });
        }
        if (session.userBets[i.user.id]) {
            return i.reply({ content: '❌ Bạn đã đặt cược rồi!', ephemeral: true });
        }

        balances[i.user.id] -= amount;
        session.userBets[i.user.id] = { side: side, amount: amount };
        session.bets[side].amount += amount;
        session.bets[side].users.add(i.user.id);
        saveData();

        await i.reply({ content: `✅ Đã đặt thành công **${formatMoneyFull(amount)}** vào cửa **${side.toUpperCase()}**!`, ephemeral: true });
        
        try {
            await session.gameMessage.edit({ embeds: [session.getEmbed(false)], components: session.getComponents(false) });
        } catch (e) {}
        return;
    }

    if (i.isButton()) {
        if (i.customId === 'btn_sodu') {
            const bal = getBalance(i.user.id);
            return i.reply({ content: `💰 Số dư hiện tại trong ví: **${formatMoneyFull(bal)}**`, ephemeral: true });
        }
        if (i.customId === 'btn_lichsu') {
            if (gameHistory.length === 0) return i.reply({ content: '📜 Chưa có lịch sử ván đấu!', ephemeral: true });
            let historyStr = gameHistory.slice(-10).reverse().map((res, idx) => {
                return `Ván ${gameHistory.length - idx}: **${res.dice1}-${res.dice2}-${res.dice3}** (Tổng: **${res.total}** -> **${res.side === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}**)`;
            }).join('\n');
            const historyEmbed = new EmbedBuilder().setColor(0x38bdf8).setTitle('📜 10 Ván Gần Nhất').setDescription(historyStr);
            return i.reply({ embeds: [historyEmbed], ephemeral: true });
        }
        if (i.customId === 'btn_bxh') {
            const sortedUsers = Object.entries(balances).sort((a, b) => b[1] - a[1]).slice(0, 10);
            let desc = sortedUsers.length === 0 ? 'Chưa có dữ liệu!' : '';
            sortedUsers.forEach(([uid, money], index) => {
                let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**#${index + 1}**`;
                desc += `${medal} <@${uid}> - **${formatMoneyFull(money)}**\n`;
            });
            const bxhEmbed = new EmbedBuilder().setColor(0xfacc15).setTitle('🏆 BXH Đại Gia').setDescription(desc);
            return i.reply({ embeds: [bxhEmbed], ephemeral: true });
        }
    }
});

// ============================================================
//  START TÀI XỈU
// ============================================================
async function startTaiXiuSession(channel, previousMsg = null) {
    if (previousMsg) {
        try { await previousMsg.delete(); } catch(e) {}
    }

    if (activeSessions[channel.id]) {
        if (activeSessions[channel.id].timer) clearInterval(activeSessions[channel.id].timer);
    }

    const sessionData = {
        timeLeft: 60,
        bets: { tai: { amount: 0, users: new Set() }, xiu: { amount: 0, users: new Set() } },
        userBets: {},
        getEmbed(isLocked = false) {
            const totalBetAmount = this.bets.tai.amount + this.bets.xiu.amount;
            return new EmbedBuilder()
                .setColor(isLocked ? 0xef4444 : 0xf59e0b)
                .setTitle('🎲 TÀI XỈU KINGMC')
                .setDescription(`⏱️ **Thời gian còn lại:** ${isLocked ? '🔒 Đã khóa cược!' : `${this.timeLeft}s`}\n\nChọn cửa đặt cược trước khi thời gian hết.\n\n💵 Giới hạn: **500k - 100m Gambling**\n💰 Tổng cược: **${formatMoneyFull(totalBetAmount)}**`)
                .addFields(
                    { name: '🔴 TÀI', value: `💰 ${formatMoneyFull(this.bets.tai.amount)}\n👥 ${this.bets.tai.users.size} người chơi`, inline: true },
                    { name: '🔵 XỈU', value: `💰 ${formatMoneyFull(this.bets.xiu.amount)}\n👥 ${this.bets.xiu.users.size} người chơi`, inline: true }
                )
                .setFooter({ text: `Tài/Xỉu x1.9 • Chơi có trách nhiệm` })
                .setTimestamp();
        },
        getComponents(isLocked = false) {
            return [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bet_tai').setLabel('Tài').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(isLocked),
                    new ButtonBuilder().setCustomId('bet_xiu').setLabel('Xỉu').setEmoji('🔵').setStyle(ButtonStyle.Primary).setDisabled(isLocked),
                    new ButtonBuilder().setCustomId('btn_sodu').setLabel('Số Dư').setEmoji('📊').setStyle(ButtonStyle.Secondary)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_lichsu').setLabel('Lịch Sử').setEmoji('📈').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('btn_bxh').setLabel('BXH').setEmoji('🏆').setStyle(ButtonStyle.Success)
                )
            ];
        }
    };

    activeSessions[channel.id] = sessionData;
    sessionData.gameMessage = await channel.send({ embeds: [sessionData.getEmbed()], components: sessionData.getComponents() });

    const timer = setInterval(async () => {
        if (!activeSessions[channel.id] || activeSessions[channel.id] !== sessionData) {
            clearInterval(timer);
            return;
        }

        sessionData.timeLeft--;
        if (sessionData.timeLeft <= 0) {
            clearInterval(timer);
            delete activeSessions[channel.id]; 
            await finishGameAndLoop(channel, sessionData.gameMessage, sessionData.bets, sessionData.userBets);
        } else {
            try {
                await sessionData.gameMessage.edit({ 
                    embeds: [sessionData.getEmbed(sessionData.timeLeft <= 5)], 
                    components: sessionData.getComponents(sessionData.timeLeft <= 5) 
                });
            } catch (e) {}
        }
    }, 1000);

    sessionData.timer = timer;
}

// ============================================================
//  FINISH GAME
// ============================================================
async function finishGameAndLoop(channel, gameMessage, bets, userBets) {
    try {
        totalGameCount++;
        const currentSessionId = totalGameCount;

        const rollingMsg = await channel.send('🎲 **ĐANG LẮC ĐỢI KẾT QUẢ...**\nhttps://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMWk3MGs0bmFzazI3djR5aG0yZXBvZmxpZXR4YnlyNndmYmlwYXlpayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l4hLA4ALhP0eD1ZGo/giphy.gif');
        try { await gameMessage.delete(); } catch(e) {}

        setTimeout(async () => {
            let winSide;
            const totalTai = bets.tai.amount;
            const totalXiu = bets.xiu.amount;

            let highStakesSide = null;
            if (totalTai >= 200000000 && totalXiu < 200000000) {
                highStakesSide = 'tai';
            } else if (totalXiu >= 200000000 && totalTai < 200000000) {
                highStakesSide = 'xiu';
            } else if (totalTai >= 200000000 && totalXiu >= 200000000) {
                highStakesSide = totalTai >= totalXiu ? 'tai' : 'xiu';
            }

            let forcedWinSide = null;
            for (const uid in userBets) {
                let streak = userLoseStreaks[uid] || 0;
                if (streak >= 6 && streak <= 9 && Math.random() < 0.85) {
                    forcedWinSide = userBets[uid].side; 
                    break; 
                }
            }

            if (forcedWinSide) {
                winSide = forcedWinSide;
            } else if (highStakesSide) {
                const isGai = Math.random() < 0.85;
                if (isGai) {
                    winSide = highStakesSide === 'tai' ? 'xiu' : 'tai';
                } else {
                    winSide = highStakesSide;
                }
            } else if (totalTai !== totalXiu) {
                const minoritySide = totalTai < totalXiu ? 'tai' : 'xiu';
                const majoritySide = totalTai > totalXiu ? 'tai' : 'xiu';
                const isMinorityWin = Math.random() < 0.60; 
                winSide = isMinorityWin ? minoritySide : majoritySide;
            } else {
                winSide = Math.random() < 0.5 ? 'tai' : 'xiu';
            }

            let d1, d2, d3, total;
            do {
                d1 = Math.floor(Math.random() * 6) + 1;
                d2 = Math.floor(Math.random() * 6) + 1;
                d3 = Math.floor(Math.random() * 6) + 1;
                total = d1 + d2 + d3;
            } while ((winSide === 'tai' && total < 11) || (winSide === 'xiu' && total >= 11));

            const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            const d1Str = diceEmojis[d1];
            const d2Str = diceEmojis[d2];
            const d3Str = diceEmojis[d3];

            gameHistory.push({ dice1: d1, dice2: d2, dice3: d3, total: total, side: total >= 11 ? 'tai' : 'xiu' });

            const resultText = total >= 11 ? 'TÀI' : 'XỈU';
            let res = `🎲 Kết quả: **${d1Str} ${d2Str} ${d3Str}** (${d1} - ${d2} - ${d3} | Tổng: **${total}** -> **${resultText}**)\n\n`;

            for (const uid in userBets) {
                const betInfo = userBets[uid];
                const isWin = betInfo.side === winSide;
                const userObj = await client.users.fetch(uid).catch(() => null);

                if (isWin) {
                    userLoseStreaks[uid] = 0;
                    if (userBetHistory[uid]) userBetHistory[uid] = [];

                    const totalReceive = Math.floor(betInfo.amount * 1.9); 
                    const profit = totalReceive - betInfo.amount;          

                    balances[uid] += totalReceive;
                    res += `🎉 <@${uid}> thắng **+${formatMoneyFull(totalReceive)}** (Số dư: ${formatMoneyFull(balances[uid])})\n`;

                    if (userObj) {
                        try {
                            const dmText = `🎲 Kết quả phiên #${currentSessionId}: ${d1Str} · ${d2Str} · ${d3Str} = ${total} — ${betInfo.side === 'tai' ? 'Tài' : 'Xỉu'} Thắng\n💵 Lãi **${formatMoneyFull(profit)}** · Nhận về **${formatMoneyFull(totalReceive)}**\n💰 Số dư: **${formatMoneyFull(balances[uid])}**`;
                            await userObj.send(dmText);
                        } catch (err) {}
                    }
                } else {
                    userLoseStreaks[uid] = (userLoseStreaks[uid] || 0) + 1;
                    if (!userBetHistory[uid]) userBetHistory[uid] = [];
                    userBetHistory[uid].push(betInfo.amount);

                    let streak = userLoseStreaks[uid];
                    const lossAmount = betInfo.amount;

                    if (balances[uid] < 5000) {
                        balances[uid] = 100000000;
                        res += `🔄 <@${uid}> đã hết tiền và được hệ thống hồi sinh **100m**!\n`;
                        if (userObj) {
                            try {
                                await userObj.send(`🔄 Bạn đã sạch ví! Hệ thống đã tự động cấp lại cho bạn **100m Gambling** để tiếp tục chơi.`);
                            } catch (e) {}
                        }
                    }

                    if (streak === 10) {
                        let totalBet10 = userBetHistory[uid].reduce((a, b) => a + b, 0);
                        let refundAmount = Math.floor(totalBet10 * 0.2);
                        balances[uid] += refundAmount;

                        res += `🛡️ <@${uid}> thua chuỗi 10 ván! Được hoàn trả 20% tổng tiền cược: **+${formatMoneyFull(refundAmount)}** (Số dư: ${formatMoneyFull(balances[uid])})\n`;

                        userLoseStreaks[uid] = 0;
                        userBetHistory[uid] = [];

                        if (userObj) {
                            try {
                                await userObj.send(`🛡️ Bạn đã thua liên tiếp 10 ván trong phiên #${currentSessionId}. Hệ thống hoàn trả 20% tổng cược: **+${formatMoneyFull(refundAmount)}**\n💰 Số dư mới: **${formatMoneyFull(balances[uid])}**`);
                            } catch (err) {}
                        }
                    } else {
                        res += `💀 <@${uid}> thua ván thứ ${streak} **-${formatMoneyFull(lossAmount)}** (Số dư: ${formatMoneyFull(balances[uid])})\n`;

                        if (userObj) {
                            try {
                                const dmText = `🎲 Kết quả phiên #${currentSessionId}: ${d1Str} · ${d2Str} · ${d3Str} = ${total} — ${resultText}\n` +
                                             `💸 Thua **${formatMoneyFull(lossAmount)}**\n` +
                                             `📈 Chuỗi thua hiện tại: **${streak}/10 phiên**.\n` +
                                             `💰 Số dư: **${formatMoneyFull(balances[uid])}**`;
                                await userObj.send(dmText);
                            } catch (err) {}
                        }
                    }
                }
            }

            if (Object.keys(userBets).length === 0) {
                res += `*Phiên này không có ai đặt cược!*`;
            }

            const finalEmbed = new EmbedBuilder()
                .setColor(total >= 11 ? 0xef4444 : 0x3b82f6)
                .setTitle(`🏆 KẾT QUẢ PHIÊN #${currentSessionId}`)
                .setDescription(res + `\n🔄 **Đang tự động mở phiên tiếp theo sau 5 giây...**`)
                .setTimestamp();

            await rollingMsg.edit({ content: null, embeds: [finalEmbed] });

            setTimeout(() => {
                try { rollingMsg.delete(); } catch(e) {}

                if (!activeSessions[channel.id]) {
                    startTaiXiuSession(channel, null);
                }
            }, 5000);

        }, 3000);
    } catch (e) {
        console.log(e);
    }
}

// ============================================================
//  START BOT
// ============================================================
client.login(BOT_TOKEN);
