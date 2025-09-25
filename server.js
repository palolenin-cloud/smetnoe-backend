// --- Подключение зависимостей (наши "строймаaterials") ---
const express = require('express'); // Пакет для создания сервера. Наш "фундамент".
const cors = require('cors'); // Пакет для настройки правил доступа. "Пропуск" на нашу стройплощадку.
const TelegramBot = require('node-telegram-bot-api'); // Пакет для работы с Telegram. Наш "менеджер по работе с клиентами".
const { v4: uuidv4 } = require('uuid'); // Пакет для генерации уникальных ID. "Паспортный стол" для токенов и платежей.

// --- Конфигурация ---
const app = express(); // Создаем экземпляр нашего приложения/сервера. "Запускаем стройку".
const PORT = 3001; // Порт, который будет "слушать" наш сервер. "Адрес" нашего офиса в мире компьютера.

// ВАЖНО: Замените 'YOUR_TELEGRAM_BOT_TOKEN' на реальный токен вашего бота
const telegramToken = '8072033778:AAEme5mrzxHpJ63IEksQy2d9ddabDt-1jDA'; 
const bot = new TelegramBot(telegramToken, { polling: true }); // Инициализируем бота.

// --- "База данных" (для простоты храним все в памяти) ---
// В реальном приложении здесь будет настоящая база данных (например, PostgreSQL или MongoDB)
const activeTokens = new Map(); // Хранилище для токенов доступа. Формат: [token, expiryDate]. Map - это как записная книжка "ключ-значение", идеально для быстрого поиска токена.

// --- Настройка сервера ---
app.use(cors()); // Разрешаем доступ с ЛЮБОГО адреса
app.use(express.json()); // <-- ВОТ ЭТА СТРОКА! Учим сервер понимать JSON.

// --- Логика Telegram-бота (Этот раздел остается без изменений) ---

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
        const userId = query.from.id;
        const paymentId = uuidv4(); 
        const paymentConfirmationUrl = `https://smetnoe-frontend.vercel.app/payment-success?userId=${userId}&paymentId=${paymentId}`;
        bot.sendMessage(chatId, `Для оплаты перейдите по ссылке: ${paymentConfirmationUrl}`);
    }
});


// --- API-эндпоинты (точки, куда может "звонить" фронтенд) ---

// Эндпоинт, который имитирует страницу успешной оплаты
app.get('/api/payment-success', (req, res) => {
    const { userId, paymentId } = req.query;

    if (!userId || !paymentId) {
        // Отправляем ошибку в формате JSON, как и в других частях API
        return res.status(400).json({ success: false, message: 'Ошибка: неверные параметры подтверждения.' });
    }

    // Создаем новый токен доступа
    const token = uuidv4();
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24);

    // Сохраняем токен в наше хранилище
    activeTokens.set(token, expiryDate);

    console.log(`Выдан новый токен: ${token} для пользователя ${userId}. Действителен до: ${expiryDate}`);
    
    // Отправляем JSON с токеном
    res.json({ success: true, token: token });
});


// === ОБНОВЛЕННЫЙ И ПРОКОММЕНТИРОВАННЫЙ РАЗДЕЛ ===
// ЗАЩИЩЕННЫЙ эндпоинт для расчета лесов
app.post('/api/calculate/scaffolding', (req, res) => {
    // --- Проверка доступа ("Охранник на входе") ---
    const token = req.headers['authorization']; // Ожидаем, что фронтенд пришлет токен в специальном "кармане" - заголовке.

    // Проверяем, есть ли токен и записан ли он в нашей "книге учета" activeTokens.
    if (!token || !activeTokens.has(token)) {
        // Если нет - вежливо отказываем в доступе.
        return res.status(403).json({ success: false, message: 'Ошибка: Токен доступа отсутствует или недействителен.' });
    }

    // Достаем дату истечения срока действия токена из нашей "книги учета".
    const expiryDate = activeTokens.get(token);
    // Сравниваем ее с текущей датой.
    if (new Date() > expiryDate) {
        activeTokens.delete(token); // Удаляем просроченный токен, чтобы не занимал место.
        // Если токен просрочен - сообщаем об этом.
        return res.status(403).json({ success: false, message: 'Ошибка: Срок действия вашего токена истек.' });
    }

    // --- Логика калькулятора ("Инженер-сметчик") ---
    const data = req.body; // Получаем все исходные данные (длину, высоту и т.д.) от фронтенда.
    
    // Готовим "пустые бланки" для результатов.
    let volume = 0;
    let formula = '';
    let formulaBreakdown = []; // <-- НОВИНКА: Готовим пустой список для расшифровки переменных в формуле.
    let coefficient = null;

    // --- НОВИНКА: Заранее готовим "справку" с нормативным обоснованием. Это константа, она не меняется.
    const justification = {
        title: 'ГЭСН 81-02-08-2022, п. 2.8.27',
        text: '«...установка и разборка наружных инвентарных лесов исчисляется по площади вертикальной проекции их на фасад здания, внутренних — по горизонтальной проекции на основание. Если внутренние леса устанавливаются только для отделки стен (вдоль стен) и не имеют сплошного настила по всему помещению для отделки потолка, то их площадь исчисляется по длине стен, умноженной на ширину настила лесов.»'
    };

    // --- Начинаем расчет в зависимости от выбора пользователя ---
    if (data.location === 'outside') {
        // Конвертируем текстовые данные от фронтенда в числа.
        const L = parseFloat(data.length);
        const H = parseFloat(data.height);
        
        // Проверяем, что нам прислали корректные числа.
        if (isNaN(L) || isNaN(H) || L <= 0 || H <= 0) {
            return res.status(400).json({ success: false, message: 'Длина и высота должны быть положительными числами.' });
        }
        
        // Выполняем расчет.
        volume = L * H;
        // Заполняем "бланки" с результатами.
        formula = `V = L × H = ${L} × ${H}`;
        formulaBreakdown = [ // <-- НОВИНКА: Заполняем расшифровку.
            'V – искомый объем работ, м²',
            'L – длина фасада здания, м',
            'H – высота фасада здания, м'
        ];

        // Дополнительная логика для коэффициента.
        if (H > 16) {
            const K = Math.ceil((H - 16) / 4);
            coefficient = {
                value: K,
                formula: `K = Округл.вверх((${H} - 16) / 4) = ${K}`,
                explanation: 'Так как высота лесов превышает 16 м, дополнительно применяется коэффициент К.'
            };
        }
    } else if (data.location === 'inside') {
        // Аналогичная логика для внутренних лесов...
        if (data.insideType === 'ceiling') {
            const Lpom = parseFloat(data.roomLength);
            const Wpom = parseFloat(data.roomWidth);
            if (isNaN(Lpom) || isNaN(Wpom) || Lpom <= 0 || Wpom <= 0) {
                return res.status(400).json({ success: false, message: 'Длина и ширина помещения должны быть положительными числами.' });
            }
            volume = Lpom * Wpom;
            formula = `V = Lпом × Wпом = ${Lpom} × ${Wpom}`;
            formulaBreakdown = [
                'V – искомый объем работ, м²',
                'Lпом – длина помещения, м',
                'Wпом – ширина помещения, м'
            ];
        } else if (data.insideType === 'walls') {
            const Lsten = parseFloat(data.wallsLength);
            const Wnastila = parseFloat(data.scaffoldWidth);
            if (isNaN(Lsten) || isNaN(Wnastila) || Lsten <= 0 || Wnastila <= 0) {
                return res.status(400).json({ success: false, message: 'Длина стен и ширина настила должны быть положительными числами.' });
            }
            volume = Lsten * Wnastila;
            formula = `V = Lстен × Wнастила = ${Lsten} × ${Wnastila}`;
             formulaBreakdown = [
                'V – искомый объем работ, м²',
                'Lстен – общая длина стен, м',
                'Wнастила – ширина настила лесов, м'
            ];
        }
    }

    // --- Отправка ответа ("Курьер") ---
    // Собираем все наши заполненные "бланки" в одну посылку (JSON-объект).
    res.json({
        success: true, // Флаг, что все прошло успешно.
        volume: volume.toFixed(2), // Основной результат.
        formula: formula, // Текстовая формула.
        formulaBreakdown: formulaBreakdown, // <-- НОВИНКА: Список с расшифровкой.
        coefficient: coefficient, // Коэффициент (если он есть).
        justification: justification // <-- НОВИНКА: Наша "справка" с обоснованием.
    });
});


// --- Запуск сервера ---
app.listen(PORT, () => {
    // Сообщение в консоли, что наш сервер успешно запущен и готов к работе.
    console.log(`Сервер калькуляторов запущен на http://localhost:${PORT}`);
});

