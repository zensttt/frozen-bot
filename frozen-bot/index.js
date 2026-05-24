const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    ChannelType
} = require('discord.js');

require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = "!";

client.once('ready', () => {
    console.log(`${client.user.tag} est en ligne !`);
});

client.on('messageCreate', async message => {

    if (message.author.bot) return;

    // SETUP
    if (message.content === '!setup') {

        message.channel.send(`
🎫 **Panel Tickets Frozen**

Réagis avec :
📩 Recrutement
❓ Problème
🎨 Pack Graphique
🎵 Pack Son
        `);
    }

    // CLEAR
    if (message.content.startsWith('!clear')) {

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply("❌ Tu n'as pas la permission.");
        }

        await message.channel.bulkDelete(10).catch(() => {});
        message.channel.send("✅ Messages supprimés.")
            .then(msg => {
                setTimeout(() => msg.delete(), 3000);
            });
    }

    // CLOSE
    if (message.content === '!close') {

        message.channel.send("🔒 Fermeture du ticket...");

        setTimeout(() => {
            message.channel.delete().catch(() => {});
        }, 3000);
    }

    // HELP
    if (message.content === '!help') {

        message.channel.send(`
📖 **Commandes disponibles**

!setup → envoyer le panel
!clear → supprimer 10 messages
!close → fermer le ticket
!help → afficher les commandes
        `);
    }
});

client.login(process.env.DISCORD_TOKEN);
