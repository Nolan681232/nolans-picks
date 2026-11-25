// Online play uses Trystero over public Nostr relays. There is no game server and no API key.
// Everyone on the menu joins one shared lobby room and hosts publish their game there, which
// is the public game list. A match itself is a second room named after the code.
// `identity: "none"` gives each tab its own player id, so two tabs in one browser can play.

const APP_ID = "nolan681232.github.io/nolans-picks/towers";
const TRYSTERO_URL = "https://esm.run/trystero@0.27.0";

let joinRoomFn = null;

async function getJoin() {
  if (!joinRoomFn) {
    const mod = await import(TRYSTERO_URL);
    joinRoomFn = mod.joinRoom;
  }
  return joinRoomFn;
}

export function createNetwork() {
  let lobby = null;
  let ads = null;
  let lobbyId = null;
  let game = null;

  return {
    get lobbyId() {
      return lobbyId;
    },
    async openLobby(onAds, onStatus) {
      onStatus("connecting");
      try {
        const joinRoom = await getJoin();
        lobby = joinRoom({ appId: APP_ID, identity: "none" }, "lobby");
        ads = lobby.makeUserState("ad", null);
        const self = await lobby.getSelf();
        lobbyId = self.userId;
        const emit = () => {
          const all = ads.getAll() || {};
          const games = [];
          const now = Date.now();
          for (const [id, ad] of Object.entries(all)) {
            if (!ad || typeof ad !== "object" || id === lobbyId) continue;
            if (!ad.code || typeof ad.beat !== "number") continue;
            if (now - ad.beat > 12000) continue;
            games.push({ id, ...ad });
          }
          games.sort((a, b) => a.beat - b.beat);
          onAds(games);
        };
        ads.onChange(emit);
        const peerNote = () => {
          const n = Object.keys(lobby.getUsers?.() || {}).length;
          onStatus(n > 0 ? `online:${n}` : "online");
          emit();
        };
        lobby.onUserJoin(peerNote);
        lobby.onUserLeave(peerNote);
        lobby.onError((err) => {
          console.warn("lobby", err);
          onStatus(err?.code === "relay-failed" ? "offline" : `error:${err?.code || "relay"}`);
        });
        onStatus("online");
        emit();
        return true;
      } catch (err) {
        console.warn(err);
        onStatus("offline");
        return false;
      }
    },
    refreshAds() {
      if (!ads) return [];
      const all = ads.getAll() || {};
      const now = Date.now();
      return Object.entries(all)
        .filter(([id, ad]) => ad && id !== lobbyId && ad.code && now - ad.beat < 12000)
        .map(([id, ad]) => ({ id, ...ad }));
    },
    publishAd(ad) {
      ads?.set({ ...ad, beat: Date.now() });
    },
    clearAd() {
      try { ads?.clear(); } catch { /* lobby already closed */ }
    },
    async joinGame(code, handlers) {
      if (game) await this.leaveGame();
      const joinRoom = await getJoin();
      const room = joinRoom({ appId: APP_ID, identity: "none", maxUsers: 8 }, `g-${code}`);
      const self = await room.getSelf();
      const who = room.makeUserState("who", null);
      const match = room.makeState("match", null);
      const snap = room.makeAction("snap");
      const ev = room.makeAction("ev");
      const bots = room.makeAction("bots");
      who.onChange(() => handlers.onWho?.(who.getAll() || {}));
      match.onChange((value) => handlers.onMatch?.(value), { replay: true });
      snap.onMessage((data, ctx) => handlers.onSnap?.(ctx.userId, data));
      ev.onMessage((data, ctx) => handlers.onEvent?.(ctx.userId, data));
      bots.onMessage((data, ctx) => handlers.onBots?.(ctx.userId, data));
      room.onUserJoin((info) => handlers.onJoin?.(info));
      room.onUserLeave((info) => handlers.onLeave?.(info));
      room.onError((err) => handlers.onError?.(err));
      game = { room, selfId: self.userId, who, match, snap, ev, bots };
      return game;
    },
    async leaveGame() {
      const current = game;
      game = null;
      if (!current) return;
      try { await current.room.leave(); } catch { /* already left */ }
    },
  };
}

export function sendSnap(game, data) {
  if (!game) return;
  void game.snap.send(data).catch(() => {});
}

export function sendEvent(game, data, target) {
  if (!game) return;
  void game.ev.send(data, target ? { target } : undefined).catch(() => {});
}

export function sendBots(game, data) {
  if (!game) return;
  void game.bots.send(data).catch(() => {});
}
