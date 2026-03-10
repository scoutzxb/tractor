# Tractor Game - Single-Player vs Multiplayer Modes

## Two Game Modes Available

### 🎮 Single-Player Mode
**Use case:** Play alone against 3 AI opponents

**How to use:**
```bash
POST /api/new-game
{
  "mode": "normal",
  "level": "2",
  "dealer": "south",
  "playerMode": "single"
}
```

**Behavior:**
- ✅ Phase immediately: `"dealing"`
- ✅ Only South is human: `humanSeats: ["south"]`
- ✅ No waiting, no join required
- ✅ AI controls East, North, West

**Response:**
```json
{
  "sessionId": "abc123",
  "phase": "dealing",
  "humanSeats": ["south"],
  "isMultiplayer": false,
  "myHand": [...]
}
```

---

### 👥 Two-Player Mode
**Use case:** Play with a friend remotely (each at their own device)

**How to use:**

**Step 1: Create game**
```bash
POST /api/new-game
{
  "mode": "normal",
  "level": "2",
  "dealer": "south",
  "playerMode": "two"
}
```

**Response:**
```json
{
  "sessionId": "xyz789",
  "phase": "waiting",
  "humanSeats": ["north", "south"],
  "isMultiplayer": true
}
```

**Step 2: Players join**
```bash
# Player 1 joins as South
POST /api/join-game
{
  "sessionId": "xyz789",
  "playerName": "Alice",
  "desiredSeat": "south"
}

# Player 2 joins as North
POST /api/join-game
{
  "sessionId": "xyz789",
  "playerName": "Bob",
  "desiredSeat": "north"
}
```

**Step 3: Start the game**
```bash
POST /api/start-game
{
  "sessionId": "xyz789"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Game started! Cards dealt.",
  "phase": "dealing",
  "connectedPlayers": ["south", "north"]
}
```

---

## API Reference

| Endpoint | Single-Player | Two-Player |
|----------|---------------|------------|
| `/api/new-game` | Auto-starts | Phase: "waiting" |
| `/api/join-game` | Not needed | Required |
| `/api/start-game` | Not needed | Required after joins |

## Key Differences

| Feature | Single-Player | Two-Player |
|---------|---------------|------------|
| Initial phase | `"dealing"` | `"waiting"` |
| Human players | 1 (South) | 2 (North & South) |
| `isMultiplayer` | `false` | `true` |
| Join required | No | Yes |
| Start required | No | Yes |
| AI opponents | 3 | 2 (East & West) |

## Live Service

🌐 **URL:** https://tractor-exact-dealing-carnegiexzheng.zocomputer.io

## Testing Both Modes

```bash
# Test single-player
curl -X POST https://tractor-exact-dealing-carnegiexzheng.zocomputer.io/api/new-game \
  -H "Content-Type: application/json" \
  -d '{"mode":"normal","level":"2","dealer":"south","playerMode":"single"}' \
  | jq '{phase, isMultiplayer}'

# Test two-player
curl -X POST https://tractor-exact-dealing-carnegiexzheng.zocomputer.io/api/new-game \
  -H "Content-Type: application/json" \
  -d '{"mode":"normal","level":"2","dealer":"south","playerMode":"two"}' \
  | jq '{phase, isMultiplayer}'
```

## Commits

- `98cf953` - Fix: Add isMultiplayer field to session state
- `71d6c8f` - Add waiting phase for multiplayer games
- `b018250` - Add remote multiplayer support for tractor game

Both modes fully tested and working! ✅
