import type { Seat } from '../src/core/types';
import type { Session } from '../web-deal-service';

export function deserializeSession(serialized: any, deps: any): Session {
  const { createGameEngine, SimpleAI, makeHumanProxy } = deps;
  const engine = createGameEngine(
    serialized.engineState.level,
    serialized.engineState.dealer,
    serialized.isGrabMode,
    Date.now()
  );

  engine.restoreState(serialized.engineState);

  const humanSeats = new Set<Seat>(serialized.humanSeats);

  engine.registerPlayer(new SimpleAI('east', '东'));
  engine.registerPlayer(humanSeats.has('north') ? makeHumanProxy('north') : new SimpleAI('north', '北'));
  engine.registerPlayer(new SimpleAI('west', '西'));
  engine.registerPlayer(humanSeats.has('south') ? makeHumanProxy('south') : new SimpleAI('south', '南'));

  const session: Session = {
    id: serialized.id,
    engine,
    deck: [],
    round: serialized.round,
    done: serialized.done,
    phase: serialized.phase,
    awaitingDiscard: serialized.awaitingDiscard,
    pendingChaodiSettle: serialized.pendingChaodiSettle,
    mode: serialized.mode,
    isGrabMode: serialized.isGrabMode,
    configuredLevel: serialized.configuredLevel,
    configuredDealer: serialized.configuredDealer,
    humanSeats,
    playerMode: serialized.playerMode,
    isMultiplayer: serialized.isMultiplayer,
    teamLevels: serialized.teamLevels,
    exemptions: serialized.exemptions,
    lastLogIndex: serialized.lastLogIndex,
    currentLeader: serialized.currentLeader,
    currentTrick: serialized.currentTrick,
    roundNumber: serialized.roundNumber,
    scores: new Map(Object.entries(serialized.scores)),
    tricks: serialized.tricks,
    waitingNextRound: serialized.waitingNextRound,
    lastRoundReview: serialized.lastRoundReview,
    gameResult: serialized.gameResult,
    logger: deps.getLoggerManager('game-logs-web').startNewGame(),
    loggedTeamLevels: serialized.loggedTeamLevels,
    dealingCardsLog: serialized.dealingCardsLog.map((log: any) => ({
      round: log.round,
      cardsBySeat: new Map(Object.entries(log.cardsBySeat)),
      declarations: log.declarations,
    })),
    players: new Map(Object.entries(serialized.players || {}).map(([seat, p]: [string, any]) => [
      seat,
      {
        token: p.token,
        name: p.name,
        connectedAt: new Date(p.connectedAt),
        lastSeen: new Date(p.lastSeen),
      }
    ]))
  };

  if (serialized.loggerState) {
    session.logger.restoreState(serialized.loggerState);
  }

  return session;
}
