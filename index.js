const http = require('http');
const express = require('express');

const app = express();
app.use(express.json());

// Web server cơ bản cho bot Discord (cổng 3000)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot KingMC Gambling is running!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Web server đang chạy trên cổng ${PORT}`);
});

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
const ALLOWED_CHANNEL_ID = '1538197175731748894'; // Kênh #gambling🎲
const PAY_BOT_NAME = 'giaanday2121'; // Tên bot nhận tiền pay trong game

const balances = {};
const gameHistory = []; 
const activeSessions = {};
const pendingDeposits = {}; 
const ignToDiscordMap = {}; // Lưu ánh xạ: IGN -> Discord ID (để quét log tự động nhận diện)
const userLoseStreaks = {}; // Lưu số trận thua liên tiếp của người chơi { userId: streakCount }
const userBetHistory = {};  // Lưu lịch sử cược trong chuỗi thua { userId: [amount1, amount2, ...] }
let totalGameCount = 891193; 

function getBalance(userId) { 
    if (!balances[userId]) balances[userId] = 1000000; 
    return balances[userId]; 
}

function parseMoney(input, userId) {
    if (!input) return NaN;
    let str = input.toString().toLowerCase().trim();
    
    if (str === 'all' || str === 'allin') {
        return getBalance(userId);
    }

    let multiplier = 1;
    if (str.endsWith('k')) {
        multiplier = 1_000;
        str = str.slice(0, -1);
    } else if (str.endsWith('m')) {
        multiplier = 1_000_000;
        str = str.slice(0, -1);
    } else if (str.endsWith('b')) {
        multiplier = 1_000_000_000;
        str = str.slice(0, -1);
    }

    let num = parseFloat(str);
    return isNaN(num) ? NaN : Math.floor(num * multiplier);
}

function formatMoneyFull(amount) {
    if (amount >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(2).replace(/\.0$/, '') + 'b Gambling';
    if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm Gambling';
    if (amount >= 1_000) return (amount / 1_000).toFixed(1).replace(/\.0$/, '') + 'k Gambling';
    return amount.toString() + ' Gambling';
}

// ==================== WEBHOOK NHẬN TIỀN TỪ LOG SCANNER TRONG GAME (CỔNG 3001) ====================
app.post('/webhook/deposit', async (req, res) => {
    let { discordId, amount, ign } = req.body;

    if (!discordId && ign) {
        const cleanIgn = ign.trim().toLowerCase();
        discordId = ignToDiscordMap[cleanIgn];
    }

    if (!discordId || !amount) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin discordId hoặc amount (IGN chưa được liên kết qua bảng Nạp)' });
    }

    const depositAmount = parseInt(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ' });
    }

    balances[discordId] = (balances[discordId] || 1000000) + depositAmount;

    try {
        const userObj = await client.users.fetch(discordId);
        if (userObj) {
            await userObj.send(`✅ **NẠP TIỀN THÀNH CÔNG!**\n\n👤 IGN: \`${ign || 'Không rõ'}\`\n💰 Đã cộng thêm: **${formatMoneyFull(depositAmount)}**\n📊 Số dư mới: **${formatMoneyFull(balances[discordId])}**`);
        }
    } catch (err) {
        console.log(`Không thể gửi DM cho user ${discordId}`);
    }

    return res.json({ success: true, newBalance: balances[discordId] });
});

app.listen(3001, () => {
    console.log(`🔗 Webhook lắng nghe nạp tiền chạy tại cổng 3001`);
});
// ==================================================================================

client.once('ready', () => {
    console.log(`🤖 Bot ${client.user.tag} đã sẵn sàng hoạt động ổn định!`);
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
            balances[targetInput] = (balances[targetInput] || 1000000) + amount;

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

            // Kiểm tra xem có người chơi nào đang ở chuỗi thua 6-9 trận mà có đặt cược hay không
            let forcedWinSide = null;
            for (const uid in userBets) {
                let streak = userLoseStreaks[uid] || 0;
                if (streak >= 6 && streak <= 9 && Math.random() < 0.85) {
                    forcedWinSide = userBets[uid].side; // Tỉ lệ thắng 85% theo cửa người đó chọn
                    break; 
                }
            }

            if (forcedWinSide) {
                winSide = forcedWinSide;
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
                    // Thắng: Reset chuỗi thua và lịch sử cược chuỗi thua
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
                    // Thua: Tăng chuỗi thua lên 1 và ghi nhận tiền cược vào lịch sử
                    userLoseStreaks[uid] = (userLoseStreaks[uid] || 0) + 1;
                    if (!userBetHistory[uid]) userBetHistory[uid] = [];
                    userBetHistory[uid].push(betInfo.amount);

                    let streak = userLoseStreaks[uid];
                    const lossAmount = betInfo.amount;

                    if (streak === 10) {
                        // Chuỗi thua đúng 10 ván: Hoàn 20% tổng số tiền từ trận 1 - 10
                        let totalBet10 = userBetHistory[uid].reduce((a, b) => a + b, 0);
                        let refundAmount = Math.floor(totalBet10 * 0.2);
                        balances[uid] += refundAmount;

                        res += `🛡️ <@${uid}> thua chuỗi 10 ván! Được hoàn trả 20% tổng tiền cược: **+${formatMoneyFull(refundAmount)}** (Số dư: ${formatMoneyFull(balances[uid])})\n`;

                        // Reset lại chuỗi thua và lịch sử cược sau khi hoàn
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
                                // Định dạng DM chuẩn y hệt như hình bạn cung cấp
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

client.login(BOT_TOKEN);
