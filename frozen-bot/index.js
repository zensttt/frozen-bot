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
  PermissionFlagsBits
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

function isStaff(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some(role => config.staffRoles.includes(role.name));
}

function getChannelByName(guild, name) {
  return guild.channels.cache.find(ch => ch.name === name);
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${config.serverName} • Frozen Bot` })
    .setTimestamp();
}

function chunkText(text, max = 3900) {
  const chunks = [];
  let current = "";

  for (const part of text.split("\n\n")) {
    if ((current + "\n\n" + part).length > max) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? current + "\n\n" + part : part;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sendTicketPanel(channel) {
  const embed = makeEmbed(
    "🧊 Panel Tickets — Frozen",
    [
      "Sélectionne une catégorie dans le menu ci-dessous.",
      "",
      "📋 **Recrutement**",
      "🛠️ **Problème**",
      "🎨 **Pack Graphique**",
      "🎵 **Pack Son**"
    ].join("\n")
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_menu")
    .setPlaceholder("Choisis une catégorie")
    .addOptions(
      { label: "Recrutement", value: "recrutement", emoji: "📋" },
      { label: "Problème", value: "probleme", emoji: "🛠️" },
      { label: "Pack Graphique", value: "pack_graphique", emoji: "🎨" },
      { label: "Pack Son", value: "pack_son", emoji: "🎵" }
    );

  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

async function createTicket(interaction, typeLabel) {
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

  const staffRoles = guild.roles.cache.filter(role => config.staffRoles.includes(role.name));

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
    },
    ...staffRoles.map(role => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }))
  ];

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

  await channel.send({
    content: `${member}`,
    embeds: [
      makeEmbed(
        `🎫 Ticket — ${typeLabel}`,
        `${member}, ton ticket est ouvert.\nUn membre du staff va te répondre.`
      )
    ],
    components: [new ActionRowBuilder().addComponents(closeButton)]
  });

  const logChannel = getChannelByName(guild, config.channels.ticketLogs);
  if (logChannel) {
    await logChannel.send({
      embeds: [
        makeEmbed(
          "📩 Ticket ouvert",
          `Utilisateur : ${member}\nCatégorie : **${typeLabel}**\nSalon : ${channel}`
        )
      ]
    });
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

  const chunks = chunkText(text);
  await interaction.reply({
    embeds: [makeEmbed(title, chunks.shift())],
    ephemeral: true
  });

  for (const chunk of chunks) {
    await interaction.followUp({
      embeds: [makeEmbed(title, chunk)],
      ephemeral: true
    });
  }
}

async function closeTicket(channel, closedBy) {
  const guild = channel.guild;

  const logChannel = getChannelByName(guild, config.channels.ticketLogs);
  if (logChannel) {
    await logChannel.send({
      embeds: [
        makeEmbed(
          "🔒 Ticket fermé",
          `Salon : **${channel.name}**\nFermé par : ${closedBy}`
        )
      ]
    });
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

        if (choice === "pack_graphique") return sendGraphiqueMenu(interaction);
        if (choice === "pack_son") return sendPackList(interaction, "🎵 Pack Son", config.packs.son);

        const labels = {
          recrutement: "📋 Recrutement",
          probleme: "🛠️ Problème"
        };

        return createTicket(interaction, labels[choice] || choice);
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
