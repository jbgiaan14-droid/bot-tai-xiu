// --- BẬT MÁY CHỦ HTTP ẢO ĐỂ RENDER KHÔNG BÁO LỖI ---
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot KingMC is running!');
}).listen(process.env.PORT || 3000);

// ==========================================
// DÁN TOKEN BOT CỦA BẠN VÀO DƯỚI ĐÂY (Hoặc dùng biến môi trường)
const BOT_TOKEN = process.env.BOT_TOKEN;
// ==========================================

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const balances = {};
const gameHistory = []; 
const activeSessions = {};

function getBalance(userId) { 
    if (!balances[userId]) balances[userId] = 1000000; 
    return balances[userId]; 
}

// --- HÀM XỬ LÝ TIỀN THÔNG MINH (Hỗ trợ k, m, b, all) ---
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

client.once('ready', () => console.log(`🤖 Bot KingMC Gambling đã sẵn sàng với tính năng nhập tiền tự do!`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();

    if (content === '!tx' || content === '!taixiu') {
        if (activeSessions[message.channel.id]) {
            return message.reply({ content: '⚠️ Phiên tài xỉu đang chạy trong kênh này rồi!', ephemeral: true });
        }
        try { await message.delete(); } catch(e) {}
        startTaiXiuSession(message.channel);
    }
});

// SỰ KIỆN TƯƠNG TÁC ĐƯỢC ĐẶT Ở NGOÀI ĐỂ KHÔNG BỊ TRÀN BỘ NHỚ VÀ LAG
client.on('interactionCreate', async (i) => {
    const session = activeSessions[i.channelId];

    // 1. Khi bấm nút Tài hoặc Xỉu -> Hiện Modal để người chơi gõ số tiền tùy ý
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
            .setLabel('Nhập số tiền bạn muốn cược:')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('VD: 1m, 2m, 3m, 10b hoặc 500k')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        return await i.showModal(modal);
    }

    // 2. Khi người chơi bấm Gửi từ Modal nhập tiền
    if (i.isModalSubmit() && i.customId.startsWith('modal_bet_')) {
        if (!session) return i.reply({ content: '❌ Phiên đã kết thúc!', ephemeral: true });

        const side = i.customId.replace('modal_bet_', '');
        const rawAmount = i.fields.getTextInputValue('amount_input').trim();
        
        // Gọi hàm parseMoney để hỗ trợ gõ 1m, 2m, 3m, 10b,...
        let amount = parseMoney(rawAmount, i.user.id);

        if (isNaN(amount) || amount < 5000) {
            return i.reply({ content: '❌ Vui lòng nhập số tiền hợp lệ (tối thiểu 5,000$, hỗ trợ: k, m, b)!', ephemeral: true });
        }
        if (getBalance(i.user.id) < amount) {
            return i.reply({ content: `❌ Bạn không đủ tiền! Số dư hiện tại: ${getBalance(i.user.id).toLocaleString()}$`, ephemeral: true });
        }
        if (session.userBets[i.user.id]) {
            return i.reply({ content: '❌ Bạn đã đặt cược rồi!', ephemeral: true });
        }

        balances[i.user.id] -= amount;
        session.userBets[i.user.id] = { side: side, amount: amount };
        session.bets[side].amount += amount;
        session.bets[side].users.add(i.user.id);

        await i.reply({ content: `✅ Đã đặt thành công **${amount.toLocaleString()}$** vào cửa **${side.toUpperCase()}**!`, ephemeral: true });
        
        try {
            await session.gameMessage.edit({ embeds: [session.getEmbed(false)], components: session.getComponents(false) });
        } catch (e) {}
        return;
    }

    // 3. Xử lý các nút phụ (Số dư, Lịch sử, BXH)
    if (i.isButton()) {
        if (i.customId === 'btn_sodu') {
            const bal = getBalance(i.user.id);
            return i.reply({ content: `💰 Số dư hiện tại trong ví của bạn: **${bal.toLocaleString()}$**`, ephemeral: true });
        }

        if (i.customId === 'btn_lichsu') {
            if (gameHistory.length === 0) return i.reply({ content: '📜 Chưa có lịch sử ván đấu nào gần đây!', ephemeral: true });
            let historyStr = gameHistory.slice(-10).reverse().map((res, idx) => {
                return `Ván ${gameHistory.length - idx}: **${res.dice1}-${res.dice2}-${res.dice3}** (Tổng: **${res.total}** -> **${res.side === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}**)`;
            }).join('\n');
            const historyEmbed = new EmbedBuilder().setColor(0x38bdf8).setTitle('📜 10 Ván Kết Quả Gần Nhất').setDescription(historyStr);
            return i.reply({ embeds: [historyEmbed], ephemeral: true });
        }

        if (i.customId === 'btn_bxh') {
            const sortedUsers = Object.entries(balances).sort((a, b) => b[1] - a[1]).slice(0, 10);
            let desc = sortedUsers.length === 0 ? 'Chưa có dữ liệu!' : '';
            sortedUsers.forEach(([uid, money], index) => {
                let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**#${index + 1}**`;
                desc += `${medal} <@${uid}> - **${money.toLocaleString()}$**\n`;
            });
            const bxhEmbed = new EmbedBuilder().setColor(0xfacc15).setTitle('🏆 Bảng Xếp Hạng Đại Gia').setDescription(desc);
            return i.reply({ embeds: [bxhEmbed], ephemeral: true });
        }
    }
});

async function startTaiXiuSession(channel, previousMsg = null) {
    if (previousMsg) {
        try { await previousMsg.delete(); } catch(e) {}
    }

    const sessionData = {
        timeLeft: 60,
        bets: { tai: { amount: 0, users: new Set() }, xiu: { amount: 0, users: new Set() } },
        userBets: {},
        getEmbed(isLocked = false) {
            return new EmbedBuilder()
                .setColor(isLocked ? 0xef4444 : 0xf59e0b)
                .setTitle('🎲 KINGMC GAMBLING - TÀI XỈU TỰ ĐỘNG')
                .setDescription(`Nhấn nút bên dưới để mở bảng nhập số tiền cược tùy ý.\n*(Hỗ trợ viết tắt: k, m, b - VD: 1m, 2m, 10b, 500k)*\n\n💰 Tổng cược: **${(this.bets.tai.amount + this.bets.xiu.amount).toLocaleString()}$**`)
                .addFields(
                    { name: '🔴 TÀI', value: `💰 ${this.bets.tai.amount.toLocaleString()}$ (${this.bets.tai.users.size} người)`, inline: true },
                    { name: '🔵 XỈU', value: `💰 ${this.bets.xiu.amount.toLocaleString()}$ (${this.bets.xiu.users.size} người)`, inline: true },
                    { name: '⏳ Trạng thái', value: isLocked ? '🔒 Đã khóa, chuẩn bị lắc!' : `⏱️ Còn lại: ${this.timeLeft}s` }
                );
        },
        getComponents(isLocked = false) {
            return [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bet_tai').setLabel('🔴 Tài').setStyle(ButtonStyle.Danger).setDisabled(isLocked),
                    new ButtonBuilder().setCustomId('bet_xiu').setLabel('🔵 Xỉu').setStyle(ButtonStyle.Primary).setDisabled(isLocked),
                    new ButtonBuilder().setCustomId('btn_sodu').setLabel('📊 Số Dư').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('btn_lichsu').setLabel('📈 Lịch Sử').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('btn_bxh').setLabel('🏆 BXH').setStyle(ButtonStyle.Success)
                )
            ];
        }
    };

    activeSessions[channel.id] = sessionData;
    sessionData.gameMessage = await channel.send({ embeds: [sessionData.getEmbed()], components: sessionData.getComponents() });

    const timer = setInterval(async () => {
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
}

async function finishGameAndLoop(channel, gameMessage, bets, userBets) {
    try {
        const rollingEmbed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle('🎲 ĐANG LẮC ĐỢI KẾT QUẢ...')
            .setImage('https://i.imgur.com/83Z23q7.gif');

        const rollingMsg = await channel.send({ embeds: [rollingEmbed] });
        try { await gameMessage.delete(); } catch(e) {}

        setTimeout(async () => {
            let winSide;
            const totalTai = bets.tai.amount;
            const totalXiu = bets.xiu.amount;

            if (totalTai !== totalXiu) {
                const isNaturalWin = Math.random() < 0.60; 
                if (isNaturalWin) {
                    winSide = totalTai > totalXiu ? 'tai' : 'xiu';
                } else {
                    winSide = totalTai > totalXiu ? 'xiu' : 'tai';
                }
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

            gameHistory.push({ dice1: d1, dice2: d2, dice3: d3, total: total, side: total >= 11 ? 'tai' : 'xiu' });

            const resultText = total >= 11 ? '🔴 TÀI' : '🔵 XỈU';
            let res = `🎲 Kết quả: **${d1} - ${d2} - ${d3}** (Tổng: **${total}** -> **${resultText}**)\n\n`;

            for (const uid in userBets) {
                if (userBets[uid].side === winSide) {
                    const prize = userBets[uid].amount * 2;
                    balances[uid] += prize;
                    res += `🎉 <@${uid}> thắng **+${prize.toLocaleString()}$** (Số dư: ${balances[uid].toLocaleString()}$)\n`;
                } else {
                    res += `💀 <@${uid}> thua **-${userBets[uid].amount.toLocaleString()}$** (Số dư: ${balances[uid].toLocaleString()}$)\n`;
                }
            }

            if (Object.keys(userBets).length === 0) {
                res += `*Phiên này không có ai đặt cược!*`;
            }

            const finalEmbed = new EmbedBuilder()
                .setColor(total >= 11 ? 0xef4444 : 0x3b82f6)
                .setTitle('🏆 KẾT QUẢ PHIÊN TÀI XỈU')
                .setDescription(res + `\n🔄 **Đang tự động mở phiên tiếp theo sau 5 giây...**`)
                .setTimestamp();

            await rollingMsg.edit({ embeds: [finalEmbed] });

            setTimeout(() => {
                startTaiXiuSession(channel, rollingMsg);
            }, 5000);

        }, 3000);
    } catch (e) {
        console.log(e);
    }
}

client.login(BOT_TOKEN);
