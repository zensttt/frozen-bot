module.exports = {
  prefix: "!",
  serverName: "Frozen ᴾⱽᴾ",

  channels: {
    ticketPanel: "🆘｜𝙏𝙞𝙘𝙠𝙚𝙩s",
    ticketLogs: "✅｜𝙏𝙞𝙘𝙠𝙚𝙩-𝙡𝙤𝙜𝙨",
    ticketLogsId: "1416470334701305866"
  },

  staffRoles: {
    fondateur: "𝑭𝒐𝒏𝒅𝒂𝒕𝒆𝒖𝒓",
    miniFondateur: "👑𝑴𝒊𝒏𝒊 𝑭𝒐𝒏𝒅𝒂𝒕𝒆𝒖𝒓 👑",
    gerantRecruteur: "Gérant recruteur"
  },

  recruitmentMessage: [
    "Si tu veux nous rejoindre, voici ce qu’on demande :",
    "• Ton âge",
    "• Quelques POV pour voir ton niveau 🎥",
    "• Un minimum de présence",
    "• Respect entre joueurs",
    "• Le trash IG est autorisé, mais Push-to-Talk obligatoire",
    "• Ton leaderboard à jour"
  ].join("\\n"),

  security: {
    maxMessages: 6,
    intervalMs: 5000,
    timeoutMs: 60000,
    maxMentions: 6,
    blockInviteLinks: true,

    antiRaid: {
      enabled: true,
      maxJoins: 5,
      intervalMs: 20000,
      lockMinutes: 10
    },

    autoCloseTickets: {
      enabled: true,
      inactiveHours: 12
    }
  }
};
