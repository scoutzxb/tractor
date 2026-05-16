import type { Seat, Rank } from "../../src/core/types";
import type { TeamExemptions } from "../../src/core/scoring";
import { getLoggerManager, GameLogger } from "../game-logger";

export async function handleNewGame(req: Request, deps: any) {
  const { createGameEngine, SimpleAI, makeHumanProxy, id, sessions, summarize } = deps;
  const seats: Seat[] = ["east", "north", "west", "south"];

  const body = await req.json();
  const mode = body.mode === "grab" ? "grab" : "normal";
  const level = (["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as const).includes(body.level) ? body.level : "2";
  const dealer = seats.includes(body.dealer) ? body.dealer : "south";
  const playerMode = body.playerMode === 'four' ? 'four' : body.playerMode === 'two' ? 'two' : 'single';
  const isGrabMode = mode === "grab";

  const engine = createGameEngine(level, dealer, isGrabMode, Date.now());

  const humanSeats: Set<Seat> = new Set(
    playerMode === 'four'
      ? seats
      : playerMode === 'two'
        ? ['north', 'south']
        : ['south']
  );

  engine.registerPlayer(humanSeats.has("east") ? makeHumanProxy("east") : new SimpleAI("east", "东"));
  engine.registerPlayer(humanSeats.has("north") ? makeHumanProxy("north") : new SimpleAI("north", "北"));
  engine.registerPlayer(humanSeats.has("west") ? makeHumanProxy("west") : new SimpleAI("west", "西"));
  engine.registerPlayer(humanSeats.has("south") ? makeHumanProxy("south") : new SimpleAI("south", "南"));

  const deck = engine.prepareDeck();

  const scores = new Map<Seat, number>();
  for (const seat of seats) {
    scores.set(seat, 0);
  }

  const initialPhase = playerMode === 'single' ? "dealing" : "waiting";

  const sessionId = id();

  const s = {
    id: sessionId,
    engine,
    deck,
    round: 0,
    done: false,
    phase: initialPhase,
    awaitingDiscard: false,
    pendingChaodiSettle: false,
    mode: isGrabMode ? "grab" : "normal",
    isGrabMode,
    configuredLevel: level,
    configuredDealer: dealer,
    humanSeats,
    playerMode,
    isMultiplayer: playerMode !== 'single',
    teamLevels: { eastWest: level as Rank, northSouth: level as Rank },
    exemptions: { eastWest: [] as string[], northSouth: [] as string[] },
    lastLogIndex: 0,
    currentLeader: null as Seat | null,
    currentTrick: [] as Array<{ seat: Seat; cards: any[] }>,
    roundNumber: 0,
    scores,
    tricks: [] as any[],
    waitingNextRound: false,
    lastRoundReview: null as any,
    gameResult: null as any,
    logger: getLoggerManager("game-logs-web").startNewGame(sessionId),
    dealingCardsLog: [] as any[],
    players: new Map(),
    hostSeat: undefined as Seat | undefined,
    createdAt: Date.now(),
  };

  s.logger.setGrabMode(isGrabMode);
  s.logger.setGameStartState(dealer, { eastWest: level as Rank, northSouth: level as Rank });

  sessions.set(s.id, s);
  deps.serverLog?.("new_game", { sessionId: s.id, mode, level, dealer, playerMode, isMultiplayer: playerMode !== 'single', humanSeats: [...humanSeats] });
  return deps.json(summarize(s));
}
