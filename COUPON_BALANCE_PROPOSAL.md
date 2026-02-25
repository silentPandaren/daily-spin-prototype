# Предложение по структуре баланса купонов для колеса фортуны

**Дата:** 24 февраля 2026  
**Основано на:** Анализе backend репозитория market-games-mail-ru

---

## Обзор

В backend репозитории уже существует валюта `MarketCurrency.coupons`, которая входит в `VIRTUAL_CURRENCIES`. Это позволяет интегрировать купоны колеса фортуны в существующую систему балансов через endpoint `/balance/new`.

---

## Текущая архитектура балансов в Market

### Endpoint: `GET /balance/new`

**Структура ответа:**
```json
{
  "balance": [
    {
      "amount": 150,
      "code": "bonus"
    },
    {
      "amount": 500,
      "code": "mycoins"
    },
    {
      "amount": 3,
      "code": "coupons"
    }
  ],
  "keysShowcaseLink": "/showcases/125/inventory",
  "keysShowcaseId": 125
}
```

**Ключевые компоненты:**
- `UserBalanceDto` — DTO с полями `code: MarketCurrency` и `amount: int`
- `UserBalanceService` — сервис, который собирает балансы из разных источников
- `UserBalanceVM` — ViewModel с массивом балансов и опциональной информацией о витрине ключей

### Существующие валюты

В `MarketCurrency` уже определены:
- `coupons = "coupons"` — виртуальная валюта для купонов
- Входит в `VIRTUAL_CURRENCIES`
- Имеет порядок сортировки: `16` (в `CURRENCY_ORDERING`)

---

## Предлагаемая структура для колеса фортуны

### Вариант 1: Использование существующей валюты `coupons` (рекомендуется)

**Преимущества:**
- ✅ Переиспользование существующей инфраструктуры
- ✅ Единая точка получения балансов
- ✅ Автоматическая интеграция с системой начислений/списаний
- ✅ Консистентность с другими валютами (bonus, mycoins, etc.)

**Структура:**

#### 1. Получение баланса купонов

**Запрос:**
```http
GET /balance/new
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "balance": [
    {
      "amount": 3,
      "code": "coupons"
    },
    {
      "amount": 500,
      "code": "mycoins"
    }
  ]
}
```

**На фронтенде:**
```javascript
async function getCouponBalance() {
  const response = await fetch('/balance/new', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  const couponBalance = data.balance.find(b => b.code === 'coupons');
  return couponBalance?.amount || 0;
}
```

#### 2. Интеграция с колесом фортуны

**Обновленная структура `wheel_user_state`:**
```sql
-- УДАЛИТЬ поле coupons из wheel_user_state
-- Вместо этого использовать баланс из /balance/new

ALTER TABLE wheel_user_state 
  DROP COLUMN coupons;  -- Удаляем локальное хранение

-- Оставляем только:
-- user_id, showcase_id, pity_counter, total_spins, last_spin_at
```

**Логика списания купонов:**

При спине колеса:
1. Проверить баланс через `/balance/new` (или кеш)
2. Если `coupons.amount >= 1`, выполнить спин
3. Списать купон через существующий механизм списания валюты (аналогично bonus/mycoins)
4. Обновить состояние колеса (pity_counter, total_spins)

#### 3. Начисление купонов

**Способы начисления:**
- При покупке товара на витрине (через существующий механизм начисления валют)
- За ежедневный вход (через систему бонусов)
- За реферальную программу
- Через админ-панель (ручное начисление)

**Все начисления идут через единую систему балансов Market.**

---

### Вариант 2: Отдельная валюта `wheel_coupons` (альтернатива)

Если нужна изоляция купонов колеса от других купонов в системе:

**Изменения в backend:**
```python
# В market/common/currency.py
class MarketCurrency(EnumWithLabelsAndFlags):
    # ... существующие валюты
    wheel_coupons = "wheel_coupons"  # Новая валюта

VIRTUAL_CURRENCIES: set[MarketCurrency] = {
    # ... существующие
    MarketCurrency.wheel_coupons,
}
```

**Преимущества:**
- Изоляция купонов колеса от других купонов
- Возможность иметь разные правила для разных типов купонов

**Недостатки:**
- Требует изменений в backend
- Дублирование логики

**Рекомендация:** Использовать Вариант 1, если нет специфических требований к изоляции.

---

## Интеграция с API колеса

### Обновленный endpoint `GET /wheel/state`

**Текущая структура:**
```json
{
  "coupons": {
    "current": 3,
    "totalEarned": 15,
    "totalSpent": 12
  }
}
```

**Предлагаемая структура:**
```json
{
  "coupons": {
    "current": 3,  // Из /balance/new
    "totalEarned": 15,  // Из истории начислений
    "totalSpent": 12    // Из wheel_spin_history
  },
  "balanceSource": "market_balance"  // Указывает источник
}
```

**Реализация на backend:**
```python
def get_wheel_state(user_id, showcase_id):
    # Получить баланс из UserBalanceService
    balance_vm = user_balance_service.get_user_balance(user_info, user)
    coupon_balance = next(
        (b for b in balance_vm.balances if b.code == MarketCurrency.coupons),
        UserBalanceDto(MarketCurrency.coupons, 0)
    )
    
    # Получить статистику из wheel_user_state
    state = get_user_state(user_id, showcase_id)
    
    return {
        "coupons": {
            "current": coupon_balance.amount,
            "totalEarned": state.total_coupons_earned,
            "totalSpent": state.total_coupons_spent
        }
    }
```

### Обновленный endpoint `POST /wheel/spin`

**Перед спином:**
1. Получить баланс через `UserBalanceService`
2. Проверить `coupons.amount >= 1`
3. Если недостаточно — вернуть `INSUFFICIENT_COUPONS`

**При спине:**
1. Списать купон через систему списания валют (аналогично bonus)
2. Обновить `wheel_user_state` (pity_counter, total_spins)
3. Сохранить в `wheel_spin_history`

**Пример кода:**
```python
@atomic
def perform_spin(user_id, showcase_id):
    # 1. Получить баланс
    balance_vm = user_balance_service.get_user_balance(user_info, user)
    coupon_balance = next(
        (b for b in balance_vm.balances if b.code == MarketCurrency.coupons),
        None
    )
    
    if not coupon_balance or coupon_balance.amount < 1:
        raise InsufficientCouponsError()
    
    # 2. Списать купон (через существующий механизм)
    # Например, через Billing или аналогичный сервис
    billing.deduct_currency(user, MarketCurrency.coupons, 1)
    
    # 3. Выполнить спин
    prize = determine_prize(user_id, showcase_id)
    
    # 4. Обновить состояние
    update_wheel_state(user_id, showcase_id, prize)
    
    return prize
```

---

## Схема данных

### Упрощенная таблица `wheel_user_state`

```sql
CREATE TABLE wheel_user_state (
  user_id VARCHAR(255) NOT NULL,
  showcase_id INT NOT NULL,
  -- coupons INT NOT NULL DEFAULT 0,  -- УДАЛЕНО: используем /balance/new
  pity_counter INT NOT NULL DEFAULT 0,
  total_spins INT NOT NULL DEFAULT 0,
  total_coupons_earned INT NOT NULL DEFAULT 0,  -- Для статистики
  total_coupons_spent INT NOT NULL DEFAULT 0,    -- Для статистики
  last_spin_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (user_id, showcase_id),
  INDEX idx_showcase_user (showcase_id, user_id),
  INDEX idx_last_spin (last_spin_at),
  FOREIGN KEY (showcase_id) REFERENCES wheel_showcase_config(showcase_id)
);
```

**Изменения:**
- ❌ Удалено поле `coupons` (баланс берется из `/balance/new`)
- ✅ Добавлены `total_coupons_earned` и `total_coupons_spent` для статистики
- ✅ Остальные поля без изменений

### Таблица `wheel_spin_history` (без изменений)

```sql
CREATE TABLE wheel_spin_history (
  spin_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  showcase_id INT NOT NULL,
  prize_id INT NOT NULL,
  prize_name VARCHAR(255) NOT NULL,
  is_pity_win BOOLEAN DEFAULT FALSE,
  random_number INT NULL,
  coupons_before INT NOT NULL,  -- Из /balance/new перед спинном
  coupons_after INT NOT NULL,   -- Из /balance/new после спинна
  pity_counter_before INT NOT NULL,
  pity_counter_after INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- индексы без изменений
);
```

---

## Преимущества предложенного подхода

### 1. Единая точка истины
- Баланс купонов хранится в единой системе балансов Market
- Нет дублирования данных между `wheel_user_state` и системой балансов

### 2. Переиспользование инфраструктуры
- Используется существующий endpoint `/balance/new`
- Используется существующий механизм начисления/списания валют
- Не требуется создавать отдельные API для управления купонами

### 3. Консистентность
- Купоны обрабатываются так же, как bonus, mycoins и другие виртуальные валюты
- Единый подход к кешированию и обновлению балансов

### 4. Гибкость
- Легко добавить новые способы начисления купонов через существующую систему
- Можно использовать купоны не только для колеса, но и для других механик

### 5. Безопасность
- Все операции с балансом выполняются на backend
- Атомарные транзакции при списании
- Защита от race conditions через существующие механизмы

---

## План миграции

### Этап 1: Подготовка backend
1. Убедиться, что `MarketCurrency.coupons` включен в `site.balances` для нужных витрин
2. Добавить логику начисления купонов при покупках (если еще не реализовано)
3. Добавить endpoint для списания купонов при спине (или использовать существующий)

### Этап 2: Обновление API колеса
1. Изменить `GET /wheel/state` для получения баланса из `/balance/new`
2. Изменить `POST /wheel/spin` для списания через систему балансов
3. Обновить логику валидации баланса

### Этап 3: Миграция данных
1. Перенести существующие `coupons` из `wheel_user_state` в систему балансов
2. Обновить `total_coupons_earned` и `total_coupons_spent` из истории
3. Удалить поле `coupons` из `wheel_user_state`

### Этап 4: Обновление фронтенда
1. Изменить получение баланса: вместо `GET /wheel/state` использовать `GET /balance/new`
2. Обновить UI для отображения баланса из единой системы
3. Добавить обработку ошибок при недостатке купонов

---

## Примеры использования

### Получение баланса на фронтенде

```javascript
// Получение баланса купонов
async function getCouponBalance() {
  try {
    const response = await fetch('/balance/new', {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch balance');
    }
    
    const data = await response.json();
    const couponBalance = data.balance.find(b => b.code === 'coupons');
    return couponBalance?.amount || 0;
  } catch (error) {
    console.error('Error fetching coupon balance:', error);
    return 0;
  }
}

// Использование в компоненте колеса
async function updateCouponDisplay() {
  const balance = await getCouponBalance();
  document.getElementById('couponCount').textContent = balance;
  document.getElementById('btnSpin').disabled = balance <= 0;
}
```

### Интеграция с колесом

```javascript
// В script.js
let coupons = 0;  // Инициализируется из /balance/new

// При загрузке страницы
async function initWheel() {
  coupons = await getCouponBalance();
  updateCouponsUI();
  
  // Подписка на обновления баланса (если есть WebSocket)
  subscribeToBalanceUpdates((balance) => {
    const couponBalance = balance.find(b => b.code === 'coupons');
    if (couponBalance) {
      coupons = couponBalance.amount;
      updateCouponsUI();
    }
  });
}

// При спине
async function startSpin() {
  if (coupons <= 0) {
    showError('Not enough coupons');
    return;
  }
  
  try {
    const response = await fetch('/wheel/spin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ showcaseId: 125 })
    });
    
    if (response.status === 400) {
      const error = await response.json();
      if (error.error === 'INSUFFICIENT_COUPONS') {
        // Обновить баланс и показать ошибку
        coupons = await getCouponBalance();
        updateCouponsUI();
        showError('Not enough coupons');
        return;
      }
    }
    
    const result = await response.json();
    coupons = result.coupons.remaining;
    updateCouponsUI();
    
    // Продолжить логику спина...
  } catch (error) {
    console.error('Spin error:', error);
  }
}
```

---

## Резюме

**Рекомендуемый подход:** Использовать существующую валюту `MarketCurrency.coupons` и endpoint `/balance/new` для управления балансом купонов колеса фортуны.

**Ключевые преимущества:**
- ✅ Переиспользование существующей инфраструктуры
- ✅ Единая точка истины для балансов
- ✅ Консистентность с другими валютами
- ✅ Безопасность и атомарность операций
- ✅ Гибкость для будущих расширений

**Основные изменения:**
1. Удалить поле `coupons` из `wheel_user_state`
2. Использовать `/balance/new` для получения баланса
3. Использовать существующий механизм списания валют при спине
4. Добавить статистику `total_coupons_earned/spent` в `wheel_user_state` (опционально)

---

**Вопросы для обсуждения:**
1. Нужна ли изоляция купонов колеса от других купонов в системе?
2. Какие способы начисления купонов уже реализованы в Market?
3. Есть ли специфические требования к кешированию баланса купонов?

