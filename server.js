// --- Подключение зависимостей (наши "стройматериалы") ---
const express = require('express'); // Пакет для создания сервера
const cors = require('cors'); // Пакет для настройки правил доступа к серверу
const TelegramBot = require('node-telegram-bot-api'); // Пакет для работы с Telegram
const { v4: uuidv4 } = require('uuid'); // Пакет для генерации уникальных ID

// --- Конфигурация ---
const app = express(); // Создаем экземпляр нашего приложения/сервера
const PORT = process.env.PORT || 3001; // Используем порт от Render или 3001 локально

// ВАЖНО: Токен вашего бота
const telegramToken = '8072033778:AAEme5mrzxHpJ63IEksQy2d9ddabDt-1jDA'; 
const bot = new TelegramBot(telegramToken, { polling: true });

// --- "База данных" (для простоты храним все в памяти) ---
const activeTokens = new Map(); // Хранилище для токенов доступа. Формат: [token, expiryDate]
const pendingPayments = new Map(); // Хранилище для ожидающих платежей. Формат: [paymentId, userId]

// --- Настройка сервера ---
app.use(cors()); // Разрешаем доступ к нашему серверу с других адресов
app.use(express.json()); // Учим сервер понимать данные в формате JSON


// --- Логика Telegram-бота ---

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        inline_keyboard: [
            [{ text: 'Купить доступ к калькулятору', callback_data: 'buy_access' }]
        ]
    };
    bot.sendMessage(chatId, 'Добро пожаловать в Сметный Калькулятор! Нажмите кнопку ниже, чтобы получить доступ.', {
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
        
        // Сохраняем информацию о платеже, чтобы потом проверить ее
        pendingPayments.set(paymentId, userId.toString());

        // --- ИСПРАВЛЕНИЕ: Формируем ссылку без /payment-success ---
        const paymentConfirmationUrl = `https://smetnoe-frontend.vercel.app/?userId=${userId}&paymentId=${paymentId}`;

        bot.sendMessage(chatId, `Для получения доступа перейдите по ссылке: ${paymentConfirmationUrl}`);
    }
});


// --- API-эндпоинты (точки, куда может "звонить" фронтенд) ---

// Эндпоинт для подтверждения "оплаты" и выдачи токена
app.get('/api/payment-success', (req, res) => {
    const { userId, paymentId } = req.query;

    // Проверяем, действительно ли мы ждали такой платеж от этого пользователя
    if (pendingPayments.has(paymentId) && pendingPayments.get(paymentId) === userId) {
        const token = uuidv4();
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // Токен действует 30 дней
        
        activeTokens.set(token, expiryDate);
        pendingPayments.delete(paymentId); // Удаляем использованный платеж

        res.json({ success: true, token: token });
    } else {
        res.status(400).json({ success: false, message: 'Неверные данные платежа.' });
    }
});


// Эндпоинт для расчета объема лесов
app.post('/api/calculate', (req, res) => {
    const { token, data } = req.body;

    // Проверка токена
    if (!token || !activeTokens.has(token) || activeTokens.get(token) < new Date()) {
        return res.status(403).json({ success: false, message: 'Неверный или истекший токен доступа.' });
    }
    
    // Здесь логика расчета, она остается без изменений
    let volume = 0;
    let formula = '';
    let formulaBreakdown = [];
    let coefficient = null;
    let justification = { title: '', text: '' };

    if (data.location === 'outside') {
        const H = parseFloat(data.height);
        const L = parseFloat(data.length);
        if (isNaN(H) || isNaN(L) || H <= 0 || L <= 0) {
            return res.status(400).json({ success: false, message: 'Высота и длина должны быть положительными числами.' });
        }
        volume = H * L;
        formula = `V = H × L = ${H} × ${L}`;
        formulaBreakdown = ['V – искомый объем работ, м²', 'H – высота лесов, м', 'L – длина лесов, м'];
        justification = {
            title: 'ГЭСНр 69-13-1',
            text: 'Согласно ГЭСНр 69-13-1 "Смена отдельных досок в настилах лесов", объем работ по установке и разборке лесов определяется по площади их вертикальной проекции на фасад здания.'
        };

        if (H > 16) {
            const K = Math.ceil((H - 16) / 4);
            coefficient = {
                value: K,
                explanation: 'При высоте лесов более 16 м применяется повышающий коэффициент на каждый последующий ярус высотой 4 м.',
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
            formula = `V = Lпом × Wпом = ${Lpom} × ${Wpom}`;
            formulaBreakdown = ['V – искомый объем работ, м²', 'Lпом – длина помещения, м', 'Wпом – ширина помещения, м'];
             justification = {
                title: 'ГЭСН 15-04-025-01',
                text: 'Согласно ГЭСН 15-04-025-01 "Устройство подвесных потолков", при использовании лесов объем работ исчисляется по площади потолка в горизонтальной проекции.'
            };
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
             justification = {
                title: 'ГЭСН 08-02-145-01',
                text: 'Согласно ГЭСН 08-02-145-01 "Улучшенная окраска стен", при использовании лесов для внутренних работ их объем исчисляется по площади вертикальной проекции настила.'
            };
        }
    }

    res.json({
        success: true,
        volume: volume.toFixed(2),
        formula: formula,
        formulaBreakdown: formulaBreakdown,
        coefficient: coefficient,
        justification: justification
    });
});


// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});

