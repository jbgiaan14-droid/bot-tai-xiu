const { Tail } = require('tail');
const axios = require('axios');

// Đường dẫn đến file log của tài khoản treo game trên máy ông
// (Nhớ thay chữ "Admin" thành tên User trên máy tính của ông nhé)
const logFilePath = 'C:/Users/Admin/AppData/Roaming/.minecraft/logs/latest.log';

const tail = new Tail(logFilePath);

console.log("🚀 Trình quét log đang chạy trên Desktop...");

tail.on("line", async (data) => {
    // Regex bắt dòng chat nhận tiền (Ông test xem đúng dòng game chưa nhé)
    const regex = /Bạn đã nhận được ([\d\w]+) từ ([\w]+)/i; 
    const match = data.match(regex);

    if (match) {
        const amount = match[1]; // Số tiền
        const ign = match[2];    // Tên người chơi
        
        console.log(`✅ Phát hiện nạp: ${ign} vừa pay ${amount}`);

        try {
            await axios.post('http://localhost:3001/webhook/deposit', {
                amount: amount,
                ign: ign
            });
            console.log("📤 Đã gửi tín hiệu cộng tiền về Bot Discord thành công!");
        } catch (e) {
            console.error("❌ Lỗi gửi tín hiệu:", e.message);
        }
    }
});