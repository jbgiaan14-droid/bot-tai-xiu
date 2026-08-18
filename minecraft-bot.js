const mineflayer = require('mineflayer');
const express = require('express');

// ============================================================
//  CONFIG
// ============================================================
const BOT_NAME = 'caythue'; // Tên bot trong Minecraft
const SERVER_IP = 'kingmc.vn'; // IP server Minecraft
const SERVER_PORT = 25565; // Port server (mặc định 25565)

const DISCORD_WEBHOOK_URL = 'http://localhost:3000/webhook/minecraft-pay';
const WITHDRAW_WEBHOOK_PORT= 3001;

// ============================================================
//  TẠO BOT MINECRAFT
// ============================================================
const bot = mineflayer.createBot({
    host: SERVER_IP,
    port: SERVER_PORT,
    username: BOT_NAME,
    version: '1.20.4'
});

bot.on('login', () => {
    console.log(`✅ ${BOT_NAME} đã vào server!`);
});

bot.on('error', (err) => {
    console.log('⚠️ Lỗi bot:', err.message);
});

bot.on('end', () => {
    console.log('🔴 Bot đã thoát! Reconnect sau 5s...');
    setTimeout(() => {
        bot.connect();
    }, 5000);
});

// ============================================================
//  LẮNG NGHE TIN NHẮN TRONG GAME
// ============================================================
bot.on('chat', async (username, message) => {
    if (username === BOT_NAME) return;
    
    console.log(`💬 ${username}: ${message}`);

    // ===== KIỂM TRA LỆNH PAY =====
    const payRegex = new RegExp(`^\\/pay\\s+${BOT_NAME}\\s+(\\d+)$`, 'i');
    const match = message.match(payRegex);

    if (match) {
        const amount = parseInt(match[1]);
        console.log(`💰 Nhận được ${amount} từ ${username}`);

        try {
            const response = await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    amount: amount,
                    timestamp: new Date().toISOString()
                })
            });

            const data = await response.json();
            
            if (data.success) {
                bot.chat(`✅ Đã nhận ${amount} từ ${username}! Cảm ơn bạn!`);
            } else {
                bot.chat(`❌ Lỗi: ${data.message || 'Không tìm thấy người chơi!'}`);
            }
        } catch (err) {
            console.log('⚠️ Lỗi gửi tín hiệu lên Discord:', err.message);
            bot.chat(`❌ Lỗi hệ thống, vui lòng liên hệ Admin!`);
        }
        return;
    }

    // ===== KIỂM TRA LỆNH RÚT TỪ ADMIN =====
    const withdrawRegex = new RegExp(`^\\/withdraw\\s+${BOT_NAME}\\s+(\\S+)\\s+(\\d+)$`, 'i');
    const withdrawMatch = message.match(withdrawRegex);

    if (withdrawMatch) {
        const targetIgn = withdrawMatch[1];
        const amount = parseInt(withdrawMatch[2]);

        console.log(`💸 Rút ${amount} cho ${targetIgn} theo yêu cầu Admin`);
        bot.chat(`/pay ${targetIgn} ${amount}`);
        bot.chat(`✅ Đã chuyển ${amount} cho ${targetIgn}!`);
        return;
    }
});

// ============================================================
//  WEBHOOK NHẬN LỆNH RÚT TỪ DISCORD
// ============================================================
const app = express();
app.use(express.json());

app.post('/webhook/minecraft-withdraw', (req, res) => {
    const { ign, amount, discordId } = req.body;

    if (!ign || !amount) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin!' });
    }

    console.log(`💸 Nhận lệnh rút từ Discord: ${amount} cho ${ign}`);
    bot.chat(`/pay ${ign} ${amount}`);
    
    res.json({ 
        success: true, 
        message: `Đã chuyển ${amount} cho ${ign}` 
    });
});

app.listen(WITHDRAW_WEBHOOK_PORT, () => {
    console.log(`🌐 Minecraft Bot API chạy tại http://localhost:${WITHDRAW_WEBHOOK_PORT}`);
});

console.log(`🤖 Minecraft Bot ${BOT_NAME} đang chạy...`);
