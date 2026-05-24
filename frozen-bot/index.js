require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

const DATA_FILE = path.join(__dirname, "staff-stats.json");
const spamMap = new Map();
const joinRaidMap = new Map();
const ticketActivity = new Map();
const giveaways = new Map();

function parseGiveawayDate(input) {
  const date = new Date(input);
  if (isNaN(date.getTime())) return null;
  return date;
}

function pickWinners(participants, count) {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function loadStats() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveStats(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function addStaffStat(userId, key) {
  const data = loadStats();

  if (!data[userId]) {
    data[userId] = {
      claimed: 0,
      closed: 0,
      recruitForms: 0
    };
  }

  data[userId][key] = (data[userId][key] || 0) + 1;
  saveStats(data);
}

function getRole(guild, roleName) {
  return guild.roles.cache.find(role => role.name === roleName);
}

function getStaffRolesArray() {
  return [
    config.staffRoles.fondateur,
    config.staffRoles.miniFondateur,
    config.staffRoles.gerantRecruteur
  ];
}

function isStaff(member) {
  if (!member || !member.roles) return false;

  return member.roles.cache.some(role =>
    getStaffRolesArray().includes(role.name)
  );
}

function canCreateGiveaway(member) {
  if (!member || !config.giveaway?.allowedRoles) return false;

  return config.giveaway.allowedRoles.some(roleName =>
    member.roles.cache.some(role => role.name === roleName)
  );
}

function getChannelByName(guild, name) {
  return guild.channels.cache.find(ch => ch.name === name);
}

function getLogChannel(guild) {
  return guild.channels.cache.get(config.channels.ticketLogsId)
    || getChannelByName(guild, config.channels.ticketLogs);
}

function makeEmbed(title, description) {

  const embed = new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: `${config.serverName} • Frozen Bot`
    })
    .setTimestamp();

  if (config.branding?.imageUrl) {
    embed.setImage(config.branding.imageUrl);
  }

  return embed;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendLog(guild, title, description, files = []) {

  const logChannel = getLogChannel(guild);

  if (!logChannel) return;

  await logChannel.send({
    embeds: [makeEmbed(title, description)],
    files
  }).catch(() => {});
}

async function createHtmlTranscript(channel) {

  const messages = [];
  let lastId;

  while (true) {

    const options = { limit: 100 };

    if (lastId) {
      options.before = lastId;
    }

    const fetched = await channel.messages.fetch(options).catch(() => null);

    if (!fetched || fetched.size === 0) break;

    messages.push(...fetched.values());

    lastId = fetched.last().id;

    if (fetched.size < 100) break;
  }

  messages.sort((a, b) =>
    a.createdTimestamp - b.createdTimestamp
  );

  const rows = messages.map(msg => {

    const date =
      new Date(msg.createdTimestamp).toLocaleString("fr-FR");

    const author =
      msg.author
        ? escapeHtml(msg.author.tag)
        : "Inconnu";

    const avatar =
      msg.author?.displayAvatarURL?.() || "";

    const content =
      msg.content
        ? escapeHtml(msg.content).replace(/\n/g, "<br>")
        : "<i>[embed/fichier/sans texte]</i>";

    return `
      <div class="msg">
        <img src="${avatar}" class="avatar">
        <div>
          <div>
            <b>${author}</b>
            <span>${date}</span>
          </div>

          <div class="content">
            ${content}
          </div>
        </div>
      </div>
    `;
  }).join("\n");

  const bg =
    config.branding?.imageUrl
      ? `linear-gradient(rgba(5,10,20,.88), rgba(5,10,20,.88)), url("${escapeHtml(config.branding.imageUrl)}") center/cover fixed`
      : "#0b1220";

  const html = `
<!doctype html>
<html lang="fr">
<head>

<meta charset="utf-8">

<title>
Transcript ${escapeHtml(channel.name)}
</title>

<style>

body{
background:${bg};
color:#e6f7ff;
font-family:Arial,sans-serif;
padding:30px
}

h1{
color:#00aaff
}

.msg{
display:flex;
gap:12px;
background:#111b2e;
border:1px solid #17395c;
border-radius:12px;
padding:12px;
margin:10px 0
}

.avatar{
width:42px;
height:42px;
border-radius:50%
}

span{
color:#8bbbd8;
font-size:12px
}

.content{
margin-top:6px;
line-height:1.4
}

</style>
</head>

<body>

<h1>
Transcript — #${escapeHtml(channel.name)}
</h1>

<p>
Salon ID : ${channel.id}
<br>
Date : ${new Date().toLocaleString("fr-FR")}
</p>

${rows}

</body>
</html>
`;

  return new AttachmentBuilder(
    Buffer.from(html, "utf-8"),
    {
      name: `transcript-${channel.name}.html`
    }
  );
}

async function sendTicketPanel(channel) {

  const embed = makeEmbed(
    "🧊 Panel Tickets — Frozen",
    [
      "Sélectionne une catégorie dans le menu ci-dessous.",
      "",
      "📋 Recrutement",
      "🛠️ Problème"
    ].join("\n")
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_menu")
    .setPlaceholder("Choisis une catégorie")
    .addOptions(
      {
        label: "Recrutement",
        value: "recrutement",
        emoji: "📋"
      },
      {
        label: "Problème",
        value: "probleme",
        emoji: "🛠️"
      }
    );

  await channel.send({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  });
}

function ticketButtons(ticketType) {

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Claim")
          .setEmoji("🎯")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Fermer")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)

      );

  if (ticketType === "recrutement") {

    row.addComponents(

      new ButtonBuilder()
        .setCustomId("start_recruit_form")
        .setLabel("Formulaire recrutement")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Success)

    );
  }

  return [row];
}

async function createTicket(
  interaction,
  typeLabel,
  ticketType
) {

  const guild = interaction.guild;
  const member = interaction.member;

  const alreadyOpen =
    guild.channels.cache.find(
      ch => ch.topic === `ticket-owner:${member.id}`
    );

  if (alreadyOpen) {
    return interaction.reply({
      content: `Tu as déjà un ticket ouvert : ${alreadyOpen}`,
      ephemeral: true
    });
  }

  let category =
    guild.channels.cache.find(
      ch =>
        ch.type === ChannelType.GuildCategory
        && ch.name === "Tickets"
    );

  if (!category) {

    category =
      await guild.channels.create({
        name: "Tickets",
        type: ChannelType.GuildCategory
      });
  }

  const fondateurRole =
    getRole(guild, config.staffRoles.fondateur);

  const gerantRecruteurRole =
    getRole(guild, config.staffRoles.gerantRecruteur);

  const overwrites = [

    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },

    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },

    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }

  ];

  if (ticketType === "probleme") {

    if (fondateurRole) {

      overwrites.push({
        id: fondateurRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }
  }

  else if (ticketType === "recrutement") {

    if (gerantRecruteurRole) {

      overwrites.push({
        id: gerantRecruteurRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }
  }

  const safeName =
    member.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 30);

  const channel =
    await guild.channels.create({

      name: `ticket-${safeName}`,
      type: ChannelType.GuildText,
      parent: category.id,

      topic:
        `ticket-owner:${member.id};type:${ticketType};claimed:none`,

      permissionOverwrites: overwrites

    });

  ticketActivity.set(channel.id, Date.now());

  let ping = "";

  let description =
    `${member}, ton ticket est ouvert.\nUn membre du staff va te répondre.`;

  if (ticketType === "recrutement") {

    ping =
      gerantRecruteurRole
        ? `${gerantRecruteurRole}`
        : "";

    description =
      `${member}, ton ticket recrutement est ouvert.\n\n${config.recruitmentMessage}`;
  }

  if (ticketType === "probleme") {

    ping =
      fondateurRole
        ? `${fondateurRole}`
        : "";

    description =
      `${member}, ton ticket problème est ouvert.\nLes fondateurs vont te répondre.`;
  }

  await channel.send({

    content: `${member} ${ping}`.trim(),

    embeds: [
      makeEmbed(
        `🎫 Ticket — ${typeLabel}`,
        description
      )
    ],

    components: ticketButtons(ticketType)

  });

  await sendLog(
    guild,
    "📩 Ticket ouvert",
    `Utilisateur : ${member}\nCatégorie : **${typeLabel}**\nSalon : ${channel}`
  );

  return interaction.reply({
    content: `Ticket créé : ${channel}`,
    ephemeral: true
  });
}

async function closeTicket(channel, closedBy) {

  const guild = channel.guild;

  const transcript =
    await createHtmlTranscript(channel);

  await sendLog(
    guild,
    "🔒 Ticket fermé",
    `Salon : **${channel.name}**\nFermé par : ${closedBy}`,
    [transcript]
  );

  if (
    closedBy?.id
    && closedBy.id !== client.user.id
  ) {
    addStaffStat(closedBy.id, "closed");
  }

  await channel.send(
    "🔒 Ticket fermé dans 5 secondes."
  );

  ticketActivity.delete(channel.id);

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 5000);
}

client.once("ready", () => {

  console.log(
    `Frozen connecté : ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name: `${config.serverName} 🧊`
      }
    ],
    status: "online"
  });

});
