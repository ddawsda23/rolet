const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  PermissionFlagsBits,
} = require("discord.js");

const { token, prefix } = require("./config.js");
const { getPlayer, addPoints, getTop } = require("./economy.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ─── Active Games ────────────────────────────────────────────────────────────
const activeGames = new Map(); // channelId → gameState

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

const ROULETTE_FRAMES = ["🔴⚪⚪", "⚪🔴⚪", "⚪⚪🔴", "⚪🔴⚪", "🔴⚪⚪"];
const SPIN_EMOJIS = ["🎰", "🌀", "💫", "✨", "🎲"];

// ─── Build Registration Embed ─────────────────────────────────────────────────
function buildRegistrationEmbed(players) {
  const list =
    players.size > 0
      ? [...players.values()].map((p, i) => `${i + 1}. <@${p.id}>`).join("\n")
      : "_لا يوجد لاعبون بعد..._";

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🎰 لعبة الروليت")
    .setDescription(
      "**مرحباً بكم في لعبة الروليت!**\n\nاضغط **انضمام** للدخول إلى اللعبة.\nعندما يكون عدد اللاعبين كافياً، اضغط **ابدأ اللعبة**."
    )
    .addFields(
      {
        name: `👥 اللاعبون المنضمون (${players.size})`,
        value: list,
        inline: false,
      },
      {
        name: "📋 القواعد",
        value:
          "• يُختار لاعب عشوائياً في كل جولة\n• عليه طرد أحد اللاعبين خلال 15 ثانية\n• من يبقى آخراً يفوز بـ 20 نقطة 🏆",
        inline: false,
      }
    )
    .setFooter({ text: "الروليت • الحد الأدنى لاعبان للبدء" })
    .setTimestamp();
}

// ─── Build Registration Buttons ───────────────────────────────────────────────
function buildRegistrationButtons(gameStarted = false) {
  const joinBtn = new ButtonBuilder()
    .setCustomId("roulette_join")
    .setLabel("انضمام ✅")
    .setStyle(ButtonStyle.Success)
    .setDisabled(gameStarted);

  const leaveBtn = new ButtonBuilder()
    .setCustomId("roulette_leave")
    .setLabel("انسحاب ❌")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(gameStarted);

  const shopBtn = new ButtonBuilder()
    .setCustomId("roulette_shop")
    .setLabel("المتجر 🛒")
    .setStyle(ButtonStyle.Secondary);

  const statsBtn = new ButtonBuilder()
    .setCustomId("roulette_stats")
    .setLabel("إحصائيات 📊")
    .setStyle(ButtonStyle.Secondary);

  const startBtn = new ButtonBuilder()
    .setCustomId("roulette_start")
    .setLabel("ابدأ اللعبة 🎰")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(gameStarted);

  return [
    new ActionRowBuilder().addComponents(joinBtn, leaveBtn, shopBtn, statsBtn),
    new ActionRowBuilder().addComponents(startBtn),
  ];
}

// ─── Spin Animation ───────────────────────────────────────────────────────────
async function runSpinAnimation(message, players) {
  const playerList = [...players.values()];

  for (let i = 0; i < ROULETTE_FRAMES.length; i++) {
    const frame = ROULETTE_FRAMES[i];
    const spinEmbed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle(`${SPIN_EMOJIS[i]} الروليت يدور...`)
      .setDescription(
        `\`\`\`\n${frame}\n\`\`\`\n**جاري اختيار اللاعب...**`
      )
      .setFooter({ text: "لا تتوقف... 🌀" });

    await message.edit({ embeds: [spinEmbed], components: [] });
    await sleep(600);
  }

  // Pick random player
  const picked = playerList[Math.floor(Math.random() * playerList.length)];

  const pickedEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🎯 تم الاختيار!")
    .setDescription(`> **<@${picked.id}>**\nأنت المختار هذه الجولة!`)
    .setFooter({ text: "لديك 15 ثانية لاتخاذ قرارك..." });

  await message.edit({ embeds: [pickedEmbed], components: [] });
  await sleep(2000);

  return picked;
}

// ─── Elimination Phase ────────────────────────────────────────────────────────
async function eliminationPhase(channel, picker, players) {
  const others = [...players.values()].filter((p) => p.id !== picker.id);

  if (others.length === 0) return null;

  // Build player buttons (max 25 buttons = 5 rows × 5)
  const rows = [];
  const chunks = [];
  for (let i = 0; i < others.length; i += 5) {
    chunks.push(others.slice(i, i + 5));
  }

  for (const chunk of chunks.slice(0, 5)) {
    const row = new ActionRowBuilder();
    for (const p of chunk) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`eliminate_${p.id}`)
          .setLabel(p.username)
          .setStyle(ButtonStyle.Danger)
      );
    }
    rows.push(row);
  }

  const elimEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("⚠️ وقت الطرد!")
    .setDescription(
      `<@${picker.id}> **لديك 15 ثانية لاختيار لاعب لطرده!**\n\nاختر بحكمة... ⏳`
    )
    .addFields({
      name: "اللاعبون المتاحون للطرد",
      value: others.map((p) => `• <@${p.id}>`).join("\n"),
    })
    .setFooter({ text: "⏱️ 15 ثانية" });

  const elimMsg = await channel.send({
    embeds: [elimEmbed],
    components: rows,
  });

  // Countdown updates
  const countdownIntervals = [10, 5, 3];
  const timers = countdownIntervals.map((sec) =>
    setTimeout(async () => {
      try {
        const updatedEmbed = new EmbedBuilder()
          .setColor(sec <= 5 ? 0xff0000 : 0xe74c3c)
          .setTitle(`⚠️ وقت الطرد! ⏱️ ${sec} ثوانٍ`)
          .setDescription(
            `<@${picker.id}> **تبقى ${sec} ثوانٍ فقط!**\n${sec <= 5 ? "⚡ **اختر الآن أو ستُطرد!**" : ""}`
          )
          .addFields({
            name: "اللاعبون المتاحون للطرد",
            value: others.map((p) => `• <@${p.id}>`).join("\n"),
          });
        await elimMsg.edit({ embeds: [updatedEmbed], components: rows });
      } catch {}
    }, (15 - sec) * 1000)
  );

  return new Promise((resolve) => {
    const collector = elimMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 15000,
      filter: (i) => i.user.id === picker.id,
    });

    collector.on("collect", async (interaction) => {
      const eliminatedId = interaction.customId.replace("eliminate_", "");
      const eliminated = players.get(eliminatedId);
      timers.forEach(clearTimeout);
      collector.stop("picked");

      await interaction.deferUpdate();

      const successEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ تم الطرد!")
        .setDescription(
          `<@${picker.id}> اختار طرد <@${eliminatedId}>!\n\n**<@${eliminatedId}> غادر اللعبة! 👋**`
        );

      await elimMsg.edit({ embeds: [successEmbed], components: [] });
      resolve(eliminated);
    });

    collector.on("end", async (_, reason) => {
      timers.forEach(clearTimeout);
      if (reason !== "picked") {
        // Auto-eliminate the picker
        const autoEmbed = new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle("⏰ انتهى الوقت!")
          .setDescription(
            `<@${picker.id}> لم يختر في الوقت المحدد...\n**تم طرده تلقائياً! 🚪**`
          );
        await elimMsg.edit({ embeds: [autoEmbed], components: [] }).catch(() => {});
        resolve(picker); // picker eliminates themselves
      }
    });
  });
}

// ─── Main Game Loop ───────────────────────────────────────────────────────────
async function runGame(channel, players, lobbyMessage) {
  const game = activeGames.get(channel.id);
  game.running = true;

  await lobbyMessage.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🎰 اللعبة بدأت!")
        .setDescription("جاري تجهيز الجولة الأولى..."),
    ],
    components: [],
  });

  await sleep(1500);

  let round = 1;

  while (players.size > 1) {
    // Round header
    const roundEmbed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`🎮 الجولة ${round}`)
      .setDescription(
        `**اللاعبون المتبقون: ${players.size}**\n\n${[...players.values()]
          .map((p) => `• <@${p.id}>`)
          .join("\n")}`
      )
      .setFooter({ text: "الروليت يدور..." });

    const roundMsg = await channel.send({ embeds: [roundEmbed] });
    await sleep(1500);

    // Spin
    const picker = await runSpinAnimation(roundMsg, players);

    // Elimination
    const eliminated = await eliminationPhase(channel, picker, players);

    if (eliminated) {
      players.delete(eliminated.id);

      const elim = eliminated.id === picker.id ? "نفسه" : `<@${eliminated.id}>`;
      const roundResultEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`🔴 نهاية الجولة ${round}`)
        .setDescription(
          `**تم طرد ${elim}!**\n\nاللاعبون المتبقون: **${players.size}**`
        );

      await channel.send({ embeds: [roundResultEmbed] });
    }

    await sleep(2000);
    round++;
  }

  // ── Winner ──
  const winner = [...players.values()][0];
  addPoints(winner.id, winner.username, 20);

  const winnerEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 لدينا فائز!")
    .setDescription(
      `## 🎉 <@${winner.id}> فاز باللعبة!\n\n**+20 نقطة أُضيفت إلى رصيده!**\n\n${getTop(3)
        .map((p, i) => `${["🥇","🥈","🥉"][i]} <@${p.id}> — ${p.points} نقطة`)
        .join("\n")}`
    )
    .setFooter({ text: "شكراً للجميع على المشاركة! 🎰" })
    .setTimestamp();

  await channel.send({ embeds: [winnerEmbed] });
  activeGames.delete(channel.id);
}

// ─── Command: !روليت ──────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args[0].toLowerCase();

  // ── !روليت ──
  if (command === "روليت" || command === "roulette") {
    if (activeGames.has(message.channel.id)) {
      return message.reply("⚠️ **يوجد لعبة نشطة بالفعل في هذه القناة!**");
    }

    const players = new Map();
    const game = { running: false, players };
    activeGames.set(message.channel.id, game);

    const embed = buildRegistrationEmbed(players);
    const components = buildRegistrationButtons(false);

    const lobbyMsg = await message.channel.send({
      embeds: [embed],
      components,
    });

    // ── Button Collector ──
    const collector = lobbyMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000, // 5 min lobby
    });

    collector.on("collect", async (interaction) => {
      const user = interaction.user;

      // ── Join ──
      if (interaction.customId === "roulette_join") {
        if (players.has(user.id)) {
          return interaction.reply({
            content: "⚠️ أنت منضم بالفعل!",
            ephemeral: true,
          });
        }
        players.set(user.id, { id: user.id, username: user.username });
        await interaction.update({
          embeds: [buildRegistrationEmbed(players)],
          components: buildRegistrationButtons(false),
        });
      }

      // ── Leave ──
      else if (interaction.customId === "roulette_leave") {
        if (!players.has(user.id)) {
          return interaction.reply({
            content: "⚠️ أنت لست في اللعبة!",
            ephemeral: true,
          });
        }
        players.delete(user.id);
        await interaction.update({
          embeds: [buildRegistrationEmbed(players)],
          components: buildRegistrationButtons(false),
        });
      }

      // ── Shop ──
      else if (interaction.customId === "roulette_shop") {
        const shopEmbed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("🛒 المتجر")
          .setDescription("_المتجر قيد التطوير..._\nقريباً ستتمكن من شراء مزايا خاصة بنقاطك!")
          .setFooter({ text: "ابقَ معنا! 🔧" });

        await interaction.reply({ embeds: [shopEmbed], ephemeral: true });
      }

      // ── Stats ──
      else if (interaction.customId === "roulette_stats") {
        const player = getPlayer(user.id, user.username);
        const statsEmbed = new EmbedBuilder()
          .setColor(0x1abc9c)
          .setTitle(`📊 إحصائيات ${user.username}`)
          .addFields(
            { name: "💰 النقاط", value: `${player.points}`, inline: true },
            { name: "🏅 الانتصارات", value: `${player.wins}`, inline: true }
          );

        await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
      }

      // ── Start ──
      else if (interaction.customId === "roulette_start") {
        if (players.size < 2) {
          return interaction.reply({
            content: "⚠️ **يجب أن يكون هناك لاعبان على الأقل لبدء اللعبة!**",
            ephemeral: true,
          });
        }

        collector.stop("started");
        await interaction.deferUpdate();
        await runGame(message.channel, players, lobbyMsg);
      }
    });

    collector.on("end", (_, reason) => {
      if (reason !== "started") {
        activeGames.delete(message.channel.id);
        lobbyMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle("❌ انتهت صلاحية اللعبة")
                .setDescription("انتهى وقت التسجيل دون بدء اللعبة."),
            ],
            components: [],
          })
          .catch(() => {});
      }
    });
  }

  // ── !نقاط ──
  else if (command === "نقاط" || command === "points") {
    const target = message.mentions.users.first() || message.author;
    const player = getPlayer(target.id, target.username);

    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle(`💰 نقاط ${target.username}`)
      .setDescription(`**${player.points} نقطة**`)
      .addFields({ name: "🏅 انتصارات", value: `${player.wins}` });

    message.reply({ embeds: [embed] });
  }

  // ── !قائمة ──
  else if (command === "قائمة" || command === "leaderboard") {
    const top = getTop(10);
    if (!top.length) return message.reply("لا توجد بيانات بعد!");

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🏆 قائمة المتصدرين")
      .setDescription(
        top
          .map((p, i) => `${["🥇","🥈","🥉"][i] || `${i + 1}.`} <@${p.id}> — **${p.points}** نقطة`)
          .join("\n")
      );

    message.reply({ embeds: [embed] });
  }
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`✅ البوت يعمل كـ: ${client.user.tag}`);
  console.log(`🎰 جاهز للعب الروليت!`);
  client.user.setActivity("🎰 لعبة الروليت", { type: 0 });
});

client.login(token);
