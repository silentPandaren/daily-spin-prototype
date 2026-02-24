# Daily Spin — Technical Specification

**Version:** 1.0  
**Last Updated:** February 24, 2026  
**Status:** Prototype → Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Pity Timer Logic](#pity-timer-logic)
3. [Prize Configuration Structure](#prize-configuration-structure)
4. [Analytics Events](#analytics-events)
5. [Backend API Requirements](#backend-api-requirements)
6. [Security Considerations](#security-considerations)

---

## Overview

The Daily Spin is a client-side wheel-of-fortune game where users spend "Spin Coupons" to win prizes. The current prototype (`index.html`) implements all game logic on the frontend, but **for production, critical operations must be moved to the backend** to prevent cheating.

### Key Features
- 8-segment wheel with weighted probability distribution
- Pity Timer system guaranteeing rare prizes
- Real-time analytics event tracking
- Upsell offer when coupons are depleted
- Responsive design matching MY.GAMES Market style

---

## Pity Timer Logic

### Purpose
The Pity Timer ensures that players receive a guaranteed "Legendary Item" prize after a certain number of spins without winning it, improving user experience and preventing frustration.

### Implementation Details

#### Variables
```javascript
const LEGENDARY_IDX = 2;              // Index of 'Legendary Item' in prizesConfig
const PITY_THRESHOLD = 10;            // Number of spins before guarantee triggers
let spinsSinceLastLegendary = 0;     // Current counter (persists across sessions)
```

#### Algorithm Flow

1. **Before Each Spin** (`startSpin()`):
   ```javascript
   // Check if pity threshold is reached
   if (spinsSinceLastLegendary >= PITY_THRESHOLD) {
     // Force legendary prize (bypass random roll)
     isPityWin = true;
     winIdx = LEGENDARY_IDX;
   } else {
     // Normal random roll
     ({ rnd, winIdx } = rollPrize());
   }
   ```

2. **Increment Counter**:
   ```javascript
   spinsSinceLastLegendary++;
   ```

3. **After Prize Determination** (`onSpinEnd()`):
   ```javascript
   // Reset counter if legendary was won (either by chance or pity)
   if (winIdx === LEGENDARY_IDX) {
     spinsSinceLastLegendary = 0;
   }
   ```

#### State Persistence

**Current Prototype:** Counter is stored in memory and resets on page refresh.

**Production Requirement:** The counter must be stored server-side per user to prevent:
- Manipulation via browser console
- Reset on page refresh
- Multiple account abuse

#### UI Display

- **Progress Bar:** Shows `spinsSinceLastLegendary / PITY_THRESHOLD` as a percentage
- **Visual Indicator:** Bar glows gold when `spinsSinceLastLegendary >= PITY_THRESHOLD`
- **Debug Panel:** Displays current counter value
- **Console Log:** Shows `★ PITY WIN!` tag when pity timer triggers

#### Edge Cases

1. **Concurrent Spins:** If a user triggers multiple spins rapidly, the counter should increment atomically (backend must handle this).
2. **Prize Change:** If `LEGENDARY_IDX` changes in config, existing counters should be migrated or reset.
3. **Multiple Pity Prizes:** Currently only one pity prize exists. If more are added, each needs its own counter.

---

## Prize Configuration Structure

### JSON Schema

The prize configuration is defined as an array of objects. Each object represents one wheel segment.

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

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Display name shown in success modal and analytics |
| `wheelText` | `string` | ✅ | Text rendered on wheel segment (supports `\n` for line breaks) |
| `color` | `string` | ✅ | Hex color code for segment background gradient |
| `icon` | `string` | ✅ | Path to icon image (relative to HTML file or absolute URL) |
| `weight` | `number` | ✅ | Probability weight (must sum to 100 across all prizes) |

### Computed Fields (Auto-generated)

After loading the config, the system automatically calculates:

```javascript
// For each prize, compute cumulative range
let cumulative = 0;
prizesConfig.forEach(prize => {
  prize.rangeMin = cumulative + 1;
  cumulative += prize.weight;
  prize.rangeMax = cumulative;
});
```

**Example:**
- Prize 0 (5%): `rangeMin: 1, rangeMax: 5`
- Prize 1 (15%): `rangeMin: 6, rangeMax: 20`
- Prize 2 (5%): `rangeMin: 21, rangeMax: 25`
- ... and so on

### Validation Rules

1. **Weight Sum:** All `weight` values must sum to exactly `100`
2. **Array Length:** Must contain exactly `8` items (one per wheel segment)
3. **Icon Files:** All icon paths must resolve to valid image files
4. **Color Format:** Must be valid hex color codes (e.g., `#005aff`)

### Backend Storage

**Production Requirement:** Prize configuration should be:
- Stored in database (not hardcoded in frontend)
- Versioned (to track changes over time)
- Cacheable (to reduce database queries)
- Admin-editable (via CMS or admin panel)

---

## Analytics Events

### Event Tracking Function

All analytics events are logged via a centralized function:

```javascript
function trackEvent(eventName, data = null) {
  const timestamp = new Date().toLocaleTimeString('en-GB');
  const extra = data ? ' ' + JSON.stringify(data) : '';
  const message = `[Analytics] Event: ${eventName}${extra}`;
  
  console.log(message);
  // Append to debug panel
  // Send to analytics service (production)
}
```

### Event Catalog

#### 1. `page_loaded`

**Trigger:** When the page finishes loading (DOM ready + images loaded)

**Payload:**
```json
{
  "coupons": 3
}
```

**Use Case:** Track page views and initial coupon balance

---

#### 2. `spin_started`

**Trigger:** When user clicks "Spin" button and spin animation begins

**Payload:**
```json
{
  "spinNumber": 1,
  "couponsLeft": 2
}
```

**Use Case:** Measure engagement, track spin frequency, detect rapid clicking

---

#### 3. `prize_received`

**Trigger:** After wheel stops and prize is determined (before modal appears)

**Payload:**
```json
{
  "prize": "Legendary Item",
  "pityWin": false
}
```

**Special Case:**
```json
{
  "prize": "Legendary Item",
  "pityWin": true
}
```

**Use Case:** 
- Calculate actual drop rates vs. configured weights
- Track pity timer effectiveness
- Measure prize distribution

---

#### 4. `spin_attempt_no_coupons`

**Trigger:** When user clicks "Spin" button but `coupons === 0`

**Payload:**
```json
{
  "coupons": 0
}
```

**Use Case:** Identify users who want to spin but are blocked, measure upsell opportunity

---

#### 5. `Shop_Redirect_from_Wheel`

**Trigger:** When user clicks "Go to Shop" button in the upsell offer block

**Payload:** `null`

**Use Case:** Measure conversion from upsell offer to shop page

---

### Additional Metrics (Session-based)

The debug panel also tracks:

- **Total Spins:** `totalSpins` counter (increments on each spin)
- **Average Spins per Minute:** Calculated as `totalSpins / ((Date.now() - sessionStartTime) / 60000)`

**Production Note:** These metrics should be sent to analytics service periodically (e.g., every 30 seconds) or on page unload.

---

### Integration with Analytics Services

**Current Prototype:** Events are logged to console and debug panel only.

**Production Requirements:**

1. **Send to Backend:** All events should be POSTed to `/api/analytics/track`
2. **Batch Requests:** Group multiple events into single request to reduce network overhead
3. **Retry Logic:** Queue failed requests and retry on reconnection
4. **Privacy Compliance:** Ensure GDPR/CCPA compliance (user consent, data anonymization)

**Example Backend Payload:**
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

## Backend API Requirements

### Overview

The current prototype performs all game logic on the frontend, which is **vulnerable to manipulation**. For production, the following operations must be moved to the backend:

1. Prize determination (random roll + pity timer)
2. Coupon deduction
3. Prize awarding
4. State persistence (pity counter, coupon balance)

---

### API Endpoints

#### 1. `POST /api/spin/initiate`

**Purpose:** Request permission to spin and receive prize determination from server.

**Request Headers:**
```
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "showcaseId": 125,
  "eventId": "daily-spin"
}
```

**Note:** `showcaseId` is the identifier of the showcase where the wheel is located. The showcase is linked to a game through the `wheel_showcase_config` table. The wheel is located on a showcase, not directly on a game.

**Response (200 OK):**
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
  "serverSeed": "a1b2c3d4e5f6...",  // For transparency/verification
  "clientNonce": "xyz789"            // Client-provided nonce for fairness
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "INSUFFICIENT_COUPONS",
  "message": "Not enough spin coupons. Current balance: 0"
}
```

**Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many spins in short time. Please wait."
}
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired authentication token"
}
```

---

#### 2. `POST /api/spin/confirm`

**Purpose:** Confirm that the spin animation completed and award the prize.

**Request Body:**
```json
{
  "spinId": "spin_abc123xyz",
  "timestamp": "2024-01-15T10:30:05Z"  // When animation finished
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "prizeAwarded": true,
  "transactionId": "txn_xyz789",
  "couponsRemaining": 2
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "INVALID_SPIN_ID",
  "message": "Spin ID not found or already confirmed"
}
```

**Response (409 Conflict):**
```json
{
  "success": false,
  "error": "SPIN_EXPIRED",
  "message": "Spin confirmation timeout (must confirm within 10 seconds)"
}
```

---

#### 3. `GET /api/spin/state`

**Purpose:** Retrieve current user state (coupons, pity counter, etc.)

**Response (200 OK):**
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

**Purpose:** Retrieve prize configuration (weights, names, icons)

**Response (200 OK):**
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
    // ... other prizes
  ],
  "version": "1.2.0",
  "updatedAt": "2024-01-15T09:00:00Z"
}
```

**Caching:** Frontend should cache this config and re-fetch only when `version` changes.

---

### Security Measures

#### 1. **Server-Side Random Generation**

**Problem:** Client can manipulate `Math.random()` to force desired prizes.

**Solution:**
- Use cryptographically secure random number generator (CSPRNG) on backend
- Optionally use provably fair system (server seed + client nonce)
- Return pre-determined prize in `/api/spin/initiate` response

#### 2. **Pity Timer Persistence**

**Problem:** Client can reset `spinsSinceLastLegendary` counter.

**Solution:**
- Store counter in database per user
- Increment atomically (use database transaction or Redis INCR)
- Return current value in API responses

#### 3. **Coupon Balance Validation**

**Problem:** Client can modify `coupons` variable to spin infinitely.

**Solution:**
- Store coupon balance in database
- Deduct coupons server-side before prize determination
- Return updated balance in API response
- Validate coupon balance on every spin request

#### 4. **Rate Limiting**

**Problem:** Users can spam spin requests or automate spinning.

**Solution:**
- Implement rate limiting (e.g., max 1 spin per 3 seconds per user)
- Use Redis or similar for distributed rate limiting
- Return `429 Too Many Requests` when limit exceeded

#### 5. **Spin Confirmation Timeout**

**Problem:** User could initiate spin, see prize, then close browser to avoid confirmation.

**Solution:**
- Require confirmation within 10 seconds of initiation
- If not confirmed, rollback coupon deduction (or mark spin as "abandoned")
- Log abandoned spins for analytics

#### 6. **Request Signing (Optional, Advanced)**

**Problem:** Even with backend validation, malicious users could replay requests.

**Solution:**
- Sign requests with HMAC using shared secret
- Include timestamp in signature to prevent replay attacks
- Validate signature on backend before processing

**Example:**
```javascript
const signature = crypto
  .createHmac('sha256', SECRET_KEY)
  .update(`${spinId}:${timestamp}:${userId}`)
  .digest('hex');
```

---

### Database Schema (Suggested)

#### `wheel_showcase_config`
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

**Note:** The wheel of fortune is located on a showcase, which is linked to a game. A showcase can have its own unique set of prizes and settings.

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

**Note:** User state is stored separately for each showcase, as a user can have different pity counters and coupons on different showcases.

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

**Note:** Each showcase can have its own unique set of prizes with different weights and icons.

---

### Error Handling

All API endpoints should return consistent error format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {}  // Optional additional context
}
```

**Common Error Codes:**
- `INSUFFICIENT_COUPONS`
- `RATE_LIMIT_EXCEEDED`
- `UNAUTHORIZED`
- `INVALID_SPIN_ID`
- `SPIN_EXPIRED`
- `SERVER_ERROR`
- `MAINTENANCE_MODE`

---

## Security Considerations

### Frontend Security (Current Prototype)

**⚠️ Vulnerabilities:**
1. Prize determination happens client-side → users can manipulate
2. Coupon balance stored in memory → can be modified via console
3. Pity counter resets on refresh → no persistence
4. No authentication/authorization → anyone can access

**✅ Production Requirements:**
1. All game logic must run server-side
2. User authentication required (JWT tokens)
3. All state stored in database
4. API requests must be signed/validated
5. Rate limiting to prevent abuse
6. CORS policies to restrict origins

### Data Privacy

- **Analytics:** Ensure user consent before tracking (GDPR/CCPA)
- **Personal Data:** Minimize data collection, anonymize where possible
- **PII:** Do not store personally identifiable information unless necessary
- **Logging:** Sanitize logs to remove sensitive data

### Testing Recommendations

1. **Unit Tests:** Test prize selection algorithm, pity timer logic
2. **Integration Tests:** Test API endpoints with various scenarios
3. **Load Tests:** Verify rate limiting and database performance
4. **Security Tests:** Attempt to manipulate requests, test authentication
5. **E2E Tests:** Test full user flow from spin to prize award

---

## Appendix

### Example Backend Implementation (Pseudocode)

```python
# Python/Flask example

@app.route('/api/spin/initiate', methods=['POST'])
@require_auth
@rate_limit(max_per_minute=20)
def initiate_spin():
    user_id = get_current_user_id()
    showcase_id = request.json.get('showcaseId')
    
    # Validate showcase exists and is active
    showcase = get_showcase_config(showcase_id)
    if not showcase or not showcase.is_active:
        return jsonify({
            "success": False,
            "error": "INVALID_SHOWCASE_ID"
        }), 400
    
    # Check coupon balance
    state = get_user_spin_state(user_id, showcase_id)
    if state.coupons <= 0:
        return jsonify({
            "success": False,
            "error": "INSUFFICIENT_COUPONS"
        }), 400
    
    # Determine prize (server-side)
    prize = determine_prize(user_id, showcase_id, state.pity_counter)
    
    # Deduct coupon
    state.coupons -= 1
    state.total_spins += 1
    
    # Update pity counter
    if prize.pity_win:
        state.pity_counter = 0
    else:
        state.pity_counter += 1
        if state.pity_counter >= PITY_THRESHOLD:
            state.pity_counter = PITY_THRESHOLD  # Cap at threshold
    
    # Create spin transaction
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
    
    # Save state
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
    # Get pity config for this showcase
    pity_config = get_pity_config(showcase_id)
    
    # Check pity timer
    if pity_config.is_enabled and pity_counter >= pity_config.threshold:
        return get_prize_by_id(pity_config.legendary_prize_id, pity_win=True)
    
    # Normal random roll (server-side CSPRNG)
    random_num = secrets.randbelow(100) + 1  # 1-100
    prize = select_prize_by_weight(showcase_id, random_num)
    
    return prize
```

---

**End of Specification**

