import {
  executeKittyProcess,
  validateKittyHolder,
  advancePhaseAfterKitty,
} from "../kitty-utils";
import { processChaodiPolling } from "./run-chaodi";
import { canChaoDi, chaoDi, createGameContext } from "../../src/core/trump-state";
import { getChaoDiOptions } from "../../web-deal-service";
import { autoSaveForSeat, autoSaveForAllPlayers } from "../autosave";

export async function handleDiscardManual(req: Request, deps: any) {
  const { sessions, json, summarize } = deps;
  const { sessionId, cardIds, playerSeat } = await req.json();
  const s = sessions.get(sessionId);
  if (!s) return json({ error: "session not found" }, 404);
  if (s.phase !== "kitty") return json({ error: "not in kitty phase" }, 400);

  // Validate this is the kitty holder
  const validation = validateKittyHolder(s, playerSeat);
  if (!validation.valid) {
    return json({ error: validation.error }, 400);
  }

  // Execute unified kitty process with human input
  const result = executeKittyProcess(s, playerSeat, {
    type: "human",
    cardIds,
  });

  if (!result.success) {
    return json({ error: result.error }, 400);
  }

  const wasPendingChaodiSettle = !!s.pendingChaodiSettle;
  if (wasPendingChaodiSettle) {
    s.pendingChaodiSettle = false;
    s.phase = "chaodi";
  }

  // Advance to next phase
  const { nextPhase } = advancePhaseAfterKitty(s);

  // Auto-save for the player
  autoSaveForSeat(s, playerSeat);

  // If entering chaodi phase, start polling
  if (nextPhase === "chaodi") {
    const chaodiDeps = { getChaoDiOptions, canChaoDi, chaoDi, createGameContext };
    const chaodiResult = processChaodiPolling(s, playerSeat, chaodiDeps);

    if (chaodiResult.type === "waiting-for-human") {
      return json({
        ok: true,
        logs: chaodiResult.logs,
        waitingForHuman: true,
        humanSeat: chaodiResult.humanSeat,
        state: summarize(s, playerSeat),
      });
    } else {
      autoSaveForAllPlayers(s);
      return json({
        ok: true,
        logs: chaodiResult.logs,
        state: summarize(s, playerSeat),
      });
    }
  }

  // Play phase - return updated state
  autoSaveForAllPlayers(s);
  return json({
    ok: true,
    state: summarize(s, playerSeat),
  });
}
