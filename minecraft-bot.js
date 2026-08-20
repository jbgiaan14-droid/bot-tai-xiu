const mineflayer = require('mineflayer');
const express = require('express');
const fs = require('fs');

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

function loadIgnMap() {
    try {
        const data = JSON.parse(fs.readFileSync('./data.json', 'utf-8'));
        return data.ignToDiscordMap || {};
    } catch (err) {
        return {};
    }
}

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
        
        // Lần 1: Đăng nhập
        setTimeout(() => {
            console.log(`🔐 Lần 1: Đang đăng nhập...`);
            bot.chat(`/dn ${PASSWORD}`);
        }, 2000);
        
        // Lần 2: Đăng nhập lại (sau 10s)
        setTimeout(() => {
            console.log(`🔐 Lần 2: Đang đăng nhập lại...`);
            bot.chat(`/dn ${PASSWORD}`);
        }, 12000);
        
        // Gõ /menu (sau 14s)
        setTimeout(() => {
            console.log(`📋 Mở menu...`);
            bot.chat('/menu');
        }, 14000);
    });

    // ===== LẮNG NGHE KHI MENU MỞ RA =====
    bot.on('windowOpen', (window) => {
        console.log(`📦 Đã mở cửa sổ: ${window.title}`);
        
        if (window.type === 'chest' || (window.title && window.title.includes('Menu'))) {
            console.log(`🎮 Click vào slot 24 (KingsMP)...`);
            setTimeout(() => {
                bot.clickWindow(24, 0, 0);
                setTimeout(() => {
                    bot.closeWindow(window);
                    console.log(`✅ Đã đóng menu!`);
                }, 1500);
            }, 1000);
        }
    });

    // ===== LẮNG NGHE TIN NHẮN HỆ THỐNG (bắt pay) =====
    bot.on('message', async (jsonMsg) => {
        const msg = jsonMsg.toString();
        console.log(`📩 ${msg}`);

        // ===== BẮT PAY TỪ TIN NHẮN HỆ THỐNG =====
        // Ví dụ: "Bạn nhận được $100 từ Myokasi"
        const payMatch = msg.match(/Bạn nhận được \$(\d+) từ (\S+)/i);
        if (payMatch) {
            const amount = parseInt(payMatch[1]);
            const playerName = payMatch[2];

            console.log(`💰 Phát hiện pay: ${playerName} - ${amount}`);

            const ignMap = loadIgnMap();
            let discordId = null;

            for (const [ign, id] of Object.entries(ignMap)) {
                if (ign.toLowerCase() === playerName.toLowerCase()) {
                    discordId = id;
                    break;
                }
            }

            if (!discordId) {
                console.log(`⚠️ ${playerName} chưa đăng ký!`);
                return;
            }

            try {
                await fetch(DISCORD_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: playerName,
                        amount: amount
                    })
                });
                console.log(`✅ Đã gửi tín hiệu nạp cho ${playerName}`);
            } catch (err) {
                console.log('⚠️ Lỗi gửi tín hiệu:', err.message);
            }
            return;
        }

        // ===== KIỂM TRA ĐÃ VÀO KINGSMP CHƯA =====
        if (msg.includes('KingsMP') || msg.includes('vào KingsMP')) {
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

    // ===== LẮNG NGHE TIN NHẮN CHAT (chỉ để log) =====
    bot.on('chat', (username, message) => {
        if (username === BOT_NAME) return;
        console.log(`💬 ${username}: ${message}`);
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
}

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
    
    res.json({ success: true, message: `Đã chuyển ${amount} cho ${ign}` });
});

app.listen(WITHDRAW_WEBHOOK_PORT, () => {
    console.log(`🌐 Minecraft Bot API chạy tại http://localhost:${WITHDRAW_WEBHOOK_PORT}`);
});

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
