# Daily Spin — Техническая Спецификация

**Версия:** 1.0  
**Последнее обновление:** 24 февраля 2026  
**Статус:** Прототип → Готов к продакшену

---

## Содержание

1. [Обзор](#обзор)
2. [Логика Pity Timer](#логика-pity-timer)
3. [Структура конфигурации призов](#структура-конфигурации-призов)
4. [События аналитики](#события-аналитики)
5. [Требования к Backend API](#требования-к-backend-api)
6. [Соображения безопасности](#соображения-безопасности)

---

## Обзор

Daily Spin — это клиентская игра "Колесо фортуны", где пользователи тратят "Spin Coupons" (купоны на спин) для получения призов. Текущий прототип (`index.html`) реализует всю игровую логику на фронтенде, но **для продакшена критические операции должны быть перенесены на бэкенд** для предотвращения читерства.

### Ключевые функции
- Колесо на 8 секторов с взвешенным распределением вероятностей
- Система Pity Timer, гарантирующая редкие призы
- Отслеживание событий аналитики в реальном времени
- Upsell-предложение при исчерпании купонов
- Адаптивный дизайн в стиле MY.GAMES Market

---

## Логика Pity Timer

### Назначение
Pity Timer гарантирует, что игроки получат приз "Легендарный предмет" после определенного количества спинов без его выигрыша, улучшая пользовательский опыт и предотвращая фрустрацию.

### Детали реализации

#### Переменные
```javascript
const LEGENDARY_IDX = 2;              // Индекс 'Легендарного предмета' в prizesConfig
const PITY_THRESHOLD = 10;            // Количество спинов до срабатывания гарантии
let spinsSinceLastLegendary = 0;     // Текущий счетчик (сохраняется между сессиями)
```

#### Алгоритм работы

1. **Перед каждым спином** (`startSpin()`):
   ```javascript
   // Проверяем, достигнут ли порог pity
   if (spinsSinceLastLegendary >= PITY_THRESHOLD) {
     // Принудительно выдаем легендарный приз (обход случайного выбора)
     isPityWin = true;
     winIdx = LEGENDARY_IDX;
   } else {
     // Обычный случайный выбор
     ({ rnd, winIdx } = rollPrize());
   }
   ```

2. **Увеличение счетчика**:
   ```javascript
   spinsSinceLastLegendary++;
   ```

3. **После определения приза** (`onSpinEnd()`):
   ```javascript
   // Сбрасываем счетчик, если легендарный предмет был выигран (случайно или через pity)
   if (winIdx === LEGENDARY_IDX) {
     spinsSinceLastLegendary = 0;
   }
   ```

#### Персистентность состояния

**Текущий прототип:** Счетчик хранится в памяти и сбрасывается при обновлении страницы.

**Требование для продакшена:** Счетчик должен храниться на сервере для каждого пользователя, чтобы предотвратить:
- Манипуляции через консоль браузера
- Сброс при обновлении страницы
- Злоупотребление несколькими аккаунтами

#### Отображение в UI

- **Прогресс-бар:** Показывает `spinsSinceLastLegendary / PITY_THRESHOLD` в процентах
- **Визуальный индикатор:** Полоса светится золотым, когда `spinsSinceLastLegendary >= PITY_THRESHOLD`
- **Панель отладки:** Отображает текущее значение счетчика
- **Лог консоли:** Показывает тег `★ PITY WIN!` при срабатывании pity timer

#### Граничные случаи

1. **Параллельные спины:** Если пользователь быстро запускает несколько спинов, счетчик должен увеличиваться атомарно (бэкенд должен обрабатывать это).
2. **Изменение приза:** Если `LEGENDARY_IDX` изменяется в конфиге, существующие счетчики должны быть мигрированы или сброшены.
3. **Несколько Pity-призов:** В настоящее время существует только один pity-приз. Если добавляются другие, каждому нужен свой счетчик.

---

## Структура конфигурации призов

### JSON-схема

Конфигурация призов определяется как массив объектов. Каждый объект представляет один сектор колеса.

```json
[
  {
    "name": "25% Discount",
    "wheelText": "25%\nDiscount",
    "color": "#005aff",
    "icon": "icons/discount.png",
    "weight": 5
  },
  {
    "name": "100 Platinum",
    "wheelText": "100\nPlatinum",
    "color": "#642ab5",
    "icon": "icons/platinum.png",
    "weight": 15
  },
  {
    "name": "Legendary Item",
    "wheelText": "Legendary\nItem",
    "color": "#003dad",
    "icon": "icons/legendary.png",
    "weight": 5
  },
  {
    "name": "8 Spheres",
    "wheelText": "8\nSpheres",
    "color": "#51258f",
    "icon": "icons/spheres.png",
    "weight": 5
  },
  {
    "name": "200 Cores",
    "wheelText": "200\nCores",
    "color": "#005aff",
    "icon": "icons/cores.png",
    "weight": 5
  },
  {
    "name": "4 Spheres",
    "wheelText": "4\nSpheres",
    "color": "#642ab5",
    "icon": "icons/spheres.png",
    "weight": 10
  },
  {
    "name": "50 Platinum",
    "wheelText": "50\nPlatinum",
    "color": "#003dad",
    "icon": "icons/platinum.png",
    "weight": 30
  },
  {
    "name": "Premium 30 days",
    "wheelText": "Premium\n30 days",
    "color": "#51258f",
    "icon": "icons/premium.png",
    "weight": 25
  }
]
```

### Описание полей

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `name` | `string` | ✅ | Отображаемое имя, показываемое в модальном окне успеха и аналитике |
| `wheelText` | `string` | ✅ | Текст, отображаемый на секторе колеса (поддерживает `\n` для переноса строки) |
| `color` | `string` | ✅ | Hex-код цвета для градиента фона сектора |
| `icon` | `string` | ✅ | Путь к иконке изображения (относительно HTML-файла или абсолютный URL) |
| `weight` | `number` | ✅ | Вес вероятности (должен суммироваться до 100 для всех призов) |

### Вычисляемые поля (автоматически генерируются)

После загрузки конфига система автоматически вычисляет:

```javascript
// Для каждого приза вычисляем кумулятивный диапазон
let cumulative = 0;
prizesConfig.forEach(prize => {
  prize.rangeMin = cumulative + 1;
  cumulative += prize.weight;
  prize.rangeMax = cumulative;
});
```

**Пример:**
- Приз 0 (5%): `rangeMin: 1, rangeMax: 5`
- Приз 1 (15%): `rangeMin: 6, rangeMax: 20`
- Приз 2 (5%): `rangeMin: 21, rangeMax: 25`
- ... и так далее

### Правила валидации

1. **Сумма весов:** Все значения `weight` должны суммироваться ровно до `100`
2. **Длина массива:** Должен содержать ровно `8` элементов (по одному на сектор колеса)
3. **Файлы иконок:** Все пути к иконкам должны указывать на валидные файлы изображений
4. **Формат цвета:** Должны быть валидными hex-кодами цветов (например, `#005aff`)

### Хранение на бэкенде

**Требование для продакшена:** Конфигурация призов должна быть:
- Храниться в базе данных (не захардкожена во фронтенде)
- Версионироваться (для отслеживания изменений во времени)
- Кешироваться (для уменьшения запросов к БД)
- Редактироваться администратором (через CMS или админ-панель)

---

## События аналитики

### Функция отслеживания событий

Все события аналитики логируются через централизованную функцию:

```javascript
function trackEvent(eventName, data = null) {
  const timestamp = new Date().toLocaleTimeString('en-GB');
  const extra = data ? ' ' + JSON.stringify(data) : '';
  const message = `[Analytics] Event: ${eventName}${extra}`;
  
  console.log(message);
  // Добавить в панель отладки
  // Отправить в сервис аналитики (продакшен)
}
```

### Каталог событий

#### 1. `page_loaded`

**Триггер:** Когда страница завершает загрузку (DOM готов + изображения загружены)

**Payload:**
```json
{
  "coupons": 3
}
```

**Применение:** Отслеживание просмотров страницы и начального баланса купонов

---

#### 2. `spin_started`

**Триггер:** Когда пользователь нажимает кнопку "Spin" и начинается анимация спина

**Payload:**
```json
{
  "spinNumber": 1,
  "couponsLeft": 2
}
```

**Применение:** Измерение вовлеченности, отслеживание частоты спинов, обнаружение быстрых кликов

---

#### 3. `prize_received`

**Триггер:** После остановки колеса и определения приза (перед появлением модального окна)

**Payload:**
```json
{
  "prize": "Legendary Item",
  "pityWin": false
}
```

**Особый случай:**
```json
{
  "prize": "Legendary Item",
  "pityWin": true
}
```

**Применение:** 
- Вычисление фактических шансов выпадения vs. настроенные веса
- Отслеживание эффективности pity timer
- Измерение распределения призов

---

#### 4. `spin_attempt_no_coupons`

**Триггер:** Когда пользователь нажимает кнопку "Spin", но `coupons === 0`

**Payload:**
```json
{
  "coupons": 0
}
```

**Применение:** Выявление пользователей, которые хотят крутить, но заблокированы, измерение возможности upsell

---

#### 5. `Shop_Redirect_from_Wheel`

**Триггер:** Когда пользователь нажимает кнопку "Go to Shop" в блоке upsell-предложения

**Payload:** `null`

**Применение:** Измерение конверсии из upsell-предложения на страницу магазина

---

### Дополнительные метрики (на основе сессии)

Панель отладки также отслеживает:

- **Всего спинов:** Счетчик `totalSpins` (увеличивается при каждом спине)
- **Среднее количество спинов в минуту:** Вычисляется как `totalSpins / ((Date.now() - sessionStartTime) / 60000)`

**Примечание для продакшена:** Эти метрики должны отправляться в сервис аналитики периодически (например, каждые 30 секунд) или при выгрузке страницы.

---

### Интеграция с сервисами аналитики

**Текущий прототип:** События логируются только в консоль и панель отладки.

**Требования для продакшена:**

1. **Отправка на бэкенд:** Все события должны отправляться POST-запросом на `/api/analytics/track`
2. **Пакетные запросы:** Группировать несколько событий в один запрос для уменьшения сетевой нагрузки
3. **Логика повтора:** Ставить неудачные запросы в очередь и повторять при переподключении
4. **Соответствие приватности:** Обеспечить соответствие GDPR/CCPA (согласие пользователя, анонимизация данных)

**Пример Payload для бэкенда:**
```json
{
  "userId": "user_12345",
  "sessionId": "sess_abc123",
  "events": [
    {
      "eventName": "spin_started",
      "timestamp": "2024-01-15T10:30:00Z",
      "data": { "spinNumber": 1, "couponsLeft": 2 }
    }
  ]
}
```

---

## Требования к Backend API

### Обзор

Текущий прототип выполняет всю игровую логику на фронтенде, что **уязвимо для манипуляций**. Для продакшена следующие операции должны быть перенесены на бэкенд:

1. Определение приза (случайный выбор + pity timer)
2. Списание купонов
3. Начисление приза
4. Сохранение состояния (счетчик pity, баланс купонов)

---

### API-эндпоинты

#### 1. `POST /api/spin/initiate`

**Назначение:** Запросить разрешение на спин и получить определение приза от сервера.

**Заголовки запроса:**
```
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Тело запроса:**
```json
{
  "showcaseId": 125,
  "eventId": "daily-spin"
}
```

**Примечание:** `showcaseId` — это идентификатор витрины, на которой расположено колесо. Витрина привязана к игре через таблицу `wheel_showcase_config`.

**Ответ (200 OK):**
```json
{
  "success": true,
  "spinId": "spin_abc123xyz",
  "prize": {
    "prizeId": 2,
    "name": "Legendary Item",
    "icon": "icons/legendary.png",
    "pityWin": false
  },
  "pityCounter": {
    "current": 7,
    "threshold": 10,
    "guaranteed": false
  },
  "couponsRemaining": 2,
  "serverSeed": "a1b2c3d4e5f6...",  // Для прозрачности/верификации
  "clientNonce": "xyz789"            // Клиентский nonce для честности
}
```

**Ответ (400 Bad Request):**
```json
{
  "success": false,
  "error": "INSUFFICIENT_COUPONS",
  "message": "Недостаточно купонов на спин. Текущий баланс: 0"
}
```

**Ответ (429 Too Many Requests):**
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Слишком много спинов за короткое время. Пожалуйста, подождите."
}
```

**Ответ (401 Unauthorized):**
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Недействительный или истекший токен аутентификации"
}
```

---

#### 2. `POST /api/spin/confirm`

**Назначение:** Подтвердить, что анимация спина завершена и начислить приз.

**Тело запроса:**
```json
{
  "spinId": "spin_abc123xyz",
  "timestamp": "2024-01-15T10:30:05Z"  // Когда анимация завершилась
}
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "prizeAwarded": true,
  "transactionId": "txn_xyz789",
  "couponsRemaining": 2
}
```

**Ответ (400 Bad Request):**
```json
{
  "success": false,
  "error": "INVALID_SPIN_ID",
  "message": "ID спина не найден или уже подтвержден"
}
```

**Ответ (409 Conflict):**
```json
{
  "success": false,
  "error": "SPIN_EXPIRED",
  "message": "Истекло время подтверждения спина (должно быть подтверждено в течение 10 секунд)"
}
```

---

#### 3. `GET /api/spin/state`

**Назначение:** Получить текущее состояние пользователя (купоны, счетчик pity и т.д.)

**Ответ (200 OK):**
```json
{
  "coupons": 3,
  "pityCounter": {
    "current": 0,
    "threshold": 10,
    "guaranteed": false
  },
  "lastSpinAt": "2024-01-15T10:25:00Z",
  "totalSpins": 42
}
```

---

#### 4. `GET /api/spin/config`

**Назначение:** Получить конфигурацию призов (веса, названия, иконки)

**Ответ (200 OK):**
```json
{
  "prizes": [
    {
      "id": 0,
      "name": "25% Discount",
      "wheelText": "25%\nDiscount",
      "color": "#005aff",
      "icon": "icons/discount.png",
      "weight": 5
    },
    // ... другие призы
  ],
  "version": "1.2.0",
  "updatedAt": "2024-01-15T09:00:00Z"
}
```

**Кеширование:** Фронтенд должен кешировать этот конфиг и перезагружать только при изменении `version`.

---

### Меры безопасности

#### 1. **Генерация случайных чисел на сервере**

**Проблема:** Клиент может манипулировать `Math.random()` для принудительного выбора желаемого приза.

**Решение:**
- Использовать криптографически стойкий генератор случайных чисел (CSPRNG) на бэкенде
- Опционально использовать систему "provably fair" (серверный seed + клиентский nonce)
- Возвращать предопределенный приз в ответе `/api/spin/initiate`

#### 2. **Персистентность Pity Timer**

**Проблема:** Клиент может сбросить счетчик `spinsSinceLastLegendary`.

**Решение:**
- Хранить счетчик в базе данных для каждого пользователя
- Увеличивать атомарно (использовать транзакцию БД или Redis INCR)
- Возвращать текущее значение в ответах API

#### 3. **Валидация баланса купонов**

**Проблема:** Клиент может изменить переменную `coupons` для бесконечных спинов.

**Решение:**
- Хранить баланс купонов в базе данных
- Списать купоны на сервере перед определением приза
- Возвращать обновленный баланс в ответе API
- Валидировать баланс купонов при каждом запросе на спин

#### 4. **Ограничение частоты запросов (Rate Limiting)**

**Проблема:** Пользователи могут спамить запросами на спин или автоматизировать спины.

**Решение:**
- Реализовать ограничение частоты (например, максимум 1 спин за 3 секунды на пользователя)
- Использовать Redis или аналогичный для распределенного rate limiting
- Возвращать `429 Too Many Requests` при превышении лимита

#### 5. **Таймаут подтверждения спина**

**Проблема:** Пользователь может инициировать спин, увидеть приз, затем закрыть браузер, чтобы избежать подтверждения.

**Решение:**
- Требовать подтверждение в течение 10 секунд после инициирования
- Если не подтверждено, откатить списание купонов (или пометить спин как "abandoned")
- Логировать заброшенные спины для аналитики

#### 6. **Подпись запросов (Опционально, Продвинуто)**

**Проблема:** Даже с валидацией на бэкенде злоумышленники могут повторять запросы.

**Решение:**
- Подписывать запросы с помощью HMAC, используя общий секрет
- Включать временную метку в подпись для предотвращения replay-атак
- Валидировать подпись на бэкенде перед обработкой

**Пример:**
```javascript
const signature = crypto
  .createHmac('sha256', SECRET_KEY)
  .update(`${spinId}:${timestamp}:${userId}`)
  .digest('hex');
```

---

### Схема базы данных (Рекомендуемая)

#### `user_spin_state`
```sql
CREATE TABLE wheel_showcase_config (
  showcase_id INT PRIMARY KEY,
  game_id INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_game (game_id)
);
```

**Примечание:** Колесо фортуны располагается на витрине (`showcase`), которая привязана к игре. Витрина может иметь свой уникальный набор призов и настроек.

#### `user_spin_state`
```sql
CREATE TABLE user_spin_state (
  user_id VARCHAR(255) NOT NULL,
  showcase_id INT NOT NULL,
  coupons INT NOT NULL DEFAULT 0,
  pity_counter INT NOT NULL DEFAULT 0,
  total_spins INT NOT NULL DEFAULT 0,
  last_spin_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, showcase_id),
  INDEX idx_showcase_user (showcase_id, user_id),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

**Примечание:** Состояние пользователя хранится отдельно для каждой витрины, так как пользователь может иметь разные счетчики pity и купоны на разных витринах.

#### `spin_transactions`
```sql
CREATE TABLE spin_transactions (
  spin_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  showcase_id INT NOT NULL,
  prize_id INT NOT NULL,
  pity_win BOOLEAN DEFAULT FALSE,
  coupons_before INT NOT NULL,
  coupons_after INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP,
  status ENUM('pending', 'confirmed', 'expired') DEFAULT 'pending',
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_showcase_created (showcase_id, created_at),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

#### `prize_config`
```sql
CREATE TABLE prize_config (
  prize_id INT PRIMARY KEY,
  showcase_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  wheel_text VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL,
  icon_path VARCHAR(255) NOT NULL,
  weight INT NOT NULL,
  version INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_showcase_active (showcase_id, is_active),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

**Примечание:** Каждая витрина может иметь свой уникальный набор призов с разными весами и иконками.

---

### Обработка ошибок

Все API-эндпоинты должны возвращать единообразный формат ошибки:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Человекочитаемое сообщение об ошибке",
  "details": {}  // Опциональный дополнительный контекст
}
```

**Общие коды ошибок:**
- `INSUFFICIENT_COUPONS`
- `RATE_LIMIT_EXCEEDED`
- `UNAUTHORIZED`
- `INVALID_SPIN_ID`
- `SPIN_EXPIRED`
- `SERVER_ERROR`
- `MAINTENANCE_MODE`

---

## Соображения безопасности

### Безопасность фронтенда (Текущий прототип)

**⚠️ Уязвимости:**
1. Определение приза происходит на клиенте → пользователи могут манипулировать
2. Баланс купонов хранится в памяти → может быть изменен через консоль
3. Счетчик pity сбрасывается при обновлении → нет персистентности
4. Нет аутентификации/авторизации → любой может получить доступ

**✅ Требования для продакшена:**
1. Вся игровая логика должна выполняться на сервере
2. Требуется аутентификация пользователя (JWT токены)
3. Все состояние хранится в базе данных
4. API-запросы должны быть подписаны/валидированы
5. Ограничение частоты запросов для предотвращения злоупотреблений
6. Политики CORS для ограничения источников

### Приватность данных

- **Аналитика:** Обеспечить согласие пользователя перед отслеживанием (GDPR/CCPA)
- **Персональные данные:** Минимизировать сбор данных, анонимизировать где возможно
- **PII:** Не хранить личную информацию, если это не необходимо
- **Логирование:** Очищать логи от чувствительных данных

### Рекомендации по тестированию

1. **Юнит-тесты:** Тестировать алгоритм выбора приза, логику pity timer
2. **Интеграционные тесты:** Тестировать API-эндпоинты с различными сценариями
3. **Нагрузочные тесты:** Проверить rate limiting и производительность БД
4. **Тесты безопасности:** Попытаться манипулировать запросами, протестировать аутентификацию
5. **E2E тесты:** Протестировать полный пользовательский поток от спина до начисления приза

---

## Приложение

### Пример реализации бэкенда (Псевдокод)

```python
# Python/Flask пример

@app.route('/api/spin/initiate', methods=['POST'])
@require_auth
@rate_limit(max_per_minute=20)
def initiate_spin():
    user_id = get_current_user_id()
    showcase_id = request.json.get('showcaseId')
    
    # Проверяем существование и активность витрины
    showcase = get_showcase_config(showcase_id)
    if not showcase or not showcase.is_active:
        return jsonify({
            "success": False,
            "error": "INVALID_SHOWCASE_ID"
        }), 400
    
    # Проверяем баланс купонов
    state = get_user_spin_state(user_id, showcase_id)
    if state.coupons <= 0:
        return jsonify({
            "success": False,
            "error": "INSUFFICIENT_COUPONS"
        }), 400
    
    # Определяем приз (на сервере)
    prize = determine_prize(user_id, showcase_id, state.pity_counter)
    
    # Списываем купон
    state.coupons -= 1
    state.total_spins += 1
    
    # Обновляем счетчик pity
    if prize.pity_win:
        state.pity_counter = 0
    else:
        state.pity_counter += 1
        if state.pity_counter >= PITY_THRESHOLD:
            state.pity_counter = PITY_THRESHOLD  # Ограничиваем порогом
    
    # Создаем транзакцию спина
    spin_id = generate_spin_id()
    create_spin_transaction(
        spin_id=spin_id,
        user_id=user_id,
        showcase_id=showcase_id,
        prize_id=prize.id,
        pity_win=prize.pity_win,
        coupons_before=state.coupons + 1,
        coupons_after=state.coupons
    )
    
    # Сохраняем состояние
    save_user_spin_state(state)
    
    return jsonify({
        "success": True,
        "spinId": spin_id,
        "prize": {
            "prizeId": prize.id,
            "name": prize.name,
            "icon": prize.icon,
            "pityWin": prize.pity_win
        },
        "pityCounter": {
            "current": state.pity_counter,
            "threshold": PITY_THRESHOLD,
            "guaranteed": state.pity_counter >= PITY_THRESHOLD
        },
        "couponsRemaining": state.coupons
    }), 200

def determine_prize(user_id, showcase_id, pity_counter):
    # Получаем конфигурацию pity timer для этой витрины
    pity_config = get_pity_config(showcase_id)
    
    # Проверяем pity timer
    if pity_config.is_enabled and pity_counter >= pity_config.threshold:
        return get_prize_by_id(pity_config.legendary_prize_id, pity_win=True)
    
    # Обычный случайный выбор (серверный CSPRNG)
    random_num = secrets.randbelow(100) + 1  # 1-100
    prize = select_prize_by_weight(showcase_id, random_num)
    
    return prize
```

---

**Конец спецификации**

