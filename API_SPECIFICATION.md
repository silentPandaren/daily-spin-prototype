# API Specification — Daily Spin Wheel

**Версия:** 1.0  
**Последнее обновление:** 24 февраля 2026  
**Базовый URL:** `https://api.my.games/wheel`

---

## Содержание

1. [Структура базы данных](#структура-базы-данных)
2. [Эндпоинты](#эндпоинты)
   - [POST /wheel/spin](#post-wheelspin)
   - [GET /wheel/config](#get-wheelconfig)
   - [GET /wheel/state](#get-wheelstate)
   - [GET /wheel/history](#get-wheelhistory)
3. [Коды ошибок](#коды-ошибок)
4. [Примеры запросов и ответов](#примеры-запросов-и-ответов)

---

## Структура базы данных

### Таблица: `wheel_showcase_config`

Связь витрин с играми. Колесо фортуны располагается на витрине, которая привязана к игре.

```sql
CREATE TABLE wheel_showcase_config (
  showcase_id INT PRIMARY KEY,
  game_id INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_game (game_id),
  FOREIGN KEY (game_id) REFERENCES games(game_id)
);
```

**Поля:**
- `showcase_id` — уникальный идентификатор витрины (например, 125)
- `game_id` — идентификатор игры, к которой привязана витрина
- `is_active` — активна ли витрина
- `created_at` — время создания записи
- `updated_at` — время последнего обновления

---

### Таблица: `wheel_user_state`

Хранит текущее состояние каждого пользователя для колеса фортуны на конкретной витрине.

```sql
CREATE TABLE wheel_user_state (
  user_id VARCHAR(255) NOT NULL,
  showcase_id INT NOT NULL,
  coupons INT NOT NULL DEFAULT 0,
  pity_counter INT NOT NULL DEFAULT 0,
  total_spins INT NOT NULL DEFAULT 0,
  last_spin_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (user_id, showcase_id),
  INDEX idx_showcase_user (showcase_id, user_id),
  INDEX idx_last_spin (last_spin_at),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

**Поля:**
- `user_id` — уникальный идентификатор пользователя
- `showcase_id` — идентификатор витрины (например, 125)
- `coupons` — текущее количество купонов на спин
- `pity_counter` — счетчик спинов с момента последнего легендарного приза (0-10)
- `total_spins` — общее количество спинов пользователя на этой витрине
- `last_spin_at` — время последнего спина (NULL, если спинов не было)
- `created_at` — время создания записи
- `updated_at` — время последнего обновления

---

### Таблица: `wheel_spin_history`

История всех спинов пользователей для аналитики и аудита.

```sql
CREATE TABLE wheel_spin_history (
  spin_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  showcase_id INT NOT NULL,
  prize_id INT NOT NULL,
  prize_name VARCHAR(255) NOT NULL,
  is_pity_win BOOLEAN DEFAULT FALSE,
  random_number INT NULL,  -- NULL если pity win
  coupons_before INT NOT NULL,
  coupons_after INT NOT NULL,
  pity_counter_before INT NOT NULL,
  pity_counter_after INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_showcase_created (showcase_id, created_at),
  INDEX idx_prize (prize_id),
  INDEX idx_pity_win (is_pity_win),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

**Поля:**
- `spin_id` — уникальный идентификатор спина (UUID или аналогичный)
- `user_id` — идентификатор пользователя
- `showcase_id` — идентификатор витрины
- `prize_id` — ID выигранного приза (соответствует `prize_id` из `wheel_prize_config`)
- `prize_name` — название приза (для быстрого доступа без JOIN)
- `is_pity_win` — флаг, указывающий, был ли приз выдан через Pity Timer
- `random_number` — сгенерированное случайное число (1-100), NULL если pity win
- `coupons_before` — количество купонов до спина
- `coupons_after` — количество купонов после спина
- `pity_counter_before` — значение pity counter до спина
- `pity_counter_after` — значение pity counter после спина
- `created_at` — время создания записи

---

### Таблица: `wheel_prize_config`

Конфигурация призов колеса. Позволяет изменять призы без изменения кода.

```sql
CREATE TABLE wheel_prize_config (
  prize_id INT PRIMARY KEY AUTO_INCREMENT,
  showcase_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  wheel_text VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL,  -- hex color code
  icon_path VARCHAR(500) NOT NULL,
  weight INT NOT NULL,  -- вероятность (1-100)
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT NOT NULL,  -- порядок отображения на колесе (0-7)
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_showcase_active (showcase_id, is_active),
  INDEX idx_version (version),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

**Поля:**
- `prize_id` — уникальный идентификатор приза
- `showcase_id` — идентификатор витрины (разные витрины могут иметь разные наборы призов)
- `name` — название приза (отображается в модальном окне)
- `wheel_text` — текст на секторе колеса (поддерживает `\n` для переноса)
- `color` — цвет сектора (hex-код, например `#005aff`)
- `icon_path` — путь к иконке приза
- `weight` — вес вероятности (должен суммироваться до 100 для всех активных призов витрины)
- `is_active` — активен ли приз (можно временно отключить)
- `display_order` — порядок отображения на колесе (0 = первый сектор, 7 = последний)
- `version` — версия конфигурации (для кеширования на клиенте)
- `created_at` — время создания
- `updated_at` — время последнего обновления

**Ограничения:**
- Для каждого `showcase_id` сумма `weight` всех активных призов должна равняться 100
- Для каждого `showcase_id` должно быть ровно 8 активных призов
- `display_order` должен быть уникальным для каждого `showcase_id` (0-7)

---

### Таблица: `wheel_pity_config`

Конфигурация Pity Timer для каждой витрины.

```sql
CREATE TABLE wheel_pity_config (
  showcase_id INT PRIMARY KEY,
  legendary_prize_id INT NOT NULL,  -- prize_id легендарного приза
  threshold INT NOT NULL DEFAULT 10,  -- количество спинов до гарантии
  is_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id),
  FOREIGN KEY (legendary_prize_id) REFERENCES wheel_prize_config(prize_id)
);
```

**Поля:**
- `showcase_id` — идентификатор витрины
- `legendary_prize_id` — ID приза, который гарантируется через Pity Timer
- `threshold` — порог спинов (по умолчанию 10)
- `is_enabled` — включен ли Pity Timer для этой витрины
- `updated_at` — время последнего обновления

---

## Эндпоинты

### POST /wheel/spin

Инициирует спин колеса для пользователя. Определяет приз на сервере, списывает купон, обновляет счетчики.

**Авторизация:** Требуется (Bearer Token)

**Заголовки:**
```
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Тело запроса:**
```json
{
  "showcaseId": 125
}
```

**Параметры:**
- `showcaseId` (integer, required) — идентификатор витрины

**Ответ (200 OK):**
```json
{
  "success": true,
  "spinId": "spin_abc123xyz789",
  "prize": {
    "prizeId": 2,
    "name": "Legendary Item",
    "wheelText": "Legendary\nItem",
    "color": "#003dad",
    "icon": "icons/legendary.png",
    "isPityWin": false
  },
  "coupons": {
    "remaining": 2,
    "before": 3,
    "after": 2
  },
  "pityTimer": {
    "current": 7,
    "threshold": 10,
    "guaranteed": false,
    "before": 6,
    "after": 7
  },
  "randomNumber": 23,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Ответ при Pity Win:**
```json
{
  "success": true,
  "spinId": "spin_abc123xyz789",
  "prize": {
    "prizeId": 2,
    "name": "Legendary Item",
    "wheelText": "Legendary\nItem",
    "color": "#003dad",
    "icon": "icons/legendary.png",
    "isPityWin": true
  },
  "coupons": {
    "remaining": 1,
    "before": 2,
    "after": 1
  },
  "pityTimer": {
    "current": 0,
    "threshold": 10,
    "guaranteed": true,
    "before": 10,
    "after": 0
  },
  "randomNumber": null,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Описание полей ответа:**

| Поле | Тип | Описание |
|------|-----|----------|
| `success` | boolean | Успешность операции |
| `spinId` | string | Уникальный идентификатор спина |
| `prize.prizeId` | integer | ID выигранного приза |
| `prize.name` | string | Название приза |
| `prize.wheelText` | string | Текст для отображения на колесе |
| `prize.color` | string | Цвет сектора (hex) |
| `prize.icon` | string | Путь к иконке |
| `prize.isPityWin` | boolean | Был ли приз выдан через Pity Timer |
| `coupons.remaining` | integer | Оставшееся количество купонов |
| `coupons.before` | integer | Количество купонов до спина |
| `coupons.after` | integer | Количество купонов после спина |
| `pityTimer.current` | integer | Текущее значение счетчика (0-10) |
| `pityTimer.threshold` | integer | Порог для гарантии (обычно 10) |
| `pityTimer.guaranteed` | boolean | Достигнут ли порог (следующий спин гарантирован) |
| `pityTimer.before` | integer | Значение счетчика до спина |
| `pityTimer.after` | integer | Значение счетчика после спина |
| `randomNumber` | integer\|null | Сгенерированное число (1-100), null если pity win |
| `timestamp` | string | ISO 8601 timestamp спина |

**Ошибки:**

**400 Bad Request** — Недостаточно купонов:
```json
{
  "success": false,
  "error": "INSUFFICIENT_COUPONS",
  "message": "Not enough spin coupons. Current balance: 0",
  "coupons": {
    "remaining": 0
  }
}
```

**401 Unauthorized** — Недействительный токен:
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired authentication token"
}
```

**429 Too Many Requests** — Превышен лимит запросов:
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many spins in short time. Please wait.",
  "retryAfter": 3
}
```

**500 Internal Server Error** — Ошибка сервера:
```json
{
  "success": false,
  "error": "SERVER_ERROR",
  "message": "Internal server error. Please try again later."
}
```

---

### GET /wheel/config

Возвращает текущую конфигурацию колеса для указанной витрины (список призов, их веса, иконки).

**Авторизация:** Не требуется (публичный эндпоинт)

**Параметры запроса:**
- `showcaseId` (integer, required) — идентификатор витрины

**Пример запроса:**
```
GET /wheel/config?showcaseId=125
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "showcaseId": 125,
  "gameId": 42,
  "version": "1.2.0",
  "updatedAt": "2024-01-15T09:00:00Z",
  "pityTimer": {
    "enabled": true,
    "threshold": 10,
    "legendaryPrizeId": 2
  },
  "prizes": [
    {
      "prizeId": 0,
      "name": "25% Discount",
      "wheelText": "25%\nDiscount",
      "color": "#005aff",
      "icon": "icons/discount.png",
      "weight": 5,
      "displayOrder": 0,
      "rangeMin": 1,
      "rangeMax": 5
    },
    {
      "prizeId": 1,
      "name": "100 Platinum",
      "wheelText": "100\nPlatinum",
      "color": "#642ab5",
      "icon": "icons/platinum.png",
      "weight": 15,
      "displayOrder": 1,
      "rangeMin": 6,
      "rangeMax": 20
    },
    {
      "prizeId": 2,
      "name": "Legendary Item",
      "wheelText": "Legendary\nItem",
      "color": "#003dad",
      "icon": "icons/legendary.png",
      "weight": 5,
      "displayOrder": 2,
      "rangeMin": 21,
      "rangeMax": 25
    },
    {
      "prizeId": 3,
      "name": "8 Spheres",
      "wheelText": "8\nSpheres",
      "color": "#51258f",
      "icon": "icons/spheres.png",
      "weight": 5,
      "displayOrder": 3,
      "rangeMin": 26,
      "rangeMax": 30
    },
    {
      "prizeId": 4,
      "name": "200 Cores",
      "wheelText": "200\nCores",
      "color": "#005aff",
      "icon": "icons/cores.png",
      "weight": 5,
      "displayOrder": 4,
      "rangeMin": 31,
      "rangeMax": 35
    },
    {
      "prizeId": 5,
      "name": "4 Spheres",
      "wheelText": "4\nSpheres",
      "color": "#642ab5",
      "icon": "icons/spheres.png",
      "weight": 10,
      "displayOrder": 5,
      "rangeMin": 36,
      "rangeMax": 45
    },
    {
      "prizeId": 6,
      "name": "50 Platinum",
      "wheelText": "50\nPlatinum",
      "color": "#003dad",
      "icon": "icons/platinum.png",
      "weight": 30,
      "displayOrder": 6,
      "rangeMin": 46,
      "rangeMax": 75
    },
    {
      "prizeId": 7,
      "name": "Premium 30 days",
      "wheelText": "Premium\n30 days",
      "color": "#51258f",
      "icon": "icons/premium.png",
      "weight": 25,
      "displayOrder": 7,
      "rangeMin": 76,
      "rangeMax": 100
    }
  ]
}
```

**Описание полей ответа:**

| Поле | Тип | Описание |
|------|-----|----------|
| `success` | boolean | Успешность операции |
| `showcaseId` | integer | Идентификатор витрины |
| `gameId` | integer | Идентификатор игры, к которой привязана витрина |
| `version` | string | Версия конфигурации (для кеширования) |
| `updatedAt` | string | ISO 8601 timestamp последнего обновления |
| `pityTimer.enabled` | boolean | Включен ли Pity Timer |
| `pityTimer.threshold` | integer | Порог спинов для гарантии |
| `pityTimer.legendaryPrizeId` | integer | ID легендарного приза |
| `prizes[]` | array | Массив призов, отсортированный по `displayOrder` |
| `prizes[].prizeId` | integer | ID приза |
| `prizes[].name` | string | Название приза |
| `prizes[].wheelText` | string | Текст для колеса |
| `prizes[].color` | string | Цвет сектора (hex) |
| `prizes[].icon` | string | Путь к иконке |
| `prizes[].weight` | integer | Вес вероятности (1-100) |
| `prizes[].displayOrder` | integer | Порядок на колесе (0-7) |
| `prizes[].rangeMin` | integer | Минимальное значение диапазона (вычисляется автоматически) |
| `prizes[].rangeMax` | integer | Максимальное значение диапазона (вычисляется автоматически) |

**Ошибки:**

**400 Bad Request** — Неверный showcaseId:
```json
{
  "success": false,
  "error": "INVALID_SHOWCASE_ID",
  "message": "Showcase ID not found"
}
```

**404 Not Found** — Конфигурация не найдена:
```json
{
  "success": false,
  "error": "CONFIG_NOT_FOUND",
  "message": "Wheel configuration not found for this showcase"
}
```

**Кеширование:** Клиент должен кешировать ответ и перезагружать только при изменении `version`.

---

### GET /wheel/state

Возвращает текущее состояние пользователя (купоны, Pity Timer, статистика).

**Авторизация:** Требуется (Bearer Token)

**Параметры запроса:**
- `showcaseId` (integer, required) — идентификатор витрины

**Пример запроса:**
```
GET /wheel/state?showcaseId=125
Authorization: Bearer <user_token>
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "showcaseId": 125,
  "gameId": 42,
  "coupons": {
    "current": 3,
    "totalEarned": 15,
    "totalSpent": 12
  },
  "pityTimer": {
    "current": 7,
    "threshold": 10,
    "guaranteed": false
  },
  "statistics": {
    "totalSpins": 12,
    "lastSpinAt": "2024-01-15T10:25:00Z",
    "legendaryWins": 1,
    "pityWins": 0
  }
}
```

---

### GET /wheel/history

Возвращает историю спинов пользователя.

**Авторизация:** Требуется (Bearer Token)

**Параметры запроса:**
- `showcaseId` (integer, required) — идентификатор витрины
- `limit` (integer, optional) — количество записей (по умолчанию 20, максимум 100)
- `offset` (integer, optional) — смещение для пагинации (по умолчанию 0)

**Пример запроса:**
```
GET /wheel/history?showcaseId=125&limit=10&offset=0
Authorization: Bearer <user_token>
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "showcaseId": 125,
  "gameId": 42,
  "total": 42,
  "limit": 10,
  "offset": 0,
  "history": [
    {
      "spinId": "spin_abc123",
      "prizeId": 2,
      "prizeName": "Legendary Item",
      "isPityWin": false,
      "randomNumber": 23,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "spinId": "spin_xyz789",
      "prizeId": 6,
      "prizeName": "50 Platinum",
      "isPityWin": false,
      "randomNumber": 67,
      "createdAt": "2024-01-15T10:25:00Z"
    }
    // ... еще 8 записей
  ]
}
```

---

## Коды ошибок

| Код | HTTP Status | Описание |
|-----|-------------|----------|
| `INSUFFICIENT_COUPONS` | 400 | Недостаточно купонов для спина |
| `INVALID_SHOWCASE_ID` | 400 | Неверный идентификатор витрины |
| `UNAUTHORIZED` | 401 | Недействительный или отсутствующий токен |
| `FORBIDDEN` | 403 | Доступ запрещен |
| `CONFIG_NOT_FOUND` | 404 | Конфигурация не найдена |
| `RATE_LIMIT_EXCEEDED` | 429 | Превышен лимит запросов |
| `SERVER_ERROR` | 500 | Внутренняя ошибка сервера |
| `MAINTENANCE_MODE` | 503 | Сервис на техническом обслуживании |

---

## Примеры запросов и ответов

### Пример 1: Успешный спин

**Запрос:**
```http
POST /wheel/spin HTTP/1.1
Host: api.my.games
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "showcaseId": 125
}
```

**Ответ:**
```json
{
  "success": true,
  "spinId": "spin_abc123xyz789",
  "prize": {
    "prizeId": 6,
    "name": "50 Platinum",
    "wheelText": "50\nPlatinum",
    "color": "#003dad",
    "icon": "icons/platinum.png",
    "isPityWin": false
  },
  "coupons": {
    "remaining": 2,
    "before": 3,
    "after": 2
  },
  "pityTimer": {
    "current": 8,
    "threshold": 10,
    "guaranteed": false,
    "before": 7,
    "after": 8
  },
  "randomNumber": 67,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### Пример 2: Pity Win (гарантированный легендарный приз)

**Запрос:**
```http
POST /wheel/spin HTTP/1.1
Host: api.my.games
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "showcaseId": 125
}
```

**Ответ:**
```json
{
  "success": true,
  "spinId": "spin_def456uvw012",
  "prize": {
    "prizeId": 2,
    "name": "Legendary Item",
    "wheelText": "Legendary\nItem",
    "color": "#003dad",
    "icon": "icons/legendary.png",
    "isPityWin": true
  },
  "coupons": {
    "remaining": 1,
    "before": 2,
    "after": 1
  },
  "pityTimer": {
    "current": 0,
    "threshold": 10,
    "guaranteed": true,
    "before": 10,
    "after": 0
  },
  "randomNumber": null,
  "timestamp": "2024-01-15T10:35:00Z"
}
```

---

### Пример 3: Получение конфигурации

**Запрос:**
```http
GET /wheel/config?showcaseId=125 HTTP/1.1
Host: api.my.games
```

**Ответ:** (см. раздел [GET /wheel/config](#get-wheelconfig))

---

## Алгоритм определения приза

### Логика на сервере

```python
def determine_prize(user_id, showcase_id):
    # 1. Получить состояние пользователя
    state = get_user_state(user_id, showcase_id)
    pity_config = get_pity_config(showcase_id)
    
    # 2. Проверить Pity Timer
    if pity_config.is_enabled and state.pity_counter >= pity_config.threshold:
        # Гарантированный легендарный приз
        prize = get_prize_by_id(pity_config.legendary_prize_id)
        is_pity_win = True
        random_number = None
    else:
        # Обычный случайный выбор
        random_number = generate_random(1, 100)  # CSPRNG
        prize = select_prize_by_weight(showcase_id, random_number)
        is_pity_win = False
    
    # 3. Обновить состояние
    state.pity_counter += 1
    if prize.prize_id == pity_config.legendary_prize_id:
        state.pity_counter = 0  # Сброс при выигрыше легендарки
    
    state.coupons -= 1
    state.total_spins += 1
    state.last_spin_at = now()
    
    # 4. Сохранить в историю
    save_spin_history(
        user_id=user_id,
        showcase_id=showcase_id,
        prize_id=prize.prize_id,
        is_pity_win=is_pity_win,
        random_number=random_number,
        coupons_before=state.coupons + 1,
        coupons_after=state.coupons,
        pity_before=state.pity_counter - 1 if not is_pity_win else pity_config.threshold,
        pity_after=state.pity_counter
    )
    
    # 5. Сохранить обновленное состояние
    save_user_state(state)
    
    return prize, is_pity_win, random_number
```

---

## Безопасность

### Рекомендации по реализации

1. **Генерация случайных чисел:**
   - Используйте криптографически стойкий генератор (CSPRNG)
   - Не используйте `Math.random()` или аналогичные клиентские функции
   - Пример: `secrets.randbelow(100) + 1` в Python, `crypto.randomInt()` в Node.js

2. **Атомарные операции:**
   - Используйте транзакции БД для обновления состояния
   - Проверяйте баланс купонов перед списанием
   - Используйте `SELECT ... FOR UPDATE` для предотвращения race conditions

3. **Rate Limiting:**
   - Ограничьте количество спинов на пользователя (например, 1 спин в 3 секунды)
   - Используйте Redis для распределенного rate limiting
   - Возвращайте `429 Too Many Requests` при превышении

4. **Валидация:**
   - Проверяйте `showcaseId` на существование
   - Проверяйте, что витрина активна (`is_active = TRUE`)
   - Валидируйте токен аутентификации
   - Проверяйте баланс купонов перед каждым спином

5. **Аудит:**
   - Сохраняйте все спины в `wheel_spin_history`
   - Логируйте все ошибки и подозрительную активность
   - Регулярно проверяйте статистику на аномалии

---

## Тестирование

### Unit-тесты

- Тестирование алгоритма выбора приза
- Тестирование логики Pity Timer
- Валидация конфигурации призов

### Integration-тесты

- Полный цикл спина (запрос → определение приза → обновление БД)
- Проверка атомарности операций
- Тестирование rate limiting

### Load-тесты

- Производительность при высокой нагрузке
- Проверка блокировок БД
- Тестирование кеширования конфигурации

---

**Конец спецификации**

