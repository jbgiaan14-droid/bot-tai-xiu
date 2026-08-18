const mineflayer = require('mineflayer');
const express = require('express');

// ============================================
// CONFIG
// ============================================
const BOT_NAME = 'caythue';
const SERVER_IP = 'kingmc.vn';
const SERVER_PORT = 25565;
const PASSWORD = 'skibiditoilet';

const DISCORD_WEBHOOK_URL = 'http://localhost:3000/webhook/minecraft-pay';
const WITHDRAW_WEBHOOK_PORT = 3001;

// ============================================
// TẠO BOT MINECRAFT
// ============================================
let bot = null;
let isInGame = false;

function createBot() {
    if (bot) {
        bot.end();
        bot = null;
    }

    bot = mineflayer.createBot({
        host: SERVER_IP,
        port: SERVER_PORT,
        username: BOT_NAME,
        version: '1.20.4',
        auth: 'offline'
    });

    // ===== KHI BOT VÀO SERVER =====
    bot.on('login', () => {
        console.log(`✅ ${BOT_NAME} đã kết nối tới server!`);
        isInGame = false;
        
        // ===== LẦN 1: GÕ /dn skibiditoilet (sau 2s) =====
        setTimeout(() => {
            console.log(`🔐 Lần 1: Đang đăng nhập...`);
            bot.chat(`/dn ${PASSWORD}`);
        }, 2000);
        
        // ===== LẦN 2: GÕ /dn skibiditoilet (sau 12s) =====
        setTimeout(() => {
            console.log(`🔐 Lần 2: Đang đăng nhập lại...`);
            bot.chat(`/dn ${PASSWORD}`);
        }, 12000);
        
        // ===== GÕ /menu (sau 14s - sau lần 2 khoảng 2s) =====
        setTimeout(() => {
            console.log(`📋 Mở menu...`);
            bot.chat('/menu');
        }, 14000);
        
        // ===== CHỌN SLOT 24 (sau 16s) =====
        setTimeout(() => {
            console.log(`🎮 Chọn KingsMP (slot 24)...`);
            // Mở inventory và click slot 24
            bot.clickWindow(24, 0, 0);
        }, 16000);
    });

    // ===== LẮNG NGHE SỰ KIỆN INVENTORY =====
    bot.on('windowOpen', (window) => {
        console.log(`📦 Đã mở inventory: ${window.title}`);
        
        // Nếu là menu chọn cụm server, click vào slot 24
        if (window.title && window.title.includes('Menu')) {
            console.log(`🎮 Click vào slot 24 để chọn KingsMP...`);
            bot.clickWindow(24, 0, 0);
            
            setTimeout(() => {
                bot.closeWindow(window);
                console.log(`✅ Đã đóng inventory!`);
            }, 1000);
        }
    });

    // ===== LẮNG NGHE TIN NHẮN =====
    bot.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString();
        console.log(`📩 ${msg}`);

        // ===== KIỂM TRA ĐÃ VÀO KINGSMP CHƯA =====
        if (msg.includes('KingsMP') || msg.includes('vào KingsMP') || msg.includes('đã vào KingsMP')) {
            console.log(`✅ Đã vào KingsMP! Bot sẵn sàng!`);
            isInGame = true;
        }

        // ===== BỊ KICK =====
        if (msg.includes('đã bị kick') || msg.includes('Bạn đã bị') || msg.includes('disconnect')) {
            console.log(`⚠️ Bot bị kick! Thử lại sau 15s...`);
            setTimeout(() => {
                createBot();
            }, 15000);
        }
    });

    // ===== LẮNG NGHE TIN NHẮN CHAT =====
    bot.on('chat', async (username, message) => {
        if (username === BOT_NAME) return;
        
        console.log(`💬 ${username}: ${message}`);

        // ===== KIỂM TRA LỆNH PAY =====
        const payRegex = new RegExp(`^\\/pay\\s+${BOT_NAME}\\s+(\\d+)$`, 'i');
        const match = message.match(payRegex);

        if (match && isInGame) {
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

        if (withdrawMatch && isInGame) {
            const targetIgn = withdrawMatch[1];
            const amount = parseInt(withdrawMatch[2]);

            console.log(`💸 Rút ${amount} cho ${targetIgn} theo yêu cầu Admin`);
            bot.chat(`/pay ${targetIgn} ${amount}`);
            bot.chat(`✅ Đã chuyển ${amount} cho ${targetIgn}!`);
            return;
        }
    });

    // ===== XỬ LÝ LỖI =====
    bot.on('error', (err) => {
        console.log('⚠️ Lỗi bot:', err.message);
        if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
            console.log('🔄 Server không phản hồi, thử lại sau 15s...');
            setTimeout(() => {
                createBot();
            }, 15000);
        }
    });

    // ===== BOT BỊ NGẮT KẾT NỐI =====
    bot.on('end', () => {
        console.log('🔴 Bot đã ngắt kết nối! Thử lại sau 10s...');
        isInGame = false;
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

        if (!isInGame) {
            return res.status(400).json({ success: false, message: 'Bot chưa vào game!' });
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

// ============================================
// GIỮ BOT CHẠY LIÊN TỤC
// ============================================
process.on('uncaughtException', (err) => {
    console.log('⚠️ Lỗi không mong muốn:', err.message);
    setTimeout(() => {
        createBot();
    }, 10000);
});
