// --- Подключение зависимостей (наши "стройматериалы") ---
const express = require('express'); // Пакет для создания сервера
const cors = require('cors'); // Пакет для настройки правил доступа к серверу
const TelegramBot = require('node-telegram-bot-api'); // Пакет для работы с Telegram
const { v4: uuidv4 } = require('uuid'); // Пакет для генерации уникальных ID

// --- Конфигурация ---
const app = express(); // Создаем экземпляр нашего приложения/сервера
// Используем порт от Render (через process.env.PORT) или 3001 локально
const PORT = process.env.PORT || 3001; 

// ВАЖНО: Токен вашего бота (должен браться из переменных окружения на Render)
// Если вы используете Render, убедитесь, что переменная TELEGRAM_BOT_TOKEN установлена
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '8072033778:AAEme5mrzxHpJ63IEksQy2d9ddabDt-1jDA'; 
const bot = new TelegramBot(telegramToken, { polling: true });

// --- "База данных" (для простоты храним все в памяти) ---
// В реальном приложении здесь будет настоящая база данных
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

        // ВАЖНО: Адрес вашего фронтенда, куда будет перенаправлен пользователь
        // Это должно быть вашим URL на Vercel!
        const frontendUrl = 'https://smetnoe-frontend.vercel.app'; 
        
        // Формируем ссылку, которая перенаправляет на эндпоинт, выдающий токен
        // Эндпоинт /api/payment-success должен быть на Render/бэкенде
        const backendUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

        const paymentConfirmationUrl = `${backendUrl}/api/payment-success?userId=${userId}&paymentId=${paymentId}&redirectUrl=${frontendUrl}`;


        bot.sendMessage(chatId, `Для получения доступа перейдите по ссылке: ${paymentConfirmationUrl}`);
    }
});


// --- API-эндпоинты (точки, куда может "звонить" фронтенд) ---

// Эндпоинт для подтверждения "оплаты" и выдачи токена
app.get('/api/payment-success', (req, res) => {
    const { userId, paymentId, redirectUrl } = req.query;

    // Проверяем, действительно ли мы ждали такой платеж от этого пользователя
    if (pendingPayments.has(paymentId) && pendingPayments.get(paymentId) === userId) {
        const token = uuidv4();
        const expiryDate = new Date();
        // Токен действует 30 дней
        expiryDate.setDate(expiryDate.getDate() + 30); 
        
        activeTokens.set(token, expiryDate);
        pendingPayments.delete(paymentId); // Удаляем использованный платеж

        // Перенаправляем пользователя обратно на фронтенд, передавая токен в URL
        // Фронтенд должен быть готов извлечь этот токен!
        res.redirect(`${redirectUrl}?token=${token}`);
        
    } else {
        // Если ошибка, возвращаем пользователя на фронтенд с сообщением об ошибке
        res.redirect(`${redirectUrl}?error=Неверные данные платежа.`);
    }
});


// Эндпоинт для расчета объема лесов
app.post('/api/calculate', (req, res) => {
    // В отличие от предыдущего варианта, фронтенд отправляет токен в теле запроса,
    // что менее безопасно, но соответствует нашей текущей архитектуре MVP.
    const { token, data } = req.body;

    // --- Проверка токена (Аутентификация/Авторизация) ---
    if (!token) {
        return res.status(403).json({ success: false, message: 'Токен доступа отсутствует. Получите его у Telegram-бота.' });
    }
    if (!activeTokens.has(token) || activeTokens.get(token) < new Date()) {
        return res.status(403).json({ success: false, message: 'Неверный или истекший токен доступа. Пожалуйста, получите новый.' });
    }
    
    // --- Логика расчета ---
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
            title: 'ГЭСН 81-02-38-2017 (Техническая часть)',
            text: 'Объем работ по установке и разборке лесов определяется по площади их вертикальной проекции на фасад здания. При расчетах, смеем заверить, необходимо руководствоваться положениями технической части к сметно-нормативной базе.'
        };

        // --- ИСПРАВЛЕННАЯ ЛОГИКА КОЭФФИЦИЕНТА ---
        if (H > 16) {
            // K = (Количество циклов по 4м свыше 16м) + 1 (за ярус 16-20м)
            // При H=20: ceil((20-16)/4) + 1 = 2.
            // При H=21: ceil((21-16)/4) + 1 = 3.
            const K = Math.ceil((H - 16) / 4) + 1;

            coefficient = {
                value: K,
                explanation: 'Смеем заверить, что при высоте лесов более 16 м применяется повышающий коэффициент на каждый последующий ярус высотой 4 м. Это соответствует Технической части норм (прим. к таблицам).',
                formula: `K = округл.вверх((H - 16) / 4) + 1 = округл.вверх((${H} - 16) / 4) + 1 = ${K}`
            };
        }
        // ------------------------------------------
        
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
                title: 'ГЭСН 15-04-025-01 (Пример)',
                text: 'При использовании лесов для работ по потолку объем работ исчисляется по площади потолка в горизонтальной проекции (сплошной настил).'
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
                'Wnastila – ширина настила лесов, м'
            ];
             justification = {
                title: 'ГЭСН 08-02-145-01 (Пример)',
                text: 'При использовании лесов для внутренних работ по стенам их объем исчисляется по площади вертикальной проекции настила.'
            };
        }
    }

    // Возвращаем результат
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
