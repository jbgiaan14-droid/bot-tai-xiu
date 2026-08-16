const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const balances = {};
const ignToDiscordMap = {}; 
const PAY_BOT_NAME = 'giaanday2121'; 

// Hàm chuyển đổi tiền tệ (hỗ trợ k, m, b)
function parseMoney(input) {
    if (!input) return NaN;
    let str = input.toString().toLowerCase().trim();
    let multiplier = 1;
    if (str.endsWith('k')) { multiplier = 1_000; str = str.slice(0, -1); }
    else if (str.endsWith('m')) { multiplier = 1_000_000; str = str.slice(0, -1); }
    else if (str.endsWith('b')) { multiplier = 1_000_000_000; str = str.slice(0, -1); }
    let num = parseFloat(str);
    return isNaN(num) ? NaN : Math.floor(num * multiplier);
}

// --- WEBHOOK NHẬN TIỀN TỪ SCANNER ---
app.post('/webhook/deposit', async (req, res) => {
    let { amount, ign } = req.body;
    if (!ign) return res.status(400).json({ success: false, message: 'Thiếu IGN' });

    const discordId = ignToDiscordMap[ign.trim().toLowerCase()];
    if (!discordId) return res.status(400).json({ success: false, message: 'IGN chưa liên kết' });

    const depositAmount = parseMoney(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ' });

    balances[discordId] = (balances[discordId] || 1000000) + depositAmount;

    try {
        const user = await client.users.fetch(discordId);
        await user.send(`✅ **NẠP THÀNH CÔNG!**\n\n👤 IGN: \`${ign}\`\n💰 Cộng thêm: **${depositAmount.toLocaleString()} Gambling**\n📊 Số dư mới: **${balances[discordId].toLocaleString()} Gambling**`);
    } catch (e) {}

    res.json({ success: true, newBalance: balances[discordId] });
});

// Cổng chạy tương thích cả Render và Local
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🔗 Server đang chạy trên cổng ${PORT}`));

// --- DISCORD INTERACTION ---
client.on('interactionCreate', async (i) => {
    if (i.isButton() && i.customId === 'btn_open_nap') {
        const modal = new ModalBuilder().setCustomId('modal_nap').setTitle('NẠP GAMBLING');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nap_ign').setLabel('Tên trong game (IGN)').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nap_amount').setLabel('Số tiền (VD: 10m, 1b)').setStyle(TextInputStyle.Short).setRequired(true))
        );
        return await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === 'modal_nap') {
        const ign = i.fields.getTextInputValue('nap_ign').trim();
        const amount = i.fields.getTextInputValue('nap_amount').trim();
        
        ignToDiscordMap[ign.toLowerCase()] = i.user.id;

        return await i.reply({ 
            content: `✅ Đã ghi nhận IGN: \`${ign}\`.\n\nVào game gõ lệnh:\n\`/pay ${PAY_BOT_NAME} ${amount}\``, 
            ephemeral: true 
        });
    }
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    if (msg.content === '!setupbank') {
        try { await msg.delete(); } catch(e) {}
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_open_nap').setLabel('Nạp Money').setStyle(ButtonStyle.Success)
        );
        return msg.channel.send({ content: '🏛️ Bấm nút dưới để nạp:', components: [row] });
    }
});

client.once('ready', () => console.log(`🤖 Bot ${client.user.tag} đã sẵn sàng!`));

client.login("process.env.BOT_TOKEN");
