import { computed, reactive } from "@vue/reactivity";
import chalk from "chalk";

import useSocketConnections from "./use-socket-connections.js";

import { generateDeck } from "../utils/deck.js";

const debug = false;

/** @type {import("@/models/game-state").GameState} */
const initGameState = {
  phase: "pregame",
  actionQueue: [],
  cardMap: {},
  discardPile: [],
  drawPile: [],
  players: {},
  commands: [],
};

const gameState = reactive({ ...initGameState });

const playersArray = computed(() => {
  return Object.keys(gameState.players)
    .map((uid) => ({ ...gameState.players[uid], uid }))
    .sort((a, b) => a.position - b.position);
});

export default function () {
  /**
   * @param {string} uid
   */
  function addPlayer(uid) {
    // Add player to game
    const position = playersArray.value.length;

    /** @type {import("@/models/game-state").Player} */
    const newPlayer = {
      status: "waiting",
      position,
      hand: [],
      isOnline: true,
    };
    gameState.players = { ...gameState.players, [uid]: newPlayer };
  }

  /**
   * @param {string} uid
   */
  function removePlayer(uid) {
    delete gameState.players[uid];
    playersArray.value.forEach(
      ({ uid }, i) => (gameState.players[uid].position = i)
    );
  }

  /**
   * @param {import("@/models/game-state").FaceUpCard | import("@/models/game-state").FaceDownCard} card
   */
  function toCard(card) {
    if (debug) console.log("toCard", card);
    return gameState.cardMap[card.id];
  }

  /**
   * @param {import("@/models/game-state").Card | import("@/models/game-state").FaceUpCard | import("@/models/game-state").FaceDownCard} card
   * @returns {import("@/models/game-state").FaceUpCard}
   */
  function toFaceUp(card) {
    if (debug) console.log("toFaceUp", card);
    return { ...gameState.cardMap[card.id], orientation: "up" };
  }

  /**
   * @param {import("@/models/game-state").Card | import("@/models/game-state").FaceUpCard | import("@/models/game-state").FaceDownCard} card
   * @returns {import("@/models/game-state").FaceDownCard}
   */
  function toFaceDown(card) {
    if (debug) console.log("toFaceDown", card);
    return { id: card.id, orientation: "down" };
  }

  /**
   * @param {string} player
   * @returns {import('@/models/game-state').ClientState}
   */
  function evalClientState(player) {
    const discardPileCount = gameState.discardPile.length;

    /** @type {import('@/models/game-state.js').ClientState['discardPile']} */
    const discardPile = {
      topCard:
        discardPileCount > 0
          ? {
              ...gameState.discardPile[discardPileCount - 1],
              orientation: "up",
            }
          : undefined,
      count: discardPileCount,
    };

    const drawPileCount = gameState.drawPile.length;

    /** @type {import('@/models/game-state.js').ClientState['drawPile']} */
    const drawPile = {
      topCard:
        drawPileCount > 0
          ? toFaceDown(gameState.drawPile[drawPileCount - 1])
          : undefined,
      count: drawPileCount,
    };

    // TODO: make cards face up or face down depending on player
    const players = playersArray.value.map((playerI) => {
      const hand = playerI.hand.map((card) => {
        return card.orientation === "up" ? toFaceUp(card) : toFaceDown(card);
      });
      return { ...playerI, hand };
    });

    const clientState = {
      phase: gameState.phase,
      activePlayerUid: gameState.activePlayerUid,
      actionQueue: [],
      discardPile,
      drawPile,
      players,
    };

    return clientState;
  }

  /**
   * @param {string | undefined} [startingPlayer]
   */
  function startGame(startingPlayer) {
    // Verify enough players
    if (playersArray.value.length <= 1) {
      throw new Error("Need at least two players to start game");
    }

    gameState.phase = "ingame";

    // Determine active player
    const randomPlayer =
      playersArray.value[(playersArray.value.length * Math.random()) | 0];
    gameState.activePlayerUid = startingPlayer ?? randomPlayer.uid;

    // Shuffle and add cards to draw pile
    const { deck, cardMap } = generateDeck();
    gameState.drawPile = deck;
    gameState.cardMap = cardMap;

    // Deal cards to players
    const CARDS_PER_HAND = 4;
    for (let i = 1; i <= CARDS_PER_HAND; i++) {
      playersArray.value.forEach(({ uid }) => {
        const card = gameState.drawPile.pop();
        if (card === undefined) {
          throw new Error("Overdraw from draw pile");
        }
        gameState.players[uid].hand.push({ ...card, orientation: "down" });
      });
    }

    // Start discard pile
    const card = gameState.drawPile.pop();
    if (card === undefined) {
      throw new Error("Overdraw from draw pile");
    }
    gameState.discardPile.push(card);
  }

  /**
   * @param {import('@/models/game-state').ClientCommand} clientCommand
   */
  function executeCommand({ player, command }) {
    const { broadcastUpdate, sendReject } = useSocketConnections();
    try {
      switch (command.id) {
        case "connect-to-room": {
          if (gameState.players[player] === undefined) {
            if (gameState.phase === "pregame") {
              // Add player to game
              addPlayer(player);
            } else {
              // TODO: Add player to observers?
            }
          } else {
            // Set player online
            gameState.players[player].isOnline = true;
          }

          break;
        }
        case "disconnect-from-room": {
          if (gameState.players[player] !== undefined) {
            if (gameState.phase === "ingame") {
              // Set player offline
              gameState.players[player].isOnline = false;
            } else {
              // Remove player from game
              removePlayer(player);
            }
          }

          break;
        }
        case "toggle-ready": {
          // TODO: If valid, process, else, throw error
          if (gameState.phase === "ingame") {
            throw new Error("Game has already started");
          }

          if (gameState.players[player].status === "waiting") {
            gameState.players[player].status = "ready";
          } else if (gameState.players[player].status === "ready") {
            gameState.players[player].status = "waiting";
          }

          if (playersArray.value.every(({ status }) => status === "ready")) {
            startGame();
          }

          break;
        }
        case "restart-game": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "call-dutch": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "draw-discard-pile": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "draw-draw-pile": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "match-discard": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "peek": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "replace-discard": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
        case "swap": {
          // TODO: If valid, process, else, throw error
          // TODO: Eval all client states and send responses
          break;
        }
      }

      // Command succeeded

      // Send state update to all players

      const clientStates = Object.keys(gameState.players).reduce((obj, uid) => {
        return { ...obj, [uid]: evalClientState(uid) };
      }, {});
      broadcastUpdate(clientStates);

      // Save and output command
      gameState.commands.push({ player, command });
      console.log(
        `🟢 ${chalk.yellow(player.substring(0, 4))}: ${JSON.stringify(command)}`
      );
    } catch (error) {
      // Command rejected
      sendReject(player, {
        id: "reject",
        commandId: command.id,
        reason: error.message,
      });
      console.log(
        `🚫 ${chalk.yellow(player.substring(0, 4))}: ${JSON.stringify(
          command
        )} ${chalk.red(error.message)}`
      );
    }
  }

  return {
    executeCommand,
  };
}
