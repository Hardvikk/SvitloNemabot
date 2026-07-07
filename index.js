import { getCity, getStreet, getBuildName, getGroups, generateKey, getSchedule, compressTime, formatDate, getCurrentInterval, getNextInterval  } from "./api-call.js";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fs from 'fs';
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

dotenv.config({
  quiet:true,
});

// replace the value below with the Telegram token you receive from @BotFather
const token = `${process.env.BOT_TOKKEN}`;

const ALGORITHM = "aes-256-cbc";
const SECRET = process.env.DATA_SECRET;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getKey() {
  return crypto.createHash("sha256").update(String(SECRET)).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

const sessions = new Map();
const users = new Map();

const DB_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  try {
    if (!fs.existsSync(DB_FILE)) return;

    const raw = fs.readFileSync(DB_FILE, "utf8");
    if (!raw.trim()) return;

    const decrypted = decrypt(raw);
    const data = JSON.parse(decrypted);

    for (const [chatId, userData] of Object.entries(data)) {
      users.set(chatId, userData);
    }
  } catch (err) {
    console.error("Помилка читання users.json:", err.message);
  }
}
function saveUsers() {
  try {
    const data = Object.fromEntries(users);
    const json = JSON.stringify(data, null, 2);
    const encrypted = encrypt(json);

    fs.writeFileSync(DB_FILE, encrypted, "utf8");
  } catch (err) {
    console.error("Помилка запису users.json:", err.message);
  }
}

loadUsers();

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});
// Matches "/echo [whatever]"

bot.setMyCommands([
  { command: 'start', description: 'Запуск бота' },
  { command: 'help', description: 'Довідка' },
  { command: 'address', description: 'Вказати адресу' },
  { command: 'graph', description: 'Показати графік' },
  { command: 'myinfo', description: 'Моя інформація' },
  { command: 'cancel', description: 'Скасувати дію' }
]);

bot.onText(/^\/start$/i, (msg) => {
  bot.sendMessage(msg.chat.id,
  `Привіт це бот для легкого перегляду графіків.

Для додавання адреси використай команду /address
  
Довідка: /help`
  );
});

bot.onText(/^\/help$/i, (msg) => {
  bot.sendMessage(msg.chat.id,
  `Команди:
/address команда для введеня вашої  адреси.
/graph команда для перегляду графіку відключення світла.
/myinfo команда для перегляду своєї інформації.
/start команда для виведення привітання.`
  )});
  
bot.onText(/^\/address$/i, (msg) => {
  const chatId = msg.chat.id;
  const userKey = String(chatId);
  sessions.set(chatId, { step: "city" });
  
  if (!users.has(userKey)) {
    users.set(userKey, {
      city: "",
      street: "",
      build: "",
      group: "",
    });
    saveUsers();
  }
  
  bot.sendMessage(chatId, "Введи місто (наприклад: Тернопіль). Для скасування напиши /cancel");
});

bot.onText(/^\/cancel$/i, (msg) => {
  const chatId = msg.chat.id;
  sessions.delete(chatId);
  bot.sendMessage(chatId, "Скасавано");
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userKey = String(chatId);
  const text = (msg.text || "").trim();
  if (!text) return;

  if (text.startsWith("/")) return;
  
  const s = sessions.get(chatId);
  const u = users.get(userKey); 
  if(!s) return;
  if(s.step === "city") {
    u.city = text;
    s.step = "street";
    sessions.set(chatId, s);
    return bot.sendMessage(chatId, "Введи назву вулиці (наприклад: Миру).")
  }
  
  if(s.step === "street") {
    u.street = text;
    s.step = "build";
    sessions.set(chatId, s);
    return bot.sendMessage(chatId, "Введи номер будинку (наприклад: 4).")
  }
  try {
  if(s.step === "build") {
    u.build = text;
    const cityId = await getCity(u.city);
    const streetId = await getStreet(cityId, u.street);
    const buildId = await getBuildName(cityId, streetId, u.build);
    const groupId = await getGroups(cityId, streetId, buildId);
    u.group = groupId
    users.set(userKey, u);
    saveUsers();
    
    return bot.sendMessage(chatId, "Інформацію про адресу було успішно збережено, для перегляду графіку використайте команду /graph")
    }
  } catch(err) {
    await bot.sendMessage(chatId, `Помилка збереження адреси ${err}` )
  } finally {
      sessions.delete(chatId);
    }
});

bot.onText(/^\/graph$/i, async(msg) => {
  const chatId = msg.chat.id;
  const userKey = String(chatId);
  const u = users.get(userKey); 
  try {
      let out = "";
      let intervals = "";
      const cityId = await getCity(u.city);
      const streetId = await getStreet(cityId, u.street);
      const buildId = await getBuildName(cityId, streetId, u.build);
      const groupId = await getGroups(cityId, streetId, buildId);

      const { timeVal, debugKey } = await generateKey(cityId, streetId, u.build);
      let schedule = (await getSchedule(groupId, debugKey, timeVal));
      for (const item of schedule) {
        const times = item.dataJson?.[String(groupId)]?.times || {};
        const timeCompress = await compressTime(times);
        const currentInterval = await getCurrentInterval(timeCompress);
        const nextInterval = await getNextInterval(timeCompress);
        const timeRow = timeCompress.map(g =>
          g.from === g.to ? `${g.from} : ${g.value}` : `${g.from} - ${g.to} : ${g.value}`
        );

        const formDate = await formatDate(item.dateGraph);

        out += `${formDate}\n${timeRow.join("\n")}\n\n`;
        intervals += `Зараз діє: ${currentInterval.from} - ${currentInterval.to} : ${currentInterval.value}\nНаступний: ${nextInterval.from} - ${nextInterval.to} : ${nextInterval.value}`

      };
      
      // await bot.sendMessage(chatId, `Результат\nмісто: ${u.city}\nвулиця: ${u.street}\nбудинок: ${u.build}\n група: ${u.group}`);
      await bot.sendMessage(chatId, out || "Немає даних");
      await bot.sendMessage(chatId, intervals || "Немає даних")
    } catch(err) {
      await bot.sendMessage(chatId, `Не вдалося знайти адресу. Спробуй ще раз ${err}` )
    } finally {
      sessions.delete(chatId);
    }

});

bot.onText(/^\/myinfo$/i, (msg) => {
  const chatId = msg.chat.id;
  const userKey = String(chatId);
  const u = users.get(userKey);
  if(!u) {
    return bot.sendMessage(chatId, "Відсутня інформація про вашу адресу")
  }
  bot.sendMessage(chatId, `Місто: ${u.city}\nВулиця: ${u.street}\nБудинок: ${u.build}\nГрупа: ${u.group}`);
  
});
