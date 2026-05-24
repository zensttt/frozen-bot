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
  if (!data[userId]) data[userId] = { claimed: 0, closed: 0, recruitForms: 0 };
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
  return member.roles.cache.some(role => getStaffRolesArray().includes(role.name));
}

function getChannelByName(guild, name) {
  return guild.channels.cache.find(ch => ch.name === name);
}

function getLogChannel(guild) {
  return guild.channels.cache.get(config.channels.ticketLogsId) || getChannelByName(guild, config.channels.ticketLogs);
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${config.serverName} • Frozen Bot` })
    .setTimestamp()
    .setImage(config.branding.imageUrl);
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
  await logChannel.send({ embeds: [makeEmbed(title, description)], files }).catch(() => {});
}

async function createHtmlTranscript(channel) {
  const messages = [];
  let lastId;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const fetched = await channel.messages.fetch(options).catch(() => null);
    if (!fetched || fetched.size === 0) break;

    messages.push(...fetched.values());
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const rows = messages.map(msg => {
    const date = new Date(msg.createdTimestamp).toLocaleString("fr-FR");
    const author = msg.author ? escapeHtml(msg.author.tag) : "Inconnu";
    const avatar = msg.author?.displayAvatarURL?.() || "";
    const content = msg.content ? escapeHtml(msg.content).replace(/\n/g, "<br>") : "<i>[embed/fichier/sans texte]</i>";
    const attachments = msg.attachments.size
      ? `<div class="attachments">${msg.attachments.map(a => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name || a.url)}</a>`).join("<br>")}</div>`
      : "";

    return `
      <div class="msg">
        <img src="${avatar}" class="avatar">
        <div>
          <div><b>${author}</b> <span>${date}</span></div>
          <div class="content">${content}</div>
          ${attachments}
        </div>
      </div>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Transcript ${escapeHtml(channel.name)}</title>
<style>
body{background:#0b1220;color:#e6f7ff;font-family:Arial,sans-serif;padding:30px}
h1{color:#00aaff}
.msg{display:flex;gap:12px;background:#111b2e;border:1px solid #17395c;border-radius:12px;padding:12px;margin:10px 0}
.avatar{width:42px;height:42px;border-radius:50%}
span{color:#8bbbd8;font-size:12px}
.content{margin-top:6px;line-height:1.4}
a{color:#55c7ff}
</style>
</head>
<body>
<h1>Transcript — #${escapeHtml(channel.name)}</h1>
<p>Salon ID : ${channel.id}<br>Date : ${new Date().toLocaleString("fr-FR")}</p>
${rows}
</body>
</html>`;

  return new AttachmentBuilder(Buffer.from(html, "utf-8"), {
    name: `transcript-${channel.name}.html`
  });
}

async function sendTicketPanel(channel) {
  const embed = makeEmbed(
    "🧊 Panel Tickets — Frozen",
    [
      "Sélectionne une catégorie dans le menu ci-dessous.",
      "",
      "📋 **Recrutement**",
      "🛠️ **Problème**"
    ].join("\n")
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_menu")
    .setPlaceholder("Choisis une catégorie")
    .addOptions(
      { label: "Recrutement", value: "recrutement", emoji: "📋" },
      { label: "Problème", value: "probleme", emoji: "🛠️" }
    );

  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

function ticketButtons(ticketType) {
  const row = new ActionRowBuilder().addComponents(
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

async function createTicket(interaction, typeLabel, ticketType) {
  const guild = interaction.guild;
  const member = interaction.member;

  const alreadyOpen = guild.channels.cache.find(ch => ch.topic === `ticket-owner:${member.id}`);
  if (alreadyOpen) {
    return interaction.reply({ content: `Tu as déjà un ticket ouvert : ${alreadyOpen}`, ephemeral: true });
  }

  let category = guild.channels.cache.find(ch => ch.type === ChannelType.GuildCategory && ch.name === "Tickets");
  if (!category) {
    category = await guild.channels.create({ name: "Tickets", type: ChannelType.GuildCategory });
  }

  const fondateurRole = getRole(guild, config.staffRoles.fondateur);
  const gerantRecruteurRole = getRole(guild, config.staffRoles.gerantRecruteur);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
  ];

  if (ticketType === "probleme") {
    if (fondateurRole) {
      overwrites.push({
        id: fondateurRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
      });
    }
  } else if (ticketType === "recrutement") {
    if (gerantRecruteurRole) {
      overwrites.push({
        id: gerantRecruteurRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
      });
    }
  }

  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);
  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket-owner:${member.id};type:${ticketType};claimed:none`,
    permissionOverwrites: overwrites
  });

  ticketActivity.set(channel.id, Date.now());

  let ping = "";
  let description = `${member}, ton ticket est ouvert.\nUn membre du staff va te répondre.`;

  if (ticketType === "recrutement") {
    ping = gerantRecruteurRole ? `${gerantRecruteurRole}` : "";
    description = `${member}, ton ticket recrutement est ouvert.\n\n${config.recruitmentMessage}\n\nClique sur **Formulaire recrutement** pour remplir ta candidature.`;
  }

  if (ticketType === "probleme") {
    ping = fondateurRole ? `${fondateurRole}` : "";
    description = `${member}, ton ticket problème est ouvert.\nLes fondateurs vont te répondre.`;
  }

  await channel.send({
    content: `${member} ${ping}`.trim(),
    embeds: [makeEmbed(`🎫 Ticket — ${typeLabel}`, description)],
    components: ticketButtons(ticketType)
  });

  await sendLog(guild, "📩 Ticket ouvert", `Utilisateur : ${member}\nCatégorie : **${typeLabel}**\nSalon : ${channel}`);

  return interaction.reply({ content: `Ticket créé : ${channel}`, ephemeral: true });
}

async function closeTicket(channel, closedBy) {
  const guild = channel.guild;
  const transcript = await createHtmlTranscript(channel);

  await sendLog(guild, "🔒 Ticket fermé", `Salon : **${channel.name}**\nFermé par : ${closedBy}`, [transcript]);

  if (closedBy?.id && closedBy.id !== client.user.id) addStaffStat(closedBy.id, "closed");

  await channel.send("🔒 Ticket fermé dans 5 secondes.");
  ticketActivity.delete(channel.id);
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

client.once("ready", () => {
  console.log(`Frozen connecté : ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: `${config.serverName} 🧊` }], status: "online" });
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_menu") {
        const choice = interaction.values[0];
        const labels = { recrutement: "📋 Recrutement", probleme: "🛠️ Problème" };
        return createTicket(interaction, labels[choice] || choice, choice);
      }
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

        await interaction.channel.setTopic(currentTopic.replace("claimed:none", `claimed:${interaction.user.id}`)).catch(() => {});
        addStaffStat(interaction.user.id, "claimed");

        await interaction.reply({ embeds: [makeEmbed("🎯 Ticket claim", `Ticket pris en charge par ${interaction.user}.`)] });
        await sendLog(interaction.guild, "🎯 Ticket claim", `Ticket : ${interaction.channel}\nStaff : ${interaction.user}`);
        return;
      }

      if (interaction.customId === "start_recruit_form") {
        const modal = new ModalBuilder().setCustomId("recruit_form").setTitle("Candidature Frozen");

        const age = new TextInputBuilder().setCustomId("age").setLabel("Ton âge").setStyle(TextInputStyle.Short).setRequired(true);
        const dispo = new TextInputBuilder().setCustomId("dispo").setLabel("Tes disponibilités").setStyle(TextInputStyle.Short).setRequired(true);
        const niveau = new TextInputBuilder().setCustomId("niveau").setLabel("Ton niveau / expérience").setStyle(TextInputStyle.Paragraph).setRequired(true);
        const leaderboard = new TextInputBuilder().setCustomId("leaderboard").setLabel("Ton leaderboard à jour").setStyle(TextInputStyle.Short).setRequired(true);
        const pov = new TextInputBuilder().setCustomId("pov").setLabel("POV / liens / infos importantes").setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(age),
          new ActionRowBuilder().addComponents(dispo),
          new ActionRowBuilder().addComponents(niveau),
          new ActionRowBuilder().addComponents(leaderboard),
          new ActionRowBuilder().addComponents(pov)
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "close_ticket") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
        }

        await interaction.reply("Fermeture du ticket...");
        return closeTicket(interaction.channel, interaction.user);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "recruit_form") {
      const age = interaction.fields.getTextInputValue("age");
      const dispo = interaction.fields.getTextInputValue("dispo");
      const niveau = interaction.fields.getTextInputValue("niveau");
      const leaderboard = interaction.fields.getTextInputValue("leaderboard");
      const pov = interaction.fields.getTextInputValue("pov");

      const embed = makeEmbed("📋 Formulaire recrutement", [
        `Candidat : ${interaction.user}`,
        "",
        `**Âge :** ${age}`,
        `**Disponibilités :** ${dispo}`,
        `**Niveau / expérience :** ${niveau}`,
        `**Leaderboard :** ${leaderboard}`,
        `**POV / infos :** ${pov}`
      ].join("\n"));

      await interaction.reply({ content: "✅ Formulaire envoyé.", ephemeral: true });
      await interaction.channel.send({ embeds: [embed] });
      await sendLog(interaction.guild, "📋 Formulaire recrutement envoyé", `Candidat : ${interaction.user}\nTicket : ${interaction.channel}`);
      return;
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Une erreur est arrivée.", ephemeral: true }).catch(() => {});
    }
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const prefix = config.prefix || "!";
  const member = message.member;

  if (message.channel.topic?.startsWith("ticket-owner:")) {
    ticketActivity.set(message.channel.id, Date.now());
  }

  if (config.security.blockInviteLinks && /(discord\.gg|discord\.com\/invite)/i.test(message.content) && !isStaff(member)) {
    await message.delete().catch(() => {});
    await sendLog(message.guild, "🚫 Invitation Discord bloquée", `Utilisateur : ${message.author}\nSalon : ${message.channel}`);
    return message.channel.send(`${message.author}, les invitations Discord sont interdites ici.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
      .catch(() => {});
  }

  if (message.mentions.users.size >= config.security.maxMentions && !isStaff(member)) {
    await message.delete().catch(() => {});
    await member.timeout(config.security.timeoutMs, "Mention massive").catch(() => {});
    await sendLog(message.guild, "🚨 Mention massive", `Utilisateur : ${message.author}\nSalon : ${message.channel}`);
    return;
  }

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const oldData = spamMap.get(key) || [];
  const recent = oldData.filter(time => now - time < config.security.intervalMs);
  recent.push(now);
  spamMap.set(key, recent);

  if (recent.length >= config.security.maxMessages && !isStaff(member)) {
    await member.timeout(config.security.timeoutMs, "Spam").catch(() => {});
    spamMap.set(key, []);
    await sendLog(message.guild, "🚨 Spam détecté", `Utilisateur : ${message.author}\nSalon : ${message.channel}`);
    await message.channel.send(`${message.author} a été timeout pour spam.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
      .catch(() => {});
    return;
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "help") {
    return message.reply({
      embeds: [makeEmbed("📖 Commandes Frozen", [
        "`!setup` → envoie le panel ticket",
        "`!close` → ferme le ticket actuel",
        "`!clear 10` → supprime des messages",
        "`!add ID` → ajoute quelqu’un au ticket",
        "`!staffstats` → stats du staff",
        "`!staffstats @membre` → stats d’un staff",
        "`!statut` → statut du bot",
        "`!help` → affiche cette aide",
        "`!giveaway op` → créer un giveaway interactif"
      ].join("\n"))]
    });
  }

  if (command === "statut") {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);

    return message.reply({
      embeds: [makeEmbed("🟢 Statut Frozen Bot", [
        "**Statut :** Online",
        `**Ping :** ${client.ws.ping}ms`,
        `**Uptime :** ${hours}h ${minutes}m ${seconds}s`,
        `**Serveurs :** ${client.guilds.cache.size}`,
        `**Utilisateurs cache :** ${client.users.cache.size}`,
        `**Mémoire :** ${memory} MB`
      ].join("\n"))]
    });
  }

  if (command === "setup") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply("❌ Tu dois être administrateur pour utiliser cette commande.");
    }

    const panelChannel = getChannelByName(message.guild, config.channels.ticketPanel) || message.channel;
    await sendTicketPanel(panelChannel);
    return message.reply(`✅ Panel ticket envoyé dans ${panelChannel}.`);
  }

  if (command === "add") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) return message.reply("❌ Cette commande doit être utilisée dans un ticket.");
    if (!isStaff(member)) return message.reply("❌ Seul le staff peut ajouter quelqu’un dans un ticket.");

    const userId = args[0]?.replace(/[<@!>]/g, "");
    if (!userId) return message.reply("Utilisation : `!add ID_DISCORD`");

    const user = await message.guild.members.fetch(userId).catch(() => null);
    if (!user) return message.reply("❌ Utilisateur introuvable.");

    await message.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    await sendLog(message.guild, "➕ Utilisateur ajouté au ticket", `Ticket : ${message.channel}\nAjouté : ${user}\nPar : ${message.author}`);
    return message.reply(`✅ ${user} a été ajouté au ticket.`);
  }

  if (command === "close") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) return message.reply("❌ Cette commande doit être utilisée dans un ticket.");
    if (!isStaff(member) && !message.channel.topic.includes(message.author.id)) return message.reply("❌ Tu n’as pas la permission de fermer ce ticket.");
    return closeTicket(message.channel, message.author);
  }

  if (command === "clear") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ Tu n’as pas la permission de supprimer des messages.");
    }

    const amount = Math.min(parseInt(args[0] || "10", 10), 100);
    if (Number.isNaN(amount) || amount < 1) return message.reply("Utilisation : `!clear 10`");

    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return message.reply("❌ Impossible de supprimer ces messages.");

    await sendLog(message.guild, "🧹 Messages supprimés", `Staff : ${message.author}\nSalon : ${message.channel}\nNombre : ${deleted.size}`);
    return message.channel.send(`✅ ${deleted.size} messages supprimés.`).then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
  }

  if (command === "staffstats") {
    if (!isStaff(member)) return message.reply("❌ Commande réservée au staff.");

    const target = message.mentions.users.first() || message.author;
    const data = loadStats();
    const stats = data[target.id] || { claimed: 0, closed: 0, recruitForms: 0 };

    return message.reply({
      embeds: [makeEmbed(`📊 Stats staff — ${target.username}`, [
        `🎯 Tickets claim : **${stats.claimed || 0}**`,
        `🔒 Tickets fermés : **${stats.closed || 0}**`,
        `📋 Formulaires : **${stats.recruitForms || 0}**`
      ].join("\n"))]
      if (command === "giveaway") {

  if (args[0] !== "op") {
    return message.reply("Utilisation : !giveaway op");
  }

  const allowed =
    config.giveaway.allowedRoles.some(roleName =>
      message.member.roles.cache.some(r => r.name === roleName)
    );

  if (!allowed) {
    return message.reply("❌ Permission refusée.");
  }

  const modal = new ModalBuilder()
    .setCustomId("giveaway_create")
    .setTitle("Créer un giveaway");

  const endDate =
    new TextInputBuilder()
      .setCustomId("endDate")
      .setLabel("Date de fin")
      .setPlaceholder("2026-05-30 20:00")
      .setStyle(TextInputStyle.Short);

  const winners =
    new TextInputBuilder()
      .setCustomId("winners")
      .setLabel("Nombre de gagnants")
      .setStyle(TextInputStyle.Short);

  const prize =
    new TextInputBuilder()
      .setCustomId("prize")
      .setLabel("Lot à gagner")
      .setStyle(TextInputStyle.Short);

  const description =
    new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Description")
      .setStyle(TextInputStyle.Paragraph);

  modal.addComponents(
    new ActionRowBuilder().addComponents(endDate),
    new ActionRowBuilder().addComponents(winners),
    new ActionRowBuilder().addComponents(prize),
    new ActionRowBuilder().addComponents(description)
  );

  return await message.reply({
    content: "❌ Les modals ne fonctionnent pas avec les messages.\nTape `/` plus tard si tu veux un vrai slash command."
  });
}
  
});

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;
  await sendLog(message.guild, "🗑️ Message supprimé", `Auteur : ${message.author || "Inconnu"}\nSalon : ${message.channel}\nMessage : ${message.content || "[vide]"}`);
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await sendLog(oldMessage.guild, "✏️ Message modifié", `Auteur : ${oldMessage.author}\nSalon : ${oldMessage.channel}\nAvant : ${oldMessage.content || "[vide]"}\nAprès : ${newMessage.content || "[vide]"}`);
});

client.on("guildMemberAdd", async member => {
  await sendLog(member.guild, "👋 Membre rejoint", `Membre : ${member.user}\nID : ${member.id}`);

  if (!config.security.antiRaid.enabled) return;

  const key = member.guild.id;
  const now = Date.now();
  const joins = (joinRaidMap.get(key) || []).filter(time => now - time < config.security.antiRaid.intervalMs);
  joins.push(now);
  joinRaidMap.set(key, joins);

  if (joins.length >= config.security.antiRaid.maxJoins) {
    await sendLog(member.guild, "🚨 Anti-raid déclenché", `${joins.length} arrivées détectées rapidement.\nLock temporaire activé.`);

    const everyone = member.guild.roles.everyone;
    for (const channel of member.guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false }).catch(() => {});
      }
    }

    setTimeout(async () => {
      for (const channel of member.guild.channels.cache.values()) {
        if (channel.type === ChannelType.GuildText) {
          await channel.permissionOverwrites.edit(everyone, { SendMessages: null }).catch(() => {});
        }
      }
      await sendLog(member.guild, "✅ Anti-raid terminé", "Les salons texte ont été déverrouillés.");
    }, config.security.antiRaid.lockMinutes * 60 * 1000);
  }
});

client.on("guildMemberRemove", async member => {
  await sendLog(member.guild, "👋 Membre parti", `Membre : ${member.user}\nID : ${member.id}`);
});

client.on("guildBanAdd", async ban => {
  await sendLog(ban.guild, "🔨 Membre banni", `Membre : ${ban.user}\nID : ${ban.user.id}`);
});

client.on("guildBanRemove", async ban => {
  await sendLog(ban.guild, "♻️ Membre débanni", `Membre : ${ban.user}\nID : ${ban.user.id}`);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const added = newRoles.filter(role => !oldRoles.has(role.id));
  const removed = oldRoles.filter(role => !newRoles.has(role.id));

  if (added.size > 0) {
    await sendLog(newMember.guild, "➕ Rôle ajouté", `Membre : ${newMember.user}\nRôle : ${added.map(r => r.name).join(", ")}`);
  }

  if (removed.size > 0) {
    await sendLog(newMember.guild, "➖ Rôle retiré", `Membre : ${newMember.user}\nRôle : ${removed.map(r => r.name).join(", ")}`);
  }
});

setInterval(async () => {
  if (!config.security.autoCloseTickets.enabled) return;

  const inactiveMs = config.security.autoCloseTickets.inactiveHours * 60 * 60 * 1000;
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel.topic?.startsWith("ticket-owner:")) continue;

      if (!ticketActivity.has(channel.id)) ticketActivity.set(channel.id, channel.createdTimestamp || now);
      const last = ticketActivity.get(channel.id);

      if (now - last >= inactiveMs) {
        await channel.send("⏱️ Ticket fermé automatiquement pour inactivité.").catch(() => {});
        await closeTicket(channel, client.user);
      }
    }
  }
}, 10 * 60 * 1000);

if (!process.env.DISCORD_TOKEN) {
  console.error("Erreur : variable DISCORD_TOKEN manquante dans Railway.");
  process.exit(1);
}

client.on("interactionCreate", async interaction => {
  try {

    if (interaction.isButton()) {

      if (interaction.customId.startsWith("giveaway_join_")) {

        const giveawayId = interaction.customId.replace("giveaway_join_", "");
        const data = giveaways.get(giveawayId);

        if (!data) {
          return interaction.reply({
            content: "❌ Giveaway terminé.",
            ephemeral: true
          });
        }

        if (Date.now() >= data.endAt) {
          return interaction.reply({
            content: "❌ Giveaway terminé.",
            ephemeral: true
          });
        }

        data.participants.add(interaction.user.id);

        return interaction.reply({
          content: "✅ Participation enregistrée.",
          ephemeral: true
        });
      }
    }

    if (interaction.isModalSubmit()) {

      if (interaction.customId === "giveaway_create") {

        const endDateInput = interaction.fields.getTextInputValue("endDate");
        const winnersInput = interaction.fields.getTextInputValue("winners");
        const prize = interaction.fields.getTextInputValue("prize");
        const description = interaction.fields.getTextInputValue("description");

        const endDate = parseGiveawayDate(endDateInput);

        if (!endDate) {
          return interaction.reply({
            content: "❌ Date invalide.",
            ephemeral: true
          });
        }

        const winnersCount = parseInt(winnersInput);

        if (isNaN(winnersCount) || winnersCount <= 0) {
          return interaction.reply({
            content: "❌ Nombre de gagnants invalide.",
            ephemeral: true
          });
        }

        const giveawayChannel =
          interaction.guild.channels.cache.get(config.giveaway.channelId);

        if (!giveawayChannel) {
          return interaction.reply({
            content: "❌ Salon giveaway introuvable.",
            ephemeral: true
          });
        }

        const rolePing =
          interaction.guild.roles.cache.find(
            r => r.name === config.giveaway.pingRole
          );

        const giveawayId = Date.now().toString();

        const embed = makeEmbed(
          "🎉 GIVEAWAY FROZEN",
          [
            `🎁 **Lot :** ${prize}`,
            `🏆 **Gagnants :** ${winnersCount}`,
            `⏰ **Fin :** <t:${Math.floor(endDate.getTime() / 1000)}:F>`,
            "",
            description,
            "",
            "Clique sur 🎉 pour participer."
          ].join("\n")
        );

        const button = new ButtonBuilder()
          .setCustomId(`giveaway_join_${giveawayId}`)
          .setLabel("Participer")
          .setEmoji("🎉")
          .setStyle(ButtonStyle.Success);

        const giveawayMessage = await giveawayChannel.send({
          content: rolePing
            ? `${rolePing} 🎉 Nouveau giveaway`
            : "@everyone 🎉 Nouveau giveaway",
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(button)
          ]
        });

        giveaways.set(giveawayId, {
          messageId: giveawayMessage.id,
          channelId: giveawayChannel.id,
          prize,
          winnersCount,
          endAt: endDate.getTime(),
          participants: new Set()
        });

        await interaction.reply({
          content: "✅ Giveaway créé.",
          ephemeral: true
        });

        setTimeout(async () => {

          const data = giveaways.get(giveawayId);

          if (!data) return;

          const participants = [...data.participants];

          if (participants.length <= 0) {

            await giveawayChannel.send(
              `❌ Giveaway terminé.\nAucun participant.`
            );

            giveaways.delete(giveawayId);
            return;
          }

          const winners =
            pickWinners(participants, data.winnersCount);

          const winnersPing =
            winners.map(id => `<@${id}>`).join(" ");

          await giveawayChannel.send(
            `🎉 Félicitations ${winnersPing}\nVous gagnez : **${data.prize}**`
          );

          giveaways.delete(giveawayId);

        }, endDate.getTime() - Date.now());
      }
    }

  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);
