const mineflayer = require('mineflayer');
const express = require('express');

// ============================================
// CONFIG
// ============================================
const BOT_NAME = 'caythue';
const SERVER_IP = 'kingmc.vn'; // Thay bằng IP server của bạn
const SERVER_PORT = 25565;

const DISCORD_WEBHOOK_URL = 'http://localhost:3000/webhook/minecraft-pay';
const WITHDRAW_WEBHOOK_PORT = 3001;

// ============================================
// TẠO BOT MINECRAFT
// ============================================
let bot = null;

function createBot() {
    bot = mineflayer.createBot({
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
        console.log('🔴 Bot đã thoát! Thử kết nối lại sau 10s...');
        setTimeout(() => {
            createBot(); // Tạo bot mới
        }, 10000);
    });

    // ============================================
    // LẮNG NGHE TIN NHẮN TRONG GAME
    // ============================================
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
                    bot.chat(`✅ Đã nhận ${amount} từ ${username}!`);
                } else {
                    bot.chat(`❌ Lỗi: ${data.message || 'Không tìm thấy người chơi!'}`);
                }
            } catch (err) {
                console.log('⚠️ Lỗi gửi tín hiệu:', err.message);
                bot.chat(`❌ Lỗi hệ thống!`);
            }
            return;
        }
    });

    // ============================================
    // WEBHOOK NHẬN LỆNH RÚT TỪ DISCORD
    // ============================================
    const app = express();
    app.use(express.json());

    app.post('/webhook/minecraft-withdraw', (req, res) => {
        const { ign, amount } = req.body;

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
}

// ============================================
// KHỞI ĐỘNG BOT
// ============================================
console.log(`🤖 Minecraft Bot ${BOT_NAME} đang chạy...`);
createBot();
