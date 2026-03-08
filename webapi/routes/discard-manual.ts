export async function handleDiscardManual(req: Request, deps: any) {
  const { sessions, json, summarize } = deps;
  const { sessionId, cardIds, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "kitty" || !s.awaitingDiscard) return json({ error: "not awaiting discard" }, 400);
  
  // Check if the requesting player is the kitty holder
  const state = s.engine.getState();
  const kittyHolder = state.trumpState.kittyHolder;
  if (kittyHolder !== playerSeat) {
    return json({ error: "you are not the kitty holder" }, 400);
  }
  
  if (!Array.isArray(cardIds) || cardIds.length !== 6) return json({ error: "must discard exactly 6 cards" }, 400);

  const normalizedIds = cardIds.map((x: any) => Number(x));
  if (normalizedIds.some((n: number) => Number.isNaN(n))) return json({ error: "invalid card ids" }, 400);

  const hand = state.hands.get(playerSeat) || [];
  const idSet = new Set(normalizedIds);
  if (idSet.size !== 6) return json({ error: "duplicate cards in discard" }, 400);

  const discard: any[] = [];
  const remain: any[] = [];
  for (const c of hand) {
    if (idSet.has(c.id)) discard.push(c); else remain.push(c);
  }
  if (discard.length !== 6) return json({ error: "some discard cards not in hand" }, 400);

  state.hands.set(playerSeat, remain);
  state.kitty = discard;
  s.awaitingDiscard = false;
  
  // Record final kitty after discard
  if (s.logger) {
    s.logger.recordKitty(discard);
  }
  
  // Record initial hands after human player discards
  if (s.logger && state.ctx) {
    s.logger.recordInitialHands(state.hands, state.ctx);
  }
  
  // Fix: update lastLogIndex after successful discard
  s.lastLogIndex = s.engine.getLogs().length;

  // 扣底完成后，根据游戏模式决定下一阶段
  const SEATS = ["east", "north", "west", "south"];
  function getNextSeat(seat: string) {
    const idx = SEATS.indexOf(seat);
    return SEATS[(idx + 1) % 4];
  }

  // 普通模式进入炒底阶段，抢庄模式直接进入出牌阶段
  if (s.isGrabMode) {
    // 抢庄模式：直接进入出牌阶段
    s.phase = "play";
    s.currentLeader = state.dealer;
    s.currentTurn = state.dealer;
    s.roundNumber = 0;
    s.scores = new Map([["east", 0], ["north", 0], ["west", 0], ["south", 0]]);
  } else {
    // 普通模式：进入炒底阶段，从当前 kittyHolder 的下一个座位开始轮询
    s.phase = "chaodi";
    s.nextChaodiSeat = getNextSeat(state.trumpState.kittyHolder || state.dealer);
    s.chaodiRound = 1;
    s.chaodiPassCount = 0;
  }

  return json({ ok: true, state: summarize(s, playerSeat) });
}
