require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Envoie le panel ticket Frozen")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Ferme le ticket actuel"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprime des messages")
    .addIntegerOption(option =>
      option.setName("nombre")
        .setDescription("Nombre de messages à supprimer")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Déploiement des commandes slash...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Commandes installées avec succès.");
  } catch (error) {
    console.error(error);
  }
})();
