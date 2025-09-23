// --- Подключение зависимостей (наши "стройматериалы") ---
const express = require('express'); // Пакет для создания сервера
const cors = require('cors'); // Пакет для настройки правил доступа к серверу
const TelegramBot = require('node-telegram-bot-api'); // Пакет для работы с Telegram
const { v4: uuidv4 } = require('uuid'); // Пакет для генерации уникальных ID

// --- Конфигурация ---
const app = express(); // Создаем экземпляр нашего приложения/сервера
const PORT = 3001; // Порт, который будет "слушать" наш сервер

// ВАЖНО: Замените 'YOUR_TELEGRAM_BOT_TOKEN' на реальный токен вашего бота
const telegramToken = '8072033778:AAEme5mrzxHpJ63IEksQy2d9ddabDt-1jDA'; 
const bot = new TelegramBot(telegramToken, { polling: true });

// --- "База данных" (для простоты храним все в памяти) ---
// В реальном приложении здесь будет настоящая база данных (например, PostgreSQL или MongoDB)
const activeTokens = new Map(); // Хранилище для токенов доступа. Формат: [token, expiryDate]

// --- Настройка сервера ---
app.use(cors()); // Разрешаем доступ к нашему серверу с других адресов (например, с нашего фронтенда)
app.use(express.json()); // Учим сервер понимать данные в формате JSON

// --- Логика Telegram-бота ---

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    inline_keyboard: [
      [{
        text: 'Купить доступ на 24 часа (100 руб)',
        callback_data: 'buy_access'
      }]
    ]
  };
  bot.sendMessage(chatId, 'Добро пожаловать в сервис сметных калькуляторов! Здесь вы можете приобрести временный доступ к нашим инструментам.', {
    reply_markup: keyboard
  });
});

// Обработчик нажатий на кнопки
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'buy_access') {
        // --- СИМУЛЯЦИЯ ОПЛАТЫ ---
        // В реальном проекте здесь будет код для генерации ссылки на оплату через ЮKassa или другую систему
        const userId = query.from.id;
        const paymentId = uuidv4(); // Уникальный ID для этой "оплаты"

        // Генерируем ссылку, которая имитирует успешную оплату
        // ВАЖНО: В реальном приложении URL должен быть вашего фронтенда
        const paymentConfirmationUrl = `https://smetnoe-backend.onrender.com/api/payment-success?userId=${userId}&paymentId=${paymentId}`;

        bot.sendMessage(chatId, `Для оплаты перейдите по ссылке: ${paymentConfirmationUrl}`);
    }
});


// --- API-эндпоинты (точки, куда может "звонить" фронтенд) ---

// Эндпоинт, который имитирует страницу успешной оплаты
app.get('/api/payment-success', (req, res) => {
    const { userId, paymentId } = req.query;

    if (!userId || !paymentId) {
        return res.status(400).send('Ошибка: неверные параметры подтверждения.');
    }

    // Создаем новый токен доступа
    const token = uuidv4();
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24); // Токен действует 24 часа

    // Сохраняем токен в наше хранилище
    activeTokens.set(token, expiryDate);

    console.log(`Выдан новый токен: ${token} для пользователя ${userId}. Действителен до: ${expiryDate}`);

    // В реальном приложении мы бы перенаправили пользователя на фронтенд с этим токеном
    // Например: res.redirect(`http://your-frontend-site.com/calculator?token=${token}`);
    res.redirect(`https://smetnoe-frontend.vercel.app/?token=${token}`);
});


// ЗАЩИЩЕННЫЙ эндпоинт для расчета лесов
app.post('/api/calculate/scaffolding', (req, res) => {
    // --- Проверка доступа ---
    const token = req.headers['authorization']; // Ожидаем, что токен придет в заголовке

    if (!token || !activeTokens.has(token)) {
        return res.status(403).json({ success: false, message: 'Ошибка: Токен доступа отсутствует или недействителен.' });
    }

    const expiryDate = activeTokens.get(token);
    if (new Date() > expiryDate) {
        activeTokens.delete(token); // Удаляем просроченный токен
        return res.status(403).json({ success: false, message: 'Ошибка: Срок действия вашего токена истек.' });
    }

    // --- Логика калькулятора (осталась прежней) ---
    const data = req.body;
    let volume = 0;
    let formula = '';
    let coefficient = null;

    if (data.location === 'outside') {
        const L = parseFloat(data.length);
        const H = parseFloat(data.height);
        if (isNaN(L) || isNaN(H) || L <= 0 || H <= 0) {
            return res.status(400).json({ success: false, message: 'Длина и высота должны быть положительными числами.' });
        }
        volume = L * H;
        formula = `V = L * H = ${L} * ${H} = ${volume.toFixed(2)}`;

        if (H > 16) {
            const K = Math.ceil((H - 16) / 4);
            coefficient = {
                value: K,
                formula: `K = округл.вверх((H - 16) / 4) = округл.вверх((${H} - 16) / 4) = ${K}`
            };
        }
    } else if (data.location === 'inside') {
        if (data.insideType === 'ceiling') {
            const Lpom = parseFloat(data.roomLength);
            const Wpom = parseFloat(data.roomWidth);
            if (isNaN(Lpom) || isNaN(Wpom) || Lpom <= 0 || Wpom <= 0) {
                return res.status(400).json({ success: false, message: 'Длина и ширина помещения должны быть положительными числами.' });
            }
            volume = Lpom * Wpom;
            formula = `V = Lпом * Wпом = ${Lpom} * ${Wpom} = ${volume.toFixed(2)}`;
        } else if (data.insideType === 'walls') {
            const Lsten = parseFloat(data.wallsLength);
            const Wnastila = parseFloat(data.scaffoldWidth);
            if (isNaN(Lsten) || isNaN(Wnastila) || Lsten <= 0 || Wnastila <= 0) {
                return res.status(400).json({ success: false, message: 'Длина стен и ширина настила должны быть положительными числами.' });
            }
            volume = Lsten * Wnastila;
            formula = `V = Lстен * Wнастила = ${Lsten} * ${Wnastila} = ${volume.toFixed(2)}`;
        }
    }

    res.json({
        success: true,
        volume: volume.toFixed(2),
        formula: formula,
        coefficient: coefficient
    });
});


// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Сервер калькуляторов запущен на http://localhost:${PORT}`);
});
