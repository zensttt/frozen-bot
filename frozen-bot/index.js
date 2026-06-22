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

function getRole(guild, roleId) {
  return guild.roles.cache.get(roleId);
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
    getStaffRolesArray().includes(role.id)
  );
}

function canCreateGiveaway(member) {
  if (!member || !config.giveaway?.allowedRoles) return false;

  return member.roles.cache.some(role =>
    config.giveaway.allowedRoles.includes(role.id)
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

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
      const choice = interaction.values[0];

      const labels = {
        recrutement: "📋 Recrutement",
        probleme: "🛠️ Problème"
      };

      return createTicket(interaction, labels[choice] || choice, choice);
    }

    if (interaction.isButton()) {
      if (interaction.customId === "claim_ticket") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
        }

        if (!isStaff(interaction.member)) {
          return interaction.reply({ content: "Seul le staff peut claim un ticket.", ephemeral: true });
        }

        const currentTopic = interaction.channel.topic || "";

        if (currentTopic.includes("claimed:") && !currentTopic.includes("claimed:none")) {
          return interaction.reply({ content: "Ce ticket est déjà claim.", ephemeral: true });
        }

        await interaction.channel.setTopic(
          currentTopic.replace("claimed:none", `claimed:${interaction.user.id}`)
        ).catch(() => {});

        addStaffStat(interaction.user.id, "claimed");

        await interaction.reply({
          embeds: [makeEmbed("🎯 Ticket claim", `Ticket pris en charge par ${interaction.user}.`)]
        });

        return;
      }

      if (interaction.customId === "close_ticket") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
        }

        await interaction.reply("Fermeture du ticket...");
        return closeTicket(interaction.channel, interaction.user);
      }

      if (interaction.customId === "start_recruit_form") {
        const modal = new ModalBuilder()
          .setCustomId("recruit_form")
          .setTitle("Candidature Frozen");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("age")
              .setLabel("Ton âge")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("dispo")
              .setLabel("Tes disponibilités")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("niveau")
              .setLabel("Ton niveau / expérience")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("leaderboard")
              .setLabel("Ton leaderboard")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pov")
              .setLabel("POV / liens Medal")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith("open_giveaway_modal_")) {
        const ownerId = interaction.customId.replace("open_giveaway_modal_", "");

        if (interaction.user.id !== ownerId) {
          return interaction.reply({ content: "❌ Ce bouton n’est pas pour toi.", ephemeral: true });
        }

        if (!canCreateGiveaway(interaction.member)) {
          return interaction.reply({ content: "❌ Permission refusée.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`giveaway_create_${ownerId}`)
          .setTitle("Créer un giveaway");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("endDate")
              .setLabel("Date de fin")
              .setPlaceholder("2026-05-30T20:00")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("winners")
              .setLabel("Nombre de gagnants")
              .setPlaceholder("1")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("prize")
              .setLabel("Lot à gagner")
              .setPlaceholder("Nitro")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("description")
              .setLabel("Description")
              .setPlaceholder("Giveaway Frozen")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith("giveaway_join_")) {
        const giveawayId = interaction.customId.replace("giveaway_join_", "");
        const data = giveaways.get(giveawayId);

        if (!data) {
          return interaction.reply({ content: "❌ Giveaway terminé.", ephemeral: true });
        }

        data.participants.add(interaction.user.id);

        return interaction.reply({
          content: "✅ Participation enregistrée.",
          ephemeral: true
        });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "recruit_form") {
      const age = interaction.fields.getTextInputValue("age");
      const dispo = interaction.fields.getTextInputValue("dispo");
      const niveau = interaction.fields.getTextInputValue("niveau");
      const leaderboard = interaction.fields.getTextInputValue("leaderboard");
      const pov = interaction.fields.getTextInputValue("pov");

      const embed = makeEmbed(
        "📋 Formulaire recrutement",
        [
          `Candidat : ${interaction.user}`,
          "",
          `**Âge :** ${age}`,
          `**Disponibilités :** ${dispo}`,
          `**Niveau / expérience :** ${niveau}`,
          `**Leaderboard :** ${leaderboard}`,
          `**POV / liens Medal :** ${pov}`
        ].join("\n")
      );

      await interaction.reply({ content: "✅ Formulaire envoyé.", ephemeral: true });
      await interaction.channel.send({ embeds: [embed] });

      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("giveaway_create_")) {
      const endDateInput = interaction.fields.getTextInputValue("endDate");
      const winnersInput = interaction.fields.getTextInputValue("winners");
      const prize = interaction.fields.getTextInputValue("prize");
      const description = interaction.fields.getTextInputValue("description") || "Bonne chance à tous !";

      const endDate = parseGiveawayDate(endDateInput);

      if (!endDate || endDate.getTime() <= Date.now()) {
        return interaction.reply({
          content: "❌ Date invalide. Utilise ce format : `2026-05-30T20:00`",
          ephemeral: true
        });
      }

      const winnersCount = parseInt(winnersInput, 10);

      if (isNaN(winnersCount) || winnersCount <= 0) {
        return interaction.reply({ content: "❌ Nombre de gagnants invalide.", ephemeral: true });
      }

      const giveawayChannel = interaction.guild.channels.cache.get(config.giveaway.channelId);

      if (!giveawayChannel) {
        return interaction.reply({ content: "❌ Salon giveaway introuvable.", ephemeral: true });
      }

      const rolePing = interaction.guild.roles.cache.find(r => r.name === config.giveaway.pingRole);
      const giveawayId = Date.now().toString();

      const button = new ButtonBuilder()
        .setCustomId(`giveaway_join_${giveawayId}`)
        .setLabel("Participer")
        .setEmoji("🎉")
        .setStyle(ButtonStyle.Success);

      const msg = await giveawayChannel.send({
        content: rolePing ? `${rolePing} 🎉 Nouveau giveaway !` : "@everyone 🎉 Nouveau giveaway !",
        embeds: [
          makeEmbed(
            "🎉 GIVEAWAY FROZEN",
            [
              `🎁 **Lot :** ${prize}`,
              `🏆 **Gagnants :** ${winnersCount}`,
              `⏰ **Fin :** <t:${Math.floor(endDate.getTime() / 1000)}:F>`,
              `⏳ **Temps restant :** <t:${Math.floor(endDate.getTime() / 1000)}:R>`,
              "",
              description,
              "",
              "Clique sur 🎉 pour participer."
            ].join("\n")
          )
        ],
        components: [new ActionRowBuilder().addComponents(button)]
      });

      giveaways.set(giveawayId, {
        messageId: msg.id,
        prize,
        winnersCount,
        endAt: endDate.getTime(),
        participants: new Set()
      });

      await interaction.reply({
        content: `✅ Giveaway créé.\nID : \`${giveawayId}\``,
        ephemeral: true
      });

      setTimeout(async () => {
        const data = giveaways.get(giveawayId);
        if (!data) return;

        const participants = [...data.participants];

        if (!participants.length) {
          giveaways.delete(giveawayId);
          return giveawayChannel.send(`❌ Giveaway terminé : **${prize}**\nAucun participant.`);
        }

        const winners = pickWinners(participants, winnersCount);
        const winnersPing = winners.map(id => `<@${id}>`).join(" ");

        await giveawayChannel.send(`🎉 Félicitations ${winnersPing} !\nVous gagnez : **${prize}**`);

        giveaways.delete(giveawayId);
      }, endDate.getTime() - Date.now());

      return;
    }
  } catch (err) {
    console.error(err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Une erreur est arrivée.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});


client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const prefix = config.prefix || "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (command === "help" || command === "aide") {
    return message.reply({
      embeds: [
        makeEmbed(
          "📖 Commandes Frozen",
          [
            "`!setup` → envoie le panel ticket",
            "`!close` → ferme le ticket",
            "`!clear 10` → supprime des messages",
            "`!add ID` → ajoute quelqu’un au ticket",
            "`!staffstats` → stats staff",
            "`!giveaway op` → créer un giveaway",
            "`!cancelgiveaway ID` → annuler un giveaway",
            "`!statut` → statut du bot",
            "`!help` / `!aide` → aide"
          ].join("\n")
        )
      ]
    });
  }

  if (command === "setup") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply("❌ Permission refusée.");
    }

    const panelChannel =
      getChannelByName(message.guild, config.channels.ticketPanel) || message.channel;

    await sendTicketPanel(panelChannel);
    return message.reply("✅ Panel envoyé.");
  }

  if (command === "close") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) {
      return message.reply("❌ Utilise cette commande dans un ticket.");
    }

    return closeTicket(message.channel, message.author);
  }

  if (command === "giveaway") {
    if (args[0] !== "op") {
      return message.reply("Utilisation : `!giveaway op`");
    }

    if (!canCreateGiveaway(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const button = new ButtonBuilder()
      .setCustomId(`open_giveaway_modal_${message.author.id}`)
      .setLabel("Créer le giveaway")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success);

    return message.reply({
      content: "🎉 Clique sur le bouton pour ouvrir le menu giveaway.",
      components: [new ActionRowBuilder().addComponents(button)]
    });
  }

  if (command === "cancelgiveaway") {
    if (!canCreateGiveaway(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const giveawayId = args[0];

    if (!giveawayId) {
      return message.reply("Utilisation : `!cancelgiveaway ID`");
    }

    const data = giveaways.get(giveawayId);

    if (!data) {
      return message.reply("❌ Giveaway introuvable.");
    }

    giveaways.delete(giveawayId);

    return message.reply(`🛑 Giveaway \`${giveawayId}\` annulé.`);
  }

  if (command === "clear") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ Permission refusée.");
    }

    const amount = Math.min(parseInt(args[0] || "10", 10), 100);

    if (Number.isNaN(amount) || amount < 1) {
      return message.reply("Utilisation : `!clear 10`");
    }

    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);

    if (!deleted) {
      return message.reply("❌ Impossible de supprimer.");
    }

    return message.channel
      .send(`✅ ${deleted.size} messages supprimés.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
  }

  if (command === "add") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) {
      return message.reply("❌ À utiliser dans un ticket.");
    }

    if (!isStaff(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const userId = args[0]?.replace(/[<@!>]/g, "");

    if (!userId) {
      return message.reply("Utilisation : `!add ID`");
    }

    const user = await message.guild.members.fetch(userId).catch(() => null);

    if (!user) {
      return message.reply("❌ Utilisateur introuvable.");
    }

    await message.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    return message.reply(`✅ ${user} ajouté au ticket.`);
  }

  if (command === "staffstats") {
    if (!isStaff(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = message.mentions.users.first() || message.author;
    const data = loadStats();
    const stats = data[target.id] || {
      claimed: 0,
      closed: 0,
      recruitForms: 0
    };

    return message.reply({
      embeds: [
        makeEmbed(
          `📊 Stats staff — ${target.username}`,
          [
            `🎯 Tickets claim : **${stats.claimed || 0}**`,
            `🔒 Tickets fermés : **${stats.closed || 0}**`,
            `📋 Formulaires : **${stats.recruitForms || 0}**`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "statut") {
    return message.reply({
      embeds: [
        makeEmbed(
          "🟢 Statut du bot",
          [
            `Ping : ${client.ws.ping}ms`,
            `Serveurs : ${client.guilds.cache.size}`,
            `Utilisateurs : ${client.users.cache.size}`
          ].join("\n")
        )
      ]
    });
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Erreur : DISCORD_TOKEN manquant.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
