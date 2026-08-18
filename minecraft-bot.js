const mineflayer = require('mineflayer');
const express = require('express');

// ============================================
// CONFIG
// ============================================
const BOT_NAME = 'caythue';
const SERVER_IP = 'kingmc.vn';
const SERVER_PORT = 25565;
const PASSWORD = 'skibiditoilet'; // Mật khẩu đăng nhập

const DISCORD_WEBHOOK_URL = 'http://localhost:3000/webhook/minecraft-pay';
const WITHDRAW_WEBHOOK_PORT = 3001;

// ============================================
// TẠO BOT MINECRAFT
// ============================================
let bot = null;
let isLoggedIn = false;

function createBot() {
    bot = mineflayer.createBot({
        host: SERVER_IP,
        port: SERVER_PORT,
        username: BOT_NAME,
        version: '1.20.4'
    });

    // ===== KHI BOT VÀO SERVER =====
    bot.on('login', () => {
        console.log(`✅ ${BOT_NAME} đã kết nối tới server!`);
        isLoggedIn = false;
    });

    // ===== LẮNG NGHE TIN NHẮN ĐỂ ĐĂNG NHẬP =====
    bot.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString();
        console.log(`📩 ${msg}`);

        // ===== ĐĂNG NHẬP VÀO LOBBY =====
        if (msg.includes('/login') || msg.includes('đăng nhập') || msg.includes('Đăng nhập')) {
            console.log(`🔐 Đang đăng nhập vào lobby...`);
            bot.chat(`/dn ${PASSWORD}`);
            isLoggedIn = true;
            
            // ===== CHỜ 10 GIÂY RỒI MỞ MENU =====
            setTimeout(() => {
                console.log(`📋 Đang mở menu...`);
                bot.chat('/menu');
                
                // ===== CHỌN SLOT 24 (KINGSMP) =====
                setTimeout(() => {
                    console.log(`🎮 Đang chọn KingsMP (slot 24)...`);
                    // Cách 1: Dùng lệnh click slot (nếu server hỗ trợ)
                    bot.chat('/select 24');
                    // Hoặc click vào slot 24 trong inventory
                    // bot.clickWindow(24, 0, 0);
                }, 2000);
            }, 10000);
        }

        // ===== KIỂM TRA ĐÃ VÀO KINGSMP CHƯA =====
        if (msg.includes('KingsMP') || msg.includes('Đã vào')) {
            console.log(`✅ Đã vào KingsMP! Bot sẵn sàng!`);
        }
    });

    // ===== LẮNG NGHE TIN NHẮN CHAT =====
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

    bot.on('error', (err) => {
        console.log('⚠️ Lỗi bot:', err.message);
    });

    bot.on('end', () => {
        console.log('🔴 Bot đã thoát! Thử kết nối lại sau 10s...');
        isLoggedIn = false;
        setTimeout(() => {
            createBot();
        }, 10000);
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
