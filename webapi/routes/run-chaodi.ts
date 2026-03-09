import type { Seat } from "../../src/core/types";
import { autoSaveForAllPlayers, autoSaveForSeat } from "../autosave";

const SEATS: Seat[] = ["east", "north", "west", "south"];

function getNextSeat(seat: Seat): Seat {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

function initChaodiPolling(s: any): void {
  const state = s.engine.getState();
  const startSeat = getNextSeat(state.trumpState.kittyHolder || state.dealer);
  s.chaodiRound = 1;
  s.nextChaodiSeat = startSeat;
  s.chaodiPassCount = 0;
}

export async function handleRunChaodi(req: Request, deps: any) {
  const { sessions, json, summarize, getChaoDiOptions } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  if (!s.nextChaodiSeat) {
    initChaodiPolling(s);
  }

  const logs: string[] = [];
  const state = s.engine.getState();
  let currentSeat: Seat = s.nextChaodiSeat;
  let processedCount = 0;

  while (processedCount < 4) {
    if (state.trumpState.currentTrump?.declarer === currentSeat) {
      currentSeat = getNextSeat(currentSeat);
      processedCount++;
      continue;
    }

    if (state.trumpState.kittyHolder === currentSeat) {
      currentSeat = getNextSeat(currentSeat);
      processedCount++;
      continue;
    }

    const options = getChaoDiOptions(s, currentSeat);
    if (options.length === 0) {
      currentSeat = getNextSeat(currentSeat);
      processedCount++;
      continue;
    }

    if (s.humanSeats.has(currentSeat)) {
      s.nextChaodiSeat = currentSeat;
      autoSaveForSeat(s, currentSeat);
      return json({
        ok: true,
        logs,
        waitingForHuman: true,
        humanSeat: currentSeat,
        state: summarize(s, playerSeat)
      });
    }

    const aiPlayer = s.engine.getPlayer(currentSeat);
    if (aiPlayer) {
      const hand = state.hands.get(currentSeat) || [];
      const chaodiCards = aiPlayer.chooseChaoDi(hand, state.level, state.trumpState);

      if (chaodiCards && chaodiCards.length > 0) {
        const success = s.engine.tryChaoDi(currentSeat, chaodiCards);
        if (success) {
          logs.push(`${currentSeat} 炒底成功`);
          
          // AI 炒底：自动扣底
          if (!s.humanSeats.has(currentSeat)) {
            const hand = state.hands.get(currentSeat) || [];
            const chaodiHand = [...hand, ...state.kitty];
            // 自动扣6张最差的牌
            const toKeep = chaodiHand.slice(0, 39);
            const discarded = chaodiHand.slice(39);
            state.hands.set(currentSeat, toKeep);
            state.kitty = discarded;
            logs.push(`${currentSeat} 自动扣底完成`);
            
            // 继续下一轮炒底
            s.nextChaodiSeat = getNextSeat(currentSeat);
            s.chaodiPassCount = 0;
            // 不 return，继续 while 循环
          } else {
            // 人类玩家炒底：进入 kitty 阶段
            s.phase = "kitty";
            s.awaitingDiscard = true;
            s.nextChaodiSeat = getNextSeat(currentSeat);
            s.chaodiPassCount = 0;
            autoSaveForSeat(s, currentSeat);
            return json({
              ok: true,
              logs: [...logs, "请扣底后继续炒底流程"],
              phase: "kitty",
              state: summarize(s, playerSeat)
            });
          }
        }
      }
    }

    currentSeat = getNextSeat(currentSeat);
    processedCount++;
  }

  // 一轮结束，都无人炒底
  s.currentLeader = state.dealer;
  s.currentTrick = [];
  s.roundNumber = 0;
  s.scores = new Map([["east", 0], ["north", 0], ["west", 0], ["south", 0]]);
  s.phase = "play";

  if (s.logger && state.ctx) {
    s.logger.recordInitialHands(state.hands, state.ctx);
  }

  autoSaveForAllPlayers(s);

  return json({
    ok: true,
    logs: [...logs, "炒底阶段结束，进入出牌阶段"],
    state: summarize(s, playerSeat)
  });
}

export async function handleChaoDiManual(req: Request, deps: any) {
  const { sessions, json, summarize, getChaoDiOptions } = deps;
  const { sessionId, key, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  const options = getChaoDiOptions(s, playerSeat);
  const target = options.find((o: any) => o.key === key);
  if (!target) return json({ error: "option not valid now" }, 400);

  const state = s.engine.getState();
  const oldKitty = [...state.kitty];

  const success = s.engine.tryChaoDi(playerSeat, target.cards);
  if (!success) {
    return json({ error: "chaodi failed" }, 400);
  }

  const playerHand = state.hands.get(playerSeat) || [];
  state.hands.set(playerSeat, [...playerHand, ...state.kitty]);
  state.kitty = [];

  if (s.logger) {
    s.logger.recordChaoDi(
      playerSeat,
      target.cards,
      true,
      {
        suit: state.trumpState.currentTrump?.suit || null,
        isNoTrump: !state.trumpState.currentTrump?.suit
      },
      oldKitty,
      []
    );
  }

  s.lastLogIndex = s.engine.getLogs().length;
  s.phase = "kitty";
  s.awaitingDiscard = true;

  const idx = SEATS.indexOf(playerSeat);
  s.nextChaodiSeat = SEATS[(idx + 1) % 4];
  s.chaodiPassCount = 0;

  return json({ ok: true, label: target.label, state: summarize(s, playerSeat) });
}

export async function handleChaoDiPass(req: Request, deps: any) {
  const { sessions, json, summarize, getChaoDiOptions } = deps;
  const { sessionId, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "chaodi") return json({ error: "not in chaodi phase" }, 400);

  const options = getChaoDiOptions(s, playerSeat);
  if (options.length === 0) {
    return json({ error: "you cannot chaodi now" }, 400);
  }

  s.chaodiPassCount = (s.chaodiPassCount || 0) + 1;
  s.nextChaodiSeat = getNextSeat(playerSeat);

  const state = s.engine.getState();
  if (s.chaodiPassCount >= 3) {
    s.currentLeader = state.dealer;
    s.currentTrick = [];
    s.roundNumber = 0;
    s.scores = new Map([["east", 0], ["north", 0], ["west", 0], ["south", 0]]);
    s.phase = "play";

    if (s.logger && state.ctx) {
      s.logger.recordInitialHands(state.hands, state.ctx);
    }

    autoSaveForAllPlayers(s);

    return json({
      ok: true,
      passed: true,
      message: "炒底阶段结束，进入出牌阶段",
      state: summarize(s, playerSeat)
    });
  }

  autoSaveForAllPlayers(s);

  return json({
    ok: true,
    passed: true,
    message: "已跳过，继续轮询其他玩家",
    state: summarize(s, playerSeat)
  });
}

export async function handleChaoDiNorth(req: Request, deps: any) {
  return handleChaoDiManual(req, { ...deps, playerSeat: 'north' });
}

export async function handleChaoDiPassNorth(req: Request, deps: any) {
  return handleChaoDiPass(req, { ...deps, playerSeat: 'north' });
}
