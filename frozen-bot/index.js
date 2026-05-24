require("dotenv").config();

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
  AttachmentBuilder
} = require("discord.js");

const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const spamMap = new Map();

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

function isFounder(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some(role =>
    role.name === config.staffRoles.fondateur ||
    role.name === config.staffRoles.miniFondateur
  );
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
    .setTimestamp();
}

async function createTranscript(channel) {
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

  let content = `Transcript du ticket : #${channel.name}\n`;
  content += `Salon ID : ${channel.id}\n`;
  content += `Date : ${new Date().toLocaleString("fr-FR")}\n`;
  content += "----------------------------------------\n\n";

  for (const msg of messages) {
    const date = new Date(msg.createdTimestamp).toLocaleString("fr-FR");
    const author = msg.author ? `${msg.author.tag} (${msg.author.id})` : "Inconnu";
    const text = msg.content && msg.content.trim() ? msg.content : "[embed/fichier/sans texte]";
    const attachments = msg.attachments.size > 0
      ? "\nFichiers : " + msg.attachments.map(a => a.url).join(", ")
      : "";

    content += `[${date}] ${author}\n${text}${attachments}\n\n`;
  }

  return new AttachmentBuilder(Buffer.from(content, "utf-8"), {
    name: `transcript-${channel.name}.txt`
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

async function createTicket(interaction, typeLabel, ticketType) {
  const guild = interaction.guild;
  const member = interaction.member;

  const alreadyOpen = guild.channels.cache.find(ch => ch.topic === `ticket-owner:${member.id}`);
  if (alreadyOpen) {
    return interaction.reply({
      content: `Tu as déjà un ticket ouvert : ${alreadyOpen}`,
      ephemeral: true
    });
  }

  let category = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildCategory && ch.name === "Tickets"
  );

  if (!category) {
    category = await guild.channels.create({
      name: "Tickets",
      type: ChannelType.GuildCategory
    });
  }

  const fondateurRole = getRole(guild, config.staffRoles.fondateur);
  const miniFondateurRole = getRole(guild, config.staffRoles.miniFondateur);
  const gerantRecruteurRole = getRole(guild, config.staffRoles.gerantRecruteur);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
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

  } else if (ticketType === "recrutement") {
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
} else {
    for (const roleName of getStaffRolesArray()) {
      const role = getRole(guild, roleName);
      if (role) {
        overwrites.push({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages
          ]
        });
      }
    }
  }

  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);

  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket-owner:${member.id}`,
    permissionOverwrites: overwrites
  });

  const closeButton = new ButtonBuilder()
    .setCustomId("close_ticket")
    .setLabel("Fermer le ticket")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Danger);

  let ping = "";
  let description = `${member}, ton ticket est ouvert.\nUn membre du staff va te répondre.`;

  if (ticketType === "recrutement") {
    ping = gerantRecruteurRole ? `${gerantRecruteurRole}` : "";
    description = `${member}, ton ticket recrutement est ouvert.\n\n${config.recruitmentMessage}`;
  }

  if (ticketType === "probleme") {
    ping = fondateurRole ? `${fondateurRole}` : "";
    description = `${member}, ton ticket problème est ouvert.\nLes fondateurs vont te répondre.`;
  }

  await channel.send({
    content: `${member} ${ping}`.trim(),
    embeds: [makeEmbed(`🎫 Ticket — ${typeLabel}`, description)],
    components: [new ActionRowBuilder().addComponents(closeButton)]
  });

  const logChannel = getLogChannel(guild);
  if (logChannel) {
    await logChannel.send({
      embeds: [
        makeEmbed(
          "📩 Ticket ouvert",
          `Utilisateur : ${member}\nCatégorie : **${typeLabel}**\nSalon : ${channel}`
        )
      ]
    }).catch(() => {});
  }

  return interaction.reply({ content: `Ticket créé : ${channel}`, ephemeral: true });
}

async function sendGraphiqueMenu(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("graphique_menu")
    .setPlaceholder("Choisis un dossier graphique")
    .addOptions(
      { label: "FPS", value: "fps", emoji: "⚡" },
      { label: "CVC", value: "cvc", emoji: "🧊" },
      { label: "Opti", value: "opti", emoji: "🚀" },
      { label: "Troll", value: "troll", emoji: "😈" },
      { label: "Reshade", value: "reshade", emoji: "🎨" }
    );

  return interaction.reply({
    embeds: [makeEmbed("🎨 Pack Graphique", "Choisis le dossier que tu veux télécharger.")],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}

async function sendPackList(interaction, title, packs) {
  if (!packs || packs.length === 0) {
    return interaction.reply({
      content: "Aucun lien n’est encore configuré pour cette catégorie.",
      ephemeral: true
    });
  }

  const text = packs
    .map((pack, index) => `**${index + 1}. ${pack.name}**\n${pack.url}`)
    .join("\n\n");

  return interaction.reply({
    embeds: [makeEmbed(title, text.slice(0, 3900))],
    ephemeral: true
  });
}

async function closeTicket(channel, closedBy) {
  const guild = channel.guild;
  const logChannel = getLogChannel(guild);
  const transcript = await createTranscript(channel);

  if (logChannel) {
    await logChannel.send({
      embeds: [
        makeEmbed(
          "🔒 Ticket fermé",
          `Salon : **${channel.name}**\nFermé par : ${closedBy}`
        )
      ],
      files: [transcript]
    }).catch(() => {});
  }

  await channel.send("🔒 Ticket fermé dans 5 secondes.");
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

client.once("ready", () => {
  console.log(`Frozen connecté : ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: `${config.serverName} 🧊` }],
    status: "online"
  });
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_menu") {
        const choice = interaction.values[0];

        const labels = {
          recrutement: "📋 Recrutement",
          probleme: "🛠️ Problème"
        };

        return createTicket(interaction, labels[choice] || choice, choice);
      }

      if (interaction.customId === "graphique_menu") {
        const choice = interaction.values[0];
        return sendPackList(
          interaction,
          `🎨 Pack Graphique — ${choice.toUpperCase()}`,
          config.packs.graphique[choice]
        );
      }
    }

    if (interaction.isButton() && interaction.customId === "close_ticket") {
      if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
        return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
      }

      await interaction.reply("Fermeture du ticket...");
      return closeTicket(interaction.channel, interaction.user);
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

  if (
    config.security.blockInviteLinks &&
    /(discord\.gg|discord\.com\/invite)/i.test(message.content) &&
    !isStaff(member)
  ) {
    await message.delete().catch(() => {});
    return message.channel.send(`${message.author}, les invitations Discord sont interdites ici.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
      .catch(() => {});
  }

  if (message.mentions.users.size >= config.security.maxMentions && !isStaff(member)) {
    await message.delete().catch(() => {});
    await member.timeout(config.security.timeoutMs, "Mention massive").catch(() => {});
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
      embeds: [
        makeEmbed(
          "📖 Commandes Frozen",
          [
            "`!setup` → envoie le panel ticket",
            "`!close` → ferme le ticket actuel",
            "`!clear 10` → supprime des messages",
            "`!add ID` → ajoute quelqu’un au ticket",
            "`!packs` → affiche les catégories de packs",
            "`!help` → affiche cette aide"
          ].join("\n")
        )
      ]
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
    if (!message.channel.topic?.startsWith("ticket-owner:")) {
      return message.reply("❌ Cette commande doit être utilisée dans un ticket.");
    }

    if (!isStaff(member)) {
      return message.reply("❌ Seul le staff peut ajouter quelqu’un dans un ticket.");
    }

    const userId = args[0]?.replace(/[<@!>]/g, "");
    if (!userId) return message.reply("Utilisation : `!add ID_DISCORD`");

    const user = await message.guild.members.fetch(userId).catch(() => null);
    if (!user) return message.reply("❌ Utilisateur introuvable.");

    await message.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    return message.reply(`✅ ${user} a été ajouté au ticket.`);
  }

  if (command === "close") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) {
      return message.reply("❌ Cette commande doit être utilisée dans un ticket.");
    }

    if (!isStaff(member) && !message.channel.topic.includes(message.author.id)) {
      return message.reply("❌ Tu n’as pas la permission de fermer ce ticket.");
    }

    return closeTicket(message.channel, message.author);
  }

  if (command === "clear") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ Tu n’as pas la permission de supprimer des messages.");
    }

    const amount = Math.min(parseInt(args[0] || "10", 10), 100);
    if (Number.isNaN(amount) || amount < 1) {
      return message.reply("Utilisation : `!clear 10`");
    }

    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return message.reply("❌ Impossible de supprimer ces messages.");

    return message.channel.send(`✅ ${deleted.size} messages supprimés.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
  }

  if (command === "packs") {
    return message.reply({
      embeds: [
        makeEmbed(
          "📦 Packs disponibles",
          [
            "🎵 **Pack Son** : utilise le panel ticket.",
            "🎨 **Pack Graphique** : FPS, CVC, Opti, Troll, Reshade.",
            "",
            "Les liens se modifient dans `config.js`."
          ].join("\n")
        )
      ]
    });
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Erreur : variable DISCORD_TOKEN manquante dans Railway.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
