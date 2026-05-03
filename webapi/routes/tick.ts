import type { Card, Seat } from "../../src/core/types";
import { autoSaveForAllPlayers } from "../autosave";

export async function handleTick(req: Request, deps: any) {
  const { sessions, declarationOrder, summarize, SUIT_NAMES } = deps;
  const { sessionId, playerSeat } = await req.json(); // Accept playerSeat
  const s = sessions.get(sessionId);
  if (!s) return deps.json({ error: "session not found" }, 404);
  if (s.done || s.phase !== "dealing") {
    return deps.json({
      ok: true,
      alreadyAdvanced: true,
      phase: s.phase,
      state: summarize(s, playerSeat),
    });
  }

  s.round += 1;
  s.engine.dealOneRound(s.deck, s.round);

  const state = s.engine.getState();
  const order = declarationOrder(state.dealer);
  const declLogs: { seat: string; cards: string }[] = [];
  const declarations: Array<{ seat: Seat; cards: Card[] }> = [];

  // Record cards dealt this round
  const cardsBySeat = new Map<Seat, Card>();
  for (const seat of order) {
    const hand = s.engine.getState().hands.get(seat) || [];
    if (hand.length >= s.round) {
      cardsBySeat.set(seat, hand[hand.length - 1]);
    }
  }

  for (const seat of order) {
    if (seat === "south") continue;
    // Re-fetch state to get updated trumpState after each declaration
    const currentState = s.engine.getState();
    const hand = currentState.hands.get(seat) || [];
    const ai = s.engine.getPlayer(seat) as any;
    const cards = ai.chooseTrump(hand, currentState.level, currentState.trumpState);
    if (cards && cards.length > 0) {
      const ok = s.engine.tryDeclare(seat, cards);
      if (ok) {
        const countText = cards.length === 1 ? '单张' : cards.length === 2 ? '一对' : cards.length === 3 ? '三张' : `${cards.length}张`;
        const suitText = cards.every((c: any) => c.joker) 
          ? (cards[0].joker === 'big' ? '大王' : '小王')
          : SUIT_NAMES[cards.find((c: any) => !c.joker)?.suit];
        declLogs.push({
          seat,
          cards: `${countText}${suitText}`,
        });
        declarations.push({ seat, cards: [...cards] });
      }
    }
  }

  // Record dealing round for logger
  if (s.dealingCardsLog) {
    s.dealingCardsLog.push({ round: s.round, cardsBySeat, declarations });
  }
  
  // Record dealing round to logger
  if (s.logger) {
    s.logger.recordDealingRound(s.round, cardsBySeat, declarations);
  }

  deps.serverLog?.("dealing_tick", { sessionId, round: s.round, declarations: declLogs.length });

  if (s.round >= 39) {
    // Dealing finished - autosave before entering postDeal
    autoSaveForAllPlayers(s);
    
    // Flush dealing phase to log file immediately
    if (s.logger) {
      const state = s.engine.getState();
      s.logger.flushToFile(null, state.dealer, { eastWest: state.level as Rank, northSouth: state.level as Rank });
    }
    
    // 发牌结束，进入postDeal等待阶段（允许补亮）
    s.phase = "postDeal";
    s.postDealStartTime = Date.now();
    
    deps.serverLog?.("dealing_finished_entering_postDeal", {
      sessionId,
      phase: s.phase,
      postDealStartTime: s.postDealStartTime,
    });
  }

  return deps.json({ declarations: declLogs, state: summarize(s, playerSeat) }); // Pass playerSeat
}
