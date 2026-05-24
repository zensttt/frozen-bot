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

function hasStaffRole(member) {
  return member.roles.cache.some(role => config.staffRoles.includes(role.name));
}

function getChannelByName(guild, name) {
  return guild.channels.cache.find(ch => ch.name === name);
}

function frozenEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Frozen ᴾⱽᴾ • Bot Frozen" })
    .setTimestamp();
}

async function sendTicketPanel(channel) {
  const embed = frozenEmbed(
    "🧊 Panel Tickets — Frozen",
    [
      "Sélectionne une catégorie pour ouvrir un ticket.",
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

async function createTicket(interaction, type) {
  const guild = interaction.guild;
  const member = interaction.member;

  const existing = guild.channels.cache.find(ch =>
    ch.name === `ticket-${member.user.username.toLowerCase()}` ||
    ch.topic === `ticket-owner:${member.id}`
  );

  if (existing) {
    return interaction.reply({
      content: `Tu as déjà un ticket ouvert : ${existing}`,
      ephemeral: true
    });
  }

  let categoryName = "Tickets";
  let parent = guild.channels.cache.find(ch => ch.type === ChannelType.GuildCategory && ch.name === categoryName);

  if (!parent) {
    parent = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory
    });
  }

  const staffRoles = guild.roles.cache.filter(role => config.staffRoles.includes(role.name));

  const permissionOverwrites = [
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

  const channel = await guild.channels.create({
    name: `ticket-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    type: ChannelType.GuildText,
    parent: parent.id,
    topic: `ticket-owner:${member.id}`,
    permissionOverwrites
  });

  const closeButton = new ButtonBuilder()
    .setCustomId("close_ticket")
    .setLabel("Fermer le ticket")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Danger);

  const embed = frozenEmbed(
    `Ticket ${type}`,
    `${member}, ton ticket a été ouvert.\nUn membre du staff va te répondre.`
  );

  await channel.send({
    content: `${member}`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(closeButton)]
  });

  const logChannel = getChannelByName(guild, config.channels.ticketLogs);
  if (logChannel) {
    await logChannel.send({
      embeds: [frozenEmbed("📩 Ticket ouvert", `Utilisateur : ${member}\nCatégorie : **${type}**\nSalon : ${channel}`)]
    });
  }

  await interaction.reply({
    content: `Ticket créé : ${channel}`,
    ephemeral: true
  });
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

  await interaction.reply({
    embeds: [frozenEmbed("🎨 Pack Graphique", "Choisis le dossier que tu veux télécharger.")],
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

  await interaction.reply({
    embeds: [frozenEmbed(title, text.slice(0, 4000))],
    ephemeral: true
  });
}

client.once("ready", () => {
  console.log(`Frozen connecté en tant que ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "Frozen ᴾⱽᴾ 🧊" }],
    status: "online"
  });
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "!setup") {
        const channel = getChannelByName(interaction.guild, config.channels.ticketPanel) || interaction.channel;
        await sendTicketPanel(channel);
        return interaction.reply({ content: "Panel ticket envoyé.", ephemeral: true });
      }

      if (interaction.commandName === "!close") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Cette commande doit être utilisée dans un ticket.", ephemeral: true });
        }
        await interaction.reply("Ticket fermé dans 5 secondes.");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }

      if (interaction.commandName === "!clear") {
        const amount = interaction.options.getInteger("nombre");
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: `${deleted.size} messages supprimés.`, ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "!ticket_menu") {
        const value = interaction.values[0];

        if (value === "pack_graphique") return sendGraphiqueMenu(interaction);
        if (value === "pack_son") return sendPackList(interaction, "🎵 Pack Son", config.packs.son);

        const labels = {
          recrutement: "📋 Recrutement",
          probleme: "🛠️ Problème"
        };

        return createTicket(interaction, labels[value] || value);
      }

      if (interaction.customId === "!graphique_menu") {
        const value = interaction.values[0];
        return sendPackList(interaction, `🎨 Pack Graphique — ${value.toUpperCase()}`, config.packs.graphique[value]);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "!close_ticket") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
        }

        const logChannel = getChannelByName(interaction.guild, config.channels.ticketLogs);
        if (logChannel) {
          await logChannel.send({
            embeds: [frozenEmbed("🔒 Ticket fermé", `Salon : **${interaction.channel.name}**\nFermé par : ${interaction.user}`)]
          });
        }

        await interaction.reply("Ticket fermé dans 5 secondes.");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }
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

  const member = message.member;
  if (!member) return;

  // Anti-invite Discord
  if (
    config.security.blockInviteLinks &&
    /(discord\.gg|discord\.com\/invite)/i.test(message.content) &&
    !hasStaffRole(member)
  ) {
    await message.delete().catch(() => {});
    return message.channel.send(`${message.author}, les invitations Discord sont interdites ici.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
  }

  // Anti-mention massive
  if (message.mentions.users.size >= config.security.maxMentions && !hasStaffRole(member)) {
    await message.delete().catch(() => {});
    await member.timeout(config.security.timeoutMs, "Mention massive").catch(() => {});
    return;
  }

  // Anti-spam simple
  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const data = spamMap.get(key) || [];
  const recent = data.filter(timestamp => now - timestamp < config.security.intervalMs);
  recent.push(now);
  spamMap.set(key, recent);

  if (recent.length >= config.security.maxMessages && !hasStaffRole(member)) {
    await member.timeout(config.security.timeoutMs, "Spam").catch(() => {});
    await message.channel.send(`${message.author} a été timeout pour spam.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    spamMap.set(key, []);
  }
});

client.login(process.env.MTUwNzUxMTg3ODgzMjc1MDc5NQ.G4BUck.hrXbZ-KREXFEsa_W8jI4jmCW2XYF3fC_hMfQeM);
