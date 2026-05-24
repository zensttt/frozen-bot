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

  recruitmentMessage:
"Auras-tu le niveau pour nous rejoindre ?",

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
  },

  branding: {
    imageUrl: "https://cdn.discordapp.com/attachments/1426231440328102079/1508070945024250046/ChatGPT_Image_23_mai_2026_00_30_28.png?ex=6a143403&is=6a12e283&hm=4ea027cac4111d39e52702ef705724c438b59de7180aa4fb463fefd7173378b0&"
  }
};
