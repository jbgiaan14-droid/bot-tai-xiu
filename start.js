console.log('🚀 ĐANG KHỞI ĐỘNG HỆ THỐNG...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

console.log('📌 Đang khởi động Discord Bot...');
require('./index.js');

setTimeout(() => {
    console.log('📌 Đang khởi động Minecraft Bot...');
    require('./minecraft-bot.js');
}, 5000);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ HỆ THỐNG ĐANG CHẠY!');
